-- ---------------------------------------------------------------------------
-- Knowing the thing is alive without watching it.
--
-- Run after schema.sql, retention.sql and crashes.sql.
--
-- Three jobs have to be scheduled outside this codebase, and the failure mode
-- for all three is silence: reminders stop arriving, old rows stop being deleted,
-- alliance discounts stop being paid, and nothing anywhere says so. I shipped
-- exactly that bug — POST-only endpoints scheduled by a GET cron would have
-- 405'd every run and looked perfectly fine on the dashboard.
--
-- So every run records itself, and one function answers "is this healthy?" by
-- how long it has been since each job last succeeded. A job that stops being
-- called goes stale and says so.
-- ---------------------------------------------------------------------------

create table if not exists job_runs (
  job         text primary key,
  last_ok_at  timestamptz,
  last_try_at timestamptz,
  last_error  text,
  ok_count    bigint not null default 0,
  fail_count  bigint not null default 0
);

alter table job_runs enable row level security;
revoke all on job_runs from public;

/** Called by each scheduled job as it finishes, success or failure. */
create or replace function record_job_run(p_job text, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = public as $$
  insert into job_runs (job, last_ok_at, last_try_at, last_error, ok_count, fail_count)
  values (left(p_job, 40),
          case when p_ok then now() end, now(),
          case when p_ok then null else left(coalesce(p_error, 'failed'), 300) end,
          case when p_ok then 1 else 0 end,
          case when p_ok then 0 else 1 end)
  on conflict (job) do update set
    last_ok_at  = case when p_ok then now() else job_runs.last_ok_at end,
    last_try_at = now(),
    last_error  = case when p_ok then null else left(coalesce(p_error, 'failed'), 300) end,
    ok_count    = job_runs.ok_count + case when p_ok then 1 else 0 end,
    fail_count  = job_runs.fail_count + case when p_ok then 0 else 1 end;
$$;

/**
 * One answer to "is anything wrong?".
 *
 * Each job carries how long it may go quiet before that is itself a symptom —
 * generous multiples of the schedule, so an occasional missed run is not an
 * alarm but a scheduler that has stopped is.
 *
 * `never_run` is deliberately distinct from `stale`: before launch every job
 * has never run and that is fine, but a month after launch it means the
 * schedule was never set up. The difference is the whole point.
 */
create or replace function health_snapshot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_jobs    jsonb;
  v_crashes int;
  v_unbilled int := 0;
begin
  select jsonb_object_agg(j.job, jsonb_build_object(
           'state', case
                      when r.last_ok_at is null then 'never_run'
                      when r.last_ok_at < now() - j.stale_after then 'stale'
                      else 'ok' end,
           'last_ok_at', r.last_ok_at,
           'minutes_since', case when r.last_ok_at is null then null
                                 else round(extract(epoch from now() - r.last_ok_at) / 60) end,
           'last_error', r.last_error,
           'fail_count', coalesce(r.fail_count, 0)))
    into v_jobs
    from (values
            ('send-reminders',   interval '2 hours'),
            ('run-retention',    interval '3 days'),
            -- Weekly by design, so the window has to clear a whole week plus
            -- room for a scheduler that ran late. Anything tighter would report
            -- a perfectly healthy job as dead every Saturday.
            ('send-digests',     interval '9 days'),
            ('settle-alliances', interval '45 days'),
            ('settle-schools',   interval '45 days')
         ) as j(job, stale_after)
    left join job_runs r on r.job = j.job;

  select count(*) into v_crashes from crash_reports
   where created_at > now() - interval '24 hours';
  -- Deleted families whose Stripe subscription has still not been confirmed
  -- cancelled a day later: Stripe refusing, or the key not set. Each one may
  -- be charged again, so it is never silently ok.
  if to_regclass('public.billing_cancellations') is not null then
    select count(*) into v_unbilled from billing_cancellations
     where done_at is null and queued_at < now() - interval '1 day'
       and (stripe_customer_id is not null or stripe_subscription_id is not null);
  end if;

  return jsonb_build_object(
    -- never_run counts as not-ok. Only checking for 'stale' meant a deployment
    -- whose crons were never wired up reported healthy for ever — which is
    -- precisely the mistake this function exists to catch. Before launch the
    -- answer is legitimately red; that is better than a green light that means
    -- nothing.
    'ok', not exists (
      select 1 from jsonb_each(v_jobs) e
       where e.value->>'state' in ('stale', 'never_run')
    ) and v_unbilled = 0,
    'checked_at', now(),
    'jobs', v_jobs,
    'crashes_24h', v_crashes,
    'billing_cancellations_overdue', v_unbilled
  );
end $$;

revoke execute on function record_job_run(text, boolean, text) from public;
revoke execute on function health_snapshot() from public;

/**
 * Two numbers for the owner's console (MTRX Horizyn): how many families,
 * and how many did anything in the last 30 days. Counts only. Called by
 * api/stats.js with the service key; nobody else may call it.
 */
create or replace function usage_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'families', (select count(*) from families),
    'active_families', (select count(distinct family_id) from events
                         where created_at > now() - interval '30 days')
  )
$$;
revoke execute on function usage_counts() from public, anon, authenticated;
