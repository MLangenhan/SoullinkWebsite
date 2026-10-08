-- Demo-Challenge: Pokémon SoulSilver, alle vier Spieler gemeinsam verbunden. Run 1 endet an Bianka, Run 2 läuft noch.
-- Supabase → SQL Editor → New query → alles einfügen → Run. Ergebnis: vier persönliche Links (einmal nutzbar,
-- 7 Tage gültig); zuerst den Link der Leitung öffnen. Erneutes Ausführen ersetzt die alte Demo.
-- Alle Ereignisse laufen durch private.append_event (dieselben Prüfungen wie die Website). Ablauf in c_story,
-- Schritte durch "/" oder Zeilenumbruch getrennt (bewusst ohne ";", den der SQL Editor als Befehlsende liest):
--   S|Zeit = Spielsitzung · F|Route|P1|P2|P3|P4 = Begegnung für Platz 1–4 ("-" verpasst), FS = Static
--   E|Platz|von|zu = Entwicklung · K|Platz|von|zu = Korrektur · B/T|Platz|Pokémon = Box/Team · U|Platz = Undo
--   D|Platz|Pokémon|Ursache|Gegner|Level[|Route] = Tod (alle Partner sterben mit) · W|Platz|Notiz = Wipe · V|Notiz = Sieg

do $demo$
declare
  c_slug constant text := 'demo-soulsilver-alle';
  c_site constant text := 'https://mlangenhan.github.io/SoullinkWebsite';
  c_players constant text[] := array['Moritz', 'Janne', 'Elsmann', 'Linus'];  -- alle miteinander verbunden
  c_colors constant text[] := array['#2a6fdb', '#e0457b', '#2f9e62', '#e8890c'];
  c_story constant text := '
# Run 1: endet in Dukatia City an Biankas Miltank
S|2026-09-12T19:00+02 / F|Starter|Feurigel|Endivie|Karnimani|Feurigel / F|Route 29|Taubsi|Wiesor|Rattfratz|Hoothoot
F|Route 30|Raupy|Hornliu|Ledyba|Webarak / F|Route 31|Knofensa|Knofensa|Quapsel|Taubsi
F|Knofensa-Turm|Nebulak|Rattfratz|Nebulak|Rattfratz / E|1|Taubsi|Tauboga
F|Route 32|Voltilamm|Hoppspross|Felino|Voltilamm / F|Einheitstunnel|Onix|Sandan|Kleinstein|Quapsel
D|3|Felino|Wildes Pokémon|Onix|9|Einheitstunnel
S|2026-09-15T20:00+02 / F|Flegmon-Brunnen|Flegmon|Flegmon|Zubat|Flegmon / F|Steineichenwald|Myrapla|Raupy|Hornliu|Knofensa
F|Route 34|Abra|Traumato|Pummeluff|Abra / FS|Dukatia City|Evoli|Evoli|Evoli|Evoli
D|2|Rattfratz|Arenakampf Dukatia City|Bianka|19 / D|1|Tauboga|Arenakampf Dukatia City|Bianka|20
D|4|Feurigel|Arenakampf Dukatia City|Bianka|18
W|2|Biankas Miltank: Walzer, Milchgetränk, Walzer. Der Klassiker
# Run 2: läuft noch
S|2026-09-20T19:00+02 / F|Starter|Karnimani|Feurigel|Endivie|Karnimani / F|Route 29|Wiesor|Taubsi|Hoothoot|Rattfratz
F|Route 30|Ledyba|Webarak|Taubsi|Hornliu / F|Route 31|Quapsel|Knofensa|Knofensa|Taubsi
F|Knofensa-Turm|Rattfratz|Nebulak|Rattfratz|Nebulak / FS|Viola City|Togepi|Togepi|Togepi|Togepi / E|2|Taubsi|Tauboga
F|Route 32|Voltilamm|Hoppspross|Felino|Voltilamm / F|Einheitstunnel|Onix|Quapsel|Sandan|Kleinstein
S|2026-09-26T20:00+02 / F|Flegmon-Brunnen|Flegmon|Zubat|Flegmon|Flegmon / D|1|Wiesor|Arenakampf Azalea City|Kai|15
F|Steineichenwald|Myrapla|Hornliu|Raupy|Knofensa / E|1|Karnimani|Tyracroc / E|2|Feurigel|Igelavar / E|3|Endivie|Lorblatt
E|4|Karnimani|Tyracroc
S|2026-10-03T19:30+02 / F|Route 34|Abra|Traumato|Pummeluff|Abra / FS|Dukatia City|Evoli|Evoli|Evoli|Evoli
F|Route 35|Fukano|Hoothoot|Fukano|Pummeluff / F|Nationalpark|Sichlor|Pinsir|Hornliu|Raupy
E|1|Voltilamm|Waaty / D|4|Voltilamm|Trainerkampf|Käfersammler|22|Route 35 / FS|Route 36|Mogelbaum|Mogelbaum|Mogelbaum|Mogelbaum
B|2|Webarak / T|2|Zubat
';
  v_challenge uuid; v_members uuid[] := '{}'; v_clock timestamptz; v_step text; f text[]; v_seat integer;
  v_encounter uuid; v_route uuid; v_species integer; v_team integer; v_events jsonb[]; v_event jsonb;
begin
  delete from public.challenges where slug = c_slug;  -- alte Demo
  insert into public.challenges (slug, name, game, visibility)
  values (c_slug, 'Demo: SoulSilver, alle verbunden', 'Pokémon SoulSilver', 'private')
  returning id into v_challenge;
  perform set_config('demo.challenge_id', v_challenge::text, false), set_config('demo.site_url', c_site, false);

  for i in 1..4 loop
    insert into public.challenge_members (challenge_id, role, display_name, color, seat, link_group)
    values (v_challenge, case when i = 1 then 'owner' else 'player' end::public.member_role,
            c_players[i], c_colors[i], i - 1, null)  -- keine Gruppe: alle bilden einen Soul-Link
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
