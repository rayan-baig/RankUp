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
revoke all on digest_sends from public;

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
begin
  select count(*) into v_this from submissions
   where family_id = p_family_id and status = 'approved'
     and decided_at >= p_week_start and decided_at < p_week_start + 7;

  select count(*) into v_last from submissions
   where family_id = p_family_id and status = 'approved'
     and decided_at >= p_week_start - 7 and decided_at < p_week_start;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'done', done) order by done desc, name), '[]'::jsonb)
    into v_kids
    from (
      select k.name,
             (select count(*) from submissions s
               where s.kid_id = k.id and s.status = 'approved'
                 and s.decided_at >= p_week_start and s.decided_at < p_week_start + 7) as done
        from kids k where k.family_id = p_family_id
    ) t;

  -- The busiest and quietest days, named. A parent can act on "Wednesdays are
  -- where it falls apart" in a way they cannot act on a total.
  select to_char(d, 'FMDay') into v_busy from (
    select (p_week_start + i) as d,
           (select count(*) from submissions s
             where s.family_id = p_family_id and s.status = 'approved'
               and s.decided_at >= (p_week_start + i)
               and s.decided_at < (p_week_start + i + 1)) as n
      from generate_series(0, 6) i
  ) days order by n desc, d asc limit 1;

  select to_char(d, 'FMDay') into v_quiet from (
    select (p_week_start + i) as d,
           (select count(*) from submissions s
             where s.family_id = p_family_id and s.status = 'approved'
               and s.decided_at >= (p_week_start + i)
               and s.decided_at < (p_week_start + i + 1)) as n
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
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(d.digest || jsonb_build_object('week_key', d.week_key)), '[]'::jsonb)
    into v_rows
    from (
      select f.id,
             to_char(date_trunc('week', (now() at time zone f.timezone)::date)::date, 'IYYY-"W"IW') as week_key,
             family_week_digest(
               f.id,
               date_trunc('week', (now() at time zone f.timezone)::date)::date
             ) as digest
        from families f
       where extract(isodow from (now() at time zone f.timezone)) >= p_weekday
         and extract(hour from (now() at time zone f.timezone)) >= p_hour
    ) d
   where not exists (
           select 1 from digest_sends s
            where s.family_id = d.id and s.week_key = d.week_key)
     -- Nothing happened and nothing happened last week either: say nothing.
     and ((d.digest->>'approved')::int > 0 or (d.digest->>'approved_last_week')::int > 0);

  return jsonb_build_object('ok', true, 'digests', v_rows);
end $$;

/** Records that a week went out, which is what stops it going out twice. */
create or replace function mark_digest_sent(p_family_id uuid, p_week_key text)
returns void language sql security definer set search_path = public as $$
  insert into digest_sends (family_id, week_key) values (p_family_id, p_week_key)
  on conflict (family_id, week_key) do nothing;
$$;

-- Service role only. due_digests would otherwise hand any signed-in account a
-- list of every family in the database along with how their week went.
revoke execute on function due_digests(int, int) from public;
revoke execute on function mark_digest_sent(uuid, text) from public;
revoke execute on function family_week_digest(uuid, date) from public;
