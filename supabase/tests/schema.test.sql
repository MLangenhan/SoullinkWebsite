-- Szenario-Test für Schema, Event-Logik und RLS. Bricht beim ersten Fehler ab.
-- Ausführen: scripts/test-db.sh
\set ON_ERROR_STOP on
\set QUIET on
-- Ergebniszeilen verwerfen; die Testausgabe kommt über NOTICE
\o /dev/null

create schema test;
grant usage on schema test to public;

create function test.ok(p_condition boolean, p_message text) returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'FEHLGESCHLAGEN: %', p_message;
  end if;
  raise notice 'ok – %', p_message;
end;
$$;

-- Führt SQL als aktuelle Rolle aus und erwartet einen bestimmten SQLSTATE
create function test.fails(p_sql text, p_sqlstate text, p_message text) returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FEHLGESCHLAGEN: % (kein Fehler, erwartet %)', p_message, p_sqlstate;
exception
  when others then
    if sqlstate = p_sqlstate then
      raise notice 'ok – % (%: %)', p_message, sqlstate, sqlerrm;
    elsif sqlerrm like 'FEHLGESCHLAGEN:%' then
      raise;
    else
      raise exception 'FEHLGESCHLAGEN: % (erwartet %, bekommen %: %)', p_message, p_sqlstate, sqlstate, sqlerrm;
    end if;
end;
$$;

-- Ablage für IDs zwischen den Schritten (temporär, für alle Rollen beschreibbar)
create table test.ids (k text primary key, v text not null);
grant all on test.ids to public;
create function test.put(p_key text, p_value text) returns void
language sql as $$ insert into test.ids values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function test.get(p_key text) returns text
language sql stable as $$ select v from test.ids where k = p_key $$;
grant execute on all functions in schema test to public;

-- Stammdaten (Auszug)
insert into public.species (id, slug, name_en, name_de, generation, evolution_chain_id, evolves_from_id, evolution_stage, sprite_url) values
  (172, 'pichu', 'Pichu', 'Pichu', 2, 10, null, 1, 'https://example.test/172.png'),
  (25, 'pikachu', 'Pikachu', 'Pikachu', 1, 10, 172, 2, 'https://example.test/25.png'),
  (26, 'raichu', 'Raichu', 'Raichu', 1, 10, 25, 3, 'https://example.test/26.png'),
  (63, 'abra', 'Abra', 'Abra', 1, 26, null, 1, 'https://example.test/63.png'),
  (64, 'kadabra', 'Kadabra', 'Kadabra', 1, 26, 63, 2, 'https://example.test/64.png'),
  (393, 'piplup', 'Piplup', 'Plinfa', 4, 200, null, 1, 'https://example.test/393.png');

-- Drei Discord-Anmeldungen
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"provider_id": "111111", "full_name": "Moritz", "avatar_url": "https://cdn.test/m.png"}'),
  ('00000000-0000-0000-0000-000000000002', '{"provider_id": "222222", "name": "janne_dc", "custom_claims": {"global_name": "Janne"}}'),
  ('00000000-0000-0000-0000-000000000003', '{"provider_id": "333333", "full_name": "Fremder"}');

select test.ok((select count(*) = 3 from public.profiles), 'Profile werden bei Anmeldung angelegt');
select test.ok((select display_name = 'Janne' from public.profiles where discord_id = '222222'),
               'Discord-Anzeigename (global_name) wird bevorzugt');

-- ---------------------------------------------------------------- Run anlegen (Moritz)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select test.put('run', (public.create_run('Platin Soul Link', 'platin-soullink', 'Moritz')).id::text);
select test.put('janne', (public.add_player(test.get('run')::uuid, 'Janne')).id::text);
select test.put('elsmann', (public.add_player(test.get('run')::uuid, 'Elsmann')).id::text);
select test.put('moritz', (select id::text from public.run_members where user_id = auth.uid()));
select test.ok((select count(*) = 3 from public.run_members where run_id = test.get('run')::uuid),
               'Owner sieht alle Mitglieder des privaten Runs');
select test.fails($$ select public.create_run('Doppelt', 'platin-soullink', 'Moritz') $$, 'PT409',
                  'Run-Adresse ist eindeutig');
select test.fails($$ insert into public.runs (slug, name) values ('direkt', 'Direkt') $$, '42501',
                  'Direktes INSERT in runs ist verboten');

select test.put('invite_janne', public.create_invite(test.get('run')::uuid, 'player', test.get('janne')::uuid));
select test.put('invite_viewer', public.create_invite(test.get('run')::uuid, 'viewer', null, 24, 5));
select test.fails($$ select token_hash from public.run_invites $$, '42501', 'Token-Hashes sind nicht lesbar');
select test.ok((select count(*) = 2 from public.run_invites), 'Owner sieht Einladungen (ohne Hash)');

-- ---------------------------------------------------------------- Zugriff von außen
reset role;
set role anon;
reset request.jwt.claim.sub;
select test.ok((select count(*) = 0 from public.runs), 'Anonym sieht private Runs nicht');
select test.ok((select count(*) = 6 from public.species), 'Stammdaten sind öffentlich');
select test.fails($$ select public.create_run('X', 'xyz', 'X') $$, '42501', 'Anonym darf keine Website-RPCs aufrufen');

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select test.ok((select count(*) = 0 from public.events), 'Fremder sieht keine Ereignisse eines privaten Runs');
select test.fails(format($$ select public.create_route(%L, 'Route 201') $$, test.get('run')), 'PT403',
                  'Fremder darf keine Route anlegen');
select test.fails(format($$ select public.add_player(%L, 'Hacker') $$, test.get('run')), 'PT403',
                  'Fremder darf keine Spieler anlegen');

-- ---------------------------------------------------------------- Beitritt per Einladung (Janne)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select test.ok((public.join_run(test.get('invite_janne'))).id = test.get('janne')::uuid,
               'Janne übernimmt den Platzhalter per Einladung');
select test.fails(format($$ select public.join_run(%L) $$, test.get('invite_janne')), 'PT404',
                  'Einladung ist nur einmal gültig');
select test.fails($$ select public.join_run('inv_falsch') $$, 'PT404', 'Falscher Token wird abgelehnt');
select test.ok((select count(*) = 0 from public.run_invites), 'Spieler (nicht Owner) sieht keine Einladungen');

select test.put('route201', (public.create_route(test.get('run')::uuid, 'Route 201')).id::text);
select test.ok((public.create_route(test.get('run')::uuid, ' route 201 ')).id = test.get('route201')::uuid,
               'create_route ist idempotent (Groß-/Kleinschreibung egal)');
select test.put('route202', (public.create_route(test.get('run')::uuid, 'Route 202')).id::text);

-- ---------------------------------------------------------------- Begegnungen und Soul-Link
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select test.put('enc_moritz', (public.append_event(
  test.get('run')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route201'), 'species_id', 172,
                     'status', 'team', 'nickname', 'Blitz', 'unbekannt', 'wird verworfen'),
  '10000000-0000-0000-0000-000000000001'
)).payload ->> 'encounter_id');
select test.ok((select not (payload ? 'unbekannt') from public.events where seq = 1), 'Unbekannte Payload-Felder werden verworfen');
select public.append_event(
  test.get('run')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route201'), 'species_id', 172),
  '10000000-0000-0000-0000-000000000001'
);
select test.ok((select count(*) = 1 from public.events), 'Gleiche client_event_id erzeugt kein zweites Ereignis');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select test.put('enc_janne', (public.append_event(
  test.get('run')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', 63)
)).payload ->> 'encounter_id');
select test.ok((select count(distinct link_id) = 1 from public.encounters where route_id = test.get('route201')::uuid),
               'Zweite Begegnung derselben Route tritt automatisch dem Soul-Link bei');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('run'),
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', 999)),
  'PT400', 'Unbekanntes Pokémon wird abgelehnt');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('run'),
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', '63')),
  'PT400', 'Falscher Datentyp wird abgelehnt');
select test.fails($$ insert into public.events (run_id, seq, attempt, type, source) values (test.get('run')::uuid, 99, 1, 'encounter_missed', 'web') $$,
  '42501', 'Direktes INSERT in events ist verboten');

select public.append_event(test.get('run')::uuid, 'encounter_evolved',
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'species_id', 25));
select test.ok((select species_id = 25 and caught_species_id = 172 from public.encounters
                where encounter_id = test.get('enc_moritz')::uuid), 'Entwicklung ändert die aktuelle Art');
select test.fails(format($$ select public.append_event(%L, 'encounter_evolved', %L) $$, test.get('run'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'species_id', 64)),
  'PT400', 'Entwicklung in fremde Reihe wird abgelehnt');

select test.put('missed1', (public.append_event(test.get('run')::uuid, 'encounter_missed',
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route202')))).id::text);

-- ---------------------------------------------------------------- Tod, Soul-Link, Undo
select test.put('death1', (public.append_event(test.get('run')::uuid, 'pokemon_died',
  jsonb_build_object('encounter_id', test.get('enc_janne'), 'route_id', test.get('route202'),
                     'cause', 'Volltreffer', 'opponent', 'Rivale Barry', 'level', 12))).id::text);
select test.ok((select state = 'dead' from public.encounters where encounter_id = test.get('enc_janne')::uuid),
               'Gestorbenes Pokémon ist tot');
select test.ok((select state = 'linked_dead' and lost_with_encounter_id = test.get('enc_janne')::uuid
                from public.encounters where encounter_id = test.get('enc_moritz')::uuid),
               'Soul-Link-Partner stirbt sichtbar mit');
select test.ok((select jsonb_array_length(partners) = 1 from public.graveyard), 'Friedhof zeigt die Partner');
select test.ok((select deaths_attempt = 1 and missed_attempt = 1 from public.member_stats
                where member_id = test.get('janne')::uuid), 'Zähler für Janne stimmen');
select test.ok((select deaths_attempt = 0 from public.member_stats where member_id = test.get('moritz')::uuid),
               'Mitgestorbener Partner zählt nicht als eigener Tod');
select test.fails(format($$ select public.append_event(%L, 'encounter_status_changed', %L) $$, test.get('run'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'status', 'box')),
  'PT409', 'Totes Pokémon kann nicht in die Box');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('run'),
  jsonb_build_object('event_id', (select id from public.events where payload ->> 'encounter_id' = test.get('enc_janne') and type = 'encounter_logged'))),
  'PT409', 'Begegnung mit späteren Ereignissen kann nicht direkt rückgängig gemacht werden');

select test.put('undo1', (public.append_event(test.get('run')::uuid, 'event_reverted',
  jsonb_build_object('event_id', test.get('death1')::bigint))).id::text);
select test.ok((select count(*) = 0 from public.encounters where state in ('dead', 'linked_dead')),
               'Undo des Todes belebt beide Partner wieder');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('run'),
  jsonb_build_object('event_id', test.get('death1')::bigint)), 'PT409', 'Doppeltes Undo wird abgelehnt');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('run'),
  jsonb_build_object('event_id', test.get('undo1')::bigint)), 'PT400', 'Undo eines Undo wird abgelehnt');

select public.append_event(test.get('run')::uuid, 'pokemon_died',
  jsonb_build_object('encounter_id', test.get('enc_janne'), 'cause', 'Selbstzerstörung'));

-- ---------------------------------------------------------------- Wipe und neuer Versuch
select test.put('wipe1', (public.append_event(test.get('run')::uuid, 'attempt_ended',
  jsonb_build_object('reason', 'wipe', 'caused_by_member_id', test.get('janne')))).id::text);
select test.ok((select current_attempt = 2 and wipes_total = 1 and resets_total = 1 from public.run_stats),
               'Wipe startet Versuch 2');
select test.ok((select deaths_attempt = 0 and deaths_total = 1 and missed_attempt = 0 and missed_total = 1
                       and wipes_caused = 1
                from public.member_stats where member_id = test.get('janne')::uuid),
               'Session-Zähler beginnen neu, Gesamtzähler bleiben');
select test.fails(format($$ select public.append_event(%L, 'encounter_status_changed', %L) $$, test.get('run'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'status', 'box')),
  'PT409', 'Pokémon aus früherem Versuch sind gesperrt');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('run'),
  jsonb_build_object('event_id', test.get('missed1')::bigint)), 'PT409', 'Undo im alten Versuch wird abgelehnt');

select public.append_event(test.get('run')::uuid, 'event_reverted', jsonb_build_object('event_id', test.get('wipe1')::bigint));
select test.ok((select current_attempt = 1 from public.run_stats), 'Wipe lässt sich rückgängig machen, solange nichts folgte');
select public.append_event(test.get('run')::uuid, 'attempt_ended', jsonb_build_object('reason', 'reset'));
select public.append_event(test.get('run')::uuid, 'counter_adjusted',
  jsonb_build_object('counter', 'deaths', 'member_id', test.get('moritz'), 'delta', 3, 'note', 'Altdaten'));
select test.ok((select deaths_attempt = 3 and deaths_total = 3 from public.member_stats
                where member_id = test.get('moritz')::uuid), 'Manuelle Korrektur fließt in die Zähler ein');
select test.ok((select bool_and(seq = n) from (select seq, row_number() over (order by seq) as n from public.events) s),
               'Sequenznummern sind lückenlos');

-- ---------------------------------------------------------------- Unveränderlichkeit
reset role;
select test.fails($$ update public.events set payload = '{}' where seq = 1 $$, 'PT403',
                  'Ereignisse können selbst vom DB-Owner nicht geändert werden');
select test.fails($$ delete from public.events where seq = 1 $$, 'PT403',
                  'Ereignisse können nicht einzeln gelöscht werden');

-- ---------------------------------------------------------------- Bot-Zugang
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select test.fails(format($$ select public.create_bot_token(%L, 'Bot') $$, test.get('run')), 'PT403',
                  'Nur die Run-Leitung erstellt Bot-Tokens');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select test.put('bot', public.create_bot_token(test.get('run')::uuid, 'Discord-Bot'));
select test.fails($$ select token_hash from public.bot_tokens $$, '42501', 'Bot-Token-Hash ist nicht lesbar');

reset role;
set role anon;
reset request.jwt.claim.sub;
select test.ok((select (public.bot_state(test.get('bot')) -> 'run' ->> 'current_attempt')::integer = 2),
               'Bot liest den Stand seines Runs');
select test.fails($$ select public.bot_state('slb_falsch') $$, 'PT401', 'Falsches Bot-Token wird abgelehnt');
select test.ok((select (public.bot_create_route(test.get('bot'), 'Route 203')).name = 'Route 203'), 'Bot legt Routen an');
select test.ok((select actor_member_id = test.get('janne')::uuid and source = 'bot'
                from public.bot_append_event(test.get('bot'), '222222', 'encounter_missed',
                  jsonb_build_object('member_id', test.get('janne')))),
               'Bot ordnet Discord-ID dem Spieler zu');
select test.ok((select actor_member_id is null and actor_discord_id = '444444'
                from public.bot_append_event(test.get('bot'), '444444', 'encounter_missed',
                  jsonb_build_object('member_id', test.get('elsmann')))),
               'Unverknüpfte Discord-Nutzer werden protokolliert (wenn erlaubt)');
select test.fails($$ select count(*) from public.bot_tokens $$, '42501', 'Anonym liest keine Bot-Tokens');
select test.fails($$ select public.append_event(test.get('run')::uuid, 'encounter_missed', '{}') $$, '42501',
                  'Bot kann die Website-RPCs nicht nutzen');

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.update_run(test.get('run')::uuid, 'Platin Soul Link', 'public', false);
reset role;
set role anon;
reset request.jwt.claim.sub;
select test.fails(format($$ select public.bot_append_event(%L, '444444', 'encounter_missed', %L) $$, test.get('bot'),
  jsonb_build_object('member_id', test.get('elsmann'))), 'PT403', 'Strikter Modus sperrt unverknüpfte Discord-Nutzer');
select test.ok((select count(*) > 0 from public.events), 'Öffentlicher Run ist für Zuschauer lesbar');
select test.ok((select count(*) = 3 from public.member_stats), 'Zuschauer sehen die Zähler');
select test.fails($$ select * from public.profiles $$, '42501', 'Profile sind für Zuschauer nicht lesbar');

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.revoke_bot_token((select id from public.bot_tokens));
reset role;
set role anon;
select test.fails(format($$ select public.bot_state(%L) $$, test.get('bot')), 'PT401', 'Widerrufenes Bot-Token ist ungültig');

-- ---------------------------------------------------------------- Konto löschen, Run löschen
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-000000000002';
select test.ok((select count(*) = 0 from public.events where actor_user_id = '00000000-0000-0000-0000-000000000002'),
               'Kontolöschung anonymisiert Ereignisse statt sie zu blockieren');
select test.ok((select user_id is null from public.run_members where id = test.get('janne')::uuid),
               'Spielerplatz wird wieder zum Platzhalter');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select test.fails(format($$ select public.delete_run(%L, 'falsch') $$, test.get('run')), 'PT400',
                  'Run-Löschung braucht die richtige Bestätigung');
select public.delete_run(test.get('run')::uuid, 'platin-soullink');
reset role;
select test.ok((select count(*) = 0 from public.events), 'Run-Löschung entfernt auch alle Ereignisse');

\o
\echo 'Alle Tests bestanden.'
