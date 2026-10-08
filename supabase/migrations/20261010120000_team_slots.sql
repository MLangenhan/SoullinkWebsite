-- Team-Plätze und Teamgröße wie in den Spielen
--
-- * encounter_status_changed darf einen Platz 1–6 mitgeben ("slot"). Ein Pokémon, das schon im Team
--   ist, kann so auf einen anderen Platz ziehen (der bisherige Inhaber tauscht mit ihm).
-- * Höchstens sechs Pokémon im Team: Ins Team wechseln geht nur mit freiem Platz. Ein neu gefangenes
--   Pokémon landet bei vollem Team in der Box.
-- Die bisherige Prüfung bleibt unverändert als private.validate_event_base und wird hier umhüllt.

alter function private.validate_event(uuid, integer, public.event_type, jsonb) rename to validate_event_base;

create function private.validate_event(p_challenge_id uuid, p_run integer, p_type public.event_type, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_slot integer;
  v_encounter public.encounters;
  v_member uuid;
  v_team integer;
begin
  if p_type = 'encounter_status_changed' and jsonb_typeof(p_payload) = 'object' then
    v_slot := private.jsonb_int(p_payload, 'slot', false, 1, 6);
    -- Umstellen innerhalb des Teams: nur mit Platz, sonst wäre es kein Wechsel
    if v_slot is not null and p_payload ->> 'status' = 'team' then
      v_encounter := private.require_living_encounter(
        p_challenge_id, p_run, private.jsonb_uuid(p_payload, 'encounter_id', true));
      if v_encounter.state = 'team' then
        return jsonb_build_object('encounter_id', v_encounter.encounter_id, 'status', 'team', 'slot', v_slot);
      end if;
    end if;
  end if;

  v_result := private.validate_event_base(p_challenge_id, p_run, p_type, p_payload);

  if p_type in ('encounter_status_changed', 'encounter_logged') and v_result ->> 'status' = 'team' then
    v_member := coalesce(
      (v_result ->> 'member_id')::uuid,
      (select en.member_id from public.encounters en
       where en.challenge_id = p_challenge_id and en.encounter_id = (v_result ->> 'encounter_id')::uuid));
    select count(*) into v_team
    from public.encounters en
    where en.challenge_id = p_challenge_id and en.run_number = p_run and en.member_id = v_member and en.state = 'team';

    if v_team >= 6 then
      if p_type = 'encounter_logged' then
        v_result := jsonb_set(v_result, '{status}', '"box"');
      else
        raise exception using errcode = 'PT409',
          message = 'Das Team ist voll. Erst ein Pokémon in die Box legen oder tauschen';
      end if;
    elsif v_slot is not null then
      v_result := v_result || jsonb_build_object('slot', v_slot);
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function private.validate_event(uuid, integer, public.event_type, jsonb) from public, anon, authenticated;
