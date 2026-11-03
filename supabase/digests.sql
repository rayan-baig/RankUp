-- ---------------------------------------------------------------------------
-- The weekly digest.
--
-- Run after schema.sql, sync.sql, notifications.sql and reminders.sql.
--
-- The Behaviour Blueprint screen has computed a family's real numbers for
-- months and almost nobody opens it, because nothing ever asks them to. This is
-- the thing that asks: one push on a Sunday evening with the week in a
-- sentence, and a tap that lands on the charts.
--
-- It is written to be dull in the right way. The numbers are computed HERE, not
-- by the browser, because the job runs with no browser involved. It is
-- idempotent on (family, week), because a scheduler that fires twice must not
-- message a family twice. And it says nothing a parent could not already see —
-- the digest is a prompt, not a new kind of data.
-- ---------------------------------------------------------------------------

-- Where a family lives, in IANA terms. "Sunday evening" is meaningless without
-- it, and reminder_schedules already proved the point: a family that moves must
-- not start getting messages at midnight. Default UTC so nothing breaks; it is
-- filled in the moment a family saves any reminder.
alter table families add column if not exists timezone text not null default 'UTC';

-- The record that a week has already been sent. The primary key IS the
-- idempotency: a second run of the job inserts nothing.
create table if not exists digest_sends (
  family_id uuid not null references families(id) on delete cascade,
  week_key  text not null,
  sent_at   timestamptz not null default now(),
  primary key (family_id, week_key)
);

alter table digest_sends enable row level security;
revoke all on digest_sends from public, anon, authenticated;

/**
 * Keep the family's zone in step with whatever the reminder screen was told.
 *
 * A separate trigger rather than an edit to save_reminder_schedule, so the two
 * features stay independent: reminders keep working whether or not this file
 * has been applied.
 */
create or replace function sync_family_timezone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update families set timezone = new.timezone
   where id = new.family_id and timezone is distinct from new.timezone;
  return new;
end $$;

drop trigger if exists reminder_sets_family_timezone on reminder_schedules;
create trigger reminder_sets_family_timezone
after insert or update of timezone on reminder_schedules
for each row execute function sync_family_timezone();

/**
 * One family's week, as numbers.
 *
 * Approvals rather than XP, for the same reason the alliance leaderboard uses
 * them: XP is inflated by the Elite boost and by difficulty, so a family on the
 * dearer plan would appear to be trying harder. A finished chore is a finished
 * chore.
 *
 * `p_week_start` is the Monday. Last week is included because a number on its
 * own tells a parent nothing — "nine" means nothing, "nine, up from five" is
 * the whole message.
 */
create or replace function family_week_digest(p_family_id uuid, p_week_start date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_this int;
  v_last int;
  v_kids jsonb;
  v_quiet text;
  v_busy  text;
  v_pending int;
  v_tz    text;
  -- Where the week starts and ends, as moments: midnight on the Monday WHERE
  -- THE FAMILY LIVES. Comparing decided_at with a bare date counted the days
  -- in the server's zone (UTC), so a chore a family in California accepted at
  -- 7pm on Sunday landed on Monday, in the wrong week, and a family in Sydney
  -- had its Monday morning counted as Sunday. The job already picks each
  -- family's own Sunday evening; the days it counts are now theirs too.
  v_from  timestamptz;
  v_to    timestamptz;
  v_prev  timestamptz;
begin
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from families where id = p_family_id;
  -- A zone the database does not know is counted in UTC rather than failing
  -- the whole run for every family after this one.
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  v_from := (p_week_start::timestamp) at time zone v_tz;
  v_to   := ((p_week_start + 7)::timestamp) at time zone v_tz;
  v_prev := ((p_week_start - 7)::timestamp) at time zone v_tz;

  select count(*) into v_this from submissions
   where family_id = p_family_id and status = 'approved'
     and decided_at >= v_from and decided_at < v_to;

  select count(*) into v_last from submissions
   where family_id = p_family_id and status = 'approved'
     and decided_at >= v_prev and decided_at < v_from;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'done', done) order by done desc, name), '[]'::jsonb)
    into v_kids
    from (
      select k.name,
             (select count(*) from submissions s
               where s.kid_id = k.id and s.status = 'approved'
                 and s.decided_at >= v_from and s.decided_at < v_to) as done
        from kids k where k.family_id = p_family_id
    ) t;

  -- The busiest and quietest days, named. A parent can act on "Wednesdays are
  -- where it falls apart" in a way they cannot act on a total. Each day runs
  -- from the family's own midnight to the next, so a clock change (a 23- or
  -- 25-hour day) is still one day.
  select to_char(d, 'FMDay') into v_busy from (
    select (p_week_start + i) as d,
           (select count(*) from submissions s
             where s.family_id = p_family_id and s.status = 'approved'
               and s.decided_at >= ((p_week_start + i)::timestamp at time zone v_tz)
               and s.decided_at < ((p_week_start + i + 1)::timestamp at time zone v_tz)) as n
      from generate_series(0, 6) i
  ) days order by n desc, d asc limit 1;

  select to_char(d, 'FMDay') into v_quiet from (
    select (p_week_start + i) as d,
           (select count(*) from submissions s
             where s.family_id = p_family_id and s.status = 'approved'
               and s.decided_at >= ((p_week_start + i)::timestamp at time zone v_tz)
               and s.decided_at < ((p_week_start + i + 1)::timestamp at time zone v_tz)) as n
      from generate_series(0, 6) i
  ) days order by n asc, d asc limit 1;

  -- The one thing in here that is a call to action rather than a report.
  select count(*) into v_pending from submissions
   where family_id = p_family_id and status = 'pending';

  return jsonb_build_object(
    'family_id', p_family_id,
    'week_start', p_week_start,
    'approved', v_this,
    'approved_last_week', v_last,
    'kids', v_kids,
    'busiest_day', v_busy,
    'quietest_day', v_quiet,
    'waiting_for_you', v_pending
  );
end $$;

/**
 * Which families are due their digest, with the numbers already worked out.
 *
 * Due means: it is at or past `p_hour` on `p_weekday` where they live, and no
 * digest has gone out for the week that is ending. The grace is the rest of the
 * evening rather than a fixed window — a scheduler that misses its slot should
 * still deliver on the right day, and a digest that arrives on Monday morning
 * is about a week nobody is thinking about any more.
 *
 * A family with nothing at all to report is left out. A push that says "0
 * chores this week, same as last week" is a product telling a struggling family
 * off, which is not what this is for.
 */
create or replace function due_digests(p_weekday int default 7, p_hour int default 18)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return due_digests_at(now(), p_weekday, p_hour);
end $$;

/** The same, as of a given moment: the tests' way to stand in any time zone's Sunday. */
create or replace function due_digests_at(p_now timestamptz, p_weekday int default 7, p_hour int default 18)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(d.digest || jsonb_build_object('week_key', d.week_key)), '[]'::jsonb)
    into v_rows
    from (
      select f.id,
             to_char(date_trunc('week', (p_now at time zone f.timezone)::date)::date, 'IYYY-"W"IW') as week_key,
             family_week_digest(
               f.id,
               date_trunc('week', (p_now at time zone f.timezone)::date)::date
             ) as digest
        from families f
       where extract(isodow from (p_now at time zone f.timezone)) >= p_weekday
         and extract(hour from (p_now at time zone f.timezone)) >= p_hour
    ) d
   where not exists (
           select 1 from digest_sends s
            where s.family_id = d.id and s.week_key = d.week_key)
     -- Nothing happened and nothing happened last week either: say nothing.
     and ((d.digest->>'approved')::int > 0 or (d.digest->>'approved_last_week')::int > 0);

  return jsonb_build_object('ok', true, 'digests', v_rows);
end $$;

/**
 * Claims a family's week before anything is sent: true for the one run that
 * gets it, false for every other. Marking it AFTER sending, as the job used
 * to, let two runs that overlapped (a scheduler firing twice, a slow run
 * meeting the next) both find the family due and both send.
 */
create or replace function claim_digest(p_family_id uuid, p_week_key text)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    insert into digest_sends (family_id, week_key) values (p_family_id, p_week_key)
    on conflict (family_id, week_key) do nothing
    returning 1
  ) select exists (select 1 from claimed);
$$;

/** Records that a week went out, which is what stops it going out twice. */
create or replace function mark_digest_sent(p_family_id uuid, p_week_key text)
returns void language sql security definer set search_path = public as $$
  insert into digest_sends (family_id, week_key) values (p_family_id, p_week_key)
  on conflict (family_id, week_key) do nothing;
$$;

-- Service role only. due_digests would otherwise hand any signed-in account a
-- list of every family in the database along with how their week went.
revoke execute on function due_digests(int, int) from public, anon, authenticated;
revoke execute on function due_digests_at(timestamptz, int, int) from public, anon, authenticated;
revoke execute on function claim_digest(uuid, text) from public, anon, authenticated;
revoke execute on function mark_digest_sent(uuid, text) from public, anon, authenticated;
revoke execute on function family_week_digest(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The free trial's two reminder emails.
--
-- A new family gets a trial of a better plan with no card, and when it ends
-- they are quietly on the plan they pay for. Two emails say so first: three
-- days before, and on the day it ends, in the family's own time zone. The job
-- that sends them is api/send-trial-emails.js, run hourly.
--
-- Each is sent once per family, ever: the primary key is the promise. A run
-- claims the row before sending and marks it sent after; a send that fails
-- gives the claim back so the next run tries again, and a claim left by a run
-- that died is taken again after an hour (the email service's idempotency key
-- stops that being a second email). Nothing about the email address is kept
-- here: it is read from the account when the job asks.
-- ---------------------------------------------------------------------------

create table if not exists trial_reminder_sends (
  family_id     uuid not null references families(id) on delete cascade,
  kind          text not null check (kind in ('three_days', 'last_day')),
  trial_ends_at timestamptz not null,
  claimed_at    timestamptz not null default now(),
  sent_at       timestamptz,
  primary key (family_id, kind)
);

alter table trial_reminder_sends enable row level security;
revoke all on trial_reminder_sends from public, anon, authenticated;

/**
 * Which families are due a trial reminder at `p_now`, with who to write to.
 *
 * Due means: a trial is running, of a better plan than the one they pay for
 * (a family already paying for Elite loses nothing when an Elite trial ends,
 * and is told nothing), and
 *   three_days  it ends within three days, but not today where they live;
 *   last_day    it ends today where they live, or within two hours (late
 *               the evening before, for a trial that ends just after midnight).
 * A family that missed the first (the job was down) gets only the second.
 * Only parents are written to, never a supporter, and only an account with an
 * email address.
 */
create or replace function due_trial_reminders_at(p_now timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb;
begin
  with running as (
    select f.id, f.tier, f.trial_tier, f.trial_ends_at,
           case when exists (select 1 from pg_timezone_names where name = f.timezone)
                then f.timezone else 'UTC' end as tz
      from families f
     where f.trial_tier is not null
       and f.trial_ends_at is not null
       and f.trial_ends_at > p_now
       and f.trial_ends_at <= p_now + interval '3 days'
       and (case f.trial_tier when 'elite' then 2 when 'standard' then 1 else 0 end)
         > (case f.tier       when 'elite' then 2 when 'standard' then 1 else 0 end)
  ), due as (
    -- The last two hours count as the last day too. The job runs hourly, and
    -- a trial ends at the time of day the family signed up: one ending at
    -- 00:20 where they live had twenty minutes of its own day, which an hourly
    -- run at 35 past never landed in, so its last reminder was never sent.
    select r.*,
           case when (r.trial_ends_at at time zone r.tz)::date = (p_now at time zone r.tz)::date
                  or r.trial_ends_at <= p_now + interval '2 hours'
                then 'last_day' else 'three_days' end as kind
      from running r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'family_id', d.id,
           'kind', d.kind,
           'trial_tier', d.trial_tier,
           'paid_tier', d.tier,
           'trial_ends_at', d.trial_ends_at,
           'timezone', d.tz,
           'ends_local', to_char(d.trial_ends_at at time zone d.tz, 'FMDay FMDD FMMonth'),
           'days_left', (d.trial_ends_at at time zone d.tz)::date - (p_now at time zone d.tz)::date,
           'recipients', (
             select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', p.name) order by p.created_at), '[]'::jsonb)
               from parents p join auth.users u on u.id = p.user_id
              where p.family_id = d.id and p.role = 'parent'
                and u.email is not null and u.email like '%@%')
         ) order by d.trial_ends_at), '[]'::jsonb)
    into v_rows
    from due d
   where not exists (
           select 1 from trial_reminder_sends s
            where s.family_id = d.id and s.kind = d.kind
              and (s.sent_at is not null or s.claimed_at > p_now - interval '1 hour'));

  return jsonb_build_object('ok', true, 'reminders', v_rows);
end $$;

create or replace function due_trial_reminders()
returns jsonb language sql stable security definer set search_path = public as $$
  select due_trial_reminders_at(now());
$$;

/**
 * Claim one family's reminder before it is sent: true for the one run that
 * gets it. A reminder already sent is never claimed again; a claim more than
 * an hour old that never became a send (the run died) can be taken again.
 */
create or replace function claim_trial_reminder(p_family_id uuid, p_kind text, p_trial_ends_at timestamptz)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    insert into trial_reminder_sends (family_id, kind, trial_ends_at)
    values (p_family_id, p_kind, p_trial_ends_at)
    on conflict (family_id, kind) do update
       set claimed_at = now(), trial_ends_at = excluded.trial_ends_at
     where trial_reminder_sends.sent_at is null
       and trial_reminder_sends.claimed_at < now() - interval '1 hour'
    returning 1
  ) select exists (select 1 from claimed);
$$;

/**
 * After the send: sent, so never again; or not sent, so the claim is given
 * back and the next run tries again.
 */
create or replace function finish_trial_reminder(p_family_id uuid, p_kind text, p_sent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_sent then
    update trial_reminder_sends set sent_at = coalesce(sent_at, now())
     where family_id = p_family_id and kind = p_kind;
  else
    delete from trial_reminder_sends
     where family_id = p_family_id and kind = p_kind and sent_at is null;
  end if;
end $$;

-- Service role only: these list every family on a trial, with their email.
revoke execute on function due_trial_reminders_at(timestamptz) from public, anon, authenticated;
revoke execute on function due_trial_reminders() from public, anon, authenticated;
revoke execute on function claim_trial_reminder(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function finish_trial_reminder(uuid, text, boolean) from public, anon, authenticated;
