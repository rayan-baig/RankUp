-- ---------------------------------------------------------------------------
-- Knowing the thing is alive without watching it.
--
-- Run after schema.sql, schools.sql, leaderboards.sql, retention.sql and crashes.sql.
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
revoke all on job_runs from public, anon, authenticated;

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
  v_errors  int := 0;
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
            -- Every ten minutes. An hour quiet means the boards are an hour old.
            ('refresh-leaderboards', interval '1 hour'),
            -- Hourly. Quiet for a day means a trial-ending email may be missed.
            ('send-trial-emails', interval '6 hours'),
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
  -- The server functions' own errors (crashes.sql), the same window.
  if to_regclass('public.server_errors') is not null then
    select count(*) into v_errors from server_errors
     where created_at > now() - interval '24 hours';
  end if;
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
    'server_errors_24h', v_errors,
    'billing_cancellations_overdue', v_unbilled
  );
end $$;

revoke execute on function record_job_run(text, boolean, text) from public, anon, authenticated;
revoke execute on function health_snapshot() from public, anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- How much RankUp is used, day by day: totals only.
--
-- Six numbers a day: families signed up, chores accepted, rewards bought,
-- games played, schools signed up, and views of a help page. Each is a count
-- and nothing else. No family, child, adult, device or school is recorded
-- with it, not even a time of day; no cookie is set and nothing is sent
-- anywhere else. Five are bumped inside the database by the thing they count
-- (a trigger), so there is no extra request and no list of who did what to
-- keep; the sixth, a help page view, is one request with the public key
-- alone, never a sign-in. A count cannot be turned back into a family.
--
-- Each day's count is split over 16 rows picked at random, so thousands of
-- families accepting chores at once do not all wait on one row; the totals
-- are the sum. Kept 400 days (run_retention, retention.sql). Read only by the
-- server: the operator's page (api/operator-schools.js) and the owner's
-- console (api/stats.js).
-- ---------------------------------------------------------------------------

create table if not exists usage_daily (
  day    date not null,
  metric text not null check (metric in ('families_signed_up', 'chores_accepted', 'rewards_bought',
                                         'games_played', 'schools_signed_up', 'help_views')),
  shard  smallint not null check (shard between 0 and 15),
  n      bigint not null default 0,
  primary key (day, metric, shard)
);

alter table usage_daily enable row level security;
revoke all on usage_daily from public, anon, authenticated;

/** Add one to today's (UTC) count of p_metric. */
create or replace function usage_bump(p_metric text)
returns void language sql security definer set search_path = public as $$
  insert into usage_daily (day, metric, shard, n)
  values ((now() at time zone 'utc')::date, p_metric, floor(random() * 16)::smallint, 1)
  on conflict (day, metric, shard) do update set n = usage_daily.n + 1;
$$;
revoke execute on function usage_bump(text) from public, anon, authenticated;

/** The one trigger behind every count but help views; which count is its argument. */
create or replace function usage_count_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A chore counts once, when it is accepted: not when it is sent, and not
  -- again if the row is saved later for something else.
  if tg_argv[0] = 'chores_accepted' then
    -- Only submissions get this argument; the fields are read through jsonb
    -- because a trigger function is shared by tables without a status.
    if to_jsonb(new)->>'status' <> 'approved'
       or (tg_op = 'UPDATE' and to_jsonb(old)->>'status' = 'approved') then
      return null;
    end if;
  end if;
  perform usage_bump(tg_argv[0]);
  return null;
end $$;
revoke execute on function usage_count_row() from public, anon, authenticated;

drop trigger if exists usage_families_signed_up on families;
create trigger usage_families_signed_up after insert on families
  for each row execute function usage_count_row('families_signed_up');
drop trigger if exists usage_chores_accepted on submissions;
create trigger usage_chores_accepted after insert or update of status on submissions
  for each row execute function usage_count_row('chores_accepted');
drop trigger if exists usage_rewards_bought on redemptions;
create trigger usage_rewards_bought after insert on redemptions
  for each row execute function usage_count_row('rewards_bought');
drop trigger if exists usage_games_played on events;
create trigger usage_games_played after insert on events
  for each row when (new.type = 'minigame_played') execute function usage_count_row('games_played');
drop trigger if exists usage_schools_signed_up on schools;
create trigger usage_schools_signed_up after insert on schools
  for each row execute function usage_count_row('schools_signed_up');

/**
 * A help page was opened (the parents' or the schools'). Callable by anyone,
 * signed in or not, because the schools' help page is read before anybody
 * has an account; it takes nothing and records nothing but the one count.
 */
create or replace function count_help_view()
returns void language sql security definer set search_path = public as $$
  select usage_bump('help_views');
$$;
revoke execute on function count_help_view() from public;
grant execute on function count_help_view() to anon, authenticated;

/**
 * The last p_days days (UTC), oldest first, every day present even with
 * nothing counted, and the totals over them. For the operator and the
 * owner's console; nobody else may call it.
 */
create or replace function usage_daily_counts(p_days int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  with days as (
    select d::date as day
      from generate_series((now() at time zone 'utc')::date - (greatest(1, least(coalesce(p_days, 30), 400)) - 1),
                           (now() at time zone 'utc')::date, interval '1 day') d
  ), metrics(metric) as (
    values ('families_signed_up'), ('chores_accepted'), ('rewards_bought'),
           ('games_played'), ('schools_signed_up'), ('help_views')
  ), grid as (
    select d.day, m.metric, coalesce((select sum(u.n) from usage_daily u
                                       where u.day = d.day and u.metric = m.metric), 0)::bigint as n
      from days d cross join metrics m
  )
  select jsonb_build_object(
    'days', (select jsonb_agg(row order by day) from (
               select day, jsonb_object_agg(metric, n) || jsonb_build_object('day', day) as row
                 from grid group by day) r),
    'totals', (select jsonb_object_agg(metric, total) from (
                 select metric, sum(n)::bigint as total from grid group by metric) t))
$$;
revoke execute on function usage_daily_counts(int) from public, anon, authenticated;
