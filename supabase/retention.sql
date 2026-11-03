-- ---------------------------------------------------------------------------
-- Retention: throwing away what nothing reads any more.
--
-- Run after schema.sql, sync.sql, guilds.sql and consent.sql.
--
-- These tables grow forever and are only ever read over a short recent
-- window. Left alone they become the largest thing in the database. (RankUp
-- takes no photos any more, so there are none here to clear.)
--
--   events                     ~10 rows per family per day, forever. The
--                              dashboard shows the last 8 and the Behaviour
--                              Blueprint reads 7 days.
--   pairing_codes              a six-digit code lives ten minutes. The row
--                              outlived it by years.
--   pairing_claim_attempts     rate-limit marks, read over a ten-minute window.
--
-- Guild messages are deliberately NOT in this list. They are the record of what
-- children said to each other, they can be reported, and a job that quietly
-- deletes them to save disk would be deleting moderation evidence. If they ever
-- need a retention policy it is a safety decision, not a storage one.
-- ---------------------------------------------------------------------------

-- Without this the nightly delete is a sequential scan of the largest table in
-- the database, which is the one thing that could make the tidy-up cost more
-- than the mess.
create index if not exists events_created_at_idx on events (created_at);

/**
 * One call, so a scheduler has one thing to hit and the result says what went.
 *
 * `p_photo_days` is ignored. It cleared photos RankUp no longer takes, and it
 * stays in the signature only so that an older copy of api/run-retention.js,
 * which still sends it, keeps working while the app is being updated.
 *
 * Every limit is a parameter with a generous default: the point is to stop
 * unbounded growth, not to be clever about how little can be kept. Service-role
 * only — it deletes across every family, which is not a thing any signed-in
 * account should be able to ask for.
 */
create or replace function run_retention(
  p_photo_days  int default 14,
  p_event_days  int default 90,
  p_pairing_days int default 2)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_events  int;
  v_codes   int;
  v_tries   int;
  v_crashes int;
begin
  with gone as (
    delete from events
     where created_at < now() - make_interval(days => greatest(7, p_event_days))
    returning 1
  ) select count(*) into v_events from gone;

  -- Claimed codes are kept as briefly as unclaimed ones: once a device is
  -- linked the kids row carries the link, and the code is spent either way.
  with gone as (
    delete from pairing_codes
     where expires_at < now() - make_interval(days => greatest(1, p_pairing_days))
    returning 1
  ) select count(*) into v_codes from gone;

  -- Uses the parameter like everything else here. It was hardcoded to a day,
  -- which meant RETENTION_PAIRING_DAYS was a knob that did nothing.
  with gone as (
    delete from pairing_claim_attempts
     where tried_at < now() - make_interval(days => greatest(1, p_pairing_days))
    returning 1
  ) select count(*) into v_tries from gone;

  -- crash_reports only exists once crashes.sql has been applied; retention
  -- must not fail on a deployment that has not.
  -- Receipts for retried calls (sync.sql) only matter while a phone might
  -- still be retrying; a month is far past that.
  if to_regclass('public.rpc_receipts') is not null then
    delete from rpc_receipts where created_at < now() - interval '30 days';
  end if;

  -- What a deleted family leaves for its Stripe cancellation (consent.sql):
  -- the marker after a week, a confirmed cancellation after 30 days. One still
  -- waiting for Stripe is never deleted here; api/run-retention.js retries it.
  if to_regclass('public.billing_cancellations') is not null then
    delete from billing_cancellations
     where done_at is not null
       and (done_at < now() - interval '30 days'
            or (stripe_customer_id is null and stripe_subscription_id is null
                and queued_at < now() - interval '7 days'));
  end if;

  if to_regclass('public.crash_reports') is not null then
    execute format(
      'with gone as (delete from crash_reports where created_at < now() - make_interval(days => %s) returning 1) select count(*) from gone',
      greatest(7, p_event_days)) into v_crashes;
  end if;

  return jsonb_build_object(
    'ok', true,
    'crashes_deleted', coalesce(v_crashes, 0),
    'events_deleted', v_events,
    'pairing_codes_deleted', v_codes,
    'claim_attempts_deleted', v_tries
  );
end $$;

revoke execute on function run_retention(int, int, int) from public, anon, authenticated;
