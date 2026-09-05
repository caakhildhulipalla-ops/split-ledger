-- ============================================================================
-- LOCAL TESTING ONLY. Never run this against Supabase.
--
-- Supabase provides the `auth` schema, the `auth.users` table, `auth.uid()`
-- and the `anon` / `authenticated` roles. This reproduces just enough of
-- them to run the real migrations and prove the RLS policies hold.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  phone              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase reads the subject claim off the request JWT. Same contract here,
-- driven by a session GUC so a test can act as any user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
