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

-- Stammdaten kommen aus der Migration 20261008120100_species.sql
select test.ok((select count(*) >= 1025 from public.species), 'Stammdaten sind geladen');

-- Vier anonyme Sitzungen (Geräte): Moritz, Janne, ein Fremder, Jannes zweites Gerät
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------- Challenge anlegen (Moritz)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select test.put('ch', (public.create_challenge('Platin Soul Link', 'platin-soullink', 'Moritz')).id::text);
select test.put('janne', (public.add_player(test.get('ch')::uuid, 'Janne')).id::text);
select test.put('elsmann', (public.add_player(test.get('ch')::uuid, 'Elsmann')).id::text);
select test.put('moritz', (select member_id::text from public.member_devices where user_id = auth.uid()));
select test.ok(test.get('moritz') is not null, 'Ersteller ist per Gerät an seinen Platz gebunden');
select test.ok((select count(*) = 3 from public.challenge_members where challenge_id = test.get('ch')::uuid),
               'Owner sieht alle Mitglieder der privaten Challenge');
select test.fails($$ select public.create_challenge('Doppelt', 'platin-soullink', 'Moritz') $$, 'PT409',
                  'Challenge-Adresse ist eindeutig');
select test.fails($$ insert into public.challenges (slug, name) values ('direkt', 'Direkt') $$, '42501',
                  'Direktes INSERT in challenges ist verboten');

select test.put('invite_janne', public.create_invite(test.get('ch')::uuid, 'player', test.get('janne')::uuid));
select test.put('invite_viewer', public.create_invite(test.get('ch')::uuid, 'viewer', null, 24, 5));
select test.fails($$ select token_hash from public.challenge_invites $$, '42501', 'Token-Hashes sind nicht lesbar');
select test.ok((select count(*) = 2 from public.challenge_invites), 'Owner sieht Einladungen (ohne Hash)');

-- ---------------------------------------------------------------- Zugriff von außen
reset role;
set role anon;
reset request.jwt.claim.sub;
select test.ok((select count(*) = 0 from public.challenges), 'Anonym sieht private Challenges nicht');
select test.ok((select count(*) >= 1025 from public.species), 'Stammdaten sind öffentlich');
select test.ok((select public.invite_preview(test.get('invite_janne')) ->> 'member_name' = 'Janne'),
               'Einladungsvorschau zeigt den Spielerplatz, auch ohne Sitzung');
select test.fails($$ select public.invite_preview('inv_falsch') $$, 'PT404', 'Vorschau falscher Links verrät nichts');
select test.fails($$ select public.create_challenge('X', 'xyz', 'X') $$, '42501', 'Anonym darf keine Website-RPCs aufrufen');

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select test.ok((select count(*) = 0 from public.events), 'Fremder sieht keine Ereignisse einer privaten Challenge');
select test.fails(format($$ select public.create_route(%L, 'Route 201') $$, test.get('ch')), 'PT403',
                  'Fremder darf keine Route anlegen');
select test.fails(format($$ select public.add_player(%L, 'Hacker') $$, test.get('ch')), 'PT403',
                  'Fremder darf keine Spieler anlegen');

-- ---------------------------------------------------------------- Beitritt per Einladung (Janne)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select test.ok((public.join_challenge(test.get('invite_janne'))).id = test.get('janne')::uuid,
               'Janne übernimmt den Platzhalter per Einladung');
select test.fails(format($$ select public.join_challenge(%L) $$, test.get('invite_janne')), 'PT404',
                  'Einladung ist nur einmal gültig');
select test.fails($$ select public.join_challenge('inv_falsch') $$, 'PT404', 'Falscher Token wird abgelehnt');
select test.ok((select count(*) = 0 from public.challenge_invites), 'Spieler (nicht Owner) sieht keine Einladungen');
select test.ok((select count(*) = 1 from public.member_devices), 'Spieler sieht nur das eigene Gerät');

-- Zweites Gerät: Janne erstellt sich selbst einen Gerätelink, aber nicht für andere
select test.put('device_janne', public.create_invite(test.get('ch')::uuid, 'viewer', test.get('janne')::uuid));
select test.fails(format($$ select public.create_invite(%L, 'player', %L) $$, test.get('ch'), test.get('moritz')),
                  'PT403', 'Gerätelink für fremden Platz wird abgelehnt');
select test.fails(format($$ select public.create_invite(%L, 'player') $$, test.get('ch')),
                  'PT403', 'Nur die Leitung lädt neue Mitglieder ein');
select test.fails(format($$ select public.join_challenge(%L) $$, test.get('invite_viewer')), 'PT409',
                  'Ein Gerät gehört pro Challenge nur zu einem Mitglied');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select test.ok((select id = test.get('janne')::uuid and role = 'player'
                from public.join_challenge(test.get('device_janne'))),
               'Zweites Gerät landet beim selben Spieler und behält die Rolle');
select test.fails(format($$ select public.update_member(%L, 'Moritz', null, null) $$, test.get('moritz')), 'PT403',
                  'Spieler darf fremde Mitglieder nicht ändern');
select test.ok((select discord_id = '222222' from public.update_member(test.get('janne')::uuid, 'Janne', '#7fd1a8', '222222')),
               'Spieler hinterlegt die eigene Discord-ID');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

select test.put('route201', (public.create_route(test.get('ch')::uuid, 'Route 201')).id::text);
select test.ok((public.create_route(test.get('ch')::uuid, ' route 201 ')).id = test.get('route201')::uuid,
               'create_route ist idempotent (Groß-/Kleinschreibung egal)');
select test.put('route202', (public.create_route(test.get('ch')::uuid, 'Route 202')).id::text);

-- ---------------------------------------------------------------- Begegnungen und Soul-Link
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select test.put('enc_moritz', (public.append_event(
  test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route201'), 'species_id', 172,
                     'status', 'team', 'nickname', 'Blitz', 'unbekannt', 'wird verworfen'),
  '10000000-0000-0000-0000-000000000001'
)).payload ->> 'encounter_id');
select test.ok((select not (payload ? 'unbekannt') from public.events where seq = 1), 'Unbekannte Payload-Felder werden verworfen');
select public.append_event(
  test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route201'), 'species_id', 172),
  '10000000-0000-0000-0000-000000000001'
);
select test.ok((select count(*) = 1 from public.events), 'Gleiche client_event_id erzeugt kein zweites Ereignis');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select test.put('enc_janne', (public.append_event(
  test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', 63)
)).payload ->> 'encounter_id');
select test.ok((select count(distinct link_id) = 1 from public.encounters where route_id = test.get('route201')::uuid),
               'Zweite Begegnung derselben Route tritt automatisch dem Soul-Link bei');

-- Später nachgetragen: Elsmanns Pokémon landet im bestehenden Soul-Link der Route
select test.ok((select payload ->> 'link_id' = (select link_id::text from public.encounters
                  where encounter_id = test.get('enc_moritz')::uuid)
                from public.append_event(test.get('ch')::uuid, 'encounter_logged',
                  jsonb_build_object('member_id', test.get('elsmann'), 'route_id', test.get('route201'), 'species_id', 396))),
               'Nachgetragene Begegnung tritt dem bestehenden Soul-Link bei');

-- Static-Begegnung auf derselben Route bildet einen eigenen Soul-Link
select test.put('static_janne', (public.append_event(
  test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', 393, 'kind', 'static')
)).payload ->> 'link_id');
select test.ok((select count(distinct link_id) = 2 and count(*) filter (where kind = 'static') = 1
                from public.encounters where route_id = test.get('route201')::uuid),
               'Static-Begegnung bekommt einen eigenen Soul-Link auf derselben Route');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('ch'),
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route201'), 'species_id', 393,
                     'link_id', test.get('static_janne'))),
  'PT409', 'Wilde Begegnung kann keinem Static-Soul-Link beitreten');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('ch'),
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route201'), 'species_id', 393, 'kind', 'legendär')),
  'PT400', 'Unbekannte Begegnungsart wird abgelehnt');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('ch'),
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', 99999)),
  'PT400', 'Unbekanntes Pokémon wird abgelehnt');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('ch'),
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route201'), 'species_id', '63')),
  'PT400', 'Falscher Datentyp wird abgelehnt');
select test.fails($$ insert into public.events (challenge_id, seq, run_number, type, source) values (test.get('ch')::uuid, 99, 1, 'encounter_missed', 'web') $$,
  '42501', 'Direktes INSERT in events ist verboten');

select public.append_event(test.get('ch')::uuid, 'encounter_evolved',
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'species_id', 25));
select test.ok((select species_id = 25 and caught_species_id = 172 from public.encounters
                where encounter_id = test.get('enc_moritz')::uuid), 'Entwicklung ändert die aktuelle Art');
select test.fails(format($$ select public.append_event(%L, 'encounter_evolved', %L) $$, test.get('ch'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'species_id', 64)),
  'PT400', 'Entwicklung in fremde Reihe wird abgelehnt');

-- Falsches Pokémon eingetragen: korrigieren und wieder rückgängig machen
select test.put('corr1', (public.append_event(test.get('ch')::uuid, 'encounter_corrected',
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'species_id', 393))).id::text);
select test.ok((select species_id = 393 and caught_species_id = 393 from public.encounters
                where encounter_id = test.get('enc_moritz')::uuid), 'Korrektur ändert gefangene und aktuelle Art');
select test.fails(format($$ select public.append_event(%L, 'encounter_corrected', %L) $$, test.get('ch'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'species_id', 393)),
  'PT409', 'Korrektur auf dieselbe Art wird abgelehnt');
select public.append_event(test.get('ch')::uuid, 'event_reverted', jsonb_build_object('event_id', test.get('corr1')::bigint));
select test.ok((select species_id = 25 and caught_species_id = 172 from public.encounters
                where encounter_id = test.get('enc_moritz')::uuid), 'Undo der Korrektur stellt Fang und Entwicklung wieder her');

select test.put('missed1', (public.append_event(test.get('ch')::uuid, 'encounter_missed',
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route202')))).id::text);

-- ---------------------------------------------------------------- Tod, Soul-Link, Undo
select test.put('death1', (public.append_event(test.get('ch')::uuid, 'pokemon_died',
  jsonb_build_object('encounter_id', test.get('enc_janne'), 'route_id', test.get('route202'),
                     'cause', 'Volltreffer', 'opponent', 'Rivale Barry', 'level', 12))).id::text);
select test.ok((select state = 'dead' from public.encounters where encounter_id = test.get('enc_janne')::uuid),
               'Gestorbenes Pokémon ist tot');
select test.ok((select state = 'linked_dead' and lost_with_encounter_id = test.get('enc_janne')::uuid
                from public.encounters where encounter_id = test.get('enc_moritz')::uuid),
               'Soul-Link-Partner stirbt sichtbar mit');
select test.ok((select jsonb_array_length(partners) = 2 from public.graveyard), 'Friedhof zeigt die Partner (Moritz und der nachgetragene Elsmann)');
select test.ok((select deaths_run = 1 and missed_run = 1 from public.member_stats
                where member_id = test.get('janne')::uuid), 'Zähler für Janne stimmen');
select test.ok((select deaths_run = 0 from public.member_stats where member_id = test.get('moritz')::uuid),
               'Mitgestorbener Partner zählt nicht als eigener Tod');
select test.fails(format($$ select public.append_event(%L, 'encounter_status_changed', %L) $$, test.get('ch'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'status', 'box')),
  'PT409', 'Totes Pokémon kann nicht in die Box');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('ch'),
  jsonb_build_object('event_id', (select id from public.events where payload ->> 'encounter_id' = test.get('enc_janne') and type = 'encounter_logged'))),
  'PT409', 'Begegnung mit späteren Ereignissen kann nicht direkt rückgängig gemacht werden');

select test.put('undo1', (public.append_event(test.get('ch')::uuid, 'event_reverted',
  jsonb_build_object('event_id', test.get('death1')::bigint))).id::text);
select test.ok((select count(*) = 0 from public.encounters where state in ('dead', 'linked_dead')),
               'Undo des Todes belebt beide Partner wieder');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('ch'),
  jsonb_build_object('event_id', test.get('death1')::bigint)), 'PT409', 'Doppeltes Undo wird abgelehnt');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('ch'),
  jsonb_build_object('event_id', test.get('undo1')::bigint)), 'PT400', 'Undo eines Undo wird abgelehnt');

select public.append_event(test.get('ch')::uuid, 'pokemon_died',
  jsonb_build_object('encounter_id', test.get('enc_janne'), 'cause', 'Selbstzerstörung'));

-- ---------------------------------------------------------------- Wipe, Sieg und neuer Run
select test.put('wipe1', (public.append_event(test.get('ch')::uuid, 'run_ended',
  jsonb_build_object('result', 'wipe', 'caused_by_member_id', test.get('janne')))).id::text);
select test.ok((select current_run = 2 and wipes_total = 1 and runs_finished = 1 from public.challenge_stats),
               'Wipe startet Run 2');
select test.ok((select deaths_run = 0 and deaths_total = 1 and missed_run = 0 and missed_total = 1
                       and wipes_caused = 1
                from public.member_stats where member_id = test.get('janne')::uuid),
               'Session-Zähler beginnen neu, Gesamtzähler bleiben');
select test.fails(format($$ select public.append_event(%L, 'encounter_status_changed', %L) $$, test.get('ch'),
  jsonb_build_object('encounter_id', test.get('enc_moritz'), 'status', 'box')),
  'PT409', 'Pokémon aus früherem Run sind gesperrt');
select test.fails(format($$ select public.append_event(%L, 'event_reverted', %L) $$, test.get('ch'),
  jsonb_build_object('event_id', test.get('missed1')::bigint)), 'PT409', 'Undo im alten Run wird abgelehnt');

select public.append_event(test.get('ch')::uuid, 'event_reverted', jsonb_build_object('event_id', test.get('wipe1')::bigint));
select test.ok((select current_run = 1 from public.challenge_stats), 'Wipe lässt sich rückgängig machen, solange nichts folgte');
select test.fails(format($$ select public.append_event(%L, 'run_ended', %L) $$, test.get('ch'),
  jsonb_build_object('result', 'won', 'caused_by_member_id', test.get('janne'))),
  'PT400', 'Ein Sieg hat keinen Verursacher');
select public.append_event(test.get('ch')::uuid, 'run_ended', jsonb_build_object('result', 'won'));
select test.ok((select current_run = 2 and wins_total = 1 and wipes_total = 0 from public.challenge_stats),
               'Sieg beendet den Run ebenfalls');
select public.append_event(test.get('ch')::uuid, 'counter_adjusted',
  jsonb_build_object('counter', 'deaths', 'member_id', test.get('moritz'), 'delta', 3, 'note', 'Altdaten'));
select test.ok((select deaths_run = 3 and deaths_total = 3 from public.member_stats
                where member_id = test.get('moritz')::uuid), 'Manuelle Korrektur fließt in die Zähler ein');
-- ---------------------------------------------------------------- Soul-Link-Paare (wie im Bot: 1↔2, 3↔4)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.set_member_link_group(test.get('moritz')::uuid, 0::smallint);
select public.set_member_link_group(test.get('janne')::uuid, 0::smallint);
select public.set_member_link_group(test.get('elsmann')::uuid, 1::smallint);
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select test.fails(format($$ select public.set_member_link_group(%L, 1::smallint) $$, test.get('janne')), 'PT403',
                  'Nur die Leitung legt Soul-Link-Gruppen fest');
select test.put('pair_moritz', (public.append_event(test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route202'), 'species_id', 25))).payload ->> 'encounter_id');
select test.put('pair_elsmann', (public.append_event(test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('elsmann'), 'route_id', test.get('route202'), 'species_id', 63))).payload ->> 'link_id');
select test.put('pair_janne', (public.append_event(test.get('ch')::uuid, 'encounter_logged',
  jsonb_build_object('member_id', test.get('janne'), 'route_id', test.get('route202'), 'species_id', 393))).payload ->> 'encounter_id');
select test.ok((select count(distinct link_id) = 2 from public.encounters where route_id = test.get('route202')::uuid and run_number = 2),
               'Paare: dieselbe Route ergibt zwei Soul-Links');
select test.fails(format($$ select public.append_event(%L, 'encounter_logged', %L) $$, test.get('ch'),
  jsonb_build_object('member_id', test.get('moritz'), 'route_id', test.get('route202'), 'species_id', 172,
                     'link_id', test.get('pair_elsmann'))),
  'PT409', 'Fremde Soul-Link-Gruppe wird abgelehnt');
select public.append_event(test.get('ch')::uuid, 'pokemon_died', jsonb_build_object('encounter_id', test.get('pair_janne')));
select test.ok((select string_agg(state::text, ',' order by species_id) from public.encounters
                where route_id = test.get('route202')::uuid and run_number = 2) = 'linked_dead,box,dead',
               'Paare: Tod reißt nur den Partner mit (Pikachu mitgestorben, Abra lebt)');

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
select test.fails(format($$ select public.create_bot_token(%L, 'Bot') $$, test.get('ch')), 'PT403',
                  'Nur die Challenge-Leitung erstellt Bot-Tokens');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select test.put('bot', public.create_bot_token(test.get('ch')::uuid, 'Discord-Bot'));
select test.fails($$ select token_hash from public.bot_tokens $$, '42501', 'Bot-Token-Hash ist nicht lesbar');

reset role;
set role anon;
reset request.jwt.claim.sub;
select test.ok((select (public.bot_state(test.get('bot')) -> 'challenge' ->> 'current_run')::integer = 2),
               'Bot liest den Stand seiner Challenge');
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
select test.fails($$ select public.append_event(test.get('ch')::uuid, 'encounter_missed', '{}') $$, '42501',
                  'Bot kann die Website-RPCs nicht nutzen');

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.update_challenge(test.get('ch')::uuid, 'Platin Soul Link', 'public', false);
reset role;
set role anon;
reset request.jwt.claim.sub;
select test.fails(format($$ select public.bot_append_event(%L, '444444', 'encounter_missed', %L) $$, test.get('bot'),
  jsonb_build_object('member_id', test.get('elsmann'))), 'PT403', 'Strikter Modus sperrt unverknüpfte Discord-Nutzer');
select test.ok((select count(*) > 0 from public.events), 'Öffentliche Challenge ist für Zuschauer lesbar');
select test.ok((select count(*) = 3 from public.member_stats), 'Zuschauer sehen die Zähler');
select test.fails($$ select * from public.member_devices $$, '42501', 'Gerätebindungen sind für Zuschauer nicht lesbar');

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.revoke_bot_token((select id from public.bot_tokens));
reset role;
set role anon;
select test.fails(format($$ select public.bot_state(%L) $$, test.get('bot')), 'PT401', 'Widerrufenes Bot-Token ist ungültig');

-- ---------------------------------------------------------------- Sitzung löschen, Geräte abmelden
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-000000000002';
select test.ok((select count(*) = 0 from public.events where actor_user_id = '00000000-0000-0000-0000-000000000002'),
               'Gelöschte Sitzung anonymisiert Ereignisse statt sie zu blockieren');
select test.ok((select count(*) = 1 from public.member_devices where member_id = test.get('janne')::uuid),
               'Jannes zweites Gerät bleibt angemeldet');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select test.fails(format($$ select public.remove_member_devices(%L) $$, test.get('moritz')), 'PT400',
                  'Leitung sperrt sich nicht selbst aus');
select test.ok(public.remove_member_devices(test.get('janne')::uuid) = 1, 'Leitung meldet alle Geräte eines Spielers ab');
select test.ok((select count(*) = 1 from public.member_devices), 'Leitung sieht die Geräte ihrer Challenge');
select test.fails(format($$ select public.delete_challenge(%L, 'falsch') $$, test.get('ch')), 'PT400',
                  'Löschen braucht die richtige Bestätigung');
select public.delete_challenge(test.get('ch')::uuid, 'platin-soullink');
reset role;
select test.ok((select count(*) = 0 from public.events), 'Löschen der Challenge entfernt auch alle Ereignisse');

\o
\echo 'Alle Tests bestanden.'
