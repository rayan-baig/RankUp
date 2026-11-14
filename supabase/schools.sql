-- ---------------------------------------------------------------------------
-- The School League.
--
-- Run after schema.sql, sync.sql and alliances.sql.
--
-- A school signs up (a principal or a teacher does it, not a child), pays by
-- its size, and hands parents a join code. Parents put their children in it.
-- Each month the school gets a score, the best school in each district is
-- named District Champion, rival schools go head to head, and each school's
-- best students get a School Star.
--
-- The safety story, because this is the first feature where adults who are
-- not family come near a child's data:
--
--   * Only a PARENT can put a child in a school. A school cannot add anyone.
--   * A school never sees a list of its students. It sees how many there are,
--     and its top ten each month, and even those show a first name only when
--     that child's parent said yes; otherwise "A student".
--   * A school nobody has checked yet (`verified` is false) sees no names at
--     all, does not appear in any league, and cannot challenge anyone. Signing
--     up as a school is open to anyone; being treated as one is not.
--   * Other schools see a school's name, town and score. Nothing about any
--     child ever crosses from one school to another.
--
-- Scores are computed here from approved quests, the same reason as for
-- alliances: a browser that could report its own number could crown itself.
-- A child's day counts at most eight approved quests, so a parent approving a
-- hundred made-up chores in an afternoon moves nothing much, and a school's
-- score is the AVERAGE per student, so a big school does not win for being big.
-- ---------------------------------------------------------------------------

create table if not exists schools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(name) between 2 and 80),
  district       text not null check (length(district) between 2 and 80),
  -- The district as typed, folded to one spelling so "North  Valley" and
  -- "north valley" are the same league.
  district_key   text not null,
  city           text not null default '',
  student_count  int  not null check (student_count between 1 and 20000),
  size_band      text not null check (size_band in ('small','medium','large','xl')),
  -- Given to parents. Rotatable, in case one ends up somewhere it should not.
  join_code      text unique,
  -- Given to other teachers, so they can see the school's page.
  staff_code     text unique,
  -- Written by the operator and by billing, never by a browser.
  status         text not null default 'trial'
                 check (status in ('trial','active','lapsed','suspended')),
  trial_ends_at  timestamptz not null default now() + interval '30 days',
  verified       boolean not null default false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at     timestamptz not null default now()
);

create index if not exists schools_district on schools (district_key);

-- One school per staff sign-in. Keyed on auth.users, not on families: a
-- teacher is not a household, and being one gives no access to any household.
create table if not exists school_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  role       text not null default 'teacher' check (role in ('admin','teacher')),
  joined_at  timestamptz not null default now()
);

-- One school per child. The primary key is the rule.
create table if not exists school_members (
  kid_id     uuid primary key references kids(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  family_id  uuid not null references families(id) on delete cascade,
  -- The parent's yes to showing this child's first name if they make the top
  -- ten. Off unless a parent turned it on.
  show_name  boolean not null default false,
  joined_at  timestamptz not null default now()
);

create index if not exists school_members_school on school_members (school_id);

create table if not exists school_rivalries (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references schools(id) on delete cascade,
  rival_id      uuid not null references schools(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','active','declined','ended')),
  created_at    timestamptz not null default now(),
  answered_at   timestamptz,
  ended_at      timestamptz,
  check (challenger_id <> rival_id)
);

-- At most one live rivalry between the same two schools, whichever asked.
create unique index if not exists school_rivalries_one_live
  on school_rivalries (least(challenger_id, rival_id), greatest(challenger_id, rival_id))
  where status in ('pending','active');

-- A finished month's score per school. Written once, by settlement; the
-- primary key is what makes running settlement twice a no-op.
create table if not exists school_month_scores (
  school_id  uuid not null references schools(id) on delete cascade,
  month_key  text not null,
  score      numeric(8,1) not null,
  students   int not null,
  ranked     boolean not null,
  primary key (school_id, month_key)
);

-- District Champion. One per district per month, and it is the payment record
-- for the reward too: `applied_at` is set only once billing has given the
-- free month, so an award that was decided but never given stays visible.
create table if not exists school_awards (
  district_key text not null,
  month_key    text not null,
  school_id    uuid not null references schools(id) on delete cascade,
  score        numeric(8,1) not null,
  decided_at   timestamptz not null default now(),
  applied_at   timestamptz,
  primary key (district_key, month_key)
);
alter table school_awards add column if not exists stripe_coupon text;

create table if not exists school_rivalry_results (
  rivalry_id       uuid not null references school_rivalries(id) on delete cascade,
  month_key        text not null,
  challenger_score numeric(8,1) not null,
  rival_score      numeric(8,1) not null,
  -- Null is a draw.
  winner_id        uuid references schools(id) on delete cascade,
  primary key (rivalry_id, month_key)
);

-- School Stars: each school's top ten for a month. Holds the child's id and
-- the number, never a name: the name is looked up when shown, so a parent
-- turning sharing off, or taking the child out of the school, takes the name
-- off every list at once, past months included.
create table if not exists school_top_students (
  school_id  uuid not null references schools(id) on delete cascade,
  month_key  text not null,
  rank       int  not null check (rank between 1 and 10),
  kid_id     uuid not null references kids(id) on delete cascade,
  score      int  not null,
  -- The admin checks the list before anyone sees it, and can leave a place
  -- out (a child who has left, or a score they know is not real).
  published  boolean not null default false,
  excluded   boolean not null default false,
  primary key (school_id, month_key, rank)
);

-- Reached only through the functions below, so no browser reads these tables
-- directly and none of them has a policy. Row level security is on with no
-- policy, which is "nobody" — belt and braces with the revokes.
alter table schools                enable row level security;
alter table school_staff           enable row level security;
alter table school_members         enable row level security;
alter table school_rivalries       enable row level security;
alter table school_month_scores    enable row level security;
alter table school_awards          enable row level security;
alter table school_rivalry_results enable row level security;
alter table school_top_students    enable row level security;

revoke all on schools, school_staff, school_members, school_rivalries,
              school_month_scores, school_awards, school_rivalry_results,
              school_top_students
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- School districts: one customer paying for many schools. The tables are
-- here because whether a school is live (school_is_live, below) asks whether
-- its district pays for it; the district's functions are at the end of this
-- file, under "School districts".
--
-- A district is never closer to a child than a school is. It holds no child
-- and no family; it sees each of its schools' totals, and only for a school
-- with enough students taking part that a total is not one child's number.
-- ---------------------------------------------------------------------------

create table if not exists districts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(name) between 2 and 80),
  -- Folded the same way as a school's district, so a school the district
  -- adds plays in the district's own league.
  district_key   text not null,
  -- For a school already on RankUp: its admin types this to join.
  link_code      text unique,
  -- 'setup' until Stripe says a plan is live; 'lapsed' once it has ended.
  status         text not null default 'setup' check (status in ('setup','active','lapsed')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- What Stripe last said, as for a school (see the school columns below).
  billing_status     text,
  billing_event_at   timestamptz,
  billing_period_end timestamptz,
  billing_ends_at    timestamptz,
  -- How many schools of each size the live plan pays for, read from the
  -- subscription's prices by the webhook: {"small": 3, "large": 1}.
  paid_bands     jsonb,
  -- A plan set up by hand in Stripe (a quoted deal) covers every school.
  paid_all       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- One district per sign-in. Like school staff, keyed on auth.users: a
-- district office is not a household and gets no way into one.
create table if not exists district_staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  district_id uuid not null references districts(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  role        text not null default 'admin' check (role in ('admin')),
  joined_at   timestamptz not null default now()
);

-- One district per school. The primary key is the rule.
create table if not exists district_schools (
  school_id         uuid primary key references schools(id) on delete cascade,
  district_id       uuid not null references districts(id) on delete cascade,
  -- For a school the district added: the one-time code its principal signs
  -- up with to become the school's admin. Cleared once used or expired.
  admin_invite      text unique,
  invite_expires_at timestamptz,
  added_at          timestamptz not null default now()
);

create index if not exists district_schools_district on district_schools (district_id);

-- "Get a quote" requests, as rate-limit marks only: a keyed hash of where the
-- request came from and when. What the person typed goes by email to whoever
-- runs RankUp and is not kept here.
create table if not exists district_quote_attempts (
  id       bigserial primary key,
  ip_key   text not null,
  tried_at timestamptz not null default now()
);

create index if not exists district_quote_attempts_tried on district_quote_attempts (tried_at);

alter table districts               enable row level security;
alter table district_staff          enable row level security;
alter table district_schools        enable row level security;
alter table district_quote_attempts enable row level security;

revoke all on districts, district_staff, district_schools, district_quote_attempts
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prices. Kept in step with SCHOOL_PRICES in src/lib/schools.js, and
-- tests/schools.mjs fails if the two ever disagree.
-- ---------------------------------------------------------------------------

create or replace function school_size_band(p_students int)
returns text language sql immutable as $$
  select case
    when p_students <= 300  then 'small'
    when p_students <= 800  then 'medium'
    when p_students <= 1500 then 'large'
    else 'xl'
  end;
$$;

/** What a school of this size pays. Public: a school wants the price first. */
create or replace function school_price_quote(p_students int)
returns jsonb language sql immutable as $$
  select case
    when p_students is null or p_students < 1 or p_students > 20000
      then jsonb_build_object('ok', false, 'reason', 'bad_size')
    else (
      select jsonb_build_object(
        'ok', true, 'band', b.band, 'label', b.label,
        'monthly_cents', b.cents,
        -- A year is ten months: two free for paying up front.
        'yearly_cents', b.cents * 10,
        'trial_days', 30)
      from (values ('small',  'Small school',  2900),
                   ('medium', 'Medium school', 5900),
                   ('large',  'Large school',  9900),
                   ('xl',     'Very large school', 14900)) as b(band, label, cents)
      where b.band = school_size_band(p_students))
  end;
$$;

create or replace function school_district_key(p_district text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(coalesce(p_district, '')), '\s+', ' ', 'g'));
$$;

/** Same alphabet as guild and alliance codes: nothing that can be misread aloud. */
create or replace function school_code(p_len int)
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           (floor(random() * 32) + 1)::int, 1), '')
    from generate_series(1, least(greatest(p_len, 1), 16));
$$;
-- Only the school functions here make codes. Callable by anyone, a single
-- request for a code two billion letters long kept the database busy for as
-- long as it took to build one.
revoke execute on function school_code(int) from public, anon, authenticated;

/** Below this many students a school's average is one family's average. */
create or replace function school_min_students()
returns int language sql immutable as $$ select 5 $$;

/**
 * Accepted chores a child can score in one day (UTC), at most. The School
 * League counts no more than this, and so do the leaderboards
 * (supabase/leaderboards.sql), so a parent tapping Accept two hundred times
 * in an afternoon puts nobody top of anything. SCHOOL_DAILY_CHORES in
 * src/lib/schools.js is the same number; tests/schoolhelp.mjs checks.
 */
create or replace function school_daily_chores()
returns int language sql immutable as $$ select 8 $$;
revoke execute on function school_daily_chores() from public, anon, authenticated;

/**
 * Whether a district's live plan pays for this school.
 *
 * The plan pays for so many schools of each size (paid_bands, from the
 * subscription's prices). Within a size, the schools added first are the ones
 * paid for, so a school added after the plan was bought waits until the plan
 * is updated to include it. A plan set up by hand in Stripe pays for all.
 */
create or replace function district_covers(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from district_schools ds
      join districts d on d.id = ds.district_id
      join schools s on s.id = ds.school_id
     where ds.school_id = p_school
       and d.status = 'active'
       and (d.paid_all
            or (select count(*) from district_schools o join schools os on os.id = o.school_id
                 where o.district_id = d.id and os.size_band = s.size_band
                   and (o.added_at, o.school_id) <= (ds.added_at, ds.school_id))
               <= coalesce((d.paid_bands ->> s.size_band)::int, 0)));
$$;

/**
 * Paid up (by itself or by its district), or still in its trial. Anything
 * else sits the league out. A suspension is the operator's, and no plan
 * lifts it.
 */
create or replace function school_is_live(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from schools s
                  where s.id = p_school
                    and s.status <> 'suspended'
                    and (s.status = 'active'
                         or (s.status = 'trial' and s.trial_ends_at > now())
                         or district_covers(s.id)));
$$;

-- ---------------------------------------------------------------------------
-- Scores.
-- ---------------------------------------------------------------------------

/**
 * Each student's points for a month: approved quests, at most eight a day
 * (school_daily_chores),
 * counted from the day they joined this school. Joining date matters: without
 * it a family could move a child between schools mid-month and bring the
 * month's points with them.
 */
create or replace function school_kid_points(p_school uuid, p_month date)
returns table (kid_id uuid, points int)
language sql stable security definer set search_path = public as $$
  select m.kid_id,
         coalesce((
           select sum(d.n) from (
             select least(count(*), school_daily_chores()) as n
               from submissions s
              where s.kid_id = m.kid_id
                and s.status = 'approved'
                and s.decided_at >= greatest(p_month::timestamptz, m.joined_at)
                and s.decided_at <  p_month + interval '1 month'
              group by (s.decided_at at time zone 'UTC')::date
           ) d), 0)::int
    from school_members m
   where m.school_id = p_school
     and m.joined_at < p_month + interval '1 month';
$$;

/** A school's month: the average per student, and how many students. */
create or replace function school_month_score(p_school uuid, p_month date)
returns table (score numeric, students int)
language sql stable security definer set search_path = public as $$
  select coalesce(round(avg(points)::numeric, 1), 0), count(*)::int
    from school_kid_points(p_school, p_month);
$$;

/**
 * One district's table for a month. Verified, live schools only — plus,
 * when asked for, one particular school, so an unverified school can still
 * see where it would stand.
 */
create or replace function school_district_table(p_district_key text, p_month date,
                                                 p_include uuid default null)
returns table (school_id uuid, name text, city text, score numeric,
               students int, ranked boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.city, ms.score, ms.students,
         -- The included school is shown even when it cannot be ranked (not yet
         -- checked, or its plan has ended), so it is marked as such here.
         (s.verified and school_is_live(s.id) and ms.students >= school_min_students()) as ranked
    from schools s
    cross join lateral school_month_score(s.id, p_month) ms
   where s.district_key = p_district_key
     and ((s.verified and school_is_live(s.id)) or s.id = p_include)
     and s.status <> 'suspended';
$$;

-- ---------------------------------------------------------------------------
-- Who is asking.
-- ---------------------------------------------------------------------------

create or replace function current_school_staff()
returns school_staff language sql stable security definer set search_path = public as $$
  select * from school_staff where user_id = auth.uid();
$$;

/** Every school the caller has a reason to look at, and why. */
create or replace function caller_school_ids()
returns table (school_id uuid, as_role text)
language sql stable security definer set search_path = public as $$
  select school_id, 'staff' from school_staff where user_id = auth.uid()
  union
  select m.school_id, 'kid' from school_members m where m.kid_id = current_kid_id()
  union
  select m.school_id, 'parent' from school_members m
   where is_parent() and m.family_id = current_family_id();
$$;

/** How a student appears on a list: a first name with a parent's yes, else not. */
create or replace function school_display_name(p_kid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when m.show_name
              then left(split_part(trim(k.name), ' ', 1), 20)
              else 'A student' end
    from kids k join school_members m on m.kid_id = k.id
   where k.id = p_kid;
$$;

-- ---------------------------------------------------------------------------
-- Signing up a school, and its staff.
-- ---------------------------------------------------------------------------

/**
 * A principal or teacher signs their school up. They become its admin.
 *
 * Open to any signed-in adult, on purpose — a school should not need to email
 * anyone to try this. What keeps that safe is `verified`: until the operator
 * has checked the school is real, it is invisible to every other school and
 * sees no child's name.
 */
create or replace function register_school(p_name text, p_district text, p_city text,
                                           p_students int, p_your_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_join   text;
  v_staff  text;
  v_name   text := trim(coalesce(p_name, ''));
  v_dist   text := regexp_replace(trim(coalesce(p_district, '')), '\s+', ' ', 'g');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  -- A child's sign-in is not a principal's.
  if exists (select 1 from kids where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_an_adult');
  end if;
  if exists (select 1 from school_staff where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_staff');
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if length(v_dist) < 2 or length(v_dist) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_district');
  end if;
  if p_students is null or p_students < 1 or p_students > 20000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_size');
  end if;
  if length(trim(coalesce(p_your_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_your_name');
  end if;

  loop
    v_join := school_code(6);
    exit when not exists (select 1 from schools where join_code = v_join);
  end loop;
  loop
    v_staff := school_code(8);
    exit when not exists (select 1 from schools where staff_code = v_staff);
  end loop;

  insert into schools (name, district, district_key, city, student_count, size_band,
                       join_code, staff_code)
  values (v_name, v_dist, school_district_key(v_dist), left(trim(coalesce(p_city, '')), 60),
          p_students, school_size_band(p_students), v_join, v_staff)
  returning id into v_id;

  insert into school_staff (user_id, school_id, name, role)
  values (v_uid, v_id, left(trim(p_your_name), 60), 'admin');

  return jsonb_build_object('ok', true, 'school_id', v_id,
                            'join_code', v_join, 'staff_code', v_staff,
                            'price', school_price_quote(p_students));
end $$;

/** Another teacher joins with the staff code. They can look, not change. */
create or replace function join_school_staff(p_staff_code text, p_your_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_s   schools;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if exists (select 1 from kids where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_an_adult');
  end if;
  if exists (select 1 from school_staff where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_staff');
  end if;
  if length(trim(coalesce(p_your_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_your_name');
  end if;
  select * into v_s from schools
   where staff_code = upper(trim(p_staff_code)) and status <> 'suspended';
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_code'); end if;

  insert into school_staff (user_id, school_id, name, role)
  values (v_uid, v_s.id, left(trim(p_your_name), 60), 'teacher');
  return jsonb_build_object('ok', true, 'school_id', v_s.id, 'name', v_s.name);
end $$;

/** New codes, for when one has gone somewhere it should not. Admin only. */
create or replace function rotate_school_codes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   school_staff := current_school_staff();
  v_join text;
  v_staff text;
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  loop
    v_join := school_code(6);
    exit when not exists (select 1 from schools where join_code = v_join);
  end loop;
  loop
    v_staff := school_code(8);
    exit when not exists (select 1 from schools where staff_code = v_staff);
  end loop;
  update schools set join_code = v_join, staff_code = v_staff where id = v_me.school_id;
  return jsonb_build_object('ok', true, 'join_code', v_join, 'staff_code', v_staff);
end $$;

-- ---------------------------------------------------------------------------
-- Families.
-- ---------------------------------------------------------------------------

/** A parent puts their own child in a school, with the code the school gave. */
create or replace function join_school(p_kid_id uuid, p_join_code text,
                                       p_show_name boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_s      schools;
begin
  if v_family is null or not is_parent() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_parent');
  end if;
  if not exists (select 1 from kids where id = p_kid_id and family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_child');
  end if;
  if exists (select 1 from school_members where kid_id = p_kid_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_in_one');
  end if;
  select * into v_s from schools
   where join_code = upper(trim(p_join_code)) and status <> 'suspended';
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_code'); end if;

  insert into school_members (kid_id, school_id, family_id, show_name)
  values (p_kid_id, v_s.id, v_family, coalesce(p_show_name, false));
  return jsonb_build_object('ok', true, 'school', jsonb_build_object(
    'name', v_s.name, 'district', v_s.district, 'city', v_s.city));
end $$;

create or replace function set_school_name_sharing(p_kid_id uuid, p_show boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_parent() then return jsonb_build_object('ok', false, 'reason', 'not_a_parent'); end if;
  update school_members set show_name = coalesce(p_show, false)
   where kid_id = p_kid_id and family_id = current_family_id();
  return jsonb_build_object('ok', found);
end $$;

/** Takes the child out, and off every School Stars list, past months too. */
create or replace function leave_school(p_kid_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  if not is_parent() then return jsonb_build_object('ok', false, 'reason', 'not_a_parent'); end if;
  delete from school_members
   where kid_id = p_kid_id and family_id = current_family_id()
  returning school_id into v_school;
  if v_school is null then return jsonb_build_object('ok', false, 'reason', 'not_in_one'); end if;
  delete from school_top_students where kid_id = p_kid_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- What each kind of person sees.
-- ---------------------------------------------------------------------------

/** The School Stars for one school and month, as the caller may see them. */
create or replace function school_stars(p_school uuid, p_month_key text, p_staff boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', t.rank,
           'score', t.score,
           -- An unchecked school sees places and points, never a name.
           'name', case when s.verified then school_display_name(t.kid_id) else 'A student' end,
           'you', t.kid_id = current_kid_id(),
           'yours', is_parent() and t.kid_id in
                    (select id from kids where family_id = current_family_id()),
           'published', t.published,
           'excluded', t.excluded) order by t.rank), '[]'::jsonb)
    from school_top_students t join schools s on s.id = t.school_id
   where t.school_id = p_school and t.month_key = p_month_key
     -- Staff see the list before it goes out, so they can check it. Families
     -- see only what was published, and never a place the admin left out.
     and (p_staff or (t.published and not t.excluded));
$$;

/** Rivalries for a school, with this month's head-to-head and the record. */
create or replace function school_rivalry_list(p_school uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'status', r.status,
           'asked_by_us', r.challenger_id = p_school,
           'rival', jsonb_build_object('name', o.name, 'city', o.city),
           'our_score', (select score from school_month_score(p_school, date_trunc('month', now())::date)),
           'their_score', (select score from school_month_score(o.id, date_trunc('month', now())::date)),
           'won',  (select count(*) from school_rivalry_results x where x.rivalry_id = r.id and x.winner_id = p_school),
           'lost', (select count(*) from school_rivalry_results x where x.rivalry_id = r.id and x.winner_id = o.id),
           'drawn', (select count(*) from school_rivalry_results x where x.rivalry_id = r.id and x.winner_id is null))
           order by r.created_at desc), '[]'::jsonb)
    from school_rivalries r
    join schools o on o.id = case when r.challenger_id = p_school then r.rival_id else r.challenger_id end
   where (r.challenger_id = p_school or r.rival_id = p_school)
     and r.status in ('pending','active');
$$;

/** One school's page, shaped for whoever is asking. */
create or replace function school_card(p_school uuid, p_as text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_s     schools;
  v_month date := date_trunc('month', now())::date;
  v_last  text := to_char(v_month - interval '1 month', 'YYYY-MM');
  v_rank  int;
  v_count int;
  v_me    school_staff := current_school_staff();
  v_score numeric;
  v_kids  int;
  v_out   jsonb;
  v_ranked boolean;
begin
  select * into v_s from schools where id = p_school;
  if not found then return null; end if;
  select score, students into v_score, v_kids from school_month_score(p_school, v_month);
  v_ranked := v_s.verified and school_is_live(p_school) and v_kids >= school_min_students();

  select count(*) filter (where ranked),
         (select count(*) + 1 from school_district_table(v_s.district_key, v_month) o
           where o.ranked and o.school_id <> p_school and o.score > v_score)
    into v_count, v_rank
    from school_district_table(v_s.district_key, v_month);

  v_out := jsonb_build_object(
    'name', v_s.name, 'district', v_s.district, 'city', v_s.city,
    'verified', v_s.verified,
    'live', school_is_live(p_school),
    'month', v_month,
    'score', v_score,
    'students', v_kids,
    'min_students', school_min_students(),
    -- The school's own id, so a family with children in two schools can ask
    -- for the right league. Only ever given to someone already connected to
    -- this school, and only useful to them.
    'school_id', p_school,
    'ranked', v_ranked,
    'district_rank', case when v_ranked then v_rank end,
    'district_schools', v_count,
    'rivalries', school_rivalry_list(p_school),
    'stars', school_stars(p_school, v_last, p_as = 'staff'),
    'stars_month', v_last,
    'titles', coalesce((select jsonb_agg(jsonb_build_object('month', a.month_key, 'score', a.score)
                                         order by a.month_key desc)
                          from school_awards a where a.school_id = p_school), '[]'::jsonb));

  if p_as = 'staff' then
    v_out := v_out || jsonb_build_object(
      'role', v_me.role,
      'status', v_s.status,
      'trial_ends_at', v_s.trial_ends_at,
      'student_count', v_s.student_count,
      'has_customer', v_s.stripe_customer_id is not null,
      -- What Stripe last said, for the portal's notice: a failed payment, a
      -- plan ending, a refund. Read here at call time, so the columns added
      -- further down this file are there by then.
      'billing_status', v_s.billing_status,
      'billing_ends_at', v_s.billing_ends_at,
      'price', school_price_quote(v_s.student_count),
      'join_code', v_s.join_code,
      -- Only the admin hands out the staff code.
      'staff_code', case when v_me.role = 'admin' then v_s.staff_code end,
      'sharing_names', (select count(*) from school_members where school_id = p_school and show_name),
      'staff', (select jsonb_agg(jsonb_build_object('name', st.name, 'role', st.role,
                                                    'you', st.user_id = auth.uid(),
                                                    -- What remove_school_staff takes. Admins only.
                                                    'ref', case when v_me.role = 'admin' then st.user_id end)
                                 order by st.role, st.name)
                  from school_staff st where st.school_id = p_school),
      'challenges_in', (select count(*) from school_rivalries
                         where rival_id = p_school and status = 'pending'),
      -- The district this school belongs to, if any, and whether its plan
      -- pays for the school now. The district's name only: nothing about its
      -- other schools.
      'district_plan', (select jsonb_build_object('name', d.name,
                                                  'covered', district_covers(p_school),
                                                  'active', d.status = 'active')
                          from district_schools ds join districts d on d.id = ds.district_id
                         where ds.school_id = p_school));
  end if;
  return v_out;
end $$;

/** The page for a teacher or principal. */
create or replace function school_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null then return jsonb_build_object('ok', true, 'school', null); end if;
  return jsonb_build_object('ok', true, 'school', school_card(v_me.school_id, 'staff'));
end $$;

/** The schools a family's children are in, or the one a child is in. */
create or replace function my_schools()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;
  return jsonb_build_object('ok', true, 'children', coalesce((
    select jsonb_agg(jsonb_build_object(
             'kid_id', k.id, 'kid_name', k.name,
             'show_name', m.show_name,
             'school', case when m.school_id is not null
                            then school_card(m.school_id, case when is_parent() then 'parent' else 'kid' end) end)
           order by k.name)
      from kids k left join school_members m on m.kid_id = k.id
     where k.family_id = v_family
       -- A child sees their own school, not their brother's.
       and (is_parent() or k.id = current_kid_id())), '[]'::jsonb));
end $$;

/**
 * A district's league for this month: names, towns and scores, nothing else.
 * Only for a school the caller is connected to.
 */
create or replace function school_league(p_school_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid := coalesce(p_school_id, (select school_id from caller_school_ids() limit 1));
  v_s      schools;
  v_month  date := date_trunc('month', now())::date;
begin
  if v_school is null or not exists (select 1 from caller_school_ids() where school_id = v_school) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_school');
  end if;
  select * into v_s from schools where id = v_school;
  return jsonb_build_object(
    'ok', true, 'district', v_s.district, 'month', v_month,
    'min_students', school_min_students(),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'city', t.city, 'score', t.score,
               'students', t.students, 'ranked', t.ranked,
               'you', t.school_id = v_school)
             order by t.ranked desc, t.score desc, t.name)
        from school_district_table(v_s.district_key, v_month, v_school) t), '[]'::jsonb),
    'champion', (select jsonb_build_object('month', a.month_key, 'name', s.name,
                                           'city', s.city, 'score', a.score)
                   from school_awards a join schools s on s.id = a.school_id
                  where a.district_key = v_s.district_key
                    -- Not a school we have since un-checked or suspended.
                    and s.verified and s.status <> 'suspended'
                  order by a.month_key desc limit 1));
end $$;

-- ---------------------------------------------------------------------------
-- Rivalries. Between two checked schools, started and answered by admins.
-- ---------------------------------------------------------------------------

/** Schools in the same district this one could challenge. Staff only. */
create or replace function district_schools(p_query text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me school_staff := current_school_staff();
  v_s  schools;
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_school_staff'); end if;
  select * into v_s from schools where id = v_me.school_id;
  return jsonb_build_object('ok', true, 'schools', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'city', o.city) order by o.name)
      from (select o.* from schools o
             where o.district_key = v_s.district_key
               and o.id <> v_s.id and o.verified and school_is_live(o.id)
               and o.name ilike '%' || replace(replace(coalesce(p_query, ''), '%', ''), '_', '') || '%'
             order by o.name limit 30) o), '[]'::jsonb));
end $$;

create or replace function challenge_school(p_rival_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  school_staff := current_school_staff();
  v_us  schools;
  v_them schools;
  v_id  uuid;
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  select * into v_us from schools where id = v_me.school_id;
  if not v_us.verified then return jsonb_build_object('ok', false, 'reason', 'not_verified_yet'); end if;
  if not school_is_live(v_us.id) then return jsonb_build_object('ok', false, 'reason', 'plan_not_active'); end if;

  select * into v_them from schools where id = p_rival_id;
  if not found or v_them.id = v_us.id or not v_them.verified or not school_is_live(v_them.id)
     or v_them.district_key <> v_us.district_key then
    return jsonb_build_object('ok', false, 'reason', 'no_such_school');
  end if;
  -- Three at a time. A rivalry is meant to be a rivalry, not spam.
  if (select count(*) from school_rivalries
       where (challenger_id = v_us.id or rival_id = v_us.id)
         and status in ('pending','active')) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_rivals');
  end if;
  if exists (select 1 from school_rivalries
              where least(challenger_id, rival_id) = least(v_us.id, v_them.id)
                and greatest(challenger_id, rival_id) = greatest(v_us.id, v_them.id)
                and status in ('pending','active')) then
    return jsonb_build_object('ok', false, 'reason', 'already_rivals');
  end if;

  insert into school_rivalries (challenger_id, rival_id) values (v_us.id, v_them.id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'rivalry_id', v_id);
end $$;

create or replace function answer_challenge(p_rivalry_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  -- The same three-at-a-time limit as challenging, or a school could be
  -- pulled into any number of rivalries by being asked.
  if p_accept and (select count(*) from school_rivalries
                    where (challenger_id = v_me.school_id or rival_id = v_me.school_id)
                      and status = 'active') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_rivals');
  end if;
  update school_rivalries
     set status = case when p_accept then 'active' else 'declined' end, answered_at = now()
   where id = p_rivalry_id and rival_id = v_me.school_id and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_challenge'); end if;
  return jsonb_build_object('ok', true);
end $$;

/** Either side can call it off. Past months' results stay. */
create or replace function end_rivalry(p_rivalry_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  update school_rivalries set status = 'ended', ended_at = now()
   where id = p_rivalry_id
     and v_me.school_id in (challenger_id, rival_id)
     and status in ('pending','active');
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------------------
-- School Stars.
-- ---------------------------------------------------------------------------

/** The admin has checked the list; families can now see it. */
create or replace function publish_top_students(p_month_key text, p_leave_out int[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  update school_top_students
     set published = true,
         excluded = rank = any (coalesce(p_leave_out, '{}'))
   where school_id = v_me.school_id and month_key = p_month_key;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nothing_to_publish'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- The monthly job and the operator. Service role only.
-- ---------------------------------------------------------------------------

/**
 * Close a finished month: every live school's score, its School Stars, each
 * district's Champion and every rivalry's result.
 *
 * Idempotent: every row it writes has a primary key on the month, so a second
 * run writes nothing and returns no awards to pay for twice.
 */
create or replace function settle_school_month(p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_key   text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  v_awards jsonb;
  v_new    uuid[];
begin
  if v_month + interval '1 month' > now() then
    return jsonb_build_object('ok', false, 'reason', 'month_not_over');
  end if;

  -- The schools closed by THIS run. Everything per school below is written
  -- only for them, so a second run cannot top up a Stars list that has had a
  -- child taken off it since (which put the same child on it twice).
  with closed as (
    insert into school_month_scores (school_id, month_key, score, students, ranked)
    select s.id, v_key, ms.score, ms.students,
           s.verified and ms.students >= school_min_students()
      from schools s cross join lateral school_month_score(s.id, v_month) ms
     where school_is_live(s.id)
    on conflict (school_id, month_key) do nothing
    returning school_id
  )
  select coalesce(array_agg(school_id), '{}') into v_new from closed;

  -- Top ten per school, by points; ties go to whoever joined first.
  insert into school_top_students (school_id, month_key, rank, kid_id, score)
  select school_id, v_key, rn, kid_id, points from (
    select s.id as school_id, p.kid_id, p.points,
           row_number() over (partition by s.id order by p.points desc, m.joined_at, p.kid_id) as rn
      from schools s
      cross join lateral school_kid_points(s.id, v_month) p
      join school_members m on m.kid_id = p.kid_id
     where s.id = any (v_new) and p.points > 0
  ) x where rn <= 10
  on conflict (school_id, month_key, rank) do nothing;

  -- A Champion needs a contest: at least two ranked schools in the district.
  with ranked as (
    select s.district_key, s.id, ms.score, ms.students, s.created_at
      from school_month_scores ms join schools s on s.id = ms.school_id
     where ms.month_key = v_key and ms.ranked
  ), contested as (
    select district_key from ranked group by district_key having count(*) >= 2
  ), winners as (
    select distinct on (r.district_key) r.district_key, r.id, r.score
      from ranked r join contested c using (district_key)
     where r.score > 0
     -- Ties: the school with more children taking part, then the one that
     -- signed up first, then by id, so the same month always crowns the same
     -- school however often it is closed.
     order by r.district_key, r.score desc, r.students desc, r.created_at, r.id
  ), inserted as (
    insert into school_awards (district_key, month_key, school_id, score)
    select district_key, v_key, id, score from winners
    on conflict (district_key, month_key) do nothing
    returning school_id, score
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'school_id', i.school_id, 'name', s.name, 'score', i.score,
           'district_key', s.district_key)), '[]'::jsonb)
    into v_awards
    from inserted i join schools s on s.id = i.school_id;

  insert into school_rivalry_results (rivalry_id, month_key, challenger_score, rival_score, winner_id)
  select r.id, v_key, a.score, b.score,
         case when a.score > b.score then r.challenger_id
              when b.score > a.score then r.rival_id end
    from school_rivalries r
    join school_month_scores a on a.school_id = r.challenger_id and a.month_key = v_key
    join school_month_scores b on b.school_id = r.rival_id and b.month_key = v_key
   where r.status = 'active' and r.answered_at < v_month + interval '1 month'
     -- Both sides need enough students for an average to mean anything;
     -- otherwise one keen child beats a whole school. No result that month.
     and a.ranked and b.ranked
  on conflict (rivalry_id, month_key) do nothing;

  return jsonb_build_object('ok', true, 'month', v_key, 'champions', v_awards);
end $$;

/**
 * Every Champion whose free month has not been given yet, with what billing
 * needs to give it. Asked for separately from settlement, so a month whose
 * reward failed to apply is tried again on the next run rather than being
 * decided once and then forgotten.
 */
create or replace function unapplied_school_awards()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'district_key', a.district_key, 'month_key', a.month_key,
           'school_id', s.id, 'name', s.name,
           -- A school its district pays for wins its month for the district:
           -- the credit goes on the district's account, which is paying.
           'status', case when dp.customer is not null then 'active' else s.status end,
           'stripe_customer_id', coalesce(dp.customer, s.stripe_customer_id),
           'stripe_subscription_id', coalesce(dp.subscription, s.stripe_subscription_id),
           'district_paid', dp.customer is not null,
           -- A month at the school's own price, whatever its billing cycle: on
           -- a yearly plan a "100% off the next invoice" would be a free year.
           'monthly_cents', (school_price_quote(s.student_count)->>'monthly_cents')::int)
           order by a.month_key, a.district_key), '[]'::jsonb)
    from school_awards a join schools s on s.id = a.school_id
    left join lateral (
      select d.stripe_customer_id as customer, d.stripe_subscription_id as subscription
        from district_schools ds join districts d on d.id = ds.district_id
       where ds.school_id = s.id and d.stripe_customer_id is not null and district_covers(s.id)
    ) dp on true
   where a.applied_at is null;
$$;

/**
 * Billing gave the Champion its free month: a coupon on a paying school, or
 * thirty more days of trial on one that has not paid yet (`p_coupon` null).
 */
drop function if exists mark_school_award_applied(text, text);
create or replace function mark_school_award_applied(p_district_key text, p_month_key text,
                                                     p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  update school_awards set applied_at = now(), stripe_coupon = p_coupon
   where district_key = p_district_key and month_key = p_month_key and applied_at is null
  returning school_id into v_school;
  if v_school is null then return jsonb_build_object('ok', false); end if;
  if p_coupon is null then
    update schools set trial_ends_at = greatest(trial_ends_at, now()) + interval '30 days'
     where id = v_school and status = 'trial';
  end if;
  return jsonb_build_object('ok', true);
end $$;

/** The operator, having checked the school is real. Or not: false un-checks it. */
create or replace function verify_school(p_school_id uuid, p_verified boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update schools set verified = coalesce(p_verified, false) where id = p_school_id;
  return jsonb_build_object('ok', found);
end $$;

/** Billing, or the operator. */
create or replace function set_school_status(p_school_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('trial','active','lapsed','suspended') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;
  update schools set status = p_status where id = p_school_id;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC on every new function, so the
-- internals are revoked from PUBLIC, not just from the two browser roles.
-- ---------------------------------------------------------------------------

grant execute on function school_price_quote(int) to anon, authenticated;
grant execute on function register_school(text, text, text, int, text) to authenticated;
grant execute on function join_school_staff(text, text) to authenticated;
grant execute on function rotate_school_codes() to authenticated;
grant execute on function join_school(uuid, text, boolean) to authenticated;
grant execute on function set_school_name_sharing(uuid, boolean) to authenticated;
grant execute on function leave_school(uuid) to authenticated;
grant execute on function school_overview() to authenticated;
grant execute on function my_schools() to authenticated;
grant execute on function school_league(uuid) to authenticated;
grant execute on function district_schools(text) to authenticated;
grant execute on function challenge_school(uuid) to authenticated;
grant execute on function answer_challenge(uuid, boolean) to authenticated;
grant execute on function end_rivalry(uuid) to authenticated;
grant execute on function publish_top_students(text, int[]) to authenticated;

-- Each takes an arbitrary school or child id and is security definer, so a
-- grant would let anyone signed in read any school's numbers or any child's
-- name by guessing a uuid. They are internals of the functions above.
revoke execute on function school_is_live(uuid) from public, anon, authenticated;
revoke execute on function school_kid_points(uuid, date) from public, anon, authenticated;
revoke execute on function school_month_score(uuid, date) from public, anon, authenticated;
revoke execute on function school_district_table(text, date, uuid) from public, anon, authenticated;
revoke execute on function current_school_staff() from public, anon, authenticated;
revoke execute on function caller_school_ids() from public, anon, authenticated;
revoke execute on function school_display_name(uuid) from public, anon, authenticated;
revoke execute on function school_stars(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function school_rivalry_list(uuid) from public, anon, authenticated;
revoke execute on function school_card(uuid, text) from public, anon, authenticated;

-- Real awards and the operator's switches: the monthly job and the operator
-- hold the service role; nobody else reaches these.
revoke execute on function settle_school_month(date) from public, anon, authenticated;
revoke execute on function mark_school_award_applied(text, text, text) from public, anon, authenticated;
revoke execute on function unapplied_school_awards() from public, anon, authenticated;
revoke execute on function verify_school(uuid, boolean) from public, anon, authenticated;
revoke execute on function set_school_status(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paying. A school's plan, like a family's, is written by Stripe's webhook
-- and by nothing else; the browser only ever asks to start a checkout.
-- ---------------------------------------------------------------------------

-- School payments are kept with every other Stripe event, so Charity Week's
-- total is the company's real takings, schools included.
alter table billing_events add column if not exists school_id uuid references schools(id) on delete set null;

/**
 * What a school's checkout needs, for the admin asking. The size band comes
 * from here, not from the request, so a school cannot pick a cheaper price
 * than its size.
 */
create or replace function school_checkout_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me school_staff := current_school_staff();
  v_s  schools;
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  select * into v_s from schools where id = v_me.school_id;
  if v_s.status = 'suspended' then return jsonb_build_object('ok', false, 'reason', 'suspended'); end if;
  -- Paying already: a second checkout would start a second subscription.
  -- Which school is still said: the billing portal asks this too, and a
  -- school that is paying is exactly the one that needs the portal (it was
  -- refused it, so a paying school could not change its card or cancel).
  if v_s.status = 'active' and v_s.stripe_subscription_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_paying',
                              'school_id', v_s.id, 'has_customer', v_s.stripe_customer_id is not null);
  end if;
  -- Its district pays for it: a plan of its own would be paying twice.
  if district_covers(v_s.id) then
    return jsonb_build_object('ok', false, 'reason', 'district_pays');
  end if;
  return jsonb_build_object('ok', true, 'school_id', v_s.id, 'name', v_s.name,
                            'band', v_s.size_band, 'status', v_s.status,
                            'trial_ends_at', v_s.trial_ends_at,
                            'has_customer', v_s.stripe_customer_id is not null);
end $$;

create or replace function attach_school_customer(p_school_id uuid, p_customer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  -- Never swaps one customer for another: that would move a school's billing
  -- onto somebody else's card record.
  update schools set stripe_customer_id = p_customer_id
   where id = p_school_id and (stripe_customer_id is null or stripe_customer_id = p_customer_id);
  return jsonb_build_object('ok', found);
end $$;

create or replace function school_for_customer(p_customer_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from schools where stripe_customer_id = p_customer_id limit 1;
$$;

create or replace function stripe_customer_for_school(p_school_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select stripe_customer_id from schools where id = p_school_id;
$$;

/**
 * The size band a school is priced at now. For the webhook, which checks the
 * price on a new subscription against it: a checkout page opened before the
 * school corrected its size still carries the old band's price.
 */
create or replace function school_band_of(p_school_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select size_band from schools where id = p_school_id;
$$;

/*
 * What Stripe last said about the school's plan, beside the league status the
 * school plays under. A failing card keeps a school playing (status stays
 * active) and the admin was told nothing at all; the portal reads this to say
 * a payment failed, that a plan is ending, or that it was refunded.
 *   billing_status     Stripe's own status, or 'refunded'
 *   billing_event_at   when the newest event applied was created: Stripe does
 *                      not deliver in order, and a late "active" used to put a
 *                      school whose plan had ended back in the league
 *   billing_period_end the end of the period being paid for
 *   billing_ends_at    when a plan cancelled in the portal stops, or stopped
 */
alter table schools add column if not exists billing_status text;
alter table schools add column if not exists billing_event_at timestamptz;
alter table schools add column if not exists billing_period_end timestamptz;
alter table schools add column if not exists billing_ends_at timestamptz;

-- Gained p_event_created and p_period_end. The old six-argument version has
-- to go, or both would exist and the webhook could reach the old one.
drop function if exists apply_school_subscription(uuid, text, text, text, text, jsonb);

/**
 * Apply what Stripe says about a school's subscription.
 *
 * Idempotent on the event id, because Stripe retries. A suspension is the
 * operator's decision and no payment event lifts it. A failing card keeps the
 * school playing while Stripe retries it; only a subscription that has really
 * ended takes the school out of the league, and then back to whatever is
 * left of its free trial rather than straight to nothing.
 */
create or replace function apply_school_subscription(p_school_id uuid, p_status text,
                                                     p_customer_id text default null,
                                                     p_subscription_id text default null,
                                                     p_stripe_event text default null,
                                                     p_payload jsonb default '{}'::jsonb,
                                                     p_event_created timestamptz default null,
                                                     p_period_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s   schools;
  v_new text;
begin
  select * into v_s from schools where id = p_school_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_school'); end if;

  if p_stripe_event is not null then
    insert into billing_events (school_id, stripe_event, type, payload)
    values (p_school_id, p_stripe_event, 'school:' || coalesce(p_status, '?'), p_payload)
    on conflict (stripe_event) do nothing;
    if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  end if;

  if v_s.status = 'suspended' then
    return jsonb_build_object('ok', true, 'status', 'suspended');
  end if;

  -- News about a subscription that is not the school's current one (an old
  -- plan being cancelled after a new one started) changes nothing. A new
  -- subscription that is active replaces the old one.
  if p_subscription_id is not null and v_s.stripe_subscription_id is not null
     and p_subscription_id <> v_s.stripe_subscription_id
     and p_status not in ('active', 'trialing') then
    return jsonb_build_object('ok', true, 'status', v_s.status, 'ignored', 'not_current_subscription');
  end if;
  -- Older news than what has been applied is out of date. Without this, a
  -- delayed "active" arriving after "deleted" put a school whose plan had
  -- ended back in the league, for nothing, until the next event.
  if p_event_created is not null and v_s.billing_event_at is not null
     and p_event_created < v_s.billing_event_at then
    return jsonb_build_object('ok', true, 'status', v_s.status, 'ignored', 'out_of_date');
  end if;
  -- A period refunded in full stays refunded (see apply_charge_refund for a
  -- family's): the portal's "cancel at the end of the period" still says
  -- active, and must not put the school back in the league for free.
  if v_s.billing_status = 'refunded' and p_status in ('active', 'trialing', 'past_due')
     and (p_subscription_id is null or p_subscription_id = v_s.stripe_subscription_id)
     and (p_period_end is null
          or (v_s.billing_period_end is not null and p_period_end <= v_s.billing_period_end)) then
    update schools
       set billing_event_at = greatest(billing_event_at, p_event_created),
           billing_ends_at = nullif(p_payload->>'cancel_at', '')::timestamptz
     where id = p_school_id;
    return jsonb_build_object('ok', true, 'status', v_s.status, 'ignored', 'refunded_period');
  end if;

  v_new := case
    when p_status in ('active', 'trialing', 'past_due') then 'active'
    when p_status in ('canceled', 'unpaid', 'incomplete_expired')
      then case when v_s.trial_ends_at > now() then 'trial' else 'lapsed' end
    -- 'incomplete' and anything new: no change until Stripe says more.
    else v_s.status
  end;

  update schools
     set status = v_new,
         -- The customer that is actually paying wins, so the billing portal
         -- opens the account with the live subscription in it.
         stripe_customer_id = case when v_new = 'active' then coalesce(p_customer_id, stripe_customer_id)
                                   else coalesce(stripe_customer_id, p_customer_id) end,
         -- Cleared when the plan ends, so nothing later mistakes an old,
         -- cancelled subscription for a paying one.
         stripe_subscription_id = case when v_new = 'active' then coalesce(p_subscription_id, stripe_subscription_id)
                                       when p_status in ('canceled', 'unpaid', 'incomplete_expired') then null
                                       else stripe_subscription_id end,
         billing_status = case when p_status in ('trialing','active','past_due','canceled','unpaid','incomplete',
                                                 'incomplete_expired','paused')
                               then p_status else 'unknown' end,
         billing_event_at = greatest(billing_event_at, p_event_created),
         billing_period_end = coalesce(p_period_end, billing_period_end),
         billing_ends_at = case
           when p_status in ('canceled', 'unpaid', 'incomplete_expired')
             then coalesce(nullif(p_payload->>'ended_at', '')::timestamptz, now())
           when p_status in ('active', 'trialing', 'past_due')
             then nullif(p_payload->>'cancel_at', '')::timestamptz
           else billing_ends_at end
   where id = p_school_id;
  return jsonb_build_object('ok', true, 'status', v_new);
end $$;

/**
 * A school's payment handed back. Called only by the Stripe webhook, on
 * charge.refunded. The webhook answered these and did nothing, so a school
 * refunded in full stayed in the league as a paying school.
 *
 * The same rules as a family's (apply_charge_refund): a partial refund is
 * goodwill and changes nothing; a refund of an earlier period, with a later
 * invoice paid since, leaves the period paid for standing; a refund in full of
 * the current one takes the school out of the league, back to whatever is left
 * of its free trial. Once per charge however often the event arrives.
 */
create or replace function apply_school_refund(p_school_id uuid, p_charge_id text,
                                               p_full boolean default false,
                                               p_event_created timestamptz default null,
                                               p_charge_created timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s schools;
  v_new text;
begin
  if not coalesce(p_full, false) then
    return jsonb_build_object('ok', true, 'ignored', 'partial_refund');
  end if;
  if p_charge_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_charge');
  end if;
  select * into v_s from schools where id = p_school_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_school'); end if;

  insert into billing_events (school_id, stripe_event, type, payload)
  values (p_school_id, 'refund:' || p_charge_id, 'school:refunded', '{}'::jsonb)
  on conflict (stripe_event) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  if p_charge_created is not null and exists (
       select 1 from billing_events
        where school_id = p_school_id and stripe_event like 'invoice:%'
          and received_at > p_charge_created + interval '7 days') then
    return jsonb_build_object('ok', true, 'ignored', 'earlier_period');
  end if;
  if v_s.status = 'suspended' then
    return jsonb_build_object('ok', true, 'status', 'suspended');
  end if;

  v_new := case when v_s.trial_ends_at > now() then 'trial' else 'lapsed' end;
  update schools
     set status = v_new,
         billing_status = 'refunded',
         billing_event_at = greatest(billing_event_at, p_event_created)
   where id = p_school_id;
  return jsonb_build_object('ok', true, 'status', v_new, 'kind', 'school');
end $$;

/** A school's invoice was paid: recorded with its amount, once. */
create or replace function record_school_payment(p_school_id uuid, p_stripe_event text,
                                                 p_amount_pence int, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into billing_events (school_id, stripe_event, type, payload, amount_pence, currency)
  values (p_school_id, p_stripe_event, 'school:invoice_paid', '{}'::jsonb, p_amount_pence, upper(p_currency))
  on conflict (stripe_event) do nothing;
  return jsonb_build_object('ok', true, 'recorded', found);
end $$;

grant execute on function school_checkout_info() to authenticated;
revoke execute on function attach_school_customer(uuid, text) from public, anon, authenticated;
revoke execute on function school_for_customer(text) from public, anon, authenticated;
revoke execute on function school_band_of(uuid) from public, anon, authenticated;
revoke execute on function stripe_customer_for_school(uuid) from public, anon, authenticated;
revoke execute on function apply_school_subscription(uuid, text, text, text, text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function apply_school_refund(uuid, text, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function record_school_payment(uuid, text, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A family's right to see what is held. Called by export_family_data in
-- consent.sql; each child's school, whether their name may show, and every
-- School Stars place they have had. Deleting the family deletes all of it:
-- school_members and school_top_students both cascade from kids.
-- ---------------------------------------------------------------------------
create or replace function export_family_school_data(p_family uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'child', k.name,
           'school', s.name, 'district', s.district, 'city', s.city,
           'joined_at', m.joined_at,
           'first_name_shown_to_school', m.show_name,
           'school_stars', coalesce((
             select jsonb_agg(jsonb_build_object('month', t.month_key, 'place', t.rank,
                                                 'points', t.score, 'published', t.published)
                              order by t.month_key)
               from school_top_students t where t.kid_id = k.id), '[]'::jsonb))
           order by k.name), '[]'::jsonb)
    from school_members m
    join kids k on k.id = m.kid_id
    join schools s on s.id = m.school_id
   where m.family_id = p_family;
$$;

revoke execute on function export_family_school_data(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The operator's view: every school waiting to be checked, and the switches.
-- Reached only by api/operator-schools.js with the service role, behind its
-- own secret. Includes who signed each school up, and their sign-in email,
-- because that is what checking a school is real mostly comes down to.
-- ---------------------------------------------------------------------------
create or replace function operator_schools()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'district', s.district, 'city', s.city,
           -- The district as the leagues group it, so the operator's checklist
           -- can show the other schools in it, and any with the same name.
           'district_key', s.district_key,
           'student_count', s.student_count, 'size_band', s.size_band,
           'status', s.status, 'verified', s.verified,
           'trial_ends_at', s.trial_ends_at, 'created_at', s.created_at,
           'paying', s.stripe_subscription_id is not null,
           -- The district account it belongs to, if any, and whether that
           -- district's plan pays for it.
           'district_account', (select d.name from district_schools ds join districts d on d.id = ds.district_id
                                 where ds.school_id = s.id),
           'district_paid', district_covers(s.id),
           'students_joined', (select count(*) from school_members m where m.school_id = s.id),
           'staff', (select coalesce(jsonb_agg(jsonb_build_object(
                              'name', st.name, 'role', st.role, 'email', u.email,
                              -- Whether they clicked the link Supabase emailed:
                              -- the address is really theirs.
                              'email_confirmed', u.email_confirmed_at is not null)
                              order by st.role, st.name), '[]'::jsonb)
                       from school_staff st left join auth.users u on u.id = st.user_id
                      where st.school_id = s.id))
           -- Waiting to be checked first, newest first within that.
           order by s.verified, s.created_at desc), '[]'::jsonb)
    from schools s;
$$;

/** Lift a suspension, back to whatever the school's plan says it should be. */
create or replace function unsuspend_school(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  update schools
     set status = case when stripe_subscription_id is not null then 'active'
                       when trial_ends_at > now() then 'trial'
                       else 'lapsed' end
   where id = p_school_id and status = 'suspended'
  returning status into v_status;
  return jsonb_build_object('ok', v_status is not null, 'status', v_status);
end $$;

revoke execute on function operator_schools() from public, anon, authenticated;
revoke execute on function unsuspend_school(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Looking after the school.
-- ---------------------------------------------------------------------------

/**
 * Take a student off the school's roll, from their place in the Stars.
 *
 * A school never sees a list of its students, so the only children it can
 * point at are the ones in its top ten, which is where a made-up or wrong
 * student does harm. Admin only. Their family is not told who removed them;
 * they simply find their child is no longer in the school, and can join again
 * only with the code (which the admin can change).
 */
create or replace function remove_school_star(p_month_key text, p_rank int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  school_staff := current_school_staff();
  v_kid uuid;
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  select kid_id into v_kid from school_top_students
   where school_id = v_me.school_id and month_key = p_month_key and rank = p_rank;
  if v_kid is null then return jsonb_build_object('ok', false, 'reason', 'no_such_place'); end if;

  delete from school_members where kid_id = v_kid and school_id = v_me.school_id;
  -- Every month's list, so they are not left on old ones either. Their place
  -- stays empty rather than everyone below moving up after the fact.
  delete from school_top_students where kid_id = v_kid and school_id = v_me.school_id;
  return jsonb_build_object('ok', true);
end $$;

/**
 * Correct the school's size, which sets its price. Not while a plan is being
 * paid: the price on the card would no longer match, so that is a change made
 * with us rather than with a button.
 */
create or replace function update_school_size(p_students int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  if p_students is null or p_students < 1 or p_students > 20000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_size');
  end if;
  if exists (select 1 from schools where id = v_me.school_id and stripe_subscription_id is not null
                                     and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'paying_contact_us');
  end if;
  -- Once we have checked a school, its size has been checked too. Going up is
  -- always fine; going down to a cheaper band is a conversation with us.
  if exists (select 1 from schools
              where id = v_me.school_id and verified
                and (school_price_quote(p_students)->>'monthly_cents')::int
                    < (school_price_quote(student_count)->>'monthly_cents')::int) then
    return jsonb_build_object('ok', false, 'reason', 'smaller_contact_us');
  end if;
  update schools set student_count = p_students, size_band = school_size_band(p_students)
   where id = v_me.school_id;
  return jsonb_build_object('ok', true, 'price', school_price_quote(p_students));
end $$;

grant execute on function remove_school_star(text, int) to authenticated;
grant execute on function update_school_size(int) to authenticated;

/**
 * Leave the school's staff. A teacher simply goes. An admin hands the school
 * to the teacher who has been there longest, so it is never left with nobody
 * in charge; the last member of staff cannot leave that way at all, because a
 * school with no staff cannot be looked after or cancelled.
 */
create or replace function leave_school_staff()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   school_staff := current_school_staff();
  v_next uuid;
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_school_staff'); end if;
  if v_me.role = 'admin' then
    select user_id into v_next from school_staff
     where school_id = v_me.school_id and user_id <> v_me.user_id
     order by joined_at, user_id limit 1;
    if v_next is null then return jsonb_build_object('ok', false, 'reason', 'last_staff'); end if;
    update school_staff set role = 'admin' where user_id = v_next;
  end if;
  delete from school_staff where user_id = v_me.user_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function leave_school_staff() to authenticated;

/**
 * The admin removes a member of staff: someone who has left, or someone who
 * got hold of the staff code who should not have. Make new codes as well, or
 * they can simply join again.
 */
create or replace function remove_school_staff(p_ref uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  if p_ref = v_me.user_id then return jsonb_build_object('ok', false, 'reason', 'not_yourself'); end if;
  delete from school_staff where user_id = p_ref and school_id = v_me.school_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_on_staff'); end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function remove_school_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The month, by email, to each school's admin (api/settle-schools.js).
--
-- Settlement closed a school's month and told nobody: the result sat on the
-- school's page for whoever opened it, and what the school had paid, and when
-- it renews, were only in Stripe's receipts. Each month, after settlement,
-- the admin gets one short email: the month's league result, what the school
-- paid that month, and when the plan next renews (or ends).
--
-- Once per school per month: the primary key is the promise. The job claims
-- a school's month before sending and marks it sent after; a send that fails
-- gives the claim back for the next run, and a claim left by a run that died
-- is taken again after an hour (the email provider's idempotency key stops
-- that being a second email). Only the scheduled job, holding the service
-- key, may claim: these name the admins' addresses.
-- ---------------------------------------------------------------------------

create table if not exists school_month_emails (
  school_id  uuid not null references schools(id) on delete cascade,
  month_key  text not null,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  primary key (school_id, month_key)
);
alter table school_month_emails enable row level security;
revoke all on school_month_emails from public, anon, authenticated;

/**
 * What the email says about one school's month: its result, what it paid,
 * and what happens next with its plan. Facts only; the words are the job's
 * (api/_shared/email.js). No child is in it: the School Stars are not.
 */
create or replace function school_month_summary(p_school uuid, p_month_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_s      schools;
  v_score  school_month_scores;
  v_from   timestamptz := to_date(p_month_key || '-01', 'YYYY-MM-DD')::timestamptz;
  v_rank   int;
  v_of     int;
  v_champ  boolean;
  v_given  boolean;
  v_paid   jsonb;
  v_rivals jsonb;
begin
  select * into v_s from schools where id = p_school;
  if not found then return null; end if;
  select * into v_score from school_month_scores where school_id = p_school and month_key = p_month_key;

  -- Its place among the district's ranked schools that month.
  select r.rn, r.n into v_rank, v_of from (
    select ms.school_id, count(*) over () as n,
           row_number() over (order by ms.score desc, ms.students desc, s.created_at, s.id) as rn
      from school_month_scores ms join schools s on s.id = ms.school_id
     where ms.month_key = p_month_key and ms.ranked and s.district_key = v_s.district_key
  ) r where r.school_id = p_school;

  select true, a.applied_at is not null into v_champ, v_given
    from school_awards a where a.month_key = p_month_key and a.school_id = p_school;

  -- Payments recorded in the month, by currency (a school pays in one).
  select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'minor', total) order by currency), '[]'::jsonb)
    into v_paid
    from (
      select upper(coalesce(currency, 'USD')) as currency, sum(amount_pence)::bigint as total
        from billing_events
       where school_id = p_school and type = 'school:invoice_paid' and amount_pence is not null
         and received_at >= v_from and received_at < v_from + interval '1 month'
       group by 1
    ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rival', case when r.challenger_id = p_school then rs.name else cs.name end,
           'result', case when rr.winner_id is null then 'draw' when rr.winner_id = p_school then 'won' else 'lost' end)
           order by r.created_at, r.id), '[]'::jsonb)
    into v_rivals
    from school_rivalry_results rr
    join school_rivalries r on r.id = rr.rivalry_id
    join schools cs on cs.id = r.challenger_id
    join schools rs on rs.id = r.rival_id
   where rr.month_key = p_month_key and p_school in (r.challenger_id, r.rival_id);

  return jsonb_build_object(
    'school_id', v_s.id,
    'name', v_s.name,
    'district', v_s.district,
    'month_key', p_month_key,
    'score', v_score.score,
    'students', coalesce(v_score.students, 0),
    'ranked', coalesce(v_score.ranked, false),
    'verified', v_s.verified,
    'min_students', school_min_students(),
    'rank', v_rank,
    'ranked_schools', v_of,
    'champion', coalesce(v_champ, false),
    'free_month_given', coalesce(v_given, false),
    'rivalries', v_rivals,
    'paid', v_paid,
    'status', v_s.status,
    -- Its district pays for it: the email says so instead of the school's
    -- own plan, which may well have ended.
    'district_plan', case when district_covers(p_school) then (
      select d.name from district_schools ds join districts d on d.id = ds.district_id
       where ds.school_id = p_school) end,
    -- What happens next: renews, ends, or the trial ends.
    'renews_at', case when v_s.status = 'active' and v_s.billing_ends_at is null then v_s.billing_period_end end,
    'ends_at', case when v_s.status = 'active' then v_s.billing_ends_at end,
    'trial_ends_at', case when v_s.status = 'trial' then v_s.trial_ends_at end
  );
end $$;

/**
 * Claim up to `p_limit` schools' emails for a closed month, with what each
 * says and who to send it to: every school whose month was settled, that is
 * not suspended, has an admin with an address, and has not had this month's
 * email. A claim more than an hour old that never became a send is taken
 * again.
 */
create or replace function claim_school_month_emails(p_month date, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  r     record;
  v_out jsonb := '[]'::jsonb;
  v_to  jsonb;
begin
  for r in
    select ms.school_id
      from school_month_scores ms join schools s on s.id = ms.school_id
     where ms.month_key = v_key and s.status <> 'suspended'
       and not exists (select 1 from school_month_emails e
                        where e.school_id = ms.school_id and e.month_key = v_key
                          and (e.sent_at is not null or e.claimed_at > now() - interval '1 hour'))
     order by ms.school_id
  loop
    select coalesce(jsonb_agg(u.email order by st.joined_at), '[]'::jsonb) into v_to
      from school_staff st join auth.users u on u.id = st.user_id
     where st.school_id = r.school_id and st.role = 'admin' and u.email like '%@%';
    -- Nobody to write to: not claimed, so an admin added later still gets it.
    continue when jsonb_array_length(v_to) = 0;

    insert into school_month_emails (school_id, month_key) values (r.school_id, v_key)
    on conflict (school_id, month_key) do update set claimed_at = now()
     where school_month_emails.sent_at is null and school_month_emails.claimed_at <= now() - interval '1 hour';
    continue when not found;

    v_out := v_out || (school_month_summary(r.school_id, v_key) || jsonb_build_object('recipients', v_to));
    exit when jsonb_array_length(v_out) >= greatest(p_limit, 1);
  end loop;
  return jsonb_build_object('ok', true, 'month', v_key, 'emails', v_out);
end $$;

/** Sent, so never again; or not sent, so the claim is given back for the next run. */
create or replace function finish_school_month_email(p_school uuid, p_month_key text, p_sent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_sent then
    update school_month_emails set sent_at = coalesce(sent_at, now())
     where school_id = p_school and month_key = p_month_key;
  else
    delete from school_month_emails
     where school_id = p_school and month_key = p_month_key and sent_at is null;
  end if;
end $$;

-- The scheduled job's alone: they list schools and their admins' addresses.
revoke execute on function school_month_summary(uuid, text) from public, anon, authenticated;
revoke execute on function claim_school_month_emails(date, int) from public, anon, authenticated;
revoke execute on function finish_school_month_email(uuid, text, boolean) from public, anon, authenticated;

-- ===========================================================================
-- School districts.
--
-- One customer buying the School League for many schools at once. A district
-- admin signs the district up, adds its schools (each gets a one-time invite
-- for its principal, who becomes the school's admin), and sees the district
-- picture: totals for each school and for the district.
--
-- What a district sees, and what it never sees:
--   * Totals only. Per school: students taking part, how many did a chore
--     this month, chores done, the average. Never a child's name, nickname or
--     any one child's number, and nothing anybody typed.
--   * Not even totals for a school with fewer students taking part than a
--     league ranks (school_min_students). Below that a total is close to one
--     family's number, so the district sees "too few to show". District
--     totals add up only the schools that are shown, so they cannot be used to
--     work a small school's number out by subtraction.
--   * Nothing changes for a school's own privacy rules: what its staff see,
--     its Stars, its verification. A district is not staff of its schools.
--
-- Paying: by invoice, yearly (api/district-billing.js, Stripe Invoicing). Each
-- school is priced by its size at the School League's yearly price, less a
-- discount that grows with its place in the district's plan
-- (district_price_quote). A district that stops paying ends its plan; each
-- school simply falls back to its own plan, its trial, or the free level.
-- Nothing is deleted then: the retention job removes a district a year after
-- its plan ended, and never a school.
-- ===========================================================================

create or replace function current_district_staff()
returns district_staff language sql stable security definer set search_path = public as $$
  select * from district_staff where user_id = auth.uid();
$$;

/** A district plan is for at least this many schools: one school is the School League. */
create or replace function district_min_schools()
returns int language sql immutable as $$ select 2 $$;

/** More than this, and a district gets a quote instead (the "Get a quote" form). */
create or replace function district_max_schools()
returns int language sql immutable as $$ select 100 $$;

/**
 * The discount, in percent, on the school in this place in a district's plan.
 * Places go biggest school first. Kept in step with DISTRICT_DISCOUNTS in
 * src/lib/schools.js; tests/schools.mjs fails if the two disagree.
 *
 * Why by place, like tax brackets, rather than one discount for the whole
 * plan: with one discount for everyone, 10 schools at 20% off cost less than
 * 9 at 10% off (8.0 school-prices against 8.1), and 25 at 30% off less than
 * 24 at 20%. A district would save money by adding a school it did not want.
 * By place, each school added adds at least 70% of its own price, and moves
 * at most two others (smaller or the same size) into a bigger discount, each
 * worth 10% of their price: the total always goes up. docs/PAYMENTS.md.
 */
create or replace function district_discount_pct(p_place int)
returns int language sql immutable as $$
  select case when p_place >= 25 then 30 when p_place >= 10 then 20 else 10 end;
$$;

/**
 * What a district pays a year for schools of these sizes. Public, like a
 * school's price: a district wants the price before an account.
 *
 * Each school at its size's yearly School League price, less its place's
 * discount. One line per size and discount, which is one Stripe price each
 * (api/_shared/districtBilling.js), with a quantity.
 */
create or replace function district_price_quote(p_students int[])
returns jsonb language plpgsql immutable as $$
declare
  v_n     int := coalesce(array_length(p_students, 1), 0);
  v_lines jsonb;
  v_total bigint;
  v_full  bigint;
begin
  if exists (select 1 from unnest(coalesce(p_students, '{}'::int[])) n
              where n is null or n < 1 or n > 20000) then
    return jsonb_build_object('ok', false, 'reason', 'bad_size');
  end if;
  if v_n < district_min_schools() then
    return jsonb_build_object('ok', false, 'reason', 'too_few_schools');
  end if;
  if v_n > district_max_schools() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_schools');
  end if;

  with placed as (
    select q->>'band' as band, q->>'label' as label, (q->>'yearly_cents')::int as full_cents,
           district_discount_pct((row_number() over (order by (q->>'yearly_cents')::int desc))::int) as pct
      from (select school_price_quote(n) as q from unnest(p_students) n) s
  ), lines as (
    select band, label, pct, full_cents, count(*)::int as quantity,
           -- Every yearly price is whole dollars and every discount a whole
           -- ten percent, so this is exact.
           (full_cents * (100 - pct) / 100)::int as unit_cents
      from placed
     group by band, label, pct, full_cents
  )
  select jsonb_agg(jsonb_build_object('band', band, 'label', label, 'pct', pct, 'quantity', quantity,
                                      'unit_yearly_cents', unit_cents,
                                      'yearly_cents', unit_cents * quantity)
                   order by full_cents desc, pct),
         sum(unit_cents * quantity), sum(full_cents * quantity)
    into v_lines, v_total, v_full
    from lines;

  return jsonb_build_object('ok', true, 'schools', v_n, 'lines', v_lines,
                            'yearly_cents', v_total, 'full_yearly_cents', v_full,
                            'saving_cents', v_full - v_total);
end $$;

/** The plan a district's schools add up to now. Suspended schools are not billed. */
create or replace function district_plan_quote(p_district uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select district_price_quote(coalesce(array_agg(s.student_count order by s.id), '{}'::int[]))
    from district_schools ds join schools s on s.id = ds.school_id
   where ds.district_id = p_district and s.status <> 'suspended';
$$;

/**
 * One school's month, as its district may see it: totals, and only when
 * enough students take part that a total is not one child's number.
 */
create or replace function district_school_month(p_school uuid, p_month date)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when count(*) < school_min_students()
      then jsonb_build_object('students', count(*), 'shown', false)
    else jsonb_build_object(
      'students', count(*), 'shown', true,
      'active', count(*) filter (where points > 0),
      'chores', coalesce(sum(points), 0),
      'score', round(avg(points)::numeric, 1))
  end
    from school_kid_points(p_school, p_month);
$$;

/** The district's totals: only the schools whose numbers are shown. */
create or replace function district_totals(p_schools jsonb, p_which text)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'schools', count(*),
    'shown', count(*) filter (where (e->p_which->>'shown')::boolean),
    'students', coalesce(sum((e->p_which->>'students')::int) filter (where (e->p_which->>'shown')::boolean), 0),
    'active', coalesce(sum((e->p_which->>'active')::int) filter (where (e->p_which->>'shown')::boolean), 0),
    'chores', coalesce(sum((e->p_which->>'chores')::int) filter (where (e->p_which->>'shown')::boolean), 0),
    'covered', count(*) filter (where (e->>'covered')::boolean))
    from jsonb_array_elements(coalesce(p_schools, '[]'::jsonb)) e;
$$;

/** Unique codes in the same alphabet as every other code here. */
create or replace function district_new_link_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v text;
begin
  loop
    v := school_code(8);
    exit when not exists (select 1 from districts where link_code = v)
          and not exists (select 1 from schools where staff_code = v);
  end loop;
  return v;
end $$;

create or replace function district_new_invite()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v text;
begin
  loop
    v := school_code(10);
    exit when not exists (select 1 from district_schools where admin_invite = v);
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Signing a district up, and its schools.
-- ---------------------------------------------------------------------------

/**
 * Someone at a district office signs the district up and becomes its admin.
 * Open to any signed-in adult, like a school: a district sees totals of the
 * schools it adds, and a school it adds is checked by us like any other
 * before it joins a league or sees a name.
 */
create or replace function register_district(p_name text, p_your_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_id   uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if exists (select 1 from kids where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_an_adult');
  end if;
  if exists (select 1 from district_staff where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_district_staff');
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if length(trim(coalesce(p_your_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_your_name');
  end if;

  insert into districts (name, district_key, link_code)
  values (v_name, school_district_key(v_name), district_new_link_code())
  returning id into v_id;
  insert into district_staff (user_id, district_id, name)
  values (v_uid, v_id, left(trim(p_your_name), 60));
  return jsonb_build_object('ok', true, 'district_id', v_id);
end $$;

/**
 * The district admin adds a school that is not on RankUp yet. It starts like
 * any new school (a free trial, not yet checked by us) in the district's own
 * league, and the admin is given a one-time invite for its principal.
 */
create or replace function add_district_school(p_name text, p_city text, p_students int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me     district_staff := current_district_staff();
  v_d      districts;
  v_name   text := trim(coalesce(p_name, ''));
  v_id     uuid;
  v_join   text;
  v_staff  text;
  v_invite text := district_new_invite();
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_district_admin'); end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if p_students is null or p_students < 1 or p_students > 20000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_size');
  end if;
  select * into v_d from districts where id = v_me.district_id for update;
  if (select count(*) from district_schools where district_id = v_d.id) >= district_max_schools() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_schools');
  end if;

  loop
    v_join := school_code(6);
    exit when not exists (select 1 from schools where join_code = v_join);
  end loop;
  loop
    v_staff := school_code(8);
    exit when not exists (select 1 from schools where staff_code = v_staff)
          and not exists (select 1 from districts where link_code = v_staff);
  end loop;

  insert into schools (name, district, district_key, city, student_count, size_band, join_code, staff_code)
  values (v_name, v_d.name, v_d.district_key, left(trim(coalesce(p_city, '')), 60),
          p_students, school_size_band(p_students), v_join, v_staff)
  returning id into v_id;
  insert into district_schools (school_id, district_id, admin_invite, invite_expires_at)
  values (v_id, v_d.id, v_invite, now() + interval '30 days');
  return jsonb_build_object('ok', true, 'school_id', v_id, 'invite', v_invite,
                            'invite_expires_at', now() + interval '30 days');
end $$;

/** A fresh invite for a school whose principal has not signed up yet. */
create or replace function new_school_invite(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me     district_staff := current_district_staff();
  v_invite text := district_new_invite();
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_district_admin'); end if;
  if not exists (select 1 from district_schools where school_id = p_school_id and district_id = v_me.district_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_school');
  end if;
  if exists (select 1 from school_staff where school_id = p_school_id and role = 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'has_admin');
  end if;
  update district_schools set admin_invite = v_invite, invite_expires_at = now() + interval '30 days'
   where school_id = p_school_id;
  return jsonb_build_object('ok', true, 'invite', v_invite, 'invite_expires_at', now() + interval '30 days');
end $$;

/**
 * Take a school out of the district. The school carries on as it was, on its
 * own plan, its trial or the free level. A school the district added whose
 * principal never signed up (no staff, no students) has nobody to carry on
 * for, so it goes with it.
 */
create or replace function remove_district_school(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me district_staff := current_district_staff();
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_district_admin'); end if;
  delete from district_schools where school_id = p_school_id and district_id = v_me.district_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_your_school'); end if;
  if not exists (select 1 from school_staff where school_id = p_school_id)
     and not exists (select 1 from school_members where school_id = p_school_id) then
    delete from schools where id = p_school_id;
    return jsonb_build_object('ok', true, 'school', 'deleted');
  end if;
  return jsonb_build_object('ok', true, 'school', 'kept');
end $$;

/** A new code for schools to join with, for when one has gone somewhere it should not. */
create or replace function rotate_district_code()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   district_staff := current_district_staff();
  v_code text := district_new_link_code();
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_district_admin'); end if;
  update districts set link_code = v_code where id = v_me.district_id;
  return jsonb_build_object('ok', true, 'link_code', v_code);
end $$;

/** A principal signs up with the invite their district gave them, and becomes the school's admin. */
create or replace function claim_school_invite(p_code text, p_your_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ds  district_schools;
  v_s   schools;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if exists (select 1 from kids where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_an_adult');
  end if;
  if exists (select 1 from school_staff where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_staff');
  end if;
  if length(trim(coalesce(p_your_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_your_name');
  end if;
  select * into v_ds from district_schools where admin_invite = upper(trim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_code'); end if;
  if v_ds.invite_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'invite_expired');
  end if;
  select * into v_s from schools where id = v_ds.school_id;

  insert into school_staff (user_id, school_id, name, role)
  values (v_uid, v_s.id, left(trim(p_your_name), 60), 'admin');
  update district_schools set admin_invite = null, invite_expires_at = null where school_id = v_s.id;
  return jsonb_build_object('ok', true, 'school_id', v_s.id, 'name', v_s.name);
end $$;

/** A school already on RankUp joins its district, with the district's code. Its admin decides. */
create or replace function join_district(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me school_staff := current_school_staff();
  v_d  districts;
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  if exists (select 1 from district_schools where school_id = v_me.school_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_in_district');
  end if;
  select * into v_d from districts where link_code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_code'); end if;
  if (select count(*) from district_schools where district_id = v_d.id) >= district_max_schools() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_schools');
  end if;
  insert into district_schools (school_id, district_id) values (v_me.school_id, v_d.id);
  return jsonb_build_object('ok', true, 'name', v_d.name);
end $$;

/** The school's admin takes the school out of its district. Same as the district doing it. */
create or replace function leave_district()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me school_staff := current_school_staff();
begin
  if v_me.user_id is null or v_me.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_school_admin');
  end if;
  delete from district_schools where school_id = v_me.school_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_in_district'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- The district picture.
-- ---------------------------------------------------------------------------

/**
 * The district admin's page. Each school: its name, town and size, how it is
 * paid for, whether its principal has signed up, and this month's and last
 * month's totals. The district's totals. The plan and its price.
 *
 * `ref` is the school's id, which the admin's own buttons (a new invite,
 * taking a school out) send back. Only ever given to this district's admin,
 * and only for this district's schools.
 */
create or replace function district_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me      district_staff := current_district_staff();
  v_d       districts;
  v_month   date := date_trunc('month', now())::date;
  v_last    date := (date_trunc('month', now()) - interval '1 month')::date;
  v_schools jsonb;
begin
  if v_me.user_id is null then return jsonb_build_object('ok', true, 'district', null); end if;
  select * into v_d from districts where id = v_me.district_id;

  select coalesce(jsonb_agg(x.card order by x.name, x.ref), '[]'::jsonb) into v_schools from (
    select s.name, s.id as ref, jsonb_build_object(
             'ref', s.id,
             'name', s.name, 'city', s.city,
             'student_count', s.student_count, 'size_band', s.size_band,
             'verified', s.verified,
             'status', s.status,
             'trial_ends_at', case when s.status = 'trial' then s.trial_ends_at end,
             'covered', district_covers(s.id),
             'own_plan', s.status = 'active' and s.stripe_subscription_id is not null,
             'has_admin', exists (select 1 from school_staff st where st.school_id = s.id and st.role = 'admin'),
             'staff', (select count(*) from school_staff st where st.school_id = s.id),
             'invite', case when ds.invite_expires_at > now() then ds.admin_invite end,
             'invite_expires_at', case when ds.invite_expires_at > now() then ds.invite_expires_at end,
             'this_month', district_school_month(s.id, v_month),
             'last_month', district_school_month(s.id, v_last)) as card
      from district_schools ds join schools s on s.id = ds.school_id
     where ds.district_id = v_d.id
  ) x;

  return jsonb_build_object('ok', true, 'district', jsonb_build_object(
    'name', v_d.name,
    'you', v_me.name,
    'status', v_d.status,
    'link_code', v_d.link_code,
    'has_customer', v_d.stripe_customer_id is not null,
    'paying', v_d.status = 'active' and v_d.stripe_subscription_id is not null,
    'billing_status', v_d.billing_status,
    'billing_period_end', v_d.billing_period_end,
    'billing_ends_at', v_d.billing_ends_at,
    'month', to_char(v_month, 'YYYY-MM'),
    'last_month', to_char(v_last, 'YYYY-MM'),
    'min_students', school_min_students(),
    'min_schools', district_min_schools(),
    'max_schools', district_max_schools(),
    'schools', v_schools,
    'totals', district_totals(v_schools, 'this_month'),
    'last_totals', district_totals(v_schools, 'last_month'),
    'quote', district_plan_quote(v_d.id)));
end $$;

-- ---------------------------------------------------------------------------
-- Paying. As for a school: written by Stripe's webhook and nothing else.
-- ---------------------------------------------------------------------------

alter table billing_events add column if not exists district_id uuid references districts(id) on delete set null;

/**
 * What the district's invoice needs, for its admin. The plan comes from the
 * district's own schools, never from the request.
 */
create or replace function district_checkout_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me district_staff := current_district_staff();
  v_d  districts;
  v_q  jsonb;
begin
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_district_admin'); end if;
  select * into v_d from districts where id = v_me.district_id;
  v_q := district_plan_quote(v_d.id);
  -- Paying already: a second plan would bill twice. The plan as it would be
  -- now goes with the refusal, for "update the plan" and for the portal.
  if v_d.status = 'active' and v_d.stripe_subscription_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_paying',
                              'district_id', v_d.id, 'has_customer', v_d.stripe_customer_id is not null,
                              'quote', v_q);
  end if;
  if not (v_q->>'ok')::boolean then return v_q; end if;
  return jsonb_build_object('ok', true, 'district_id', v_d.id, 'name', v_d.name, 'status', v_d.status,
                            'has_customer', v_d.stripe_customer_id is not null, 'quote', v_q);
end $$;

create or replace function attach_district_customer(p_district_id uuid, p_customer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update districts set stripe_customer_id = p_customer_id
   where id = p_district_id and (stripe_customer_id is null or stripe_customer_id = p_customer_id);
  return jsonb_build_object('ok', found);
end $$;

create or replace function district_for_customer(p_customer_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from districts where stripe_customer_id = p_customer_id limit 1;
$$;

create or replace function stripe_customer_for_district(p_district_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select stripe_customer_id from districts where id = p_district_id;
$$;

create or replace function stripe_subscription_for_district(p_district_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select stripe_subscription_id from districts where id = p_district_id;
$$;

/**
 * Apply what Stripe says about a district's subscription. The same rules as
 * a school's (apply_school_subscription): once per event, older news ignored,
 * news about an old plan ignored, a refunded period stays refunded. A late
 * invoice (past_due) keeps the schools covered while Stripe chases it; a plan
 * that has really ended takes the cover away, and each school is then on its
 * own plan, its trial or the free level. Nothing is deleted.
 *
 * `p_paid_bands` is how many schools of each size the plan's prices pay for;
 * `p_paid_all` is a plan made by hand in Stripe, which pays for every school.
 */
create or replace function apply_district_subscription(p_district_id uuid, p_status text,
                                                       p_customer_id text default null,
                                                       p_subscription_id text default null,
                                                       p_stripe_event text default null,
                                                       p_payload jsonb default '{}'::jsonb,
                                                       p_event_created timestamptz default null,
                                                       p_period_end timestamptz default null,
                                                       p_paid_bands jsonb default null,
                                                       p_paid_all boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_d   districts;
  v_new text;
begin
  select * into v_d from districts where id = p_district_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_district'); end if;

  if p_stripe_event is not null then
    insert into billing_events (district_id, stripe_event, type, payload)
    values (p_district_id, p_stripe_event, 'district:' || coalesce(p_status, '?'), p_payload)
    on conflict (stripe_event) do nothing;
    if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  end if;

  if p_subscription_id is not null and v_d.stripe_subscription_id is not null
     and p_subscription_id <> v_d.stripe_subscription_id
     and p_status not in ('active', 'trialing') then
    return jsonb_build_object('ok', true, 'status', v_d.status, 'ignored', 'not_current_subscription');
  end if;
  if p_event_created is not null and v_d.billing_event_at is not null
     and p_event_created < v_d.billing_event_at then
    return jsonb_build_object('ok', true, 'status', v_d.status, 'ignored', 'out_of_date');
  end if;
  if v_d.billing_status = 'refunded' and p_status in ('active', 'trialing', 'past_due')
     and (p_subscription_id is null or p_subscription_id = v_d.stripe_subscription_id)
     and (p_period_end is null
          or (v_d.billing_period_end is not null and p_period_end <= v_d.billing_period_end)) then
    update districts set billing_event_at = greatest(billing_event_at, p_event_created) where id = p_district_id;
    return jsonb_build_object('ok', true, 'status', v_d.status, 'ignored', 'refunded_period');
  end if;

  v_new := case
    when p_status in ('active', 'trialing', 'past_due') then 'active'
    when p_status in ('canceled', 'unpaid', 'incomplete_expired') then 'lapsed'
    else v_d.status
  end;

  update districts
     set status = v_new,
         stripe_customer_id = case when v_new = 'active' then coalesce(p_customer_id, stripe_customer_id)
                                   else coalesce(stripe_customer_id, p_customer_id) end,
         stripe_subscription_id = case when v_new = 'active' then coalesce(p_subscription_id, stripe_subscription_id)
                                       when p_status in ('canceled', 'unpaid', 'incomplete_expired') then null
                                       else stripe_subscription_id end,
         -- What the plan pays for: from the subscription while it is live.
         paid_bands = case when v_new = 'active' then coalesce(p_paid_bands, '{}'::jsonb) else paid_bands end,
         paid_all = case when v_new = 'active' then coalesce(p_paid_all, false) else paid_all end,
         billing_status = case when p_status in ('trialing','active','past_due','canceled','unpaid','incomplete',
                                                 'incomplete_expired','paused')
                               then p_status else 'unknown' end,
         billing_event_at = greatest(billing_event_at, p_event_created),
         billing_period_end = coalesce(p_period_end, billing_period_end),
         billing_ends_at = case
           when p_status in ('canceled', 'unpaid', 'incomplete_expired')
             then coalesce(nullif(p_payload->>'ended_at', '')::timestamptz, now())
           when p_status in ('active', 'trialing', 'past_due')
             then nullif(p_payload->>'cancel_at', '')::timestamptz
           else billing_ends_at end
   where id = p_district_id;
  return jsonb_build_object('ok', true, 'status', v_new);
end $$;

/**
 * A district's payment handed back. As for a school: a partial refund changes
 * nothing; a refund of an earlier year, with a later invoice paid since,
 * leaves the year paid for standing; a refund in full of the current one ends
 * the cover now. Once per charge.
 */
create or replace function apply_district_refund(p_district_id uuid, p_charge_id text,
                                                 p_full boolean default false,
                                                 p_event_created timestamptz default null,
                                                 p_charge_created timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d districts;
begin
  if not coalesce(p_full, false) then
    return jsonb_build_object('ok', true, 'ignored', 'partial_refund');
  end if;
  if p_charge_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_charge');
  end if;
  select * into v_d from districts where id = p_district_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_district'); end if;

  insert into billing_events (district_id, stripe_event, type, payload)
  values (p_district_id, 'refund:' || p_charge_id, 'district:refunded', '{}'::jsonb)
  on conflict (stripe_event) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  if p_charge_created is not null and exists (
       select 1 from billing_events
        where district_id = p_district_id and stripe_event like 'invoice:%'
          and received_at > p_charge_created + interval '7 days') then
    return jsonb_build_object('ok', true, 'ignored', 'earlier_period');
  end if;

  update districts
     set status = 'lapsed',
         billing_status = 'refunded',
         -- When the cover ended, which the retention job counts a year from.
         billing_ends_at = now(),
         billing_event_at = greatest(billing_event_at, p_event_created)
   where id = p_district_id;
  return jsonb_build_object('ok', true, 'status', 'lapsed', 'kind', 'district');
end $$;

/** A district's invoice was paid: recorded with its amount, once per invoice. */
create or replace function record_district_payment(p_district_id uuid, p_stripe_event text,
                                                   p_amount_pence int, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into billing_events (district_id, stripe_event, type, payload, amount_pence, currency)
  values (p_district_id, p_stripe_event, 'district:invoice_paid', '{}'::jsonb, p_amount_pence, upper(p_currency))
  on conflict (stripe_event) do nothing;
  return jsonb_build_object('ok', true, 'recorded', found);
end $$;

/**
 * A "Get a quote" request, before its email goes (api/district-quote.js).
 * At most 3 an hour from one address (a keyed hash of it, never the address)
 * and 30 an hour in all, so the form cannot be used to flood the inbox.
 */
create or replace function record_district_quote(p_ip_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('record_district_quote'));
  if (select count(*) from district_quote_attempts where tried_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  if (select count(*) from district_quote_attempts
       where ip_key = coalesce(p_ip_key, '') and tried_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_quotes');
  end if;
  insert into district_quote_attempts (ip_key) values (left(coalesce(p_ip_key, ''), 64)) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Postgres grants EXECUTE to PUBLIC on every new function, and
-- Supabase grants it to its two browser roles by name, so everything that is
-- not the browser's is revoked from all three.
-- ---------------------------------------------------------------------------

grant execute on function district_price_quote(int[]) to anon, authenticated;
grant execute on function register_district(text, text) to authenticated;
grant execute on function add_district_school(text, text, int) to authenticated;
grant execute on function new_school_invite(uuid) to authenticated;
grant execute on function remove_district_school(uuid) to authenticated;
grant execute on function rotate_district_code() to authenticated;
grant execute on function claim_school_invite(text, text) to authenticated;
grant execute on function join_district(text) to authenticated;
grant execute on function leave_district() to authenticated;
grant execute on function district_overview() to authenticated;
grant execute on function district_checkout_info() to authenticated;

-- Internals: each takes any school's or district's id, or makes codes.
revoke execute on function district_covers(uuid) from public, anon, authenticated;
revoke execute on function current_district_staff() from public, anon, authenticated;
revoke execute on function district_plan_quote(uuid) from public, anon, authenticated;
revoke execute on function district_school_month(uuid, date) from public, anon, authenticated;
revoke execute on function district_totals(jsonb, text) from public, anon, authenticated;
revoke execute on function district_new_link_code() from public, anon, authenticated;
revoke execute on function district_new_invite() from public, anon, authenticated;
-- district_min_schools, district_max_schools and district_discount_pct are
-- constants, and the public price quote above runs as its caller and asks
-- them, so they stay callable.

-- The Stripe webhook's, the district checkout's and the quote form's: the
-- server holds the service role, and nobody else reaches these.
revoke execute on function attach_district_customer(uuid, text) from public, anon, authenticated;
revoke execute on function district_for_customer(text) from public, anon, authenticated;
revoke execute on function stripe_customer_for_district(uuid) from public, anon, authenticated;
revoke execute on function stripe_subscription_for_district(uuid) from public, anon, authenticated;
revoke execute on function apply_district_subscription(uuid, text, text, text, text, jsonb, timestamptz, timestamptz, jsonb, boolean) from public, anon, authenticated;
revoke execute on function apply_district_refund(uuid, text, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function record_district_payment(uuid, text, int, text) from public, anon, authenticated;
revoke execute on function record_district_quote(text) from public, anon, authenticated;
