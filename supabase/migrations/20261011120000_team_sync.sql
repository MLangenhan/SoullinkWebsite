-- Teams angleichen: Ein Teamwechsel zieht die Soul-Link-Partner der anderen Spieler mit.
--
-- * challenges.team_sync: Einstellung pro Challenge (Standard an). Welche Partner wohin wechseln,
--   berechnet die Website (sie kennt die Team-Plätze); die Datenbank schreibt alles gemeinsam.
-- * change_team: mehrere Team/Box-Wechsel als eine Aktion, ganz oder gar nicht, mit group_id.
-- * undo_team_change: macht alle Wechsel einer Aktion zusammen rückgängig.

alter table public.challenges add column team_sync boolean not null default true;

-- Wie 20261010120000_team_slots, zusätzlich mit group_id (Kennung der gemeinsamen Aktion)
create or replace function private.validate_event(p_challenge_id uuid, p_run integer, p_type public.event_type, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_slot integer;
  v_group uuid;
  v_encounter public.encounters;
  v_member uuid;
  v_team integer;
begin
  if p_type = 'encounter_status_changed' and jsonb_typeof(p_payload) = 'object' then
    v_slot := private.jsonb_int(p_payload, 'slot', false, 1, 6);
    v_group := private.jsonb_uuid(p_payload, 'group_id', false);
    -- Umstellen innerhalb des Teams: nur mit Platz, sonst wäre es kein Wechsel
    if v_slot is not null and p_payload ->> 'status' = 'team' then
      v_encounter := private.require_living_encounter(
        p_challenge_id, p_run, private.jsonb_uuid(p_payload, 'encounter_id', true));
      if v_encounter.state = 'team' then
        return jsonb_strip_nulls(jsonb_build_object(
          'encounter_id', v_encounter.encounter_id, 'status', 'team', 'slot', v_slot, 'group_id', v_group));
      end if;
    end if;
  end if;

  v_result := private.validate_event_base(p_challenge_id, p_run, p_type, p_payload);

  if p_type in ('encounter_status_changed', 'encounter_logged') and v_result ->> 'status' = 'team' then
    v_member := coalesce(
      (v_result ->> 'member_id')::uuid,
      (select en.member_id from public.encounters en
       where en.challenge_id = p_challenge_id and en.encounter_id = (v_result ->> 'encounter_id')::uuid));
    select count(*) into v_team
    from public.encounters en
    where en.challenge_id = p_challenge_id and en.run_number = p_run and en.member_id = v_member and en.state = 'team';

    if v_team >= 6 then
      if p_type = 'encounter_logged' then
        v_result := jsonb_set(v_result, '{status}', '"box"');
      else
        raise exception using errcode = 'PT409',
          message = 'Das Team ist voll. Erst ein Pokémon in die Box legen oder tauschen';
      end if;
    elsif v_slot is not null then
      v_result := v_result || jsonb_build_object('slot', v_slot);
    end if;
  end if;

  if p_type = 'encounter_status_changed' and v_group is not null then
    v_result := v_result || jsonb_build_object('group_id', v_group);
  end if;
  return v_result;
end;
$$;

create function public.set_team_sync(p_challenge_id uuid, p_enabled boolean) returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
begin
  perform private.require_owner(p_challenge_id);
  update public.challenges set team_sync = p_enabled where id = p_challenge_id returning * into v_challenge;
  return v_challenge;
end;
$$;

-- p_moves: [{"encounter_id": …, "status": "team"|"box", "slot": 1–6?}, …]
-- Erst alle Wechsel in die Box, dann ins Team, damit beim Tauschen Plätze frei sind.
create function public.change_team(p_challenge_id uuid, p_group_id uuid, p_moves jsonb) returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members := private.require_player(p_challenge_id);
  v_ids bigint[] := '{}';
  v_move jsonb;
begin
  if p_group_id is null or jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) not between 1 and 32 then
    raise exception using errcode = 'PT400', message = 'Teamwechsel braucht eine Kennung und 1 bis 32 Änderungen';
  end if;

  -- Wiederholte Anfrage (Retry): die bereits geschriebenen Ereignisse liefern
  select coalesce(array_agg(e.id order by e.seq), '{}') into v_ids
  from public.events e
  where e.challenge_id = p_challenge_id and e.type = 'encounter_status_changed'
    and e.payload ->> 'group_id' = p_group_id::text;
  if cardinality(v_ids) > 0 then
    return v_ids;
  end if;

  for v_move in
    select m.value from jsonb_array_elements(p_moves) with ordinality as m(value, n)
    order by (m.value ->> 'status' = 'team'), m.n
  loop
    if jsonb_typeof(v_move) <> 'object' then
      raise exception using errcode = 'PT400', message = 'Jede Änderung muss ein JSON-Objekt sein';
    end if;
    v_ids := v_ids || (private.append_event(
      p_challenge_id, 'encounter_status_changed',
      jsonb_strip_nulls(jsonb_build_object(
        'encounter_id', v_move -> 'encounter_id', 'status', v_move -> 'status', 'slot', v_move -> 'slot',
        'group_id', p_group_id)),
      'web', auth.uid(), v_member.id, null, null, null
    )).id;
  end loop;
  return v_ids;
end;
$$;

create function public.undo_team_change(p_challenge_id uuid, p_group_id uuid) returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members := private.require_player(p_challenge_id);
  v_ids bigint[] := '{}';
  v_event_id bigint;
begin
  for v_event_id in
    select e.id from public.active_events e
    where e.challenge_id = p_challenge_id and e.type = 'encounter_status_changed'
      and e.payload ->> 'group_id' = p_group_id::text
    order by e.seq desc
  loop
    v_ids := v_ids || (private.append_event(
      p_challenge_id, 'event_reverted', jsonb_build_object('event_id', v_event_id),
      'web', auth.uid(), v_member.id, null, null, null
    )).id;
  end loop;
  if cardinality(v_ids) = 0 then
    raise exception using errcode = 'PT404', message = 'Teamwechsel nicht gefunden oder schon rückgängig gemacht';
  end if;
  return v_ids;
end;
$$;

revoke all on function private.validate_event(uuid, integer, public.event_type, jsonb) from public, anon, authenticated;
revoke all on function public.set_team_sync(uuid, boolean), public.change_team(uuid, uuid, jsonb),
  public.undo_team_change(uuid, uuid) from public, anon;
grant execute on function public.set_team_sync(uuid, boolean), public.change_team(uuid, uuid, jsonb),
  public.undo_team_change(uuid, uuid) to authenticated;
