-- Spielregeln pro Challenge: Level-Cap, Dupes-Clause und verfallene Soul-Links
--
-- * Level-Cap: Vorlage (Spiel) und aktueller Eintrag. Der Eintrag gilt für den Run, in dem er gesetzt
--   wurde; ein neuer Run beginnt wieder beim ersten Cap (level_cap_run <> laufender Run).
-- * dupes_clause: Warnung bei schon gefangenen Entwicklungsreihen (für alle Spieler zusammen).
-- * encounter_missed merkt sich optional die Art (wild/static). So lässt sich ein unvollständiger
--   Soul-Link als verfallen markieren, und die Route gilt für diesen Spieler als abgehakt.

alter table public.challenges
  add column level_cap_preset text check (char_length(level_cap_preset) between 1 and 40),
  add column level_cap_index smallint not null default 0 check (level_cap_index between 0 and 99),
  add column level_cap_run integer not null default 1 check (level_cap_run > 0),
  add column dupes_clause boolean not null default true;

-- Bisherige Prüfung (mit Team-Plätzen und group_id) bleibt und wird erneut umhüllt
alter function private.validate_event(uuid, integer, public.event_type, jsonb) rename to validate_event_teams;

create function private.validate_event(p_challenge_id uuid, p_run integer, p_type public.event_type, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := private.validate_event_teams(p_challenge_id, p_run, p_type, p_payload);
  v_kind text;
begin
  if p_type = 'encounter_missed' then
    v_kind := private.jsonb_text(p_payload, 'kind', false, 10);
    if v_kind is not null then
      if v_kind not in ('wild', 'static') then
        raise exception using errcode = 'PT400', message = 'Art der Begegnung muss "wild" oder "static" sein';
      end if;
      v_result := v_result || jsonb_build_object('kind', v_kind);
    end if;
  end if;
  return v_result;
end;
$$;

-- Level-Cap weiterschalten: darf jeder Spieler
create function public.set_level_cap(p_challenge_id uuid, p_index integer) returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
begin
  perform private.require_player(p_challenge_id);
  if p_index is null or p_index not between 0 and 99 then
    raise exception using errcode = 'PT400', message = 'Ungültiger Level-Cap';
  end if;
  update public.challenges
  set level_cap_index = p_index, level_cap_run = private.current_run(p_challenge_id)
  where id = p_challenge_id
  returning * into v_challenge;
  return v_challenge;
end;
$$;

-- Vorlage für Level-Caps (null = am Spielnamen erkennen) und Dupes-Clause: nur die Leitung
create function public.set_challenge_rules(p_challenge_id uuid, p_level_cap_preset text, p_dupes_clause boolean)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
begin
  perform private.require_owner(p_challenge_id);
  update public.challenges
  set level_cap_preset = nullif(trim(p_level_cap_preset), ''),
      dupes_clause = coalesce(p_dupes_clause, dupes_clause),
      level_cap_index = case when level_cap_preset is distinct from nullif(trim(p_level_cap_preset), '') then 0 else level_cap_index end
  where id = p_challenge_id
  returning * into v_challenge;
  return v_challenge;
end;
$$;

revoke all on function private.validate_event(uuid, integer, public.event_type, jsonb) from public, anon, authenticated;
revoke all on function public.set_level_cap(uuid, integer), public.set_challenge_rules(uuid, text, boolean) from public, anon;
grant execute on function public.set_level_cap(uuid, integer), public.set_challenge_rules(uuid, text, boolean) to authenticated;
