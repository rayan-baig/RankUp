-- ---------------------------------------------------------------------------
-- Leaderboards: Adventure and Arena.
--
-- Run after schema.sql, sync.sql, guilds.sql, consent.sql and schools.sql.
--
-- Many boards (chores, XP, highest level, streaks, badges, arcade scores,
-- Season themes, guilds, rising stars), each by period (this week, this month,
-- all time) and by scope (worldwide, my country, my guild, my family).
--
-- THE RULES THAT MATTER MOST, children's privacy first:
--
--   1. EVERY CHILD STARTS IN ADVENTURE. An Adventure child is on no public
--      board and sees none; family and guild boards are among people the
--      family already approved. Only a PARENT moves a child into ARENA
--      (set_leaderboard_mode), and either a parent or the child can move them
--      back, at once: going back removes them from every public board in the
--      same call (leaderboard_forget).
--   2. A STRANGER SEES A NICKNAME AND NUMBERS, NOTHING ELSE. The nickname is
--      built from two word lists and a two-digit number, never typed
--      (set_leaderboard_nickname accepts only those pieces); the country is a
--      parent's pick from a fixed list, shown as a flag. No name, family,
--      school, town or anything a child typed is ever on a public board. A
--      guild on a public board is shown by a name made from the same word
--      lists, and only when every child in it is in Arena.
--   3. THE NUMBERS ARE THE SERVER'S. Every score is worked out here from rows
--      a phone cannot write (accepted chores, the server-held streak, the
--      arcade's clamped best scores), never from what a phone reports.
--   4. NOTHING CAN BE BOUGHT OR TAPPED TO THE TOP. Chores count at most
--      school_daily_chores() a day, the School League's cap; XP counts the
--      value before the Elite boost (submissions.base_xp), at most
--      leaderboard_xp_per_chore() a chore, from those same capped chores.
--   5. CHEAP TO OPEN. A scheduled job (refresh_leaderboards, called by
--      api/refresh-leaderboards.js every ten minutes) ranks everyone once and
--      stores the result; opening a board reads a stored page by index.
--
-- Weeks start on Monday at 00:00 UTC and months on the 1st at 00:00 UTC, the
-- same instant for everyone, so "this week" is one race worldwide.
-- ---------------------------------------------------------------------------

/** The most XP one accepted chore can count for on a board: a Boss chore on a double-XP day. */
create or replace function leaderboard_xp_per_chore()
returns int language sql immutable as $$ select 200 $$;

/** The nickname pieces. The same lists as src/data/nicknames.js (tests/leaderboardwords.mjs). */
create or replace function leaderboard_first_words()
returns text[] language sql immutable as $$
  select array[
    'Swift', 'Brave', 'Cosmic', 'Lucky', 'Mighty', 'Sunny', 'Clever', 'Bright', 'Bouncy', 'Breezy',
    'Bold', 'Calm', 'Cheery', 'Daring', 'Dizzy', 'Eager', 'Epic', 'Fearless', 'Fizzy', 'Frosty',
    'Gentle', 'Giant', 'Golden', 'Happy', 'Jolly', 'Jumpy', 'Keen', 'Kind', 'Lively', 'Loyal',
    'Magic', 'Merry', 'Mega', 'Misty', 'Nifty', 'Noble', 'Peppy', 'Plucky', 'Polar', 'Quick',
    'Quiet', 'Rapid', 'Royal', 'Shiny', 'Silver', 'Snappy', 'Snowy', 'Sparky', 'Speedy', 'Starry',
    'Steady', 'Stormy', 'Super', 'Turbo', 'Ultra', 'Witty', 'Zany', 'Zesty', 'Zippy', 'Wise',
    'Neon', 'Lunar', 'Solar', 'Crystal', 'Atomic', 'Blazing', 'Chill', 'Dazzling', 'Electric', 'Flying',
    'Glowing', 'Hidden', 'Icy', 'Jazzy', 'Laser', 'Mystic', 'Ocean', 'Pixel', 'Radiant', 'Thunder'
  ]::text[]
$$;

create or replace function leaderboard_second_words()
returns text[] language sql immutable as $$
  select array[
    'Comet', 'Otter', 'Falcon', 'Rocket', 'Panda', 'Tiger', 'Dragon', 'Phoenix', 'Badger', 'Beaver',
    'Bison', 'Cheetah', 'Dolphin', 'Eagle', 'Fox', 'Gecko', 'Hawk', 'Koala', 'Lemur', 'Lion',
    'Llama', 'Lynx', 'Meteor', 'Narwhal', 'Ocelot', 'Owl', 'Parrot', 'Penguin', 'Puffin', 'Quokka',
    'Rabbit', 'Raven', 'Robin', 'Rover', 'Seal', 'Shark', 'Sloth', 'Sparrow', 'Squid', 'Star',
    'Storm', 'Swan', 'Turtle', 'Walrus', 'Whale', 'Wizard', 'Wolf', 'Yak', 'Zebra', 'Galaxy',
    'Planet', 'Nova', 'Glacier', 'Volcano', 'Breeze', 'Pebble', 'Maple', 'Acorn', 'Cactus', 'Rhino',
    'Moose', 'Pilot', 'Ranger', 'Knight', 'Ninja', 'Robot', 'Panther', 'Orbit', 'Jaguar', 'Hedgehog',
    'Kiwi', 'Mango', 'Muffin', 'Pancake', 'Pretzel', 'Waffle', 'Yeti', 'Unicorn', 'Griffin', 'Kraken'
  ]::text[]
$$;

/** The countries a parent may pick (src/data/countries.js). ISO 3166-1 codes. */
create or replace function leaderboard_country_ok(p_code text)
returns boolean language sql immutable as $$
  select coalesce(p_code = any (array[
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
    'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR',
    'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM',
    'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
    'EC', 'EE', 'EG', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD',
    'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GT', 'GU', 'GW', 'GY',
    'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IQ', 'IR', 'IS', 'IT', 'JE',
    'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA',
    'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF',
    'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
    'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
    'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA',
    'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SK', 'SL',
    'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TG', 'TH', 'TJ',
    'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ',
    'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
  ]::text[]), false)
$$;

/** Every board and the periods it has. The same list as BOARDS in src/data/leaderboards.js. */
create or replace function leaderboard_boards()
returns table (board text, period text) language sql immutable as $$
  values ('chores', 'week'), ('chores', 'month'), ('chores', 'all'),
         ('xp', 'week'), ('xp', 'month'), ('xp', 'all'),
         ('level', 'all'), ('streak_best', 'all'), ('streak_now', 'all'),
         ('badges', 'all'), ('seasons', 'all'), ('rising', 'week'),
         ('arcade', 'week'), ('arcade', 'month'), ('arcade', 'all'),
         ('guilds', 'week')
$$;

/** Which scopes a board has: guilds race guilds, worldwide and by country. */
create or replace function leaderboard_scope_ok(p_board text, p_scope text)
returns boolean language sql immutable as $$
  select case when p_board = 'guilds' then p_scope in ('world', 'country')
              else p_scope in ('world', 'country', 'guild', 'family') end
$$;

/*
 * No level is worked out in the database (tests/guarantees.mjs holds the
 * repository to one curve, in src/lib/xp.js). The "Highest level" board ranks
 * by the XP behind the level, and each phone turns that XP into a level.
 * (Dropped below in case a development database still has an early draft's.)
 */
drop function if exists leaderboard_level(bigint);

/** "2026-W46", "2026-11" or "all": which week or month a moment is in, in UTC. */
create or replace function leaderboard_period_key(p_period text, p_at timestamptz default now())
returns text language sql stable as $$
  select case p_period
           when 'week'  then to_char(date_trunc('week', p_at at time zone 'UTC'), 'IYYY-"W"IW')
           when 'month' then to_char(p_at at time zone 'UTC', 'YYYY-MM')
           else 'all' end
$$;

/** When this week or month ends and the board starts again, in UTC. */
create or replace function leaderboard_resets_at(p_period text, p_at timestamptz default now())
returns timestamptz language sql stable as $$
  select case p_period
           when 'week'  then (date_trunc('week', p_at at time zone 'UTC') + interval '7 days') at time zone 'UTC'
           when 'month' then (date_trunc('month', p_at at time zone 'UTC') + interval '1 month') at time zone 'UTC'
           else null end
$$;

/** A nickname made of three random pieces. */
create or replace function leaderboard_random_nickname()
returns text language sql volatile as $$
  select w1[1 + floor(random() * cardinality(w1))::int]
      || w2[1 + floor(random() * cardinality(w2))::int]
      || lpad(floor(random() * 100)::int::text, 2, '0')
    from (select leaderboard_first_words() as w1, leaderboard_second_words() as w2) w
$$;

/** Is this a nickname built from the lists: a first word, a second word, two digits? */
create or replace function leaderboard_nickname_ok(p_name text)
returns boolean language plpgsql immutable as $$
declare v_parts text[];
begin
  if p_name is null or length(p_name) > 40 then return false; end if;
  v_parts := regexp_match(p_name, '^([A-Z][a-z]+)([A-Z][a-z]+)([0-9]{2})$');
  return v_parts is not null
     and v_parts[1] = any (leaderboard_first_words())
     and v_parts[2] = any (leaderboard_second_words());
end $$;

/** A guild's name on a public board: made from the word lists, never what a parent typed. */
create or replace function leaderboard_guild_name(p_guild_id uuid)
returns text language sql immutable as $$
  select 'Team ' || w1[1 + ((hashtext(p_guild_id::text)::bigint % cardinality(w1)) + cardinality(w1)) % cardinality(w1)]
       || w2[1 + ((hashtext(p_guild_id::text || '/2')::bigint % cardinality(w2)) + cardinality(w2)) % cardinality(w2)]
    from (select leaderboard_first_words() as w1, leaderboard_second_words() as w2) w
$$;

-- ---------------------------------------------------------------------------
-- Tables. Row level security on, and no policy on any of them: a browser
-- reaches them only through the functions below, which check who is asking.
-- ---------------------------------------------------------------------------

/** One per child who has opened the leaderboards or been set up by a parent. */
create table if not exists leaderboard_profiles (
  kid_id          uuid primary key references kids(id) on delete cascade,
  family_id       uuid not null references families(id) on delete cascade,
  -- Adventure (the default): on no public board. Arena: on the worldwide and
  -- country boards, by nickname. Only a parent turns Arena on.
  mode            text not null default 'adventure' check (mode in ('adventure', 'arena')),
  nickname        text not null check (leaderboard_nickname_ok(nickname)),
  name_changed_at timestamptz,
  arena_since     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists leaderboard_profiles_family_idx on leaderboard_profiles (family_id);
create index if not exists leaderboard_profiles_arena_idx on leaderboard_profiles (kid_id) where mode = 'arena';
alter table leaderboard_profiles enable row level security;
revoke all on leaderboard_profiles from public, anon, authenticated;

/** The family's country for the "My country" boards, picked by a parent from the list. */
create table if not exists leaderboard_families (
  family_id  uuid primary key references families(id) on delete cascade,
  country    text check (country is null or leaderboard_country_ok(country)),
  updated_at timestamptz not null default now()
);
alter table leaderboard_families enable row level security;
revoke all on leaderboard_families from public, anon, authenticated;

/** Every child's numbers, as of the last refresh. Family and guild boards read these. */
create table if not exists leaderboard_kid_stats (
  kid_id       uuid primary key references kids(id) on delete cascade,
  family_id    uuid not null references families(id) on delete cascade,
  week_key     text not null,
  month_key    text not null,
  chores_week  int not null default 0,
  chores_month int not null default 0,
  chores_all   int not null default 0,
  xp_week      bigint not null default 0,
  xp_month     bigint not null default 0,
  xp_all       bigint not null default 0,
  xp_last_week bigint not null default 0,
  streak_best  int not null default 0,
  streak_now   int not null default 0,
  badges       int not null default 0,
  seasons      int not null default 0,
  arcade_week  jsonb not null default '{}'::jsonb,
  arcade_month jsonb not null default '{}'::jsonb,
  arcade_all   jsonb not null default '{}'::jsonb,
  computed_at  timestamptz not null default now()
);
create index if not exists leaderboard_kid_stats_family_idx on leaderboard_kid_stats (family_id);
-- Only XP is kept; a phone works out the level (see above).
alter table leaderboard_kid_stats drop column if exists level;
alter table leaderboard_kid_stats enable row level security;
revoke all on leaderboard_kid_stats from public, anon, authenticated;

/**
 * The public boards, ranked: every Arena child with something to show, on
 * each board, worldwide and in their country; and the guilds. The top of a
 * board is its first rows by rank; a child's own place is their own row.
 */
create table if not exists leaderboard_ranks (
  id         bigserial primary key,
  board      text not null,
  period     text not null,
  game       text not null default '',
  scope      text not null check (scope in ('world', 'country')),
  scope_key  text not null default '',
  period_key text not null,
  kid_id     uuid references kids(id) on delete cascade,
  guild_id   uuid references guilds(id) on delete cascade,
  rank       int not null,
  score      numeric not null,
  shown      bigint not null,
  -- The rank at the first refresh of this UTC day, for the arrows.
  base_rank  int,
  base_day   date,
  detail     jsonb,
  check ((kid_id is null) <> (guild_id is null))
);
create index if not exists leaderboard_ranks_page_idx
  on leaderboard_ranks (board, period, game, scope, scope_key, period_key, rank);
create index if not exists leaderboard_ranks_kid_idx on leaderboard_ranks (kid_id);
create index if not exists leaderboard_ranks_guild_idx on leaderboard_ranks (guild_id);
alter table leaderboard_ranks enable row level security;
revoke all on leaderboard_ranks from public, anon, authenticated;

/** When the boards were last worked out, and how long it took. */
create table if not exists leaderboard_runs (
  id          int primary key default 1 check (id = 1),
  computed_at timestamptz,
  week_key    text,
  month_key   text,
  took_ms     int,
  kids        int,
  ranked      int
);
alter table leaderboard_runs enable row level security;
revoke all on leaderboard_runs from public, anon, authenticated;

/*
 * Chores accepted before 0.13.0 have no base_xp. They are counted as what
 * they paid, less the Elite boost if the family is on Elite now. That is an
 * estimate for those old rows only; every chore accepted since stores its
 * own. Cheap to re-run: only rows still empty are touched.
 */
update submissions s
   set base_xp = case when effective_tier(s.family_id) = 'elite'
                      then round(coalesce(s.awarded_xp, 0) / 1.5)::int
                      else coalesce(s.awarded_xp, 0) end
 where s.status = 'approved' and s.base_xp is null;

-- ---------------------------------------------------------------------------
-- What a child's numbers come to, for one board.
-- ---------------------------------------------------------------------------

/**
 * One child's score on one board, and what is shown for it ("Highest level"
 * is ranked and shown by the XP behind it; the phone shows the level). A week or month the
 * stats were not counted in is zero: a board resets at the boundary itself,
 * not at the next refresh.
 */
create or replace function leaderboard_metric(st leaderboard_kid_stats, p_board text, p_period text, p_game text,
                                              p_week_key text, p_month_key text)
returns table (score numeric, shown bigint) language sql stable as $$
  select coalesce(v.s, 0)::numeric, coalesce(v.s, 0)::bigint from (
    select case
             when p_period = 'week' and st.week_key is distinct from p_week_key then 0
             when p_period = 'month' and st.month_key is distinct from p_month_key then 0
             else case p_board || ':' || p_period
               when 'chores:week'      then st.chores_week
               when 'chores:month'     then st.chores_month
               when 'chores:all'       then st.chores_all
               when 'xp:week'          then st.xp_week
               when 'xp:month'         then st.xp_month
               when 'xp:all'           then st.xp_all
               when 'level:all'        then st.xp_all
               when 'streak_best:all'  then st.streak_best
               when 'streak_now:all'   then st.streak_now
               when 'badges:all'       then st.badges
               when 'seasons:all'      then st.seasons
               when 'rising:week'      then greatest(0, st.xp_week - st.xp_last_week)
               when 'arcade:week'      then (st.arcade_week ->> p_game)::numeric
               when 'arcade:month'     then (st.arcade_month ->> p_game)::numeric
               when 'arcade:all'       then (st.arcade_all ->> p_game)::numeric
             end end::numeric as s
  ) v
$$;

-- ---------------------------------------------------------------------------
-- The scheduled job.
-- ---------------------------------------------------------------------------

/**
 * Work out every child's numbers, then rank every Arena child and guild.
 *
 * Called by api/refresh-leaderboards.js with the service key every ten
 * minutes; never from a browser. One transaction, so a board being opened
 * meanwhile sees the previous ranking whole, never half of each. Two runs at
 * once: the second steps aside. p_now is for the tests, which move the clock
 * across a week's and a month's end.
 */
create or replace function refresh_leaderboards(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t0        timestamptz := clock_timestamp();
  v_today     date := (p_now at time zone 'UTC')::date;
  v_week_ts   timestamptz := date_trunc('week', p_now at time zone 'UTC') at time zone 'UTC';
  v_month_ts  timestamptz := date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC';
  v_last_ts   timestamptz := (date_trunc('week', p_now at time zone 'UTC') - interval '7 days') at time zone 'UTC';
  v_wk        text := leaderboard_period_key('week', p_now);
  v_mk        text := leaderboard_period_key('month', p_now);
  v_kids      int;
  v_ranked    int;
  v_took      int;
  v_first     boolean;
begin
  if not pg_try_advisory_xact_lock(hashtext('refresh_leaderboards')) then
    return jsonb_build_object('ok', true, 'skipped', 'already_running');
  end if;
  -- The very first ranking has nothing to compare with: nobody is "new".
  v_first := not exists (select 1 from leaderboard_ranks);

  -- ---------- every child's numbers ----------
  insert into leaderboard_kid_stats as t (
    kid_id, family_id, week_key, month_key, chores_week, chores_month, chores_all,
    xp_week, xp_month, xp_all, xp_last_week, streak_best, streak_now, badges, seasons,
    arcade_week, arcade_month, arcade_all, computed_at)
  with counted as (
    -- Accepted chores, the first school_daily_chores() of each UTC day only,
    -- each worth its XP before the Elite boost, at most the per-chore cap.
    select c.kid_id, c.at, c.x from (
      select s.kid_id, s.decided_at as at,
             least(greatest(coalesce(s.base_xp, s.awarded_xp, 0), 0), leaderboard_xp_per_chore()) as x,
             row_number() over (partition by s.kid_id, (s.decided_at at time zone 'UTC')::date
                                order by s.decided_at, s.id) as n
        from submissions s
       where s.status = 'approved' and s.decided_at is not null and s.decided_at <= p_now
    ) c
    where c.n <= school_daily_chores()
  ), done as (
    select kid_id,
           count(*) filter (where at >= v_week_ts)  as cw,
           count(*) filter (where at >= v_month_ts) as cm,
           count(*)                                 as ca,
           coalesce(sum(x) filter (where at >= v_week_ts), 0)  as xw,
           coalesce(sum(x) filter (where at >= v_month_ts), 0) as xm,
           coalesce(sum(x), 0)                                 as xa,
           coalesce(sum(x) filter (where at >= v_last_ts and at < v_week_ts), 0) as xl
      from counted group by kid_id
  ), shelf as (
    -- What the badge shelf is counted from (src/data/badges.js), here from
    -- the server's own rows.
    select s.kid_id, count(*) as n, count(distinct q.category) as cats,
           count(*) filter (where q.timer_seconds > 0 and s.on_time is not false) as clock,
           count(*) filter (where q.difficulty = 'boss') as boss,
           max(coalesce(s.test_score, 0)) as best_test,
           count(*) filter (where not coalesce(q.redo_count, 0) > 0) as clean
      from submissions s join quests q on q.id = s.quest_id
     where s.status = 'approved'
     group by s.kid_id
  ), spent as (
    select kid_id, count(*) as n from redemptions group by kid_id
  ), picked as (
    select kid_id, count(*) as n from theme_submissions where status = 'picked' group by kid_id
  ), played as (
    -- The arcade's scores, as play_minigame recorded them (clamped, held to
    -- what the game allows in the time played).
    select kid_id,
           jsonb_object_agg(game, w) filter (where w > 0) as aw,
           jsonb_object_agg(game, m) filter (where m > 0) as am
      from (select e.kid_id, e.meta->>'game' as game,
                   max((e.meta->>'score')::int) filter (where e.created_at >= v_week_ts)  as w,
                   max((e.meta->>'score')::int) filter (where e.created_at >= v_month_ts) as m
              from events e
             where e.type = 'minigame_played' and e.kid_id is not null and e.meta ? 'game'
               and e.created_at >= least(v_week_ts, v_month_ts) and e.created_at <= p_now
             group by 1, 2) g
     group by kid_id
  )
  select k.id, k.family_id, v_wk, v_mk,
         coalesce(d.cw, 0), coalesce(d.cm, 0), coalesce(d.ca, 0),
         coalesce(d.xw, 0), coalesce(d.xm, 0), coalesce(d.xa, 0), coalesce(d.xl, 0),
         greatest(k.streak_best, k.streak_count),
         -- A streak still alive on the family's own day; a lapsed one is none.
         case when k.streak_last_day is null then 0
              when k.streak_last_day >= z.today - 1 then k.streak_count
              when k.streak_last_day = z.today - 2 and k.streak_freezes >= 1 then k.streak_count
              else 0 end,
         (coalesce(sh.n, 0) >= 1)::int + (coalesce(sh.n, 0) >= 10)::int + (coalesce(sh.n, 0) >= 50)::int
           + (coalesce(sh.n, 0) >= 100)::int
           + (k.streak_count >= 3)::int + (k.streak_count >= 7)::int + (k.streak_count >= 30)::int
           -- "Level five" and "Level twenty": the XP those levels start at
           -- (totalXpForLevel(5) and (20) in src/lib/xp.js; tests/leaderboardwords.mjs).
           + (k.xp >= 392)::int + (k.xp >= 3572)::int
           + (coalesce(sh.cats, 0) >= 5)::int + (coalesce(sh.clock, 0) >= 5)::int
           + (coalesce(sh.boss, 0) >= 3)::int + (coalesce(sh.best_test, 0) >= 90)::int
           + (coalesce(sh.clean, 0) >= 10)::int + (k.coins >= 200)::int + (coalesce(sp.n, 0) >= 1)::int,
         coalesce(pk.n, 0),
         coalesce(pl.aw, '{}'::jsonb), coalesce(pl.am, '{}'::jsonb),
         coalesce((select jsonb_object_agg(b.key, b.value) from jsonb_each(k.best_scores) b
                    where jsonb_typeof(b.value) = 'number' and b.value::text::numeric > 0), '{}'::jsonb),
         p_now
    from kids k
    join families f on f.id = k.family_id
    cross join lateral (select (p_now at time zone case when is_time_zone(f.timezone) then f.timezone else 'UTC' end)::date as today) z
    left join done d on d.kid_id = k.id
    left join shelf sh on sh.kid_id = k.id
    left join spent sp on sp.kid_id = k.id
    left join picked pk on pk.kid_id = k.id
    left join played pl on pl.kid_id = k.id
  on conflict (kid_id) do update set
    family_id = excluded.family_id, week_key = excluded.week_key, month_key = excluded.month_key,
    chores_week = excluded.chores_week, chores_month = excluded.chores_month, chores_all = excluded.chores_all,
    xp_week = excluded.xp_week, xp_month = excluded.xp_month, xp_all = excluded.xp_all,
    xp_last_week = excluded.xp_last_week, streak_best = excluded.streak_best,
    streak_now = excluded.streak_now, badges = excluded.badges, seasons = excluded.seasons,
    arcade_week = excluded.arcade_week, arcade_month = excluded.arcade_month, arcade_all = excluded.arcade_all,
    computed_at = excluded.computed_at;
  get diagnostics v_kids = row_count;

  -- ---------- the public boards: Arena children and their guilds ----------
  with prev as (
    delete from leaderboard_ranks returning *
  ), cand as (
    select b.board, b.period, ''::text as game, st.kid_id, null::uuid as guild_id,
           m.score, m.shown, lf.country, null::jsonb as detail
      from leaderboard_kid_stats st
      join leaderboard_profiles p on p.kid_id = st.kid_id and p.mode = 'arena'
      left join leaderboard_families lf on lf.family_id = st.family_id
      cross join leaderboard_boards() b
      cross join lateral leaderboard_metric(st, b.board, b.period, '', v_wk, v_mk) m
     where b.board not in ('arcade', 'guilds') and m.score > 0
    union all
    select 'arcade', per.period, g.key, st.kid_id, null::uuid,
           g.value::text::numeric, g.value::text::numeric::bigint, lf.country, null::jsonb
      from leaderboard_kid_stats st
      join leaderboard_profiles p on p.kid_id = st.kid_id and p.mode = 'arena'
      left join leaderboard_families lf on lf.family_id = st.family_id
      cross join lateral (values ('week', st.arcade_week), ('month', st.arcade_month), ('all', st.arcade_all)) per(period, j)
      cross join lateral jsonb_each(per.j) g
     where jsonb_typeof(g.value) = 'number' and g.value::text::numeric > 0
       and minigame_floor_ms(g.key) is not null
    union all
    -- A guild is ranked by its members' average this week, so a ten-seat
    -- Elite guild cannot win on size alone. On a public board only when
    -- every child in it is in Arena.
    select 'guilds', 'week', '', null::uuid, gm.guild_id,
           round(avg(coalesce(st.xp_week, 0))), sum(coalesce(st.xp_week, 0))::bigint, gf.country,
           -- Numbers only: not the crest either, which a parent can type.
           jsonb_build_object('members', count(*), 'goal', max(g.weekly_goal_xp),
                              'total', sum(coalesce(st.xp_week, 0)))
      from guild_members gm
      join guilds g on g.id = gm.guild_id
      left join leaderboard_kid_stats st on st.kid_id = gm.kid_id
      left join leaderboard_profiles p on p.kid_id = gm.kid_id
      left join leaderboard_families gf on gf.family_id = g.owner_family_id
     where gm.status = 'active'
     group by gm.guild_id, gf.country
    having bool_and(coalesce(p.mode, 'adventure') = 'arena') and sum(coalesce(st.xp_week, 0)) > 0
  ), scoped as (
    select c.*, s.scope, s.scope_key
      from cand c
      cross join lateral (values ('world', ''), ('country', c.country)) s(scope, scope_key)
     where s.scope_key is not null
  ), ranked as (
    select sc.*, rank() over (partition by sc.board, sc.period, sc.game, sc.scope, sc.scope_key
                              order by sc.score desc) as rk,
           case sc.period when 'week' then v_wk when 'month' then v_mk else 'all' end as pk
      from scoped sc
  )
  insert into leaderboard_ranks (board, period, game, scope, scope_key, period_key, kid_id, guild_id,
                                 rank, score, shown, base_rank, base_day, detail)
  select r.board, r.period, r.game, r.scope, r.scope_key, r.pk, r.kid_id, r.guild_id,
         r.rk, r.score, r.shown,
         case when o.id is null then case when v_first then r.rk end
              when o.base_day = v_today then o.base_rank else o.rank end,
         v_today, r.detail
    from ranked r
    left join prev o on o.board = r.board and o.period = r.period and o.game = r.game
                   and o.scope = r.scope and o.scope_key = r.scope_key and o.period_key = r.pk
                   and coalesce(o.kid_id, o.guild_id) = coalesce(r.kid_id, r.guild_id);
  get diagnostics v_ranked = row_count;

  v_took := round(extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
  insert into leaderboard_runs (id, computed_at, week_key, month_key, took_ms, kids, ranked)
  values (1, p_now, v_wk, v_mk, v_took, v_kids, v_ranked)
  on conflict (id) do update set computed_at = excluded.computed_at, week_key = excluded.week_key,
    month_key = excluded.month_key, took_ms = excluded.took_ms, kids = excluded.kids, ranked = excluded.ranked;

  return jsonb_build_object('ok', true, 'kids', v_kids, 'ranked', v_ranked, 'took_ms', v_took,
                            'week', v_wk, 'month', v_mk);
end $$;

-- ---------------------------------------------------------------------------
-- Profiles, modes, nicknames and the country.
-- ---------------------------------------------------------------------------

/** This child's profile, made on first use with a random nickname, in Adventure. */
create or replace function leaderboard_profile_for(p_kid_id uuid)
returns leaderboard_profiles language plpgsql security definer set search_path = public as $$
declare v leaderboard_profiles;
begin
  select * into v from leaderboard_profiles where kid_id = p_kid_id;
  if found then return v; end if;
  insert into leaderboard_profiles (kid_id, family_id, nickname)
  select id, family_id, leaderboard_random_nickname() from kids where id = p_kid_id
  on conflict (kid_id) do nothing;
  select * into v from leaderboard_profiles where kid_id = p_kid_id;
  return v;
end $$;

/** Off every public board, now: the child's own rows, and any guild of theirs. */
create or replace function leaderboard_forget(p_kid_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from leaderboard_ranks
   where kid_id = p_kid_id
      or guild_id in (select guild_id from guild_members where kid_id = p_kid_id);
$$;

/** What the child's phone shows about their leaderboard self. */
create or replace function leaderboard_me(p_kid_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v leaderboard_profiles;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  v := leaderboard_profile_for(p_kid_id);
  return jsonb_build_object(
    'ok', true,
    'mode', v.mode,
    'nickname', v.nickname,
    'arena_since', v.arena_since,
    'can_rename', v.name_changed_at is null or v.name_changed_at <= now() - interval '7 days',
    'rename_at', case when v.name_changed_at > now() - interval '7 days'
                      then v.name_changed_at + interval '7 days' end,
    'country', (select country from leaderboard_families where family_id = v.family_id),
    'computed_at', (select computed_at from leaderboard_runs where id = 1));
end $$;

/**
 * A new nickname, from the pieces: a first word, a second word and a number
 * from 0 to 99. Nothing else is accepted. Once a week, so the boards stay
 * readable; the first change after the random one is free.
 */
create or replace function set_leaderboard_nickname(p_kid_id uuid, p_first text, p_second text, p_number int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v leaderboard_profiles;
  v_name text;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  if p_first is null or p_second is null or p_number is null or p_number not between 0 and 99
     or not (p_first = any (leaderboard_first_words())) or not (p_second = any (leaderboard_second_words())) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_list');
  end if;
  v_name := p_first || p_second || lpad(p_number::text, 2, '0');

  perform leaderboard_profile_for(p_kid_id);
  select * into v from leaderboard_profiles where kid_id = p_kid_id for update;
  if v.nickname = v_name then
    return jsonb_build_object('ok', true, 'nickname', v_name);
  end if;
  if v.name_changed_at > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'name_cooldown',
                              'rename_at', v.name_changed_at + interval '7 days');
  end if;
  update leaderboard_profiles set nickname = v_name, name_changed_at = now() where kid_id = p_kid_id;
  return jsonb_build_object('ok', true, 'nickname', v_name);
end $$;

/**
 * Adventure or Arena.
 *
 * Arena only by a parent of the child's family. Adventure by a parent or by
 * the child themselves: the safer way never needs asking. Going to
 * Adventure takes the child off every public board in this call.
 */
create or replace function set_leaderboard_mode(p_kid_id uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v leaderboard_profiles;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  if p_mode is null or p_mode not in ('adventure', 'arena') then
    return jsonb_build_object('ok', false, 'reason', 'no_mode');
  end if;
  v := leaderboard_profile_for(p_kid_id);

  if p_mode = 'arena' then
    if not exists (select 1 from parents where user_id = auth.uid() and family_id = v.family_id and role = 'parent') then
      return jsonb_build_object('ok', false, 'reason', 'parent_only');
    end if;
    update leaderboard_profiles
       set mode = 'arena', arena_since = case when mode = 'arena' then arena_since else now() end
     where kid_id = p_kid_id;
  else
    update leaderboard_profiles set mode = 'adventure', arena_since = null where kid_id = p_kid_id;
    perform leaderboard_forget(p_kid_id);
  end if;
  return jsonb_build_object('ok', true, 'mode', p_mode);
end $$;

/** The family's country for the "My country" boards: one from the list, or none. Parents only. */
create or replace function set_leaderboard_country(p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid;
  v_code   text := nullif(upper(trim(left(coalesce(p_country, ''), 8))), '');
begin
  select family_id into v_family from parents where user_id = auth.uid() and role = 'parent';
  if v_family is null then raise exception 'only a parent can set the country'; end if;
  if v_code is not null and not leaderboard_country_ok(v_code) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_country');
  end if;
  insert into leaderboard_families (family_id, country, updated_at) values (v_family, v_code, now())
  on conflict (family_id) do update set country = excluded.country, updated_at = now();
  -- Off the old country's boards at once; on the new one at the next refresh.
  delete from leaderboard_ranks
   where scope = 'country'
     and (kid_id in (select id from kids where family_id = v_family)
          or guild_id in (select id from guilds where owner_family_id = v_family));
  return jsonb_build_object('ok', true, 'country', v_code);
end $$;

/** For the parent's Arena screen: every child's mode and nickname, and the country. */
create or replace function leaderboard_family_settings()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid() and role = 'parent';
  if v_family is null then raise exception 'only a parent can see this'; end if;
  perform leaderboard_profile_for(k.id) from kids k where k.family_id = v_family;
  return jsonb_build_object(
    'ok', true,
    'country', (select country from leaderboard_families where family_id = v_family),
    'kids', coalesce((
      select jsonb_agg(jsonb_build_object('kid_id', k.id, 'name', k.name, 'mode', p.mode,
                                          'nickname', p.nickname, 'arena_since', p.arena_since)
                       order by k.created_at, k.name)
        from kids k join leaderboard_profiles p on p.kid_id = k.id
       where k.family_id = v_family), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Opening a board.
-- ---------------------------------------------------------------------------

/**
 * One board, as this child may see it: the top 50 and their own place.
 *
 * Worldwide and country boards only for a child in Arena, from the stored
 * ranking, by nickname and flag; an Adventure child is told so. Family and
 * guild boards from the stored numbers, by the names the family and the
 * guild already see, among people the family approved.
 */
create or replace function leaderboard_board(p_kid_id uuid, p_board text, p_period text, p_scope text,
                                             p_game text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kid     kids;
  v_prof    leaderboard_profiles;
  v_country text;
  v_game    text := case when p_board = 'arcade' then coalesce(left(p_game, 20), '') else '' end;
  v_key     text := leaderboard_period_key(p_period);
  v_wk      text := leaderboard_period_key('week');
  v_mk      text := leaderboard_period_key('month');
  v_guild   uuid;
  v_rows    jsonb;
  v_me      jsonb;
  v_total   int;
  v_mine    record;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  if not exists (select 1 from leaderboard_boards() b where b.board = p_board and b.period = p_period)
     or not leaderboard_scope_ok(p_board, p_scope)
     or (p_board = 'arcade' and minigame_floor_ms(v_game) is null) then
    return jsonb_build_object('ok', false, 'reason', 'no_board');
  end if;

  select * into v_kid from kids where id = p_kid_id;
  v_prof := leaderboard_profile_for(p_kid_id);
  select country into v_country from leaderboard_families where family_id = v_kid.family_id;
  select guild_id into v_guild from guild_members
   where kid_id = p_kid_id and status = 'active' order by requested_at desc limit 1;

  if p_scope in ('world', 'country') then
    if v_prof.mode <> 'arena' then
      return jsonb_build_object('ok', false, 'reason', 'adventure');
    end if;
    if p_scope = 'country' and v_country is null then
      return jsonb_build_object('ok', false, 'reason', 'no_country');
    end if;

    select coalesce(jsonb_agg(x.j order by x.rank, x.id), '[]'::jsonb) into v_rows from (
      select r.rank, r.id, jsonb_build_object(
               'rank', r.rank,
               'name', coalesce(p.nickname, leaderboard_guild_name(r.guild_id)),
               'country', coalesce(lf.country, gf.country),
               'score', r.shown,
               'xp', st.xp_all,
               'change', r.base_rank - r.rank,
               'is_new', r.base_rank is null,
               'guild', r.guild_id is not null,
               'detail', r.detail,
               'you', r.kid_id = p_kid_id or (r.guild_id is not null and r.guild_id = v_guild)) as j
        from leaderboard_ranks r
        left join leaderboard_profiles p on p.kid_id = r.kid_id
        left join leaderboard_families lf on lf.family_id = p.family_id
        left join leaderboard_kid_stats st on st.kid_id = r.kid_id
        left join guilds g on g.id = r.guild_id
        left join leaderboard_families gf on gf.family_id = g.owner_family_id
       where r.board = p_board and r.period = p_period and r.game = v_game and r.scope = p_scope
         and r.scope_key = case when p_scope = 'country' then v_country else '' end
         and r.period_key = v_key
         and (r.guild_id is not null or p.mode = 'arena')
       order by r.rank, r.id
       limit 50) x;

    select count(*) into v_total from leaderboard_ranks r
     where r.board = p_board and r.period = p_period and r.game = v_game and r.scope = p_scope
       and r.scope_key = case when p_scope = 'country' then v_country else '' end and r.period_key = v_key;

    select r.rank, r.shown, r.base_rank into v_mine from leaderboard_ranks r
     where r.board = p_board and r.period = p_period and r.game = v_game and r.scope = p_scope
       and r.scope_key = case when p_scope = 'country' then v_country else '' end and r.period_key = v_key
       and (case when p_board = 'guilds' then r.guild_id = v_guild else r.kid_id = p_kid_id end)
     limit 1;
    v_me := jsonb_build_object(
      'rank', v_mine.rank,
      'score', coalesce(v_mine.shown, (select m.shown from leaderboard_kid_stats st
                                        cross join lateral leaderboard_metric(st, p_board, p_period, v_game, v_wk, v_mk) m
                                        where st.kid_id = p_kid_id and p_board <> 'guilds')),
      'change', v_mine.base_rank - v_mine.rank,
      'name', case when p_board = 'guilds' then leaderboard_guild_name(v_guild) else v_prof.nickname end,
      'in_guild', v_guild is not null);
  else
    if p_scope = 'guild' and v_guild is null then
      return jsonb_build_object('ok', false, 'reason', 'not_a_member');
    end if;
    -- People the family already sees: their own children, or the guild's
    -- members as its roster shows them.
    with members as (
      select k.id, k.name from kids k
       where p_scope = 'family' and k.family_id = v_kid.family_id
      union all
      select k.id, k.name from guild_members gm join kids k on k.id = gm.kid_id
       where p_scope = 'guild' and gm.guild_id = v_guild and gm.status = 'active'
    ), scored as (
      select mb.id, mb.name, coalesce(m.score, 0) as score, coalesce(m.shown, 0) as shown,
             coalesce(st.xp_all, 0) as xp
        from members mb
        left join leaderboard_kid_stats st on st.kid_id = mb.id
        left join lateral leaderboard_metric(st, p_board, p_period, v_game, v_wk, v_mk) m on true
    ), ranked as (
      select s.*, rank() over (order by s.score desc) as rk from scored s
    )
    select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'name', name, 'score', shown, 'xp', xp,
                                                 'you', id = p_kid_id) order by rk, name), '[]'::jsonb),
           count(*),
           (select jsonb_build_object('rank', r2.rk, 'score', r2.shown, 'name', r2.name)
              from ranked r2 where r2.id = p_kid_id)
      into v_rows, v_total, v_me
      from ranked;
  end if;

  return jsonb_build_object(
    'ok', true, 'board', p_board, 'period', p_period, 'scope', p_scope, 'game', v_game,
    'country', v_country, 'mode', v_prof.mode,
    'rows', v_rows, 'me', v_me, 'total', v_total,
    'period_key', v_key, 'resets_at', leaderboard_resets_at(p_period),
    'computed_at', (select computed_at from leaderboard_runs where id = 1));
end $$;

/** For "Download my data": each child's mode and nickname, and the country. Called by export_family_data. */
create or replace function export_family_leaderboard_data(p_family uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'country', (select country from leaderboard_families where family_id = p_family),
    'children', coalesce((select jsonb_agg(jsonb_build_object('kid_id', p.kid_id, 'mode', p.mode,
                                                              'nickname', p.nickname,
                                                              'nickname_changed_at', p.name_changed_at,
                                                              'arena_since', p.arena_since))
                            from leaderboard_profiles p where p.family_id = p_family), '[]'::jsonb))
$$;

-- What a browser may call: each checks who is asking first.
grant execute on function leaderboard_me(uuid) to anon, authenticated;
grant execute on function set_leaderboard_nickname(uuid, text, text, int) to anon, authenticated;
grant execute on function set_leaderboard_mode(uuid, text) to anon, authenticated;
grant execute on function set_leaderboard_country(text) to authenticated;
grant execute on function leaderboard_family_settings() to authenticated;
grant execute on function leaderboard_board(uuid, text, text, text, text) to anon, authenticated;

-- The server's alone: the job ranks every family at once, and the helpers
-- below take any child's id without asking who is calling.
revoke execute on function refresh_leaderboards(timestamptz) from public, anon, authenticated;
revoke execute on function leaderboard_profile_for(uuid) from public, anon, authenticated;
revoke execute on function leaderboard_forget(uuid) from public, anon, authenticated;
revoke execute on function export_family_leaderboard_data(uuid) from public, anon, authenticated;
revoke execute on function leaderboard_metric(leaderboard_kid_stats, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function leaderboard_random_nickname() from public, anon, authenticated;
revoke execute on function leaderboard_xp_per_chore() from public, anon, authenticated;
revoke execute on function leaderboard_first_words() from public, anon, authenticated;
revoke execute on function leaderboard_second_words() from public, anon, authenticated;
revoke execute on function leaderboard_country_ok(text) from public, anon, authenticated;
revoke execute on function leaderboard_boards() from public, anon, authenticated;
revoke execute on function leaderboard_scope_ok(text, text) from public, anon, authenticated;
revoke execute on function leaderboard_period_key(text, timestamptz) from public, anon, authenticated;
revoke execute on function leaderboard_resets_at(text, timestamptz) from public, anon, authenticated;
revoke execute on function leaderboard_nickname_ok(text) from public, anon, authenticated;
revoke execute on function leaderboard_guild_name(uuid) from public, anon, authenticated;
