-- Prüft den Import der Test-Altdaten (tools/migration/tests/*.json) gegen die Bot-Zähler.
-- Läuft nach schema.test.sql in derselben Datenbank (nutzt test.ok).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create temp view imported as
select * from public.member_stats
where challenge_id = (select id from public.challenges where slug = 'bot-import');

select test.ok((select current_run = 4 and runs_finished = 3 and wipes_total = 3
                from public.challenge_stats s join public.challenges c on c.id = s.challenge_id
                where c.slug = 'bot-import'), 'Import: drei frühere Runs, laufender Run ist Nummer 4');
select test.ok((select string_agg(display_name || '=' || deaths_run || '/' || deaths_total, ' ' order by seat) from imported)
               = 'Moritz=3/7 Janne=1/4 Elsmann=0/2 Linus=1/1', 'Import: Tode (Run/gesamt) entsprechen deaths.json');
select test.ok((select string_agg(display_name || '=' || missed_run || '/' || missed_total, ' ' order by seat) from imported)
               = 'Moritz=0/1 Janne=0/0 Elsmann=2/5 Linus=0/0', 'Import: verpasste Begegnungen entsprechen deaths.json');
select test.ok((select string_agg(display_name || '=' || wipes_caused, ' ' order by seat) from imported)
               = 'Moritz=1 Janne=1 Elsmann=0 Linus=0', 'Import: Wipes je Spieler aus "whipes"');
select test.ok((select count(*) = 14 and count(*) filter (where kind = 'static') = 4
                from public.encounters e join public.challenges c on c.id = e.challenge_id where c.slug = 'bot-import'),
               'Import: 14 Begegnungen, davon 4 Static');
select test.ok((select string_agg(m.display_name || ':' || s.name_de, ', ' order by m.seat, s.name_de)
                from public.graveyard g
                join public.challenges c on c.id = g.challenge_id
                join public.challenge_members m on m.id = g.member_id
                join public.species s on s.id = g.species_id
                where c.slug = 'bot-import') = 'Moritz:Luxio, Moritz:Raichu, Linus:Zubat',
               'Import: Tote mit der Entwicklungsstufe beim Tod');
select test.ok((select count(*) = 7 from public.encounters e join public.challenges c on c.id = e.challenge_id
                where c.slug = 'bot-import' and e.state = 'linked_dead'),
               'Import: Soul-Link-Partner sind mitgestorben');
select test.ok((select count(*) = 3 from public.challenge_members m join public.challenges c on c.id = m.challenge_id
                where c.slug = 'bot-import' and m.user_id is null),
               'Import: drei Platzhalter warten auf ihre Einladung');
select test.ok((select bool_and(source = 'migration') from public.events e join public.challenges c on c.id = e.challenge_id
                where c.slug = 'bot-import'), 'Import: alle Ereignisse tragen die Quelle "migration"');

\o
\echo 'Migrationstest bestanden.'
