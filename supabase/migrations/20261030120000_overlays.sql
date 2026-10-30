-- OBS-Overlays: Lese-Links für Streams
--
-- Ein Overlay-Link enthält ein eigenes Token (wie der Bot), darf aber nur lesen. So zeigt OBS auch
-- private Challenges an, ohne dass im Streaming-PC eine Spieler-Sitzung steckt. Die Leitung erstellt
-- und widerruft Overlay-Links; gespeichert wird nur der SHA-256-Hash.
--
-- overlay_state liefert denselben Datenzuschnitt, den die Website lädt (Challenge, Mitglieder, Routen,
-- Begegnungen und Ereignisse des laufenden Runs), damit Team-Plätze und Level-Cap mit demselben Code
-- berechnet werden. OBS fragt alle paar Sekunden nach; bringt der Aufruf die bekannte Version mit und
-- hat sich nichts geändert, kommt nur die Version zurück.

create table public.overlay_tokens (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  token_hash bytea not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index overlay_tokens_challenge_idx on public.overlay_tokens (challenge_id);

alter table public.overlay_tokens enable row level security;
create policy "Challenge-Leitung sieht Overlay-Links" on public.overlay_tokens
  for select to authenticated using (private.is_challenge_owner(challenge_id));
-- Token-Hashes verlassen die Datenbank nie
grant select (id, challenge_id, label, last_used_at, revoked_at, created_by, created_at)
  on public.overlay_tokens to authenticated;

create function public.create_overlay_token(p_challenge_id uuid, p_label text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := private.new_token('slo_');
begin
  perform private.require_owner(p_challenge_id);
  insert into public.overlay_tokens (challenge_id, label, token_hash, created_by)
  values (p_challenge_id, trim(p_label), private.token_hash(v_token), auth.uid());
  return v_token;
end;
$$;

create function public.revoke_overlay_token(p_token_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_id uuid;
begin
  select t.challenge_id into v_challenge_id from public.overlay_tokens t where t.id = p_token_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'Overlay-Link nicht gefunden';
  end if;
  perform private.require_owner(v_challenge_id);
  update public.overlay_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_token_id;
end;
$$;

create function private.overlay_auth(p_token text) returns public.overlay_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.overlay_tokens;
begin
  select * into v_token from public.overlay_tokens
  where token_hash = private.token_hash(coalesce(p_token, '')) and revoked_at is null;
  if not found then
    raise exception using errcode = 'PT401', message = 'Overlay-Link ungültig oder widerrufen';
  end if;
  -- Nutzung höchstens alle fünf Minuten vermerken: OBS fragt alle paar Sekunden
  if v_token.last_used_at is null or v_token.last_used_at < now() - interval '5 minutes' then
    update public.overlay_tokens set last_used_at = now() where id = v_token.id;
  end if;
  return v_token;
end;
$$;

-- Stand fürs Overlay. p_version: zuletzt bekannte Version; ist sie aktuell, kommt nur {version}.
create function public.overlay_state(p_token text, p_version text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.overlay_tokens := private.overlay_auth(p_token);
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

revoke all on function public.create_overlay_token(uuid, text), public.revoke_overlay_token(uuid),
  public.overlay_state(text, text), private.overlay_auth(text) from public, anon, authenticated;
grant execute on function public.create_overlay_token(uuid, text), public.revoke_overlay_token(uuid) to authenticated;
-- OBS hat keine Sitzung: Lesen nur mit gültigem Overlay-Token
grant execute on function public.overlay_state(text, text) to anon, authenticated;
