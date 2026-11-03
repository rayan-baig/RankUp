-- ---------------------------------------------------------------------------
-- Local Supabase shim — FOR TESTING ONLY. Never run this on a real project.
--
-- Supabase provides an `auth` schema, an `auth.uid()` function and the `anon`
-- and `authenticated` roles. A bare Postgres does not, so this recreates just
-- enough of them to run schema.sql and prove the security rules behave.
-- ---------------------------------------------------------------------------

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the signed-in user from a request-scoped JWT claim. Locally we
-- fake it with a session setting the tests can change to "become" a user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

-- The tests run as a non-superuser, because a superuser bypasses row level
-- security entirely and every policy test would pass for the wrong reason.
do $$ begin
  create role app_user login;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth to anon, authenticated, app_user;
grant authenticated, anon to app_user;


-- What a real Supabase project does to everything the SQL editor creates in
-- `public` (supabase/postgres, init-scripts/00000000000000-initial-schema.sql):
-- every new table, function and sequence is granted to anon and authenticated
-- by name, not only to PUBLIC. So `revoke ... from public` alone leaves a
-- function callable with the anon key; a function the server alone may run has
-- to be revoked from anon and authenticated as well. Without these lines the
-- stand-in was kinder than the real thing, and every check that "a browser
-- cannot call this" passed here while the hosted database let anyone call it.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
