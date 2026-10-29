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
    from generate_series(1, p_len);
$$;

/** Below this many students a school's average is one family's average. */
create or replace function school_min_students()
returns int language sql immutable as $$ select 5 $$;

/** Paid up, or still in its trial. Anything else sits the league out. */
create or replace function school_is_live(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from schools s
                  where s.id = p_school
                    and (s.status = 'active'
                         or (s.status = 'trial' and s.trial_ends_at > now())));
$$;

-- ---------------------------------------------------------------------------
-- Scores.
-- ---------------------------------------------------------------------------

/**
 * Each student's points for a month: approved quests, at most eight a day,
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
             select least(count(*), 8) as n
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
         (s.verified and ms.students >= school_min_students()) as ranked
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
begin
  select * into v_s from schools where id = p_school;
  if not found then return null; end if;
  select score, students into v_score, v_kids from school_month_score(p_school, v_month);

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
    'ranked', v_s.verified and v_kids >= school_min_students(),
    'district_rank', case when v_s.verified and v_kids >= school_min_students() then v_rank end,
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
      'price', school_price_quote(v_s.student_count),
      'join_code', v_s.join_code,
      -- Only the admin hands out the staff code.
      'staff_code', case when v_me.role = 'admin' then v_s.staff_code end,
      'sharing_names', (select count(*) from school_members where school_id = p_school and show_name),
      'staff', (select jsonb_agg(jsonb_build_object('name', st.name, 'role', st.role,
                                                    'you', st.user_id = auth.uid())
                                 order by st.role, st.name)
                  from school_staff st where st.school_id = p_school),
      'challenges_in', (select count(*) from school_rivalries
                         where rival_id = p_school and status = 'pending'));
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
begin
  if v_month + interval '1 month' > now() then
    return jsonb_build_object('ok', false, 'reason', 'month_not_over');
  end if;

  insert into school_month_scores (school_id, month_key, score, students, ranked)
  select s.id, v_key, ms.score, ms.students,
         s.verified and ms.students >= school_min_students()
    from schools s cross join lateral school_month_score(s.id, v_month) ms
   where school_is_live(s.id)
  on conflict (school_id, month_key) do nothing;

  -- Top ten per school, by points; ties go to whoever joined first.
  insert into school_top_students (school_id, month_key, rank, kid_id, score)
  select school_id, v_key, rn, kid_id, points from (
    select s.id as school_id, p.kid_id, p.points,
           row_number() over (partition by s.id order by p.points desc, m.joined_at, p.kid_id) as rn
      from schools s
      cross join lateral school_kid_points(s.id, v_month) p
      join school_members m on m.kid_id = p.kid_id
     where school_is_live(s.id) and p.points > 0
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
     order by r.district_key, r.score desc, r.students desc, r.created_at
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
           'school_id', s.id, 'name', s.name, 'status', s.status,
           'stripe_customer_id', s.stripe_customer_id,
           'stripe_subscription_id', s.stripe_subscription_id)
           order by a.month_key, a.district_key), '[]'::jsonb)
    from school_awards a join schools s on s.id = a.school_id
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
                                                     p_payload jsonb default '{}'::jsonb)
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

  v_new := case
    when p_status in ('active', 'trialing', 'past_due') then 'active'
    when p_status in ('canceled', 'unpaid', 'incomplete_expired')
      then case when v_s.trial_ends_at > now() then 'trial' else 'lapsed' end
    -- 'incomplete' and anything new: no change until Stripe says more.
    else v_s.status
  end;

  update schools
     set status = v_new,
         stripe_customer_id = coalesce(stripe_customer_id, p_customer_id),
         stripe_subscription_id = case when v_new = 'active' then coalesce(p_subscription_id, stripe_subscription_id)
                                       else stripe_subscription_id end
   where id = p_school_id;
  return jsonb_build_object('ok', true, 'status', v_new);
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
revoke execute on function stripe_customer_for_school(uuid) from public, anon, authenticated;
revoke execute on function apply_school_subscription(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
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
