-- OBS-Overlays, zweiter Schritt: Links für alle Spieler, Gerätebindung und Erneuern
--
-- Jeder Spieler erstellt und verwaltet eigene Overlay-Links, die Leitung sieht und widerruft alle;
-- Zuschauer erstellen keine.
--
-- Gerätebindung: Ist sie an (Standard für neue Links), merkt sich der Link das erste Gerät, das ihn
-- öffnet (OBS legt dafür eine zufällige Geräte-ID in seinem Browser-Speicher ab, gespeichert wird nur
-- der Hash). Wer den Link abschreibt, etwa aus dem Stream, wird abgewiesen. Wechselt das Gerät, gibt
-- der Spieler es in den Einstellungen frei. Ein Link lässt sich außerdem erneuern: Das alte Token wird
-- ungültig, Bezeichnung und Bindung bleiben.

alter table public.overlay_tokens
  add column member_id uuid,
  -- Bestehende Links laufen schon in OBS (ohne Geräte-ID): für sie bleibt die Bindung aus
  add column device_lock boolean not null default false,
  add column device_hash bytea,
  add column device_bound_at timestamptz;

-- Bestehende Links gehören dem Platz, von dem aus sie erstellt wurden, sonst der Leitung
update public.overlay_tokens t set member_id = d.member_id
from public.member_devices d
where d.user_id = t.created_by and d.challenge_id = t.challenge_id;
update public.overlay_tokens t set member_id = (
  select m.id from public.challenge_members m
  where m.challenge_id = t.challenge_id and m.role = 'owner'
  order by m.seat nulls last, m.created_at
  limit 1
)
where t.member_id is null;
delete from public.overlay_tokens where member_id is null;

alter table public.overlay_tokens
  alter column member_id set not null,
  alter column device_lock set default true,
  -- Verlässt ein Spieler die Challenge, verschwinden seine Links
  add foreign key (member_id, challenge_id) references public.challenge_members (id, challenge_id) on delete cascade;
create index overlay_tokens_member_idx on public.overlay_tokens (member_id);

drop policy "Challenge-Leitung sieht Overlay-Links" on public.overlay_tokens;
create policy "Spieler sehen eigene, Leitung alle Overlay-Links" on public.overlay_tokens
  for select to authenticated
  using (
    private.is_challenge_owner(challenge_id)
    -- Eigene Geräte sind per RLS lesbar; darüber findet jedes Gerät seinen Platz
    or member_id in (select d.member_id from public.member_devices d where d.user_id = (select auth.uid()))
  );
-- Token- und Geräte-Hashes verlassen die Datenbank nie
grant select (member_id, device_lock, device_bound_at) on public.overlay_tokens to authenticated;

-- Alte Signaturen ohne Gerätebindung und Spielerrechte
drop function public.overlay_state(text, text);
drop function public.create_overlay_token(uuid, text);
drop function private.overlay_auth(text);

-- Overlay-Link, den der angemeldete Nutzer verwalten darf: den eigenen, als Leitung jeden der Challenge
create function private.manage_overlay(p_token_id uuid) returns public.overlay_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.overlay_tokens;
begin
  perform private.require_user();
  select * into v_token from public.overlay_tokens t where t.id = p_token_id for update;
  -- Fremde erfahren nicht, ob es den Link gibt
  -- coalesce: ohne eigenen Platz ist der Vergleich null, und null darf nie als erlaubt durchgehen
  if not found or not coalesce(private.is_challenge_owner(v_token.challenge_id)
                               or v_token.member_id = private.my_member_id(v_token.challenge_id), false) then
    raise exception using errcode = 'PT404', message = 'Overlay-Link nicht gefunden';
  end if;
  if coalesce(private.member_role(v_token.challenge_id) not in ('owner', 'player'), true) then
    raise exception using errcode = 'PT403', message = 'Nur Mitspieler verwalten Overlay-Links';
  end if;
  return v_token;
end;
$$;

create function public.create_overlay_token(p_challenge_id uuid, p_label text, p_device_lock boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.challenge_members := private.require_player(p_challenge_id);
  v_token text := private.new_token('slo_');
begin
  insert into public.overlay_tokens (challenge_id, member_id, label, token_hash, device_lock, created_by)
  values (p_challenge_id, v_member.id, trim(p_label), private.token_hash(v_token), coalesce(p_device_lock, true), auth.uid());
  return v_token;
end;
$$;

create or replace function public.revoke_overlay_token(p_token_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.manage_overlay(p_token_id);
  update public.overlay_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_token_id;
end;
$$;

-- Neues Token für denselben Link: das alte wird sofort ungültig, Bezeichnung und Gerätebindung bleiben
create function public.rotate_overlay_token(p_token_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.overlay_tokens := private.manage_overlay(p_token_id);
  v_token text := private.new_token('slo_');
begin
  if v_old.revoked_at is not null then
    raise exception using errcode = 'PT409', message = 'Overlay-Link ist schon widerrufen';
  end if;
  update public.overlay_tokens set revoked_at = now() where id = p_token_id;
  insert into public.overlay_tokens (challenge_id, member_id, label, token_hash, device_lock, created_by)
  values (v_old.challenge_id, v_old.member_id, v_old.label, private.token_hash(v_token), v_old.device_lock, auth.uid());
  return v_token;
end;
$$;

-- Gerätebindung ein- oder ausschalten; beides löst die bisherige Bindung, das nächste Gerät wird gemerkt
create function public.set_overlay_device_lock(p_token_id uuid, p_device_lock boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.manage_overlay(p_token_id);
  update public.overlay_tokens
  set device_lock = coalesce(p_device_lock, true), device_hash = null, device_bound_at = null
  where id = p_token_id;
end;
$$;

-- Zu welchem Link gehört dieses Token? Für den Baukasten, ohne das Gerät zu binden.
create function public.overlay_token_id(p_token text) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_user();
  select t.id into v_id from public.overlay_tokens t
  where t.token_hash = private.token_hash(coalesce(p_token, '')) and t.revoked_at is null
    and coalesce(private.is_challenge_owner(t.challenge_id) or t.member_id = private.my_member_id(t.challenge_id), false);
  if not found then
    raise exception using errcode = 'PT401', message = 'Overlay-Link ungültig oder widerrufen';
  end if;
  return v_id;
end;
$$;

create function private.overlay_auth(p_token text, p_device text) returns public.overlay_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.overlay_tokens;
  v_device bytea;
begin
  select * into v_token from public.overlay_tokens
  where token_hash = private.token_hash(coalesce(p_token, '')) and revoked_at is null;
  if not found then
    raise exception using errcode = 'PT401', message = 'Overlay-Link ungültig oder widerrufen';
  end if;

  if v_token.device_lock then
    if p_device is null or char_length(p_device) not between 20 and 100 then
      raise exception using errcode = 'PT403', message = 'Overlay-Link ist an ein Gerät gebunden';
    end if;
    v_device := private.token_hash(p_device);
    if v_token.device_hash is null then
      -- Erstes Gerät: gleichzeitige Erstaufrufe entscheidet die Datenbank, nur einer gewinnt
      update public.overlay_tokens set device_hash = v_device, device_bound_at = now()
      where id = v_token.id and device_hash is null;
      if not found then
        select * into v_token from public.overlay_tokens where id = v_token.id;
      else
        v_token.device_hash := v_device;
      end if;
    end if;
    if v_token.device_hash <> v_device then
      raise exception using errcode = 'PT403', message = 'Overlay-Link ist an ein anderes Gerät gebunden';
    end if;
  end if;

  -- Nutzung höchstens alle fünf Minuten vermerken: OBS fragt alle paar Sekunden
  if v_token.last_used_at is null or v_token.last_used_at < now() - interval '5 minutes' then
    update public.overlay_tokens set last_used_at = now() where id = v_token.id;
  end if;
  return v_token;
end;
$$;

-- Stand fürs Overlay. p_version: zuletzt bekannte Version; ist sie aktuell, kommt nur {version}.
-- p_device: Geräte-ID der Browserquelle, nötig bei Links mit Gerätebindung.
create function public.overlay_state(p_token text, p_version text default null, p_device text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.overlay_tokens := private.overlay_auth(p_token, p_device);
  v_challenge public.challenges;
  v_run integer;
  v_version text;
begin
  select * into v_challenge from public.challenges where id = v_token.challenge_id;
  select s.current_run into v_run from public.challenge_stats s where s.challenge_id = v_challenge.id;

  -- last_seq ändert sich mit jedem Ereignis; Mitglieder, Routen und Einstellungen kommen dazu
  v_version := md5(
    to_jsonb(v_challenge)::text
    || coalesce((select string_agg(to_jsonb(m)::text, ',' order by m.id) from public.challenge_members m
                 where m.challenge_id = v_challenge.id), '')
    || coalesce((select string_agg(to_jsonb(rt)::text, ',' order by rt.id) from public.routes rt
                 where rt.challenge_id = v_challenge.id), '')
  );
  if p_version is not null and p_version = v_version then
    return jsonb_build_object('version', v_version);
  end if;

  return jsonb_build_object(
    'version', v_version,
    'challenge', to_jsonb(v_challenge) - 'created_by' - 'bot_allow_unlinked',
    'stats', (select to_jsonb(s) from public.challenge_stats s where s.challenge_id = v_challenge.id),
    'members', coalesce((
      select jsonb_agg(to_jsonb(m) - 'discord_id' order by m.seat nulls last, m.display_name)
      from public.challenge_members m
      where m.challenge_id = v_challenge.id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(rt) order by rt.sort_order)
      from public.routes rt
      where rt.challenge_id = v_challenge.id
    ), '[]'::jsonb),
    'encounters', coalesce((
      select jsonb_agg(to_jsonb(en) order by en.logged_at)
      from public.encounters en
      where en.challenge_id = v_challenge.id and en.run_number = v_run
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        to_jsonb(e) - 'actor_user_id' - 'actor_discord_id' - 'client_event_id' order by e.seq desc
      )
      from (
        select * from public.events ev
        where ev.challenge_id = v_challenge.id and ev.run_number = v_run
        order by ev.seq desc
        limit 1000
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_overlay_token(uuid, text, boolean), public.revoke_overlay_token(uuid),
  public.rotate_overlay_token(uuid), public.set_overlay_device_lock(uuid, boolean), public.overlay_token_id(text),
  public.overlay_state(text, text, text), private.overlay_auth(text, text), private.manage_overlay(uuid)
  from public, anon, authenticated;
grant execute on function public.create_overlay_token(uuid, text, boolean), public.revoke_overlay_token(uuid),
  public.rotate_overlay_token(uuid), public.set_overlay_device_lock(uuid, boolean), public.overlay_token_id(text)
  to authenticated;
-- OBS hat keine Sitzung: Lesen nur mit gültigem Overlay-Token
grant execute on function public.overlay_state(text, text, text) to anon, authenticated;
