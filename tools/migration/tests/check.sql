-- Prüft den Import von tools/migration/tests/run/ (Bot-Format) gegen die Bot-Zähler und den Beitritt
-- per Einladungslink. Läuft nach schema.test.sql in derselben Datenbank (nutzt test.ok).
-- Erwartet die psql-Variablen owner_token und player_token.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create temp view imported as
select * from public.member_stats
where challenge_id = (select id from public.challenges where slug = 'bot-import');
grant select on imported to public;

select test.ok((select current_run = 2 and runs_finished = 1 and wipes_total = 1
                from public.challenge_stats s join public.challenges c on c.id = s.challenge_id
                where c.slug = 'bot-import'), 'Import: ein früherer Run, laufender Run ist Nummer 2');
select test.ok((select string_agg(display_name || '=' || deaths_run || '/' || deaths_total, ' ' order by seat) from imported)
               = 'Moritz=2/4 Janne=0/1 Elsmann=2/4 Linus=0/2', 'Import: Tode (Run/gesamt) entsprechen stats.json');
select test.ok((select string_agg(display_name || '=' || missed_run || '/' || missed_total, ' ' order by seat) from imported)
               = 'Moritz=0/2 Janne=1/3 Elsmann=0/1 Linus=0/0', 'Import: verpasste Begegnungen entsprechen stats.json');
select test.ok((select string_agg(display_name || '=' || wipes_caused, ' ' order by seat) from imported)
               = 'Moritz=0 Janne=0 Elsmann=1 Linus=0', 'Import: Wipes je Spieler');
select test.ok((select count(*) = 7 from public.encounters e join public.challenges c on c.id = e.challenge_id
                where c.slug = 'bot-import'), 'Import: 7 Begegnungen aus routes.json (leere Einträge übersprungen)');
select test.ok((select string_agg(m.display_name || ':' || s.name_de, ', ' order by m.seat)
                from public.graveyard g
                join public.challenges c on c.id = g.challenge_id
                join public.challenge_members m on m.id = g.member_id
                join public.species s on s.id = g.species_id
                where c.slug = 'bot-import') = 'Moritz:Staraptor, Elsmann:Arkani',
               'Import: Tote mit der Entwicklungsstufe beim Tod');
select test.ok((select string_agg(m.display_name, ',' order by m.seat)
                from public.encounters e
                join public.challenges c on c.id = e.challenge_id
                join public.challenge_members m on m.id = e.member_id
                where c.slug = 'bot-import' and e.state = 'linked_dead') = 'Janne,Linus',
               'Import: Soul-Link paarweise wie im Bot (Janne mit Moritz, Linus mit Elsmann)');
select test.ok((select string_agg(display_name || '=' || link_group, ' ' order by seat) from public.challenge_members m
                join public.challenges c on c.id = m.challenge_id where c.slug = 'bot-import')
               = 'Moritz=0 Janne=0 Elsmann=1 Linus=1', 'Import: Soul-Link-Gruppen 1↔2, 3↔4');
select test.ok((select name = 'Platin Soul Link' and game = 'Pokemon Platin' from public.challenges where slug = 'bot-import'),
               'Import: Name und Spiel aus meta.json');
select test.ok((select bool_and(source = 'migration') from public.events e join public.challenges c on c.id = e.challenge_id
                where c.slug = 'bot-import'), 'Import: alle Ereignisse tragen die Quelle "migration"');
select test.ok((select count(*) = 0 from public.member_devices d join public.challenges c on c.id = d.challenge_id
                where c.slug = 'bot-import'), 'Import: alle Plätze sind frei, bis jemand seinen Link öffnet');

-- Beitritt mit den erzeugten Links
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select test.ok((select role = 'owner' and display_name = 'Moritz' from public.join_challenge(:'owner_token')),
               'Import: Moritz übernimmt per Link die Leitung');
select test.ok((select count(*) = 4 and count(*) filter (where uses = 1) = 1
                from public.challenge_invites i join public.challenges c on c.id = i.challenge_id
                where c.slug = 'bot-import'),
               'Import: Leitung sieht die vier Einladungen, eine davon eingelöst');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select test.ok((select role = 'player' and display_name = 'Janne' from public.join_challenge(:'player_token')),
               'Import: Janne übernimmt ihren Platz per Link');
select test.ok((select deaths_total = 1 from imported where display_name = 'Janne'),
               'Import: Janne sieht danach die private Challenge');
reset role;

\o
\echo 'Migrationstest bestanden.'
