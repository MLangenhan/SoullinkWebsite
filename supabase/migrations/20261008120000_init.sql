-- =====================================================================================
-- Soul-Link-Plattform – initiales Schema
--
-- Grundidee: Die Tabelle public.events ist die einzige Wahrheit über den Spielverlauf.
-- Jede Aktion (Begegnung, Tod, Wipe, …) ist ein unveränderliches Ereignis. Begegnungen,
-- Status, Friedhof und Zähler sind Views, die daraus berechnet werden. Rückgängig machen
-- heißt: ein Ereignis vom Typ event_reverted anhängen, nie löschen.
--
-- Begriffe: Eine Challenge ist die Gruppe mit ihren Spielern, Routen und Einladungen.
-- Sie besteht aus aufeinanderfolgenden Runs (Start bis Wipe oder Sieg). "Session"-Zähler
-- des alten Bots = Zähler des laufenden Runs.
--
-- Schreiben geht ausschließlich über Funktionen (RPC). Clients haben auf keine Tabelle
-- INSERT-, UPDATE- oder DELETE-Rechte. Lesen ist per Row Level Security beschränkt.
--
-- Anmeldung: Es gibt keine Konten. Wer einen Einladungslink öffnet, bekommt im Browser eine
-- anonyme Supabase-Sitzung (auth.users mit is_anonymous) und wird als Gerät an einen
-- Spielerplatz gebunden (member_devices). Ein Spieler kann mehrere Geräte haben.
-- =====================================================================================

-- Supabase vergibt in "public" standardmäßig alle Rechte an anon/authenticated und
-- PostgreSQL gibt EXECUTE auf neue Funktionen an PUBLIC. Beides hier abdrehen, damit jede
-- Freigabe weiter unten bewusst und sichtbar ist.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Nicht über die API erreichbares Schema für Hilfsfunktionen und Trigger
create schema if not exists private;
revoke all on schema private from public;

-- -------------------------------------------------------------------------------------
-- Typen
-- -------------------------------------------------------------------------------------

create type public.challenge_visibility as enum ('public', 'private');
create type public.member_role as enum ('owner', 'player', 'viewer');
create type public.event_source as enum ('web', 'bot', 'migration');
create type public.encounter_status as enum ('team', 'box');
-- static: einmalige Begegnung durch Ansprechen (Sonderregel), zusätzlich zur wilden der Route
create type public.encounter_kind as enum ('wild', 'static');
create type public.pokemon_state as enum ('team', 'box', 'dead', 'linked_dead');
create type public.event_type as enum (
  'encounter_logged',          -- Pokémon gefangen (gehört zu einem Soul-Link)
  'encounter_missed',          -- Begegnung verpasst
  'encounter_status_changed',  -- Team <-> Box
  'encounter_evolved',         -- Entwicklung
  'pokemon_died',              -- Tod inkl. Ort und Ursache
  'run_ended',                 -- Run verloren (Wipe) oder gewonnen, danach beginnt der nächste
  'counter_adjusted',          -- manuelle Korrektur / Altdaten aus dem Bot
  'event_reverted'             -- Undo eines früheren Ereignisses
);

-- -------------------------------------------------------------------------------------
-- Tabellen
-- -------------------------------------------------------------------------------------

-- Pokémon-Stammdaten, einmalig aus PokeAPI geladen (Seed-Skript)
create table public.species (
  id integer primary key check (id > 0),          -- nationale Pokédex-Nummer
  slug text not null unique,                      -- PokeAPI-Name, z. B. 'mr-mime'
  name_en text not null,
  name_de text not null,
  generation smallint not null check (generation between 1 and 20),
  evolution_chain_id integer not null,
  evolves_from_id integer references public.species (id) deferrable initially deferred,
  evolution_stage smallint not null check (evolution_stage between 1 and 5),
  sprite_url text not null
);
create index species_evolution_chain_idx on public.species (evolution_chain_id, evolution_stage);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (char_length(slug) between 3 and 40 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80),
  game text not null default 'platinum' check (char_length(game) between 1 and 40),
  visibility public.challenge_visibility not null default 'private',
  -- false: Über den Bot dürfen nur Discord-Konten schreiben, die mit einem Spieler verknüpft sind
  bot_allow_unlinked boolean not null default true,
  -- Fortlaufende Nummer des letzten Ereignisses; dient als Sperre und Synchronisationsmarke
  last_seq integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Spieler und Zuschauer einer Challenge. Ein Platz ohne Gerät (z. B. migrierte Spieler) wird
-- über einen Einladungslink übernommen.
create table public.challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  role public.member_role not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text check (color ~ '^#[0-9a-f]{6}$'),
  seat smallint check (seat >= 0),
  -- Für den Bot: Discord-Nutzer-ID, deren Befehle diesem Spieler zugeschrieben werden
  discord_id text check (discord_id ~ '^[0-9]{5,25}$'),
  created_at timestamptz not null default now(),
  unique (id, challenge_id),
  unique (challenge_id, seat),
  unique (challenge_id, discord_id),
  check ((role = 'viewer') = (seat is null))
);
create unique index challenge_members_name_idx on public.challenge_members (challenge_id, lower(display_name));

-- Geräte (anonyme Supabase-Sitzungen) eines Mitglieds. Ein Gerät gehört pro Challenge zu
-- genau einem Mitglied; challenge_id ist redundant, damit genau das als Schlüssel prüfbar ist.
create table public.member_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_id),
  foreign key (member_id, challenge_id) references public.challenge_members (id, challenge_id) on delete cascade
);
create index member_devices_member_idx on public.member_devices (member_id);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order integer not null,
  created_at timestamptz not null default now()
);
create unique index routes_name_idx on public.routes (challenge_id, lower(name));

create table public.events (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  seq integer not null check (seq > 0),
  run_number integer not null check (run_number > 0),
  type public.event_type not null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  source public.event_source not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_member_id uuid references public.challenge_members (id) on delete set null,
  -- Nur gesetzt, wenn ein Bot-Aufruf keinem Spieler zugeordnet werden konnte
  actor_discord_id text,
  client_event_id uuid,
  reverts_event_id bigint references public.events (id),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  unique (challenge_id, seq),
  unique (challenge_id, client_event_id),
  check ((type = 'event_reverted') = (reverts_event_id is not null))
);
-- Ein Ereignis kann höchstens einmal rückgängig gemacht werden
create unique index events_reverts_idx on public.events (reverts_event_id) where reverts_event_id is not null;
create index events_run_type_idx on public.events (challenge_id, type, run_number);
create index events_encounter_idx on public.events ((payload ->> 'encounter_id')) where payload ? 'encounter_id';

create table public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  token_hash bytea not null unique,
  role public.member_role not null,
  -- Optional: Link bindet ein Gerät an ein bestehendes Mitglied (Platzhalter oder weiteres Gerät)
  member_id uuid references public.challenge_members (id) on delete cascade,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((member_id is null and role in ('player', 'viewer')) or (member_id is not null and max_uses = 1))
);

-- Zugang des Discord-Bots: ein Token pro Challenge, nur als SHA-256-Hash gespeichert
create table public.bot_tokens (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  token_hash bytea not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------------------
-- Unveränderlichkeit der Ereignisse
-- -------------------------------------------------------------------------------------

-- Erlaubt sind nur: Löschen zusammen mit der ganzen Challenge und das Anonymisieren der
-- Urheber-Spalten (z. B. wenn eine Sitzung gelöscht wird). Alles andere wird abgewiesen.
create function private.protect_events() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.challenges r where r.id = old.challenge_id) then
      raise exception using errcode = 'PT403', message = 'Ereignisse sind unveränderlich';
    end if;
    return old;
  end if;

  if (to_jsonb(new) - '{actor_user_id,actor_member_id,actor_discord_id}'::text[])
       = (to_jsonb(old) - '{actor_user_id,actor_member_id,actor_discord_id}'::text[])
     and (new.actor_user_id is null or new.actor_user_id = old.actor_user_id)
     and (new.actor_member_id is null or new.actor_member_id = old.actor_member_id)
     and (new.actor_discord_id is null or new.actor_discord_id = old.actor_discord_id) then
    return new;
  end if;

  raise exception using errcode = 'PT403', message = 'Ereignisse sind unveränderlich';
end;
$$;

create trigger events_immutable
  before update or delete on public.events
  for each row execute function private.protect_events();

-- -------------------------------------------------------------------------------------
-- Berechtigungs-Hilfsfunktionen (security definer, damit RLS nicht rekursiv wird)
-- -------------------------------------------------------------------------------------

create function private.member_role(p_challenge_id uuid) returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.member_devices d
  join public.challenge_members m on m.id = d.member_id
  where d.challenge_id = p_challenge_id and d.user_id = auth.uid();
$$;

create function private.can_read_challenge(p_challenge_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.challenges r where r.id = p_challenge_id and r.visibility = 'public')
      or private.member_role(p_challenge_id) is not null;
$$;

create function private.is_challenge_owner(p_challenge_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(p_challenge_id) = 'owner', false);
$$;

create function private.require_user() returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'Anmeldung erforderlich';
  end if;
  return auth.uid();
end;
$$;

create function private.require_owner(p_challenge_id uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not private.is_challenge_owner(p_challenge_id) then
    raise exception using errcode = 'PT403', message = 'Nur die Challenge-Leitung darf das';
  end if;
end;
$$;

-- Spieler-Eintrag des angemeldeten Nutzers (Rolle owner oder player), sonst Fehler
create function private.require_player(p_challenge_id uuid) returns public.challenge_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members;
begin
  perform private.require_user();
  select m.* into v_member
  from public.member_devices d
  join public.challenge_members m on m.id = d.member_id
  where d.challenge_id = p_challenge_id and d.user_id = auth.uid() and m.role in ('owner', 'player');
  if not found then
    raise exception using errcode = 'PT403', message = 'Nur Mitspieler dürfen in dieser Challenge schreiben';
  end if;
  return v_member;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Payload-Hilfsfunktionen: lesen ein Feld typgeprüft aus und werfen verständliche Fehler
-- -------------------------------------------------------------------------------------

create function private.jsonb_uuid(p jsonb, k text, required boolean) returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p ? k) or jsonb_typeof(p -> k) = 'null' then
    if required then
      raise exception using errcode = 'PT400', message = format('Feld "%s" fehlt', k);
    end if;
    return null;
  end if;
  if jsonb_typeof(p -> k) <> 'string' then
    raise exception using errcode = 'PT400', message = format('Feld "%s" muss eine UUID sein', k);
  end if;
  return (p ->> k)::uuid;
exception
  when invalid_text_representation then
    raise exception using errcode = 'PT400', message = format('Feld "%s" muss eine UUID sein', k);
end;
$$;

create function private.jsonb_int(p jsonb, k text, required boolean, min_value integer, max_value integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if not (p ? k) or jsonb_typeof(p -> k) = 'null' then
    if required then
      raise exception using errcode = 'PT400', message = format('Feld "%s" fehlt', k);
    end if;
    return null;
  end if;
  if jsonb_typeof(p -> k) <> 'number' then
    raise exception using errcode = 'PT400', message = format('Feld "%s" muss eine Zahl sein', k);
  end if;
  v := (p ->> k)::numeric;
  if v <> trunc(v) or v < min_value or v > max_value then
    raise exception using errcode = 'PT400',
      message = format('Feld "%s" muss eine ganze Zahl zwischen %s und %s sein', k, min_value, max_value);
  end if;
  return v::integer;
end;
$$;

create function private.jsonb_text(p jsonb, k text, required boolean, max_length integer) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p ? k and jsonb_typeof(p -> k) not in ('string', 'null') then
    raise exception using errcode = 'PT400', message = format('Feld "%s" muss Text sein', k);
  end if;
  v := nullif(trim(p ->> k), '');
  if v is null and required then
    raise exception using errcode = 'PT400', message = format('Feld "%s" fehlt', k);
  end if;
  if char_length(v) > max_length then
    raise exception using errcode = 'PT400', message = format('Feld "%s" ist länger als %s Zeichen', k, max_length);
  end if;
  return v;
end;
$$;

create function private.assert_player(p_challenge_id uuid, p_member_id uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.challenge_members m
    where m.id = p_member_id and m.challenge_id = p_challenge_id and m.role in ('owner', 'player')
  ) then
    raise exception using errcode = 'PT400', message = 'Spieler gehört nicht zu dieser Challenge';
  end if;
end;
$$;

create function private.assert_route(p_challenge_id uuid, p_route_id uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.routes r where r.id = p_route_id and r.challenge_id = p_challenge_id) then
    raise exception using errcode = 'PT400', message = 'Route gehört nicht zu dieser Challenge';
  end if;
end;
$$;

create function private.assert_species(p_species_id integer) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.species s where s.id = p_species_id) then
    raise exception using errcode = 'PT400', message = format('Unbekanntes Pokémon #%s', p_species_id);
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Projektionen (Views). security_invoker sorgt dafür, dass die RLS der Basistabellen
-- auch beim Lesen über die Views gilt.
-- -------------------------------------------------------------------------------------

-- Alle Ereignisse, die zählen: weder selbst ein Undo noch rückgängig gemacht
create view public.active_events with (security_invoker = true) as
select e.*
from public.events e
where e.type <> 'event_reverted'
  and not exists (select 1 from public.events r where r.reverts_event_id = e.id);

-- Eine Zeile pro gefangenem Pokémon mit aktuellem Zustand
create view public.encounters with (security_invoker = true) as
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
last_species as (
  select distinct on (e.payload ->> 'encounter_id')
    (e.payload ->> 'encounter_id')::uuid as encounter_id,
    (e.payload ->> 'species_id')::integer as species_id
  from public.active_events e
  where e.type = 'encounter_evolved'
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
  l.species_id as caught_species_id,
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
left join deaths d on d.encounter_id = l.encounter_id
left join link_deaths ld on ld.link_id = l.link_id;

-- Kennzahlen pro Challenge
create view public.challenge_stats with (security_invoker = true) as
select
  r.id as challenge_id,
  (1 + count(e.id))::integer as current_run,
  count(e.id)::integer as runs_finished,
  (count(e.id) filter (where e.payload ->> 'result' = 'wipe'))::integer as wipes_total,
  (count(e.id) filter (where e.payload ->> 'result' = 'won'))::integer as wins_total
from public.challenges r
left join public.active_events e on e.challenge_id = r.id and e.type = 'run_ended'
group by r.id;

-- Zähler pro Spieler: laufender Run ("Session") und gesamt
create view public.member_stats with (security_invoker = true) as
with facts as (
  select en.challenge_id, en.member_id, en.run_number, 'deaths' as counter, 1 as amount
  from public.encounters en
  where en.state = 'dead'
  union all
  select e.challenge_id, (e.payload ->> 'member_id')::uuid, e.run_number, 'missed_encounters', 1
  from public.active_events e
  where e.type = 'encounter_missed'
  union all
  select e.challenge_id, (e.payload ->> 'member_id')::uuid, e.run_number, e.payload ->> 'counter',
         (e.payload ->> 'delta')::integer
  from public.active_events e
  where e.type = 'counter_adjusted'
  union all
  select e.challenge_id, (e.payload ->> 'caused_by_member_id')::uuid, e.run_number, 'wipes', 1
  from public.active_events e
  where e.type = 'run_ended' and e.payload ->> 'result' = 'wipe' and e.payload ? 'caused_by_member_id'
)
select
  m.challenge_id,
  m.id as member_id,
  m.display_name,
  m.seat,
  s.current_run,
  coalesce(sum(f.amount) filter (where f.counter = 'deaths' and f.run_number = s.current_run), 0)::integer
    as deaths_run,
  coalesce(sum(f.amount) filter (where f.counter = 'deaths'), 0)::integer as deaths_total,
  coalesce(sum(f.amount) filter (where f.counter = 'missed_encounters' and f.run_number = s.current_run), 0)::integer
    as missed_run,
  coalesce(sum(f.amount) filter (where f.counter = 'missed_encounters'), 0)::integer as missed_total,
  coalesce(sum(f.amount) filter (where f.counter = 'wipes'), 0)::integer as wipes_caused
from public.challenge_members m
join public.challenge_stats s on s.challenge_id = m.challenge_id
left join facts f on f.member_id = m.id and f.challenge_id = m.challenge_id
where m.role in ('owner', 'player')
group by m.challenge_id, m.id, m.display_name, m.seat, s.current_run;

-- Friedhof: selbst gestorbene Pokémon mit ihren Soul-Link-Partnern
create view public.graveyard with (security_invoker = true) as
select
  en.*,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'encounter_id', p.encounter_id,
      'member_id', p.member_id,
      'species_id', p.species_id,
      'nickname', p.nickname,
      'state', p.state
    ) order by p.logged_at)
    from public.encounters p
    where p.link_id = en.link_id and p.encounter_id <> en.encounter_id
  ), '[]'::jsonb) as partners
from public.encounters en
where en.state = 'dead';

-- -------------------------------------------------------------------------------------
-- Ereignisse anhängen: einziger Schreibpfad für Web, Bot und Migration
-- -------------------------------------------------------------------------------------

create function private.current_run(p_challenge_id uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 1 + count(*)::integer
  from public.active_events e
  where e.challenge_id = p_challenge_id and e.type = 'run_ended';
$$;

-- Lebendes Pokémon des laufenden Runs, sonst Fehler
create function private.require_living_encounter(p_challenge_id uuid, p_run integer, p_encounter_id uuid)
returns public.encounters
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_encounter public.encounters;
begin
  select * into v_encounter from public.encounters en
  where en.challenge_id = p_challenge_id and en.encounter_id = p_encounter_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Begegnung nicht gefunden';
  end if;
  if v_encounter.run_number <> p_run then
    raise exception using errcode = 'PT409', message = 'Begegnung gehört zu einem früheren Run';
  end if;
  if v_encounter.state in ('dead', 'linked_dead') then
    raise exception using errcode = 'PT409', message = 'Pokémon ist bereits tot';
  end if;
  return v_encounter;
end;
$$;

-- Prüft den Payload je Ereignistyp und gibt ihn normalisiert zurück (unbekannte Felder fallen weg)
create function private.validate_event(p_challenge_id uuid, p_run integer, p_type public.event_type, p_payload jsonb)
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

      v_link := private.jsonb_uuid(p_payload, 'link_id', false);
      if v_link is null then
        -- Ohne Angabe: dem jüngsten Soul-Link dieser Route und Art beitreten, in dem der Spieler noch fehlt
        select en.link_id into v_link
        from public.encounters en
        where en.challenge_id = p_challenge_id and en.run_number = p_run and en.route_id = v_route
          and en.kind::text = v_kind
          and not exists (
            select 1 from public.encounters o where o.link_id = en.link_id and o.member_id = v_member
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

create function private.append_event(
  p_challenge_id uuid,
  p_type public.event_type,
  p_payload jsonb,
  p_source public.event_source,
  p_actor_user_id uuid,
  p_actor_member_id uuid,
  p_actor_discord_id text default null,
  p_client_event_id uuid default null,
  p_occurred_at timestamptz default null
) returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
  v_run integer;
  v_payload jsonb;
  v_event public.events;
begin
  -- Zeilensperre auf der Challenge: Ereignisse einer Challenge werden strikt nacheinander geschrieben
  select r.last_seq into v_seq from public.challenges r where r.id = p_challenge_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'Challenge nicht gefunden';
  end if;

  -- Idempotenz: Wiederholte Anfragen (Doppelklick, Bot-Retry) liefern das vorhandene Ereignis
  if p_client_event_id is not null then
    select * into v_event from public.events e
    where e.challenge_id = p_challenge_id and e.client_event_id = p_client_event_id;
    if found then
      if v_event.type <> p_type then
        raise exception using errcode = 'PT409', message = 'client_event_id wurde für ein anderes Ereignis verwendet';
      end if;
      return v_event;
    end if;
  end if;

  v_run := private.current_run(p_challenge_id);
  v_payload := private.validate_event(p_challenge_id, v_run, p_type, p_payload);

  insert into public.events (
    challenge_id, seq, run_number, type, payload, source,
    actor_user_id, actor_member_id, actor_discord_id,
    client_event_id, reverts_event_id, occurred_at
  )
  values (
    p_challenge_id, v_seq + 1, v_run, p_type, v_payload, p_source,
    p_actor_user_id, p_actor_member_id, p_actor_discord_id,
    p_client_event_id,
    case when p_type = 'event_reverted' then (v_payload ->> 'event_id')::bigint end,
    coalesce(p_occurred_at, now())
  )
  returning * into v_event;

  update public.challenges set last_seq = v_seq + 1 where id = p_challenge_id;
  return v_event;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Öffentliche RPCs für die Website
-- -------------------------------------------------------------------------------------

create function private.new_token(p_prefix text) returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

create function private.token_hash(p_token text) returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(p_token, 'UTF8'));
$$;

create function public.create_challenge(
  p_name text,
  p_slug text,
  p_display_name text,
  p_visibility public.challenge_visibility default 'private',
  p_game text default 'platinum'
) returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_challenge public.challenges;
  v_member_id uuid;
begin
  insert into public.challenges (slug, name, game, visibility, created_by)
  values (lower(trim(p_slug)), trim(p_name), trim(p_game), p_visibility, v_user)
  returning * into v_challenge;

  insert into public.challenge_members (challenge_id, role, display_name, seat)
  values (v_challenge.id, 'owner', trim(p_display_name), 0)
  returning id into v_member_id;

  insert into public.member_devices (user_id, challenge_id, member_id)
  values (v_user, v_challenge.id, v_member_id);

  return v_challenge;
exception
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'Diese Challenge-Adresse ist schon vergeben';
end;
$$;

create function public.update_challenge(
  p_challenge_id uuid,
  p_name text,
  p_visibility public.challenge_visibility,
  p_bot_allow_unlinked boolean
) returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
begin
  perform private.require_owner(p_challenge_id);
  update public.challenges
  set name = trim(p_name), visibility = p_visibility, bot_allow_unlinked = p_bot_allow_unlinked
  where id = p_challenge_id
  returning * into v_challenge;
  return v_challenge;
end;
$$;

-- Löschen verlangt zur Bestätigung die Challenge-Adresse
create function public.delete_challenge(p_challenge_id uuid, p_confirm_slug text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner(p_challenge_id);
  delete from public.challenges where id = p_challenge_id and slug = p_confirm_slug;
  if not found then
    raise exception using errcode = 'PT400', message = 'Bestätigung stimmt nicht mit der Challenge-Adresse überein';
  end if;
end;
$$;

-- Platzhalter-Spieler ohne Gerät (wird später per Einladungslink übernommen)
create function public.add_player(p_challenge_id uuid, p_display_name text) returns public.challenge_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members;
begin
  perform private.require_owner(p_challenge_id);
  insert into public.challenge_members (challenge_id, role, display_name, seat)
  values (
    p_challenge_id,
    'player',
    trim(p_display_name),
    (select coalesce(max(m.seat) + 1, 0) from public.challenge_members m where m.challenge_id = p_challenge_id)
  )
  returning * into v_member;
  return v_member;
exception
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'Name ist in dieser Challenge schon vergeben';
end;
$$;

-- Eigener Mitgliedseintrag des angemeldeten Geräts in einer Challenge (oder null)
create function private.my_member_id(p_challenge_id uuid) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.member_id from public.member_devices d
  where d.challenge_id = p_challenge_id and d.user_id = auth.uid();
$$;

-- Name, Farbe und Discord-ID ändern: das Mitglied selbst oder die Challenge-Leitung
create function public.update_member(p_member_id uuid, p_display_name text, p_color text, p_discord_id text)
returns public.challenge_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members;
begin
  perform private.require_user();
  select * into v_member from public.challenge_members m where m.id = p_member_id;
  if not found
     or not (private.my_member_id(v_member.challenge_id) = p_member_id
             or private.is_challenge_owner(v_member.challenge_id)) then
    raise exception using errcode = 'PT403', message = 'Keine Berechtigung für dieses Mitglied';
  end if;
  update public.challenge_members
  set display_name = trim(p_display_name),
      color = lower(nullif(trim(p_color), '')),
      discord_id = nullif(trim(p_discord_id), '')
  where id = p_member_id
  returning * into v_member;
  return v_member;
exception
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'Name oder Discord-ID ist in dieser Challenge schon vergeben';
end;
$$;

-- Einladungslink. Mit p_member_id bindet der Link ein Gerät an dieses Mitglied: die Leitung für
-- jeden Platz, jedes Mitglied für sich selbst (zweites Gerät). Ohne p_member_id entsteht beim
-- Beitritt ein neues Mitglied (nur Leitung). Gibt den Klartext-Token genau einmal zurück;
-- gespeichert wird nur der Hash.
create function public.create_invite(
  p_challenge_id uuid,
  p_role public.member_role,
  p_member_id uuid default null,
  p_valid_hours integer default 72,
  p_max_uses integer default 1
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := private.new_token('inv_');
  v_member public.challenge_members;
  v_role public.member_role := p_role;
begin
  perform private.require_user();
  if p_valid_hours not between 1 and 720 then
    raise exception using errcode = 'PT400', message = 'Gültigkeit muss zwischen 1 und 720 Stunden liegen';
  end if;

  if p_member_id is null then
    perform private.require_owner(p_challenge_id);
    if p_role not in ('player', 'viewer') then
      raise exception using errcode = 'PT400', message = 'Neue Mitglieder können nur Spieler oder Zuschauer sein';
    end if;
  else
    select * into v_member from public.challenge_members m
    where m.id = p_member_id and m.challenge_id = p_challenge_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'Mitglied nicht gefunden';
    end if;
    if not (private.is_challenge_owner(p_challenge_id) or private.my_member_id(p_challenge_id) = p_member_id) then
      raise exception using errcode = 'PT403', message = 'Gerätelinks erstellt die Leitung oder das Mitglied selbst';
    end if;
    v_role := v_member.role;
  end if;

  insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at, created_by)
  values (
    p_challenge_id,
    private.token_hash(v_token),
    v_role,
    p_member_id,
    case when p_member_id is null then p_max_uses else 1 end,
    now() + make_interval(hours => p_valid_hours),
    auth.uid()
  );
  return v_token;
end;
$$;

create function public.revoke_invite(p_invite_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_id uuid;
begin
  select i.challenge_id into v_challenge_id from public.challenge_invites i where i.id = p_invite_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Einladung nicht gefunden';
  end if;
  perform private.require_owner(v_challenge_id);
  update public.challenge_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite_id;
end;
$$;

-- Einladungslink einlösen. Das Gerät (anonyme Sitzung) muss vorher angemeldet sein.
create function public.join_challenge(p_token text, p_display_name text default null) returns public.challenge_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_invite public.challenge_invites;
  v_member public.challenge_members;
  v_existing uuid;
begin
  select * into v_invite from public.challenge_invites i
  where i.token_hash = private.token_hash(p_token)
    and i.revoked_at is null
    and i.expires_at > now()
    and i.uses < i.max_uses
  for update;
  if not found then
    -- Bewusst ohne Details, damit sich gültige Tokens nicht erraten lassen
    raise exception using errcode = 'PT404', message = 'Einladung ungültig oder abgelaufen';
  end if;

  v_existing := private.my_member_id(v_invite.challenge_id);
  if v_existing is not null then
    raise exception using errcode = 'PT409', message = 'Dieses Gerät gehört in dieser Challenge schon zu einem Mitglied';
  end if;

  if v_invite.member_id is not null then
    select * into v_member from public.challenge_members m where m.id = v_invite.member_id;
  else
    if nullif(trim(p_display_name), '') is null then
      raise exception using errcode = 'PT400', message = 'Bitte einen Namen angeben';
    end if;
    insert into public.challenge_members (challenge_id, role, display_name, seat)
    values (
      v_invite.challenge_id,
      v_invite.role,
      trim(p_display_name),
      case when v_invite.role = 'viewer' then null else (
        select coalesce(max(m.seat) + 1, 0) from public.challenge_members m where m.challenge_id = v_invite.challenge_id
      ) end
    )
    returning * into v_member;
  end if;

  insert into public.member_devices (user_id, challenge_id, member_id)
  values (v_user, v_invite.challenge_id, v_member.id);

  update public.challenge_invites set uses = uses + 1 where id = v_invite.id;
  return v_member;
exception
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'Name ist in dieser Challenge schon vergeben';
end;
$$;

-- Alle Geräte eines Mitglieds abmelden (z. B. verlorenes Handy). Danach braucht es einen neuen Link.
create function public.remove_member_devices(p_member_id uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_id uuid;
  v_count integer;
begin
  select m.challenge_id into v_challenge_id from public.challenge_members m where m.id = p_member_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Mitglied nicht gefunden';
  end if;
  perform private.require_owner(v_challenge_id);
  if private.my_member_id(v_challenge_id) = p_member_id then
    raise exception using errcode = 'PT400', message = 'Die eigenen Geräte kann die Leitung nicht abmelden';
  end if;
  delete from public.member_devices where member_id = p_member_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Legt eine Route an oder gibt die bestehende gleichen Namens zurück
create function private.ensure_route(p_challenge_id uuid, p_name text) returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.routes;
begin
  select * into v_route from public.routes r where r.challenge_id = p_challenge_id and lower(r.name) = lower(trim(p_name));
  if found then
    return v_route;
  end if;
  insert into public.routes (challenge_id, name, sort_order)
  values (
    p_challenge_id,
    trim(p_name),
    (select coalesce(max(r.sort_order) + 1, 0) from public.routes r where r.challenge_id = p_challenge_id)
  )
  returning * into v_route;
  return v_route;
end;
$$;

create function public.create_route(p_challenge_id uuid, p_name text) returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_player(p_challenge_id);
  return private.ensure_route(p_challenge_id, p_name);
end;
$$;

create function public.update_route(p_route_id uuid, p_name text, p_sort_order integer) returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.routes;
begin
  select * into v_route from public.routes r where r.id = p_route_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Route nicht gefunden';
  end if;
  perform private.require_player(v_route.challenge_id);
  update public.routes set name = trim(p_name), sort_order = p_sort_order
  where id = p_route_id
  returning * into v_route;
  return v_route;
exception
  when unique_violation then
    raise exception using errcode = 'PT409', message = 'Eine Route mit diesem Namen gibt es schon';
end;
$$;

create function public.append_event(
  p_challenge_id uuid,
  p_type public.event_type,
  p_payload jsonb,
  p_client_event_id uuid default null
) returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members := private.require_player(p_challenge_id);
begin
  return private.append_event(
    p_challenge_id, p_type, p_payload, 'web', auth.uid(), v_member.id, null, p_client_event_id, null
  );
end;
$$;

create function public.create_bot_token(p_challenge_id uuid, p_label text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := private.new_token('slb_');
begin
  perform private.require_owner(p_challenge_id);
  insert into public.bot_tokens (challenge_id, label, token_hash, created_by)
  values (p_challenge_id, trim(p_label), private.token_hash(v_token), auth.uid());
  return v_token;
end;
$$;

create function public.revoke_bot_token(p_token_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_id uuid;
begin
  select t.challenge_id into v_challenge_id from public.bot_tokens t where t.id = p_token_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Bot-Token nicht gefunden';
  end if;
  perform private.require_owner(v_challenge_id);
  update public.bot_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_token_id;
end;
$$;

-- -------------------------------------------------------------------------------------
-- RPCs für den Discord-Bot. Der Bot nutzt nur den öffentlichen anon-Key plus sein
-- Challenge-Token. Er kann genau diese drei Funktionen aufrufen und nur seine Challenge sehen.
-- -------------------------------------------------------------------------------------

create function private.bot_auth(p_token text) returns public.bot_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.bot_tokens;
begin
  update public.bot_tokens
  set last_used_at = now()
  where token_hash = private.token_hash(p_token) and revoked_at is null
  returning * into v_token;
  if not found then
    raise exception using errcode = 'PT401', message = 'Bot-Token ungültig oder widerrufen';
  end if;
  return v_token;
end;
$$;

-- Kompletter Lesestand der Challenge in einem Aufruf (Spieler, Routen, Begegnungen, Zähler)
create function public.bot_state(p_token text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.bot_tokens := private.bot_auth(p_token);
begin
  return (
    select jsonb_build_object(
      'challenge', (
        select jsonb_build_object(
          'id', r.id, 'slug', r.slug, 'name', r.name, 'game', r.game,
          'last_seq', r.last_seq, 'current_run', s.current_run,
          'runs_finished', s.runs_finished, 'wipes_total', s.wipes_total, 'wins_total', s.wins_total
        )
        from public.challenges r join public.challenge_stats s on s.challenge_id = r.id
        where r.id = v_token.challenge_id
      ),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'display_name', m.display_name, 'role', m.role, 'seat', m.seat,
          'discord_id', m.discord_id
        ) order by m.seat nulls last, m.display_name)
        from public.challenge_members m
        where m.challenge_id = v_token.challenge_id
      ), '[]'::jsonb),
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object('id', rt.id, 'name', rt.name, 'sort_order', rt.sort_order)
                         order by rt.sort_order)
        from public.routes rt
        where rt.challenge_id = v_token.challenge_id
      ), '[]'::jsonb),
      'encounters', coalesce((
        select jsonb_agg(to_jsonb(en) - 'challenge_id' order by en.logged_at)
        from public.encounters en
        where en.challenge_id = v_token.challenge_id
      ), '[]'::jsonb),
      'member_stats', coalesce((
        select jsonb_agg(to_jsonb(ms) - 'challenge_id' order by ms.seat)
        from public.member_stats ms
        where ms.challenge_id = v_token.challenge_id
      ), '[]'::jsonb),
      'recent_events', coalesce((
        select jsonb_agg(to_jsonb(e) - 'challenge_id' - 'actor_user_id' order by e.seq desc)
        from (
          select * from public.events ev where ev.challenge_id = v_token.challenge_id order by ev.seq desc limit 25
        ) e
      ), '[]'::jsonb)
    )
  );
end;
$$;

create function public.bot_create_route(p_token text, p_name text) returns public.routes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.bot_tokens := private.bot_auth(p_token);
begin
  return private.ensure_route(v_token.challenge_id, p_name);
end;
$$;

create function public.bot_append_event(
  p_token text,
  p_discord_user_id text,
  p_type public.event_type,
  p_payload jsonb,
  p_client_event_id uuid default null
) returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.bot_tokens := private.bot_auth(p_token);
  v_member public.challenge_members;
  v_allow_unlinked boolean;
begin
  if p_discord_user_id is null or p_discord_user_id !~ '^[0-9]{5,25}$' then
    raise exception using errcode = 'PT400', message = 'Ungültige Discord-ID';
  end if;

  select m.* into v_member
  from public.challenge_members m
  where m.challenge_id = v_token.challenge_id and m.discord_id = p_discord_user_id;

  if found and v_member.role = 'viewer' then
    raise exception using errcode = 'PT403', message = 'Zuschauer dürfen nicht schreiben';
  end if;

  if found then
    return private.append_event(
      v_token.challenge_id, p_type, p_payload, 'bot', null, v_member.id, null, p_client_event_id, null
    );
  end if;

  select r.bot_allow_unlinked into v_allow_unlinked from public.challenges r where r.id = v_token.challenge_id;
  if not v_allow_unlinked then
    raise exception using errcode = 'PT403',
      message = 'Dein Discord-Konto ist mit keinem Spieler dieser Challenge verknüpft';
  end if;
  return private.append_event(
    v_token.challenge_id, p_type, p_payload, 'bot', null, null, p_discord_user_id, p_client_event_id, null
  );
end;
$$;

-- -------------------------------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------------------------------

alter table public.species enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.routes enable row level security;
alter table public.events enable row level security;
alter table public.challenge_invites enable row level security;
alter table public.bot_tokens enable row level security;
alter table public.member_devices enable row level security;

-- Eigene Gerätebindungen ("Meine Challenges"); die Leitung sieht alle ihrer Challenge
create policy "Eigene Geräte lesen, Leitung alle" on public.member_devices
  for select to authenticated using (user_id = auth.uid() or private.is_challenge_owner(challenge_id));

create policy "Stammdaten sind öffentlich" on public.species
  for select to anon, authenticated using (true);

create policy "Öffentliche und eigene Challenges lesen" on public.challenges
  for select to anon, authenticated using (private.can_read_challenge(id));
create policy "Mitglieder sichtbarer Challenges lesen" on public.challenge_members
  for select to anon, authenticated using (private.can_read_challenge(challenge_id));
create policy "Routen sichtbarer Challenges lesen" on public.routes
  for select to anon, authenticated using (private.can_read_challenge(challenge_id));
create policy "Ereignisse sichtbarer Challenges lesen" on public.events
  for select to anon, authenticated using (private.can_read_challenge(challenge_id));

create policy "Challenge-Leitung sieht Einladungen" on public.challenge_invites
  for select to authenticated using (private.is_challenge_owner(challenge_id));
create policy "Challenge-Leitung sieht Bot-Tokens" on public.bot_tokens
  for select to authenticated using (private.is_challenge_owner(challenge_id));

-- -------------------------------------------------------------------------------------
-- Rechte: ausschließlich Lesen auf Tabellen/Views, Schreiben nur über die RPCs oben
-- -------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant select on public.species, public.challenges, public.challenge_members, public.routes, public.events
  to anon, authenticated;
grant select on public.active_events, public.encounters, public.challenge_stats, public.member_stats, public.graveyard
  to anon, authenticated;
grant select on public.member_devices to authenticated;
-- Token-Hashes verlassen die Datenbank nie
grant select (id, challenge_id, role, member_id, max_uses, uses, expires_at, revoked_at, created_by, created_at)
  on public.challenge_invites to authenticated;
grant select (id, challenge_id, label, last_used_at, revoked_at, created_by, created_at)
  on public.bot_tokens to authenticated;

-- Für RLS-Policies benötigt
grant usage on schema private to anon, authenticated;
grant execute on function private.member_role(uuid), private.can_read_challenge(uuid), private.is_challenge_owner(uuid)
  to anon, authenticated;

grant execute on function
  public.create_challenge(text, text, text, public.challenge_visibility, text),
  public.update_challenge(uuid, text, public.challenge_visibility, boolean),
  public.delete_challenge(uuid, text),
  public.add_player(uuid, text),
  public.update_member(uuid, text, text, text),
  public.remove_member_devices(uuid),
  public.create_invite(uuid, public.member_role, uuid, integer, integer),
  public.revoke_invite(uuid),
  public.join_challenge(text, text),
  public.create_route(uuid, text),
  public.update_route(uuid, text, integer),
  public.append_event(uuid, public.event_type, jsonb, uuid),
  public.create_bot_token(uuid, text),
  public.revoke_bot_token(uuid)
  to authenticated;

grant execute on function
  public.bot_state(text),
  public.bot_create_route(text, text),
  public.bot_append_event(text, text, public.event_type, jsonb, uuid)
  to anon;

-- -------------------------------------------------------------------------------------
-- Live-Updates (Supabase Realtime prüft pro Abonnent die RLS-Policies oben)
-- -------------------------------------------------------------------------------------

alter publication supabase_realtime add table public.events, public.challenges, public.challenge_members, public.routes;
