-- Demo-Challenge zum Ausprobieren: Pokémon Platin, vier Spieler in zwei Soul-Link-Paaren,
-- drei Wipes und ein vierter Run, der gegen Champ Cynthia gewinnt.
--
-- Ausführen: Supabase → SQL Editor → New query → kompletten Inhalt einfügen → Run.
-- Das Ergebnis sind vier persönliche Links (einmal nutzbar, 7 Tage gültig). Zuerst den Link der
-- Leitung (Moritz) öffnen, die anderen z. B. in einem privaten Fenster oder auf dem Handy.
--
-- Alles läuft über private.append_event, also durch dieselben Prüfungen wie die Website
-- (Soul-Links, Partner-Tode, Runs). Erneutes Ausführen löscht die alte Demo und legt sie neu an.
-- Spielernamen und Website-Adresse lassen sich in den ersten Zeilen unten anpassen.

create temporary table demo_settings as
select
  'demo-platin-soullink'::text as slug,
  'https://mlangenhan.github.io/SoullinkWebsite'::text as site_url,
  array['Moritz', 'Janne', 'Elsmann', 'Linus'] as players;

-- -------------------------------------------------------------------------------------
-- Hilfsfunktionen (nur für diese Sitzung)
-- -------------------------------------------------------------------------------------

create temporary table demo_state (challenge_id uuid not null, clock timestamptz not null);

-- Spieler nach Platz 1–4 (Paare: 1↔2, 3↔4)
create function pg_temp.member(p_seat integer) returns uuid
language sql stable as $$
  select m.id from public.challenge_members m
  where m.challenge_id = (select challenge_id from pg_temp.demo_state) and m.seat = p_seat - 1;
$$;

create function pg_temp.species(p_name text) returns integer
language plpgsql stable as $$
declare
  v_id integer;
begin
  select s.id into v_id from public.species s where s.name_de = p_name;
  if v_id is null then
    raise exception 'Unbekanntes Pokémon: %', p_name;
  end if;
  return v_id;
end;
$$;

create function pg_temp.route(p_name text) returns uuid
language plpgsql as $$
declare
  v_challenge uuid := (select challenge_id from pg_temp.demo_state);
  v_id uuid;
begin
  select r.id into v_id from public.routes r where r.challenge_id = v_challenge and lower(r.name) = lower(p_name);
  if v_id is null then
    insert into public.routes (challenge_id, name, sort_order)
    values (v_challenge, p_name, (select count(*) from public.routes r where r.challenge_id = v_challenge))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Beginn einer Spielsitzung; jedes Ereignis danach liegt ein paar Minuten später
create function pg_temp.sitzung(p_start timestamptz) returns void
language sql as $$
  update pg_temp.demo_state set clock = p_start;
$$;

create function pg_temp.ev(p_type public.event_type, p_payload jsonb, p_seat integer, p_minutes integer default 4)
returns public.events
language plpgsql as $$
declare
  v_state pg_temp.demo_state;
begin
  update pg_temp.demo_state set clock = clock + make_interval(mins => p_minutes) returning * into v_state;
  return private.append_event(
    v_state.challenge_id, p_type, p_payload, 'web', null, pg_temp.member(p_seat), null, null, v_state.clock
  );
end;
$$;

-- Lebendes Pokémon eines Spielers im laufenden Run
create function pg_temp.encounter(p_seat integer, p_species text) returns uuid
language plpgsql stable as $$
declare
  v_challenge uuid := (select challenge_id from pg_temp.demo_state);
  v_id uuid;
begin
  select en.encounter_id into v_id
  from public.encounters en
  where en.challenge_id = v_challenge
    and en.run_number = private.current_run(v_challenge)
    and en.member_id = pg_temp.member(p_seat)
    and en.species_id = pg_temp.species(p_species)
    and en.state in ('team', 'box')
  order by en.logged_at desc
  limit 1;
  if v_id is null then
    raise exception 'Spieler % hat kein lebendes %', p_seat, p_species;
  end if;
  return v_id;
end;
$$;

-- Eine Route für alle vier Spieler (null = verpasst). Ins Team, solange dort weniger als sechs sind.
create function pg_temp.fang(p_route text, p1 text, p2 text, p3 text, p4 text, p_kind text default 'wild')
returns void
language plpgsql as $$
declare
  v_challenge uuid := (select challenge_id from pg_temp.demo_state);
  v_route uuid := pg_temp.route(p_route);
  v_species text[] := array[p1, p2, p3, p4];
  v_team integer;
begin
  for seat in 1..4 loop
    if v_species[seat] is null then
      perform pg_temp.ev('encounter_missed', jsonb_build_object('member_id', pg_temp.member(seat), 'route_id', v_route), seat);
    else
      select count(*) into v_team from public.encounters en
      where en.challenge_id = v_challenge and en.run_number = private.current_run(v_challenge)
        and en.member_id = pg_temp.member(seat) and en.state = 'team';
      perform pg_temp.ev('encounter_logged', jsonb_build_object(
        'member_id', pg_temp.member(seat),
        'route_id', v_route,
        'species_id', pg_temp.species(v_species[seat]),
        'kind', p_kind,
        'status', case when v_team < 6 then 'team' else 'box' end
      ), seat);
    end if;
  end loop;
end;
$$;

create function pg_temp.entwickelt(p_seat integer, p_from text, p_to text) returns void
language sql as $$
  select pg_temp.ev('encounter_evolved', jsonb_build_object(
    'encounter_id', pg_temp.encounter(p_seat, p_from), 'species_id', pg_temp.species(p_to)), p_seat, 2);
$$;

create function pg_temp.korrigiert(p_seat integer, p_from text, p_to text) returns void
language sql as $$
  select pg_temp.ev('encounter_corrected', jsonb_build_object(
    'encounter_id', pg_temp.encounter(p_seat, p_from), 'species_id', pg_temp.species(p_to)), p_seat, 1);
$$;

create function pg_temp.box(p_seat integer, p_species text) returns void
language sql as $$
  select pg_temp.ev('encounter_status_changed', jsonb_build_object(
    'encounter_id', pg_temp.encounter(p_seat, p_species), 'status', 'box'), p_seat, 1);
$$;

create function pg_temp.team(p_seat integer, p_species text) returns void
language sql as $$
  select pg_temp.ev('encounter_status_changed', jsonb_build_object(
    'encounter_id', pg_temp.encounter(p_seat, p_species), 'status', 'team'), p_seat, 1);
$$;

-- Tod; der Soul-Link-Partner stirbt automatisch mit (zählt aber nur beim Besitzer)
create function pg_temp.stirbt(p_seat integer, p_species text, p_cause text, p_opponent text, p_level integer,
                               p_route text default null)
returns void
language sql as $$
  select pg_temp.ev('pokemon_died', jsonb_strip_nulls(jsonb_build_object(
    'encounter_id', pg_temp.encounter(p_seat, p_species),
    'cause', p_cause,
    'opponent', p_opponent,
    'level', p_level,
    'route_id', case when p_route is not null then pg_temp.route(p_route) end
  )), p_seat, 6);
$$;

-- Letztes Ereignis rückgängig machen (wie der Undo-Knopf in der Timeline)
create function pg_temp.rueckgaengig(p_seat integer) returns void
language sql as $$
  select pg_temp.ev('event_reverted', jsonb_build_object('event_id', (
    select max(e.id) from public.active_events e
    where e.challenge_id = (select challenge_id from pg_temp.demo_state) and e.type <> 'event_reverted'
  )), p_seat, 1);
$$;

create function pg_temp.wipe(p_seat integer, p_note text) returns void
language sql as $$
  select pg_temp.ev('run_ended', jsonb_build_object(
    'result', 'wipe', 'caused_by_member_id', pg_temp.member(p_seat), 'note', p_note), 1, 10);
$$;

create function pg_temp.sieg(p_note text) returns void
language sql as $$
  select pg_temp.ev('run_ended', jsonb_build_object('result', 'won', 'note', p_note), 1, 10);
$$;

-- -------------------------------------------------------------------------------------
-- Challenge und Spieler
-- -------------------------------------------------------------------------------------

delete from public.challenges where slug = (select slug from demo_settings);

with c as (
  insert into public.challenges (slug, name, game, visibility)
  select slug, 'Demo: Platin Soul Link', 'Pokémon Platin', 'private' from demo_settings
  returning id
)
insert into demo_state (challenge_id, clock) select id, now() from c;

insert into public.challenge_members (challenge_id, role, display_name, color, seat, link_group)
select s.challenge_id, case when p.seat = 0 then 'owner' else 'player' end::public.member_role,
       p.name, p.color, p.seat, p.seat / 2
from demo_state s,
     demo_settings d,
     lateral (values (0, d.players[1], '#2a6fdb'), (1, d.players[2], '#e0457b'),
                     (2, d.players[3], '#2f9e62'), (3, d.players[4], '#e8890c')) as p(seat, name, color);

-- -------------------------------------------------------------------------------------
-- Run 1: endet in der ersten Arena
-- -------------------------------------------------------------------------------------

select pg_temp.sitzung('2026-08-01 19:30+02');
select pg_temp.fang('Starter', 'Panflam', 'Plinfa', 'Chelast', 'Panflam');
select pg_temp.fang('Route 201', 'Staralili', 'Bidiza', 'Staralili', 'Sheinux');
select pg_temp.fang('Route 202', 'Sheinux', 'Zirpurze', 'Bidiza', 'Staralili');
select pg_temp.fang('Route 203', 'Abra', 'Zubat', 'Sheinux', 'Zirpurze');
select pg_temp.stirbt(3, 'Bidiza', 'Rivalenkampf', 'Baro', 9, 'Route 203');
select pg_temp.fang('Erzelingen-Mine', 'Kleinstein', 'Onix', 'Kleinstein', 'Onix');
select pg_temp.entwickelt(1, 'Staralili', 'Staravia');
select pg_temp.stirbt(1, 'Staravia', 'Arenakampf Erzelingen', 'Veit', 14);
select pg_temp.stirbt(1, 'Panflam', 'Arenakampf Erzelingen', 'Veit', 13);
select pg_temp.stirbt(2, 'Zubat', 'Arenakampf Erzelingen', 'Veit', 11);
select pg_temp.wipe(1, 'Veits Koknodon räumt mit Kopfnuss das halbe Team ab');

-- -------------------------------------------------------------------------------------
-- Run 2: scheitert an Silvanas Roserade
-- -------------------------------------------------------------------------------------

select pg_temp.sitzung('2026-08-03 20:00+02');
select pg_temp.fang('Starter', 'Plinfa', 'Chelast', 'Plinfa', 'Chelast');
select pg_temp.fang('Route 201', 'Bidiza', 'Staralili', 'Staralili', 'Bidiza');
select pg_temp.fang('Route 202', 'Staralili', 'Sheinux', 'Zirpurze', 'Sheinux');
select pg_temp.fang('Route 203', 'Abra', 'Zubat', 'Sheinux', 'Abra');
select pg_temp.fang('Erzelingen-Mine', 'Onix', 'Kleinstein', 'Kleinstein', 'Onix');

select pg_temp.sitzung('2026-08-05 19:45+02');
select pg_temp.fang('Route 204', 'Knospi', 'Wadribie', 'Knospi', null);
select pg_temp.fang('Route 205', 'Bamelin', 'Schalellos', 'Pachirisu', 'Bamelin');
select pg_temp.entwickelt(1, 'Plinfa', 'Pliprin');
select pg_temp.entwickelt(2, 'Chelast', 'Chelcarain');
select pg_temp.entwickelt(1, 'Staralili', 'Staravia');
select pg_temp.entwickelt(4, 'Chelast', 'Chelcarain');
select pg_temp.fang('Windkraftwerk', 'Driftlon', 'Driftlon', 'Driftlon', 'Driftlon', 'static');
select pg_temp.stirbt(4, 'Bidiza', 'Team Galaktik', 'Rüpel', 15, 'Windkraftwerk');
select pg_temp.fang('Ewigwald', 'Nebulak', 'Haspiror', 'Wadribie', 'Zirpurze');

select pg_temp.sitzung('2026-08-07 20:15+02');
select pg_temp.stirbt(3, 'Kleinstein', 'Arenakampf Ewigenau', 'Silvana', 20);
select pg_temp.stirbt(3, 'Plinfa', 'Arenakampf Ewigenau', 'Silvana', 21);
select pg_temp.stirbt(3, 'Driftlon', 'Arenakampf Ewigenau', 'Silvana', 19);
select pg_temp.wipe(3, 'Silvanas Roserade mit Giga-Sauger, gegen Pflanzen hatte keiner was dabei');

-- -------------------------------------------------------------------------------------
-- Run 3: kommt bis Herzhofen
-- -------------------------------------------------------------------------------------

select pg_temp.sitzung('2026-08-12 19:30+02');
select pg_temp.fang('Starter', 'Chelast', 'Panflam', 'Panflam', 'Plinfa');
select pg_temp.fang('Route 201', 'Sheinux', 'Staralili', 'Bidiza', 'Staralili');
select pg_temp.fang('Route 202', 'Staralili', 'Bidiza', 'Sheinux', 'Zirpurze');
select pg_temp.fang('Route 203', 'Zubat', 'Abra', 'Abra', 'Sheinux');
select pg_temp.fang('Erzelingen-Mine', 'Kleinstein', 'Onix', 'Onix', 'Kleinstein');
select pg_temp.entwickelt(1, 'Staralili', 'Staravia');
select pg_temp.entwickelt(2, 'Panflam', 'Panpyro');
select pg_temp.fang('Route 204', 'Knospi', 'Knospi', 'Wadribie', 'Haspiror');

select pg_temp.sitzung('2026-08-14 20:00+02');
select pg_temp.fang('Route 205', 'Schalellos', 'Bamelin', 'Bamelin', 'Pachirisu');
select pg_temp.fang('Windkraftwerk', 'Driftlon', 'Driftlon', 'Driftlon', 'Driftlon', 'static');
select pg_temp.fang('Ewigwald', 'Haspiror', 'Nebulak', 'Zirpurze', 'Nebulak');
select pg_temp.stirbt(4, 'Staralili', 'Rivalenkampf', 'Baro', 19);
select pg_temp.entwickelt(1, 'Chelast', 'Chelcarain');
select pg_temp.entwickelt(3, 'Panflam', 'Panpyro');
select pg_temp.entwickelt(4, 'Plinfa', 'Pliprin');

select pg_temp.sitzung('2026-08-19 19:30+02');
select pg_temp.fang('Route 206', 'Ponita', 'Skorgla', 'Skunkapuh', 'Zirpeise');
select pg_temp.fang('Route 207', 'Machollo', 'Ponita', 'Kleinstein', 'Machollo');
select pg_temp.stirbt(1, 'Sheinux', 'Wildes Pokémon', 'Kleinstein', 17, 'Route 207');

select pg_temp.sitzung('2026-08-22 18:00+02');
select pg_temp.fang('Route 208', 'Trasla', 'Roselia', 'Bidifas', 'Zubat');
select pg_temp.fang('Herzhofen', 'Evoli', 'Evoli', 'Evoli', 'Evoli', 'static');
select pg_temp.fang('Route 209', 'Zwirrlicht', 'Bidifas', 'Staravia', 'Roselia');
select pg_temp.stirbt(3, 'Wadribie', 'Wildes Pokémon', 'Staravia', 18, 'Route 209');
select pg_temp.stirbt(2, 'Skorgla', 'Arenakampf Herzhofen', 'Lamina', 25);
select pg_temp.stirbt(2, 'Onix', 'Arenakampf Herzhofen', 'Lamina', 24);
select pg_temp.stirbt(2, 'Panpyro', 'Arenakampf Herzhofen', 'Lamina', 26);
select pg_temp.wipe(2, 'Laminas Traunmagil mit Psystrahl und Verwirrung, das war es');

-- -------------------------------------------------------------------------------------
-- Run 4: bis zum Champ
-- -------------------------------------------------------------------------------------

select pg_temp.sitzung('2026-08-26 19:30+02');
select pg_temp.fang('Starter', 'Plinfa', 'Chelast', 'Panflam', 'Plinfa');
select pg_temp.fang('Route 201', 'Staralili', 'Sheinux', 'Bidiza', 'Staralili');
select pg_temp.fang('Route 202', 'Bidiza', 'Staralili', 'Sheinux', 'Zirpurze');
select pg_temp.fang('Route 203', 'Abra', 'Zubat', 'Zubat', 'Abra');
select pg_temp.fang('Erzelingen-Mine', 'Onix', 'Kleinstein', 'Kleinstein', 'Onix');
select pg_temp.entwickelt(1, 'Staralili', 'Staravia');
select pg_temp.fang('Route 204', 'Knospi', 'Wadribie', 'Knospi', 'Haspiror');

select pg_temp.sitzung('2026-08-29 20:00+02');
select pg_temp.fang('Route 205', 'Bamelin', 'Pachirisu', 'Schalellos', 'Bamelin');
-- Linus hatte sich vertippt: Es war ein Pachirisu
select pg_temp.korrigiert(4, 'Bamelin', 'Pachirisu');
select pg_temp.fang('Windkraftwerk', 'Driftlon', 'Driftlon', 'Driftlon', 'Driftlon', 'static');
select pg_temp.fang('Ewigwald', 'Nebulak', 'Haspiror', 'Zirpurze', 'Nebulak');
select pg_temp.entwickelt(1, 'Plinfa', 'Pliprin');
select pg_temp.entwickelt(2, 'Chelast', 'Chelcarain');
select pg_temp.entwickelt(3, 'Panflam', 'Panpyro');
select pg_temp.entwickelt(4, 'Plinfa', 'Pliprin');
select pg_temp.stirbt(3, 'Zubat', 'Team Galaktik', 'Rüpel', 16);

select pg_temp.sitzung('2026-09-02 19:30+02');
select pg_temp.fang('Route 206', 'Ponita', 'Skorgla', 'Skunkapuh', 'Zirpeise');
select pg_temp.fang('Route 207', 'Machollo', 'Ponita', 'Machollo', 'Kleinstein');
select pg_temp.fang('Kraterberg', 'Bronzel', 'Meditie', 'Klingplim', 'Bronzel');
select pg_temp.entwickelt(2, 'Sheinux', 'Luxio');
select pg_temp.fang('Route 208', 'Trasla', 'Roselia', 'Bidifas', 'Zubat');
select pg_temp.fang('Herzhofen', 'Evoli', 'Evoli', 'Evoli', 'Evoli', 'static');

select pg_temp.sitzung('2026-09-05 20:00+02');
select pg_temp.fang('Route 209', 'Zwirrlicht', 'Bidifas', 'Staravia', 'Roselia');
select pg_temp.stirbt(4, 'Zirpeise', 'Arenakampf Herzhofen', 'Lamina', 27);
-- Aus Versehen in die Box geschoben und gleich zurückgenommen
select pg_temp.box(1, 'Onix');
select pg_temp.rueckgaengig(1);
select pg_temp.fang('Route 210', 'Sichlor', 'Wablu', 'Ponita', 'Machollo');
select pg_temp.entwickelt(4, 'Evoli', 'Psiana');

select pg_temp.sitzung('2026-09-09 19:30+02');
select pg_temp.fang('Route 215', 'Schlurp', 'Abra', 'Kadabra', 'Ponita');
select pg_temp.stirbt(1, 'Bidiza', 'Arenakampf Schleiede', 'Hilda', 27);
select pg_temp.team(1, 'Bamelin');
select pg_temp.fang('Route 212', 'Glibunkel', 'Kirlia', 'Roselia', 'Glibunkel');
select pg_temp.fang('Großmoor', 'Pionskora', 'Venuflibis', 'Felino', 'Pionskora');
select pg_temp.stirbt(3, 'Ponita', 'Arenakampf Weideburg', 'Wellenbrecher Marinus', 33);

select pg_temp.sitzung('2026-09-13 18:30+02');
select pg_temp.fang('Route 213', 'Plaudagei', 'Schalellos', 'Plaudagei', null);
select pg_temp.fang('Route 214', 'Rihorn', 'Skunkapuh', 'Zirpeise', 'Rihorn');
select pg_temp.fang('Route 218', 'Finneon', 'Tentacha', 'Finneon', 'Tentacha');
select pg_temp.fang('Eiseninsel', 'Riolu', 'Riolu', 'Riolu', 'Riolu', 'static');
select pg_temp.stirbt(2, 'Roselia', 'Arenakampf Kanalava', 'Adam', 35);

select pg_temp.sitzung('2026-09-17 20:00+02');
select pg_temp.entwickelt(1, 'Pliprin', 'Impoleon');
select pg_temp.entwickelt(2, 'Chelcarain', 'Chelterrar');
select pg_temp.entwickelt(3, 'Panpyro', 'Panferno');
select pg_temp.entwickelt(4, 'Pliprin', 'Impoleon');
select pg_temp.entwickelt(1, 'Staravia', 'Staraptor');
select pg_temp.entwickelt(2, 'Luxio', 'Luxtra');
select pg_temp.entwickelt(3, 'Riolu', 'Lucario');
select pg_temp.fang('Route 216', 'Shnebedeck', null, 'Quiekel', 'Schneppke');
select pg_temp.fang('Route 217', 'Schneppke', 'Shnebedeck', 'Sniebel', 'Quiekel');
select pg_temp.stirbt(4, 'Rihorn', 'Arenakampf Blizzach', 'Frida', 37);
select pg_temp.stirbt(2, 'Skorgla', 'Arenakampf Blizzach', 'Frida', 36);

select pg_temp.sitzung('2026-09-24 19:30+02');
select pg_temp.fang('Route 222', 'Pantimos', 'Gastrodon', 'Luxio', 'Plaudagei');
select pg_temp.stirbt(3, 'Finneon', 'Arenakampf Sonnewik', 'Volkner', 45);

select pg_temp.sitzung('2026-09-30 20:00+02');
select pg_temp.fang('Siegesstraße', 'Georok', 'Golbat', 'Maschock', 'Rihorn');

select pg_temp.sitzung('2026-10-04 18:00+02');
select pg_temp.stirbt(4, 'Pionskora', 'Top Vier', 'Ignaz', 51);
select pg_temp.stirbt(1, 'Glibunkel', 'Top Vier', 'Lucian', 50);
select pg_temp.stirbt(3, 'Luxio', 'Champ', 'Cynthia', 55);
select pg_temp.sieg('Champ Cynthia besiegt! Knakrack fiel im letzten Zug gegen Impoleons Hydrokanone');

-- -------------------------------------------------------------------------------------
-- Persönliche Links (nur die Hashes werden gespeichert)
-- -------------------------------------------------------------------------------------

create temporary table demo_links as
select m.seat, m.display_name, m.role, m.id as member_id,
       'inv_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as token
from public.challenge_members m
where m.challenge_id = (select challenge_id from demo_state);

insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at)
select (select challenge_id from demo_state), sha256(convert_to(l.token, 'UTF8')), l.role, l.member_id, 1,
       now() + interval '7 days'
from demo_links l;

select l.display_name as spieler,
       case l.role when 'owner' then 'Leitung' else 'Spieler' end as rolle,
       (select site_url from demo_settings) || '/join#' || l.token as link
from demo_links l
order by l.seat;
