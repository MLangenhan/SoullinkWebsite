-- Demo-Challenge: Pokémon Platin, vier Spieler in zwei Soul-Link-Paaren, drei Wipes, im vierten Run Sieg gegen Cynthia.
-- Supabase → SQL Editor → New query → alles einfügen → Run. Ergebnis: vier persönliche Links (einmal nutzbar,
-- 7 Tage gültig); zuerst den Link der Leitung öffnen. Erneutes Ausführen ersetzt die alte Demo.
-- Alle Ereignisse laufen durch private.append_event (dieselben Prüfungen wie die Website). Ablauf in c_story,
-- Schritte durch "/" oder Zeilenumbruch getrennt (bewusst ohne ";", den der SQL Editor als Befehlsende liest):
--   S|Zeit = Spielsitzung · F|Route|P1|P2|P3|P4 = Begegnung für Platz 1–4 ("-" verpasst), FS = Static
--   E|Platz|von|zu = Entwicklung · K|Platz|von|zu = Korrektur · B/T|Platz|Pokémon = Box/Team · U|Platz = Undo
--   D|Platz|Pokémon|Ursache|Gegner|Level[|Route] = Tod (Partner stirbt mit) · W|Platz|Notiz = Wipe · V|Notiz = Sieg

do $demo$
declare
  c_slug constant text := 'demo-platin-soullink';
  c_site constant text := 'https://mlangenhan.github.io/SoullinkWebsite';
  c_players constant text[] := array['Moritz', 'Janne', 'Elsmann', 'Linus'];  -- Paare: 1↔2, 3↔4
  c_colors constant text[] := array['#2a6fdb', '#e0457b', '#2f9e62', '#e8890c'];
  c_story constant text := '
# Run 1: endet in der ersten Arena
S|2026-08-01T19:30+02 / F|Starter|Panflam|Plinfa|Chelast|Panflam / F|Route 201|Staralili|Bidiza|Staralili|Sheinux
F|Route 202|Sheinux|Zirpurze|Bidiza|Staralili / F|Route 203|Abra|Zubat|Sheinux|Zirpurze / D|3|Bidiza|Rivalenkampf|Baro|9|Route 203
F|Erzelingen-Mine|Kleinstein|Onix|Kleinstein|Onix / E|1|Staralili|Staravia / D|1|Staravia|Arenakampf Erzelingen|Veit|14
D|1|Panflam|Arenakampf Erzelingen|Veit|13 / D|2|Zubat|Arenakampf Erzelingen|Veit|11
W|1|Veits Koknodon räumt mit Kopfnuss das halbe Team ab
# Run 2: scheitert an Silvanas Roserade
S|2026-08-03T20:00+02 / F|Starter|Plinfa|Chelast|Plinfa|Chelast / F|Route 201|Bidiza|Staralili|Staralili|Bidiza
F|Route 202|Staralili|Sheinux|Zirpurze|Sheinux / F|Route 203|Abra|Zubat|Sheinux|Abra / F|Erzelingen-Mine|Onix|Kleinstein|Kleinstein|Onix
S|2026-08-05T19:45+02 / F|Route 204|Knospi|Wadribie|Knospi|- / F|Route 205|Bamelin|Schalellos|Pachirisu|Bamelin / E|1|Plinfa|Pliprin
E|2|Chelast|Chelcarain / E|1|Staralili|Staravia / E|4|Chelast|Chelcarain / FS|Windkraftwerk|Driftlon|Driftlon|Driftlon|Driftlon
D|4|Bidiza|Team Galaktik|Rüpel|15|Windkraftwerk / F|Ewigwald|Nebulak|Haspiror|Wadribie|Zirpurze
S|2026-08-07T20:15+02 / D|3|Kleinstein|Arenakampf Ewigenau|Silvana|20 / D|3|Plinfa|Arenakampf Ewigenau|Silvana|21
D|3|Driftlon|Arenakampf Ewigenau|Silvana|19 / W|3|Silvanas Roserade mit Giga-Sauger, gegen Pflanzen hatte keiner was dabei
# Run 3: kommt bis Herzhofen
S|2026-08-12T19:30+02 / F|Starter|Chelast|Panflam|Panflam|Plinfa / F|Route 201|Sheinux|Staralili|Bidiza|Staralili
F|Route 202|Staralili|Bidiza|Sheinux|Zirpurze / F|Route 203|Zubat|Abra|Abra|Sheinux / F|Erzelingen-Mine|Kleinstein|Onix|Onix|Kleinstein
E|1|Staralili|Staravia / E|2|Panflam|Panpyro / F|Route 204|Knospi|Knospi|Wadribie|Haspiror
S|2026-08-14T20:00+02 / F|Route 205|Schalellos|Bamelin|Bamelin|Pachirisu / FS|Windkraftwerk|Driftlon|Driftlon|Driftlon|Driftlon
F|Ewigwald|Haspiror|Nebulak|Zirpurze|Nebulak / D|4|Staralili|Rivalenkampf|Baro|19 / E|1|Chelast|Chelcarain / E|3|Panflam|Panpyro
E|4|Plinfa|Pliprin
S|2026-08-19T19:30+02 / F|Route 206|Ponita|Skorgla|Skunkapuh|Zirpeise / F|Route 207|Machollo|Ponita|Kleinstein|Machollo
D|1|Sheinux|Wildes Pokémon|Kleinstein|17|Route 207
S|2026-08-22T18:00+02 / F|Route 208|Trasla|Roselia|Bidifas|Zubat / FS|Herzhofen|Evoli|Evoli|Evoli|Evoli
F|Route 209|Zwirrlicht|Bidifas|Staravia|Roselia / D|3|Wadribie|Wildes Pokémon|Staravia|18|Route 209
D|2|Skorgla|Arenakampf Herzhofen|Lamina|25 / D|2|Onix|Arenakampf Herzhofen|Lamina|24 / D|2|Panpyro|Arenakampf Herzhofen|Lamina|26
W|2|Laminas Traunmagil mit Psystrahl und Verwirrung, das war es
# Run 4: bis zum Champ
S|2026-08-26T19:30+02 / F|Starter|Plinfa|Chelast|Panflam|Plinfa / F|Route 201|Staralili|Sheinux|Bidiza|Staralili
F|Route 202|Bidiza|Staralili|Sheinux|Zirpurze / F|Route 203|Abra|Zubat|Zubat|Abra / F|Erzelingen-Mine|Onix|Kleinstein|Kleinstein|Onix
E|1|Staralili|Staravia / F|Route 204|Knospi|Wadribie|Knospi|Haspiror
S|2026-08-29T20:00+02 / F|Route 205|Bamelin|Pachirisu|Schalellos|Bamelin / K|4|Bamelin|Pachirisu
FS|Windkraftwerk|Driftlon|Driftlon|Driftlon|Driftlon / F|Ewigwald|Nebulak|Haspiror|Zirpurze|Nebulak / E|1|Plinfa|Pliprin
E|2|Chelast|Chelcarain / E|3|Panflam|Panpyro / E|4|Plinfa|Pliprin / D|3|Zubat|Team Galaktik|Rüpel|16
S|2026-09-02T19:30+02 / F|Route 206|Ponita|Skorgla|Skunkapuh|Zirpeise / F|Route 207|Machollo|Ponita|Machollo|Kleinstein
F|Kraterberg|Bronzel|Meditie|Klingplim|Bronzel / E|2|Sheinux|Luxio / F|Route 208|Trasla|Roselia|Bidifas|Zubat
FS|Herzhofen|Evoli|Evoli|Evoli|Evoli
S|2026-09-05T20:00+02 / F|Route 209|Zwirrlicht|Bidifas|Staravia|Roselia / D|4|Zirpeise|Arenakampf Herzhofen|Lamina|27 / B|1|Onix / U|1
F|Route 210|Sichlor|Wablu|Ponita|Machollo / E|4|Evoli|Psiana
S|2026-09-09T19:30+02 / F|Route 215|Schlurp|Abra|Kadabra|Ponita / D|1|Bidiza|Arenakampf Schleiede|Hilda|27 / T|1|Bamelin
F|Route 212|Glibunkel|Kirlia|Roselia|Glibunkel / F|Großmoor|Pionskora|Venuflibis|Felino|Pionskora
D|3|Ponita|Arenakampf Weideburg|Wellenbrecher Marinus|33
S|2026-09-13T18:30+02 / F|Route 213|Plaudagei|Schalellos|Plaudagei|- / F|Route 214|Rihorn|Skunkapuh|Zirpeise|Rihorn
F|Route 218|Finneon|Tentacha|Finneon|Tentacha / FS|Eiseninsel|Riolu|Riolu|Riolu|Riolu / D|2|Roselia|Arenakampf Kanalava|Adam|35
S|2026-09-17T20:00+02 / E|1|Pliprin|Impoleon / E|2|Chelcarain|Chelterrar / E|3|Panpyro|Panferno / E|4|Pliprin|Impoleon
E|1|Staravia|Staraptor / E|2|Luxio|Luxtra / E|3|Riolu|Lucario / F|Route 216|Shnebedeck|-|Quiekel|Schneppke
F|Route 217|Schneppke|Shnebedeck|Sniebel|Quiekel / D|4|Rihorn|Arenakampf Blizzach|Frida|37 / D|2|Skorgla|Arenakampf Blizzach|Frida|36
S|2026-09-24T19:30+02 / F|Route 222|Pantimos|Gastrodon|Luxio|Plaudagei / D|3|Finneon|Arenakampf Sonnewik|Volkner|45
S|2026-09-30T20:00+02 / F|Siegesstraße|Georok|Golbat|Maschock|Rihorn
S|2026-10-04T18:00+02 / D|4|Pionskora|Top Vier|Ignaz|51 / D|1|Glibunkel|Top Vier|Lucian|50 / D|3|Luxio|Champ|Cynthia|55
V|Champ Cynthia besiegt! Knakrack fiel im letzten Zug gegen Impoleons Hydrokanone
';
  v_challenge uuid; v_members uuid[] := '{}'; v_clock timestamptz; v_step text; f text[]; v_seat integer;
  v_encounter uuid; v_route uuid; v_species integer; v_team integer; v_events jsonb[]; v_event jsonb;
begin
  delete from public.challenges where slug = c_slug;  -- alte Demo
  insert into public.challenges (slug, name, game, visibility)
  values (c_slug, 'Demo: Platin Soul Link', 'Pokémon Platin', 'private')
  returning id into v_challenge;
  perform set_config('demo.challenge_id', v_challenge::text, false), set_config('demo.site_url', c_site, false);

  for i in 1..4 loop
    insert into public.challenge_members (challenge_id, role, display_name, color, seat, link_group)
    values (v_challenge, case when i = 1 then 'owner' else 'player' end::public.member_role,
            c_players[i], c_colors[i], i - 1, (i - 1) / 2)
    returning id into v_encounter;
    v_members := v_members || v_encounter;
  end loop;

  for v_step in
    -- \r: unter Windows eingefügter Text hat CRLF-Zeilenenden
    select btrim(s, E' \t\r') from regexp_split_to_table(c_story, '[/\r\n]') s
    where btrim(s, E' \t\r') <> '' and btrim(s, E' \t\r') not like '#%'
  loop
    f := string_to_array(v_step, '|');
    v_seat := case when f[1] in ('E', 'K', 'B', 'T', 'U', 'D', 'W') then f[2]::integer end;
    v_events := '{}';

    -- Lebendes Pokémon des Spielers im laufenden Run
    if f[1] in ('E', 'K', 'B', 'T', 'D') then
      select en.encounter_id into v_encounter
      from public.encounters en join public.species sp on sp.id = en.species_id
      where en.challenge_id = v_challenge and en.run_number = private.current_run(v_challenge)
        and en.member_id = v_members[v_seat] and sp.name_de = f[3] and en.state in ('team', 'box')
      order by en.logged_at desc limit 1;
      if v_encounter is null then
        raise exception 'Schritt "%": Spieler % hat kein lebendes %', v_step, v_seat, f[3];
      end if;
    end if;

    -- Route anlegen, falls neu
    v_route := null;
    if f[1] in ('F', 'FS') or (f[1] = 'D' and f[7] is not null) then
      select r.id into v_route from public.routes r
      where r.challenge_id = v_challenge and r.name = case when f[1] = 'D' then f[7] else f[2] end;
      if v_route is null then
        insert into public.routes (challenge_id, name, sort_order)
        values (v_challenge, case when f[1] = 'D' then f[7] else f[2] end,
                (select count(*) from public.routes r where r.challenge_id = v_challenge))
        returning id into v_route;
      end if;
    end if;

    case f[1]
      when 'S' then
        v_clock := f[2]::timestamptz;
      when 'F', 'FS' then
        for seat in 1..4 loop
          if f[seat + 2] = '-' then
            v_events := v_events || jsonb_build_object('type', 'encounter_missed', 'seat', seat,
              'payload', jsonb_build_object('member_id', v_members[seat], 'route_id', v_route));
          else
            select s.id into v_species from public.species s where s.name_de = f[seat + 2];
            if v_species is null then
              raise exception 'Schritt "%": unbekanntes Pokémon %', v_step, f[seat + 2];
            end if;
            -- Ins Team, solange dort weniger als sechs sind
            select count(*) into v_team from public.encounters en
            where en.challenge_id = v_challenge and en.run_number = private.current_run(v_challenge)
              and en.member_id = v_members[seat] and en.state = 'team';
            v_events := v_events || jsonb_build_object('type', 'encounter_logged', 'seat', seat,
              'payload', jsonb_build_object('member_id', v_members[seat], 'route_id', v_route,
                'species_id', v_species, 'kind', case when f[1] = 'FS' then 'static' else 'wild' end,
                'status', case when v_team < 6 then 'team' else 'box' end));
          end if;
        end loop;
      when 'E', 'K' then
        v_events := array[jsonb_build_object('type', case when f[1] = 'E' then 'encounter_evolved' else 'encounter_corrected' end,
          'seat', v_seat, 'payload', jsonb_build_object('encounter_id', v_encounter,
            'species_id', (select s.id from public.species s where s.name_de = f[4])))];
      when 'B', 'T' then
        v_events := array[jsonb_build_object('type', 'encounter_status_changed', 'seat', v_seat,
          'payload', jsonb_build_object('encounter_id', v_encounter, 'status', case when f[1] = 'B' then 'box' else 'team' end))];
      when 'U' then
        v_events := array[jsonb_build_object('type', 'event_reverted', 'seat', v_seat,
          'payload', jsonb_build_object('event_id', (select max(e.id) from public.active_events e
            where e.challenge_id = v_challenge and e.type <> 'event_reverted')))];
      when 'D' then
        v_events := array[jsonb_build_object('type', 'pokemon_died', 'seat', v_seat,
          'payload', jsonb_strip_nulls(jsonb_build_object('encounter_id', v_encounter, 'cause', f[4],
            'opponent', f[5], 'level', f[6]::integer, 'route_id', v_route)))];
      when 'W' then
        v_events := array[jsonb_build_object('type', 'run_ended', 'seat', 1, 'payload',
          jsonb_build_object('result', 'wipe', 'caused_by_member_id', v_members[v_seat], 'note', f[3]))];
      when 'V' then
        v_events := array[jsonb_build_object('type', 'run_ended', 'seat', 1, 'payload',
          jsonb_build_object('result', 'won', 'note', f[2]))];
      else
        raise exception 'Unbekannter Schritt: "%"', v_step;
    end case;

    foreach v_event in array v_events loop
      v_clock := v_clock + make_interval(mins => 2 + (random() * 5)::integer);
      perform private.append_event(v_challenge, (v_event ->> 'type')::public.event_type, v_event -> 'payload',
        'web', null, v_members[(v_event ->> 'seat')::integer], null, null, v_clock);
    end loop;
  end loop;
end
$demo$;

-- Persönliche Links (nur die Hashes werden gespeichert); einzige Abfrage mit Ergebnis
with links as materialized (
  select m.seat, m.display_name, m.role, m.id as member_id,
         'inv_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as token
  from public.challenge_members m
  where m.challenge_id = current_setting('demo.challenge_id')::uuid
),
saved as (
  insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at)
  select current_setting('demo.challenge_id')::uuid, sha256(convert_to(l.token, 'UTF8')), l.role, l.member_id, 1,
         now() + interval '7 days'
  from links l
  returning member_id
)
select l.display_name as spieler,
       case l.role when 'owner' then 'Leitung' else 'Spieler' end as rolle,
       current_setting('demo.site_url') || '/join#' || l.token as link
from links l join saved s on s.member_id = l.member_id
order by l.seat;
