-- =====================================================================================
-- Begegnungen korrigieren
--
-- Neuer Ereignistyp encounter_corrected: Wurde das falsche Pokémon eingetragen, wird die Art
-- korrigiert, ohne das Ereignis zu löschen (bleibt in der Timeline sichtbar und ist rückgängig
-- machbar). Die Korrektur setzt gefangene und aktuelle Art; spätere Entwicklungen gelten weiter.
--
-- Nachtragen fehlender Pokémon auf einer Route braucht keine Schemaänderung: encounter_logged
-- ohne link_id tritt bereits dem passenden Soul-Link der Route bei.
--
-- Hinweis: Der neue Enum-Wert wird in dieser Datei nur als Text verglichen, damit sie auch in
-- einer einzigen Transaktion (Supabase SQL Editor) ausgeführt werden kann.
-- =====================================================================================

alter type public.event_type add value if not exists 'encounter_corrected' after 'encounter_evolved';

-- Projektion: Korrekturen berücksichtigen (gleiche Spalten wie bisher)
create or replace view public.encounters with (security_invoker = true) as
with logged as (
  select
    e.challenge_id,
    e.run_number,
    e.id as event_id,
    e.occurred_at as logged_at,
    (e.payload ->> 'encounter_id')::uuid as encounter_id,
    (e.payload ->> 'link_id')::uuid as link_id,
    (e.payload ->> 'member_id')::uuid as member_id,
    (e.payload ->> 'route_id')::uuid as route_id,
    (e.payload ->> 'species_id')::integer as species_id,
    e.payload ->> 'nickname' as nickname,
    (e.payload ->> 'status')::public.encounter_status as initial_status,
    (e.payload ->> 'kind')::public.encounter_kind as kind
  from public.active_events e
  where e.type = 'encounter_logged'
),
last_status as (
  select distinct on (e.payload ->> 'encounter_id')
    (e.payload ->> 'encounter_id')::uuid as encounter_id,
    (e.payload ->> 'status')::public.encounter_status as status
  from public.active_events e
  where e.type = 'encounter_status_changed'
  order by e.payload ->> 'encounter_id', e.seq desc
),
-- Aktuelle Art: letzte Entwicklung oder Korrektur
last_species as (
  select distinct on (e.payload ->> 'encounter_id')
    (e.payload ->> 'encounter_id')::uuid as encounter_id,
    (e.payload ->> 'species_id')::integer as species_id
  from public.active_events e
  where e.type::text in ('encounter_evolved', 'encounter_corrected')
  order by e.payload ->> 'encounter_id', e.seq desc
),
-- Gefangene Art: letzte Korrektur, sonst die beim Eintragen
corrected as (
  select distinct on (e.payload ->> 'encounter_id')
    (e.payload ->> 'encounter_id')::uuid as encounter_id,
    (e.payload ->> 'species_id')::integer as species_id
  from public.active_events e
  where e.type::text = 'encounter_corrected'
  order by e.payload ->> 'encounter_id', e.seq desc
),
deaths as (
  select
    (e.payload ->> 'encounter_id')::uuid as encounter_id,
    e.id as death_event_id,
    e.occurred_at as died_at,
    (e.payload ->> 'route_id')::uuid as death_route_id,
    e.payload ->> 'cause' as death_cause,
    e.payload ->> 'opponent' as death_opponent,
    (e.payload ->> 'level')::integer as death_level
  from public.active_events e
  where e.type = 'pokemon_died'
),
link_deaths as (
  -- Erster Tod innerhalb eines Soul-Links: reißt alle Partner mit
  select distinct on (l.link_id)
    l.link_id,
    d.encounter_id as cause_encounter_id,
    d.died_at
  from logged l
  join deaths d on d.encounter_id = l.encounter_id
  order by l.link_id, d.died_at, d.death_event_id
)
select
  l.challenge_id,
  l.run_number,
  l.encounter_id,
  l.link_id,
  l.member_id,
  l.route_id,
  l.kind,
  coalesce(co.species_id, l.species_id) as caught_species_id,
  coalesce(ls.species_id, l.species_id) as species_id,
  l.nickname,
  case
    when d.encounter_id is not null then 'dead'::public.pokemon_state
    when ld.link_id is not null then 'linked_dead'::public.pokemon_state
    else coalesce(st.status, l.initial_status)::text::public.pokemon_state
  end as state,
  coalesce(d.died_at, ld.died_at) as lost_at,
  case when d.encounter_id is null then ld.cause_encounter_id end as lost_with_encounter_id,
  d.death_event_id,
  d.death_route_id,
  d.death_cause,
  d.death_opponent,
  d.death_level,
  l.logged_at,
  l.event_id
from logged l
left join last_status st on st.encounter_id = l.encounter_id
left join last_species ls on ls.encounter_id = l.encounter_id
left join corrected co on co.encounter_id = l.encounter_id
left join deaths d on d.encounter_id = l.encounter_id
left join link_deaths ld on ld.link_id = l.link_id;

-- Prüfung je Ereignistyp, ergänzt um encounter_corrected
create or replace function private.validate_event(p_challenge_id uuid, p_run integer, p_type public.event_type, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_route uuid;
  v_species integer;
  v_status text;
  v_encounter_id uuid;
  v_link uuid;
  v_encounter public.encounters;
  v_target public.events;
  v_counter text;
  v_delta integer;
  v_result text;
  v_kind text;
  v_group smallint;
  v_cause_member uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = 'PT400', message = 'Payload muss ein JSON-Objekt sein';
  end if;

  case p_type
    when 'encounter_logged' then
      v_member := private.jsonb_uuid(p_payload, 'member_id', true);
      perform private.assert_player(p_challenge_id, v_member);
      v_route := private.jsonb_uuid(p_payload, 'route_id', true);
      perform private.assert_route(p_challenge_id, v_route);
      v_species := private.jsonb_int(p_payload, 'species_id', true, 1, 100000);
      perform private.assert_species(v_species);
      v_status := coalesce(private.jsonb_text(p_payload, 'status', false, 10), 'box');
      if v_status not in ('team', 'box') then
        raise exception using errcode = 'PT400', message = 'Status muss "team" oder "box" sein';
      end if;

      v_kind := coalesce(private.jsonb_text(p_payload, 'kind', false, 10), 'wild');
      if v_kind not in ('wild', 'static') then
        raise exception using errcode = 'PT400', message = 'Art der Begegnung muss "wild" oder "static" sein';
      end if;

      v_encounter_id := coalesce(private.jsonb_uuid(p_payload, 'encounter_id', false), gen_random_uuid());
      if exists (
        select 1 from public.events e
        where e.type = 'encounter_logged' and e.payload ->> 'encounter_id' = v_encounter_id::text
      ) then
        raise exception using errcode = 'PT409', message = 'encounter_id ist bereits vergeben';
      end if;

      select coalesce(m.link_group, -1) into v_group from public.challenge_members m where m.id = v_member;
      v_link := private.jsonb_uuid(p_payload, 'link_id', false);
      if v_link is null then
        -- Ohne Angabe: dem jüngsten Soul-Link dieser Route und Art beitreten, in dem der Spieler noch
        -- fehlt und der zu seiner Soul-Link-Gruppe gehört
        select en.link_id into v_link
        from public.encounters en
        where en.challenge_id = p_challenge_id and en.run_number = p_run and en.route_id = v_route
          and en.kind::text = v_kind
          and not exists (
            select 1 from public.encounters o where o.link_id = en.link_id and o.member_id = v_member
          )
          and not exists (
            select 1
            from public.encounters o
            join public.challenge_members om on om.id = o.member_id
            where o.link_id = en.link_id and coalesce(om.link_group, -1) <> v_group
          )
        order by en.logged_at desc
        limit 1;
        v_link := coalesce(v_link, gen_random_uuid());
      else
        if exists (
          select 1 from public.encounters en
          where en.link_id = v_link
            and (en.challenge_id <> p_challenge_id or en.run_number <> p_run or en.route_id <> v_route
                 or en.kind::text <> v_kind)
        ) then
          raise exception using errcode = 'PT409',
            message = 'Soul-Link gehört zu einer anderen Route, Begegnungsart oder einem anderen Run';
        end if;
        if exists (select 1 from public.encounters en where en.link_id = v_link and en.member_id = v_member) then
          raise exception using errcode = 'PT409', message = 'Spieler hat in diesem Soul-Link bereits ein Pokémon';
        end if;
        if exists (
          select 1
          from public.encounters en
          join public.challenge_members om on om.id = en.member_id
          where en.link_id = v_link and coalesce(om.link_group, -1) <> v_group
        ) then
          raise exception using errcode = 'PT409', message = 'Spieler gehört zu einer anderen Soul-Link-Gruppe';
        end if;
      end if;

      return jsonb_strip_nulls(jsonb_build_object(
        'encounter_id', v_encounter_id,
        'link_id', v_link,
        'member_id', v_member,
        'route_id', v_route,
        'species_id', v_species,
        'kind', v_kind,
        'status', v_status,
        'nickname', private.jsonb_text(p_payload, 'nickname', false, 20)
      ));

    when 'encounter_missed' then
      v_member := private.jsonb_uuid(p_payload, 'member_id', true);
      perform private.assert_player(p_challenge_id, v_member);
      v_route := private.jsonb_uuid(p_payload, 'route_id', false);
      if v_route is not null then
        perform private.assert_route(p_challenge_id, v_route);
      end if;
      return jsonb_strip_nulls(jsonb_build_object(
        'member_id', v_member,
        'route_id', v_route,
        'note', private.jsonb_text(p_payload, 'note', false, 200)
      ));

    when 'encounter_status_changed' then
      v_encounter_id := private.jsonb_uuid(p_payload, 'encounter_id', true);
      v_encounter := private.require_living_encounter(p_challenge_id, p_run, v_encounter_id);
      v_status := private.jsonb_text(p_payload, 'status', true, 10);
      if v_status not in ('team', 'box') then
        raise exception using errcode = 'PT400', message = 'Status muss "team" oder "box" sein';
      end if;
      if v_encounter.state::text = v_status then
        raise exception using errcode = 'PT409', message = 'Pokémon hat diesen Status bereits';
      end if;
      return jsonb_build_object('encounter_id', v_encounter_id, 'status', v_status);

    when 'encounter_evolved' then
      v_encounter_id := private.jsonb_uuid(p_payload, 'encounter_id', true);
      v_encounter := private.require_living_encounter(p_challenge_id, p_run, v_encounter_id);
      v_species := private.jsonb_int(p_payload, 'species_id', true, 1, 100000);
      perform private.assert_species(v_species);
      if v_species = v_encounter.species_id or not exists (
        select 1
        from public.species a
        join public.species b on b.evolution_chain_id = a.evolution_chain_id
        where a.id = v_encounter.species_id and b.id = v_species
      ) then
        raise exception using errcode = 'PT400', message = 'Pokémon gehört nicht zur selben Entwicklungsreihe';
      end if;
      return jsonb_build_object('encounter_id', v_encounter_id, 'species_id', v_species);

    when 'encounter_corrected' then
      -- Falsches Pokémon eingetragen: Art korrigieren (auch bei toten Pokémon, nur im laufenden Run)
      v_encounter_id := private.jsonb_uuid(p_payload, 'encounter_id', true);
      select * into v_encounter from public.encounters en
      where en.challenge_id = p_challenge_id and en.encounter_id = v_encounter_id;
      if not found then
        raise exception using errcode = 'PT404', message = 'Begegnung nicht gefunden';
      end if;
      if v_encounter.run_number <> p_run then
        raise exception using errcode = 'PT409', message = 'Begegnung gehört zu einem früheren Run';
      end if;
      v_species := private.jsonb_int(p_payload, 'species_id', true, 1, 100000);
      perform private.assert_species(v_species);
      if v_species = v_encounter.species_id then
        raise exception using errcode = 'PT409', message = 'Dieses Pokémon ist bereits eingetragen';
      end if;
      return jsonb_build_object('encounter_id', v_encounter_id, 'species_id', v_species);

    when 'pokemon_died' then
      v_encounter_id := private.jsonb_uuid(p_payload, 'encounter_id', true);
      perform private.require_living_encounter(p_challenge_id, p_run, v_encounter_id);
      v_route := private.jsonb_uuid(p_payload, 'route_id', false);
      if v_route is not null then
        perform private.assert_route(p_challenge_id, v_route);
      end if;
      return jsonb_strip_nulls(jsonb_build_object(
        'encounter_id', v_encounter_id,
        'route_id', v_route,
        'cause', private.jsonb_text(p_payload, 'cause', false, 200),
        'opponent', private.jsonb_text(p_payload, 'opponent', false, 80),
        'level', private.jsonb_int(p_payload, 'level', false, 1, 100)
      ));

    when 'run_ended' then
      v_result := private.jsonb_text(p_payload, 'result', true, 10);
      if v_result not in ('wipe', 'won') then
        raise exception using errcode = 'PT400', message = 'Ergebnis muss "wipe" oder "won" sein';
      end if;
      v_cause_member := private.jsonb_uuid(p_payload, 'caused_by_member_id', false);
      if v_cause_member is not null then
        if v_result <> 'wipe' then
          raise exception using errcode = 'PT400', message = 'Einen Verursacher gibt es nur bei einem Wipe';
        end if;
        perform private.assert_player(p_challenge_id, v_cause_member);
      end if;
      return jsonb_strip_nulls(jsonb_build_object(
        'result', v_result,
        'caused_by_member_id', v_cause_member,
        'note', private.jsonb_text(p_payload, 'note', false, 200)
      ));

    when 'counter_adjusted' then
      v_counter := private.jsonb_text(p_payload, 'counter', true, 30);
      if v_counter not in ('deaths', 'missed_encounters') then
        raise exception using errcode = 'PT400', message = 'Zähler muss "deaths" oder "missed_encounters" sein';
      end if;
      v_member := private.jsonb_uuid(p_payload, 'member_id', true);
      perform private.assert_player(p_challenge_id, v_member);
      v_delta := private.jsonb_int(p_payload, 'delta', true, -1000, 1000);
      if v_delta = 0 then
        raise exception using errcode = 'PT400', message = 'Änderung darf nicht 0 sein';
      end if;
      return jsonb_strip_nulls(jsonb_build_object(
        'counter', v_counter,
        'member_id', v_member,
        'delta', v_delta,
        'note', private.jsonb_text(p_payload, 'note', false, 200)
      ));

    when 'event_reverted' then
      select * into v_target from public.events e
      where e.challenge_id = p_challenge_id and e.id = private.jsonb_int(p_payload, 'event_id', true, 1, 2147483647);
      if not found then
        raise exception using errcode = 'PT404', message = 'Ereignis nicht gefunden';
      end if;
      if v_target.type = 'event_reverted' then
        raise exception using errcode = 'PT400', message = 'Ein Undo kann nicht rückgängig gemacht werden';
      end if;
      if exists (select 1 from public.events r where r.reverts_event_id = v_target.id) then
        raise exception using errcode = 'PT409', message = 'Ereignis wurde bereits rückgängig gemacht';
      end if;

      if v_target.type = 'run_ended' then
        -- Nur das letzte Run-Ende, und nur solange im neuen Run noch nichts passiert ist
        if v_target.run_number <> p_run - 1 then
          raise exception using errcode = 'PT409', message = 'Nur das letzte Run-Ende kann rückgängig gemacht werden';
        end if;
        if exists (select 1 from public.active_events e where e.challenge_id = p_challenge_id and e.run_number = p_run) then
          raise exception using errcode = 'PT409',
            message = 'Im neuen Run gibt es schon Ereignisse; diese zuerst rückgängig machen';
        end if;
      elsif v_target.run_number <> p_run then
        raise exception using errcode = 'PT409', message = 'Nur Ereignisse des laufenden Runs können rückgängig gemacht werden';
      end if;

      if v_target.type = 'encounter_logged' and exists (
        select 1 from public.active_events e
        where e.challenge_id = p_challenge_id
          and e.id <> v_target.id
          and e.payload ->> 'encounter_id' = v_target.payload ->> 'encounter_id'
      ) then
        raise exception using errcode = 'PT409',
          message = 'Für dieses Pokémon gibt es spätere Ereignisse; diese zuerst rückgängig machen';
      end if;

      return jsonb_build_object('event_id', v_target.id);
  end case;
end;
$$;
