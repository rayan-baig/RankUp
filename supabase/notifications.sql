-- ---------------------------------------------------------------------------
-- Push notification subscriptions.
--
-- Run after schema.sql.
--
-- A subscription is a capability: whoever holds the endpoint can make that
-- phone buzz. So these rows are never readable from a browser — a device can
-- register and remove its own, and only the server, holding the service key,
-- can read them in order to send. Without that rule a curious child could pull
-- every endpoint in the family and notify anyone at will.
-- ---------------------------------------------------------------------------

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  keys        jsonb not null,
  family_id   uuid references families(id) on delete cascade,
  kid_id      uuid references kids(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- 'parent' or 'kid': which side of the family this device belongs to, so a
  -- "review this submission" notice goes to a parent and not to the child who
  -- just sent it.
  role        text not null check (role in ('parent', 'kid')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  failures    int not null default 0
);

create index if not exists push_subscriptions_family_idx on push_subscriptions (family_id, role);

alter table push_subscriptions enable row level security;
-- No select, insert, update or delete policy on purpose. Everything goes
-- through the two functions below, and reading is server-side only.

/** Register (or refresh) this device. Works out who it belongs to from the caller. */
create or replace function save_push_subscription(p_endpoint text, p_keys jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid;
  v_kid    uuid;
  v_role   text;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;

  select family_id into v_family from parents where user_id = auth.uid();
  if v_family is not null then
    v_role := 'parent';
  else
    select id, family_id into v_kid, v_family from kids where user_id = auth.uid();
    if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;
    v_role := 'kid';
  end if;

  insert into push_subscriptions (endpoint, keys, family_id, kid_id, user_id, role)
  values (p_endpoint, p_keys, v_family, v_kid, auth.uid(), v_role)
  on conflict (endpoint) do update
    set keys = excluded.keys, family_id = excluded.family_id, kid_id = excluded.kid_id,
        user_id = excluded.user_id, role = excluded.role, last_seen = now(), failures = 0;

  return jsonb_build_object('ok', true, 'role', v_role);
end $$;

/** A device removing itself. Only ever its own endpoint. */
create or replace function delete_push_subscription(p_endpoint text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

/**
 * Who should be told about this?
 *
 * Called by the send endpoint with the service key, never from a browser. It
 * returns endpoints, which is exactly why the anon role has no access to it.
 */
create or replace function push_targets(p_family_id uuid, p_role text, p_kid_id uuid default null)
returns setof push_subscriptions
language sql security definer set search_path = public as $$
  select * from push_subscriptions
   where family_id = p_family_id
     and role = p_role
     and (p_kid_id is null or kid_id = p_kid_id)
     and failures < 5;
$$;

/** A push service reporting an endpoint is gone. Dead ones are dropped. */
create or replace function record_push_failure(p_endpoint text, p_gone boolean default false)
returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and p_gone;
  update push_subscriptions set failures = failures + 1
   where endpoint = p_endpoint and not p_gone;
$$;

grant execute on function save_push_subscription(text, jsonb) to anon, authenticated;
grant execute on function delete_push_subscription(text) to anon, authenticated;

-- IMPORTANT: Postgres grants EXECUTE on a new function to PUBLIC automatically.
-- Revoking from `anon, authenticated` alone does nothing, because the access
-- comes from PUBLIC — which is exactly how a "locked down" function ends up
-- callable by anyone. These two return push endpoints, so they are revoked from
-- PUBLIC and never re-granted: only the send endpoint, holding the service role
-- key, may call them.
revoke execute on function push_targets(uuid, text, uuid) from public;
revoke execute on function record_push_failure(text, boolean) from public;
