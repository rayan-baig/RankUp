-- ---------------------------------------------------------------------------
-- Billing.
--
-- Run after schema.sql.
--
-- THE RULE: a family's tier is written by Stripe's webhook and by nothing else.
--
-- If a device could set its own `tier` column, every Elite feature would be one
-- edited request away from free, and a lapsed subscription would never actually
-- lapse. So the column is server-owned: the client never pushes it (see
-- SERVER_OWNED in src/lib/sync/shadow.js), and the function that writes it is
-- revoked from PUBLIC so only the webhook, holding the service role key, can
-- call it.
--
-- It also fails CLOSED. Anything other than a currently-good subscription
-- resolves to Standard.
-- ---------------------------------------------------------------------------

alter table families add column if not exists subscription_ends_at timestamptz;
alter table families add column if not exists billing_discount_percent int not null default 0;

create table if not exists billing_events (
  id           bigserial primary key,
  family_id    uuid references families(id) on delete set null,
  stripe_event text unique,
  type         text not null,
  payload      jsonb,
  received_at  timestamptz not null default now()
);

alter table billing_events enable row level security;
-- No policy: billing history is not readable from a browser.

/**
 * Apply a subscription change. Called only by the Stripe webhook.
 *
 * `p_stripe_event` makes this idempotent. Stripe retries deliveries, and
 * without a uniqueness check a retry could downgrade a family that had already
 * resubscribed.
 */
create or replace function apply_subscription_change(
  p_family_id uuid,
  p_status text,
  p_tier text,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_period_end timestamptz default null,
  p_stripe_event text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tier text;
begin
  if p_stripe_event is not null then
    begin
      insert into billing_events (family_id, stripe_event, type, payload)
      values (p_family_id, p_stripe_event, p_status, p_payload);
    exception when unique_violation then
      -- Already handled. Stripe retries; we do not act twice.
      return jsonb_build_object('ok', true, 'duplicate', true);
    end;
  end if;

  -- Fail closed: only an active or trialing subscription buys anything.
  v_tier := case
    when p_status in ('active', 'trialing') and p_tier = 'elite' then 'elite'
    else 'standard'
  end;

  update families
     set tier = v_tier,
         subscription_status = p_status,
         stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
         subscription_renews_at = p_period_end,
         subscription_ends_at = case when p_status in ('canceled', 'unpaid') then p_period_end else null end
   where id = p_family_id;

  return jsonb_build_object('ok', true, 'tier', v_tier);
end $$;

/**
 * The Stripe customer for a family. Server-side only — it is not secret, but
 * there is no reason for a browser to hold it either.
 */
create or replace function stripe_customer_for_family(p_family_id uuid)
returns text
language sql security definer set search_path = public as $$
  select stripe_customer_id from families where id = p_family_id;
$$;

/** Look up a family from its Stripe customer id, for webhook events that only carry that. */
create or replace function family_for_customer(p_customer_id text)
returns uuid
language sql security definer set search_path = public as $$
  select id from families where stripe_customer_id = p_customer_id limit 1;
$$;

/** Remember the customer id at checkout, so later webhooks can find the family. */
create or replace function attach_stripe_customer(p_family_id uuid, p_customer_id text)
returns void
language sql security definer set search_path = public as $$
  update families set stripe_customer_id = p_customer_id where id = p_family_id;
$$;

/** What the billing screen needs. Readable by a parent of the family only. */
create or replace function billing_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_family families;
begin
  select f.* into v_family from families f
    join parents p on p.family_id = f.id
   where p.user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false); end if;

  return jsonb_build_object(
    'ok', true,
    'family_id', v_family.id,
    'tier', v_family.tier,
    'status', v_family.subscription_status,
    'renews_at', v_family.subscription_renews_at,
    'ends_at', v_family.subscription_ends_at,
    'discount_percent', v_family.billing_discount_percent,
    'has_customer', v_family.stripe_customer_id is not null
  );
end $$;

/**
 * Lock the billing columns.
 *
 * Row level security decides WHICH ROWS you may touch, not which columns — so
 * the policy that lets a parent update their own family also let them set
 * `tier = 'elite'`. Column-level grants are the tool for that, and this is
 * wrapped in a function so it can be re-applied after anything that issues a
 * blanket GRANT (Supabase's defaults do, and so do the tests).
 */
create or replace function lock_billing_columns() returns void
language plpgsql as $$
begin
  -- A table-wide UPDATE grant covers every column, and a column-level REVOKE
  -- cannot carve a hole in it. The only way to restrict columns is to drop the
  -- table-wide grant and re-grant the specific ones that are safe.
  execute 'revoke update on families from anon, authenticated';
  execute 'grant update (name, parent_theme_id) on families to anon, authenticated';
end $$;

select lock_billing_columns();

grant execute on function billing_status() to authenticated;
grant execute on function lock_billing_columns() to postgres;
-- Written by the webhook only. Postgres grants EXECUTE to PUBLIC on a new
-- function automatically, so these must be revoked from PUBLIC, not just from
-- anon and authenticated.
revoke execute on function apply_subscription_change(uuid, text, text, text, text, timestamptz, text, jsonb) from public;
revoke execute on function family_for_customer(text) from public;
revoke execute on function stripe_customer_for_family(uuid) from public;
revoke execute on function attach_stripe_customer(uuid, text) from public;
