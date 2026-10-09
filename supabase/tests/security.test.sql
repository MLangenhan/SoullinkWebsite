-- Sicherheitstests: Eigenschaften des Schemas, die keine Migration aufweichen darf, und Angriffe von außen.
-- Ergänzt schema.test.sql (Verhalten der RPCs und RLS im Ablauf). Ausführen: scripts/test-db.sh
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema sec;
grant usage on schema sec to public;

create function sec.ok(p_condition boolean, p_message text, p_detail text default null) returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'FEHLGESCHLAGEN: % %', p_message, coalesce(' – ' || p_detail, '');
  end if;
  raise notice 'ok – %', p_message;
end;
$$;

create function sec.fails(p_sql text, p_sqlstate text, p_message text) returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FEHLGESCHLAGEN: % (kein Fehler, erwartet %)', p_message, p_sqlstate;
exception
  when others then
    if sqlstate = p_sqlstate then
      raise notice 'ok – % (%)', p_message, sqlstate;
    elsif sqlerrm like 'FEHLGESCHLAGEN:%' then
      raise;
    else
      raise exception 'FEHLGESCHLAGEN: % (erwartet %, bekommen %: %)', p_message, p_sqlstate, sqlstate, sqlerrm;
    end if;
end;
$$;
grant execute on all functions in schema sec to public;

-- ---------------------------------------------------------------- Schema-Eigenschaften

-- Jede Tabelle in public und private hat Row Level Security
select sec.ok(count(*) = 0, 'Alle Tabellen haben RLS', string_agg(n.nspname || '.' || c.relname, ', '))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- Views laufen mit den Rechten des Aufrufers, sonst würden sie RLS umgehen
select sec.ok(count(*) = 0, 'Alle Views sind security_invoker', string_agg(c.relname, ', '))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v' and not coalesce('security_invoker=true' = any (c.reloptions), false);

-- SECURITY DEFINER ohne festen search_path ließe sich über eigene Objekte im Suchpfad kapern
select sec.ok(count(*) = 0, 'Alle SECURITY-DEFINER-Funktionen haben einen festen search_path', string_agg(p.oid::regprocedure::text, ', '))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- Geschrieben wird nur über RPCs (Event Sourcing): keine Schreibrechte auf Tabellen oder Views
select sec.ok(count(*) = 0, 'anon und authenticated haben keine Schreibrechte auf Tabellen', string_agg(r || ' ' || pr || ' ' || c.relname, ', '))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['anon', 'authenticated']) r
cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) pr
where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'p', 'm') and has_table_privilege(r, c.oid, pr);

select sec.ok(count(*) = 0, 'private-Tabellen sind für Clients nicht lesbar', string_agg(c.relname, ', '))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['anon', 'authenticated']) r
where n.nspname = 'private' and c.relkind in ('r', 'v', 'p', 'm') and has_table_privilege(r, c.oid, 'SELECT');

-- Keine Funktion ist für PUBLIC ausführbar (Standard von PostgreSQL, hier überall entzogen)
select sec.ok(count(*) = 0, 'Keine Funktion ist für PUBLIC freigegeben', string_agg(p.oid::regprocedure::text, ', '))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));

-- Erlaubnislisten: Wer eine Funktion für Clients freigibt, muss sie hier bewusst ergänzen
select sec.ok(
  array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) = array[
    'bot_append_event(text,text,event_type,jsonb,uuid)', 'bot_create_route(text,text)', 'bot_state(text)', 'invite_preview(text)',
    'private.can_read_challenge(uuid)', 'private.is_challenge_owner(uuid)', 'private.member_role(uuid)'
  ],
  'anon darf nur Einladungsvorschau, Bot-RPCs (mit Token) und RLS-Hilfen aufrufen',
  array_to_string(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), ', '))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute');

select sec.ok(
  array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) = array[
    'add_player(uuid,text)', 'append_event(uuid,event_type,jsonb,uuid)', 'change_team(uuid,uuid,jsonb)', 'create_bot_token(uuid,text)',
    'create_challenge(text,text,text,challenge_visibility,text)', 'create_invite(uuid,member_role,uuid,integer,integer)',
    'create_route(uuid,text)', 'delete_challenge(uuid,text)', 'invite_preview(text)', 'join_challenge(text,text)',
    'private.can_read_challenge(uuid)', 'private.is_challenge_owner(uuid)', 'private.member_role(uuid)',
    'remove_member_devices(uuid)', 'revoke_bot_token(uuid)', 'revoke_invite(uuid)', 'set_challenge_rules(uuid,text,boolean)',
    'set_level_cap(uuid,integer)', 'set_member_link_group(uuid,smallint)', 'set_team_sync(uuid,boolean)',
    'undo_team_change(uuid,uuid)', 'update_challenge(uuid,text,challenge_visibility,boolean)', 'update_member(uuid,text,text,text)',
    'update_route(uuid,text,integer)'
  ],
  'authenticated darf nur die Website-RPCs aufrufen',
  array_to_string(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), ', '))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute');

-- Geheimnisse liegen nur als Hash vor, und auch der Hash ist für Clients nicht lesbar
select sec.ok(count(*) = 0, 'Token-Hashes sind für Clients nicht lesbar', string_agg(c.relname, ', '))
from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['anon', 'authenticated']) r
where n.nspname = 'public' and a.attname = 'token_hash' and has_column_privilege(r, c.oid, a.attname, 'SELECT');

select sec.ok(count(*) = 0, 'Keine Spalte speichert Tokens oder Geheimnisse im Klartext', string_agg(table_name || '.' || column_name, ', '))
from information_schema.columns
where table_schema in ('public', 'private')
  and (column_name ~* '(token|secret|password)' and column_name <> 'token_hash');

-- ---------------------------------------------------------------- Angriffe von außen

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000c001'), ('00000000-0000-0000-0000-00000000c002');
create table sec.ids (k text primary key, v text not null);
grant all on sec.ids to public;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
insert into sec.ids
select 'ch', (public.create_challenge('Sicherheit', 'sicherheit', 'Owner')).id::text;
insert into sec.ids
select 'invite', public.create_invite((select v::uuid from sec.ids where k = 'ch'), 'viewer', null, 24, 1);
insert into sec.ids
select 'bot', public.create_bot_token((select v::uuid from sec.ids where k = 'ch'), 'Bot');
reset role;
reset request.jwt.claim.sub;

-- Tokens: 32 Zufallsbytes, gespeichert wird nur SHA-256
select sec.ok(length(v) >= 47 and v like 'inv\_%', 'Einladungstoken hat 256 Bit Zufall') from sec.ids where k = 'invite';
select sec.ok(length(v) >= 47 and v like 'slb\_%', 'Bot-Token hat 256 Bit Zufall') from sec.ids where k = 'bot';
select sec.ok(
  exists (select 1 from public.challenge_invites i where i.token_hash = private.token_hash((select v from sec.ids where k = 'invite'))),
  'Einladung ist nur als SHA-256 gespeichert');
select sec.ok(
  not exists (
    select 1 from public.challenge_invites i, sec.ids s
    where s.k = 'invite' and position(s.v in row_to_json(i)::text) > 0
  ),
  'Klartext-Token steht nirgends in der Tabelle');

set role anon;
select sec.fails($$ select public.bot_state('slb_falsch') $$, 'PT401', 'Bot mit falschem Token wird abgewiesen');
select sec.fails($$ select public.bot_state('') $$, 'PT401', 'Bot ohne Token wird abgewiesen');
select sec.fails($$ select public.invite_preview(null) $$, 'PT404', 'Leere Einladung verrät nichts');
select sec.fails($$ select public.append_event(gen_random_uuid(), 'run_ended', '{}', gen_random_uuid()) $$, '42501',
                 'Anonym darf keine Website-Ereignisse schreiben');
select sec.ok((select count(*) = 0 from public.challenge_members where challenge_id = (select v::uuid from sec.ids where k = 'ch')),
              'Anonym sieht keine Mitglieder privater Challenges');
reset role;

-- Ein Fremder mit eigener Sitzung kommt weder an Daten noch an Einladungen der Challenge
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c002';
select sec.ok((select count(*) = 0 from public.challenges where slug = 'sicherheit'), 'Fremder sieht die private Challenge nicht');
select sec.ok((select count(*) = 0 from public.challenge_invites), 'Fremder sieht keine Einladungen');
select sec.ok((select count(*) = 0 from public.bot_tokens), 'Fremder sieht keine Bot-Tokens');
select sec.fails(format($$ select public.create_invite(%L, 'owner') $$, (select v from sec.ids where k = 'ch')), 'PT403',
                 'Fremder kann sich keine Einladung ausstellen');
select sec.fails(format($$ select public.delete_challenge(%L, 'sicherheit') $$, (select v from sec.ids where k = 'ch')), 'PT403',
                 'Fremder kann die Challenge nicht löschen');
select sec.fails(format($$ select public.update_challenge(%L, 'Übernommen', 'public', true) $$, (select v from sec.ids where k = 'ch')), 'PT403',
                 'Fremder kann die Challenge nicht ändern');
-- Eingaben werden als Daten behandelt, nie als SQL
select sec.fails($$ select public.create_challenge('x''); drop table public.events; --', 'sicherheit', 'X') $$, 'PT409',
                 'SQL in Eingaben wird nicht ausgeführt (Adresse bleibt eindeutig)');
reset role;
select sec.ok(to_regclass('public.events') is not null, 'Ereignistabelle existiert noch');

-- Eingabelängen sind begrenzt (kein Speicher-Missbrauch über riesige Texte)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
select sec.fails(format($$ select public.create_route(%L, repeat('x', 61)) $$, (select v from sec.ids where k = 'ch')), '23514',
                 'Routenname über 60 Zeichen wird abgewiesen');
select sec.fails($$ select public.create_challenge(repeat('x', 500), 'lang', 'X') $$, '23514',
                 'Challenge-Name über der Grenze wird abgewiesen');
reset role;
reset request.jwt.claim.sub;

\o
\echo 'Sicherheitstest bestanden.'
