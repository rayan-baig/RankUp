-- ---------------------------------------------------------------------------
-- The leaderboard job stays quick with many families.
--
-- 2,000 families, 4,000 children, 120,000 accepted chores or so and 40,000 arcade
-- rounds; half the children in Arena, in ten countries. refresh_leaderboards
-- ranks them all, and opening a board reads one stored page. The limits are
-- several times what a laptop takes, so a slow CI machine passes and a job
-- that has started ranking live, or reading every row per child, does not.
-- tools/loadtest.mjs --jobs times it on the load-test seed too.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email)
select ('53000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 't53-' || g || '@example.com'
  from generate_series(1, 2000) g;
insert into families (id, name, tier)
select ('53f00000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'T53 family ' || g,
       case when g % 3 = 0 then 'elite' else 'standard' end
  from generate_series(1, 2000) g;
insert into parents (user_id, family_id, name)
select ('53000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
       ('53f00000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'T53 parent'
  from generate_series(1, 2000) g;
insert into parental_consents (family_id, parent_id, version, method, signed_name)
select p.family_id, p.id, '2026-01', 'payment_card', 'T53' from parents p where p.name = 'T53 parent';
insert into kids (id, family_id, name, xp, streak_count, streak_last_day, best_scores)
select ('53c00000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
       ('53f00000-0000-4000-8000-' || lpad(to_hex((g + 1) / 2), 12, '0'))::uuid, 'T53 kid ' || g,
       g * 7, g % 20, current_date, jsonb_build_object('stack', g % 101, 'snake', (g * 3) % 101)
  from generate_series(1, 4000) g;
insert into quests (id, family_id, kid_id, title, xp, category, difficulty)
select ('53e00000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
       ('53f00000-0000-4000-8000-' || lpad(to_hex((g + 1) / 2), 12, '0'))::uuid,
       ('53c00000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'T53 chore', 30, 'kitchen', 'medium'
  from generate_series(1, 4000) g;
insert into submissions (family_id, quest_id, kid_id, status, decided_at, awarded_xp, base_xp)
select q.family_id, q.id, q.kid_id, 'approved', now() - make_interval(hours => (n * 13 + g) % 1400), 30, 30
  from quests q
  cross join lateral (select ('x' || substr(q.id::text, 25, 12))::bit(48)::bigint::int as g) z
  cross join generate_series(1, 45) n
 where q.title = 'T53 chore' and n <= 15 + (z.g * 7) % 31;
insert into events (family_id, kid_id, type, meta, created_at)
select k.family_id, k.id, 'minigame_played', jsonb_build_object('game', 'stack', 'score', (n * 17) % 101, 'coins', 1),
       now() - make_interval(hours => n * 30)
  from kids k cross join generate_series(1, 10) n where k.name like 'T53 kid %';
insert into leaderboard_profiles (kid_id, family_id, mode, nickname, arena_since)
select k.id, k.family_id, case when right(k.name, 1) in ('1', '3', '5', '7', '9') then 'arena' else 'adventure' end,
       leaderboard_random_nickname(), now()
  from kids k where k.name like 'T53 kid %';
insert into leaderboard_families (family_id, country)
select f.id, (array['GB', 'US', 'CA', 'AU', 'IE', 'NZ', 'IN', 'ZA', 'DE', 'FR'])[1 + (row_number() over (order by f.id))::int % 10]
  from families f where f.name like 'T53 family %';
analyze;

do $$
declare
  r jsonb;
  t0 timestamptz;
  ms numeric;
  n int;
begin
  t0 := clock_timestamp();
  r := refresh_leaderboards();
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice '  (the job: % children, % ranked rows, % ms)', r->>'kids', r->>'ranked', round(ms);
  perform ok('ranking 4,000 children and about 120,000 chores takes under 20 seconds', ms < 20000, round(ms) || ' ms');
  select count(*) into n from leaderboard_ranks where kid_id in (select kid_id from leaderboard_profiles where mode = 'adventure');
  perform ok('not one of the 2,000 Adventure children is on a public board', n = 0, n || ' are');
  perform ok('every Arena child with chores has a worldwide place on the chores board',
    (select count(*) from leaderboard_ranks r join kids k on k.id = r.kid_id
      where board = 'chores' and period = 'all' and scope = 'world' and k.name like 'T53 kid %')
    = (select count(*) from leaderboard_profiles p where p.mode = 'arena' and p.kid_id in (select id from kids where name like 'T53 kid %')));

  t0 := clock_timestamp();
  r := refresh_leaderboards();
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform ok('and again, over its own last run, as quickly', ms < 20000, round(ms) || ' ms');
end $$;

-- Opening a board: one stored page, by index, however many are ranked.
set role app_user;
do $$
declare
  r jsonb; t0 timestamptz; ms numeric; v_kid uuid; v_user uuid;
begin
  set local role postgres;
  select lr.kid_id into v_kid from leaderboard_ranks lr join kids k on k.id = lr.kid_id
   where lr.board = 'chores' and lr.period = 'all' and lr.scope = 'world' and k.name like 'T53 kid %'
   order by lr.rank desc limit 1;
  select pa.user_id into v_user from parents pa join kids k on k.family_id = pa.family_id where k.id = v_kid;
  set local role app_user;
  perform become(v_user);
  t0 := clock_timestamp();
  for i in 1 .. 20 loop
    r := leaderboard_board(v_kid, 'chores', 'all', 'world');
  end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  raise notice '  (opening a worldwide board: % ms)', round(ms, 1);
  perform ok('opening a worldwide board of 2,000 takes under 150 ms', ms < 150, round(ms, 1) || ' ms');
  perform ok('the top 50, and the child''s own place far below it',
    jsonb_array_length(r->'rows') = 50 and (r->'me'->>'rank')::int > 50, (r->'me')::text);
  r := leaderboard_board(v_kid, 'arcade', 'all', 'country', 'stack');
  perform ok('an arcade board by country', (r->>'ok')::boolean and jsonb_array_length(r->'rows') > 0, left(r::text, 200));
end $$;
reset role;

delete from leaderboard_ranks;
delete from families where name like 'T53 family %';
delete from auth.users where email like 't53-%@example.com';
