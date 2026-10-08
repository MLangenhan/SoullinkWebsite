-- Minimale Nachbildung der Supabase-Umgebung, damit Migration und Tests auf einem
-- nackten PostgreSQL (>= 15) laufen: Rollen, auth-Schema, auth.uid(), Realtime-Publikation
-- und die Standardrechte, die Supabase in "public" vergibt.

-- Rollen sind clusterweit und bleiben nach einem Testlauf bestehen
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb not null default '{}'
);

-- Supabase liest die Nutzer-ID aus dem JWT; hier aus einer Sitzungsvariable
create function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;

create publication supabase_realtime;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
