-- ---------------------------------------------------------------------------
-- The leaderboards (supabase/leaderboards.sql): Adventure and Arena.
--
--   * every child starts in Adventure, on no public board; only a parent
--     switches on Arena, and the child or a parent switches it off, at once;
--   * a child who is not in Arena never appears on a public board, in the
--     stored ranking or in what any caller is sent;
--   * boards rank correctly by period and scope, and reset on the UTC week's
--     and month's boundaries;
--   * the daily cap and the per-chore XP cap hold, and the Elite boost buys
--     nothing;
--   * nicknames only from the word lists, once a week; the country only from
--     its list;
--   * deleting a child, or withdrawing consent, takes them off every board.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('51a00000-0000-4000-8000-0000000000a1', 't51-parent-a@example.com'),
  ('51a00000-0000-4000-8000-0000000000a2', null),
  ('51b00000-0000-4000-8000-0000000000b1', 't51-parent-b@example.com'),
  ('51b00000-0000-4000-8000-0000000000b2', null),
  ('51c00000-0000-4000-8000-0000000000c1', 't51-parent-c@example.com'),
  ('51c00000-0000-4000-8000-0000000000c2', null);
insert into families (id, name, tier) values
  ('51a00000-0000-4000-8000-00000000000f', 'T51 Elite family', 'elite'),
  ('51b00000-0000-4000-8000-00000000000f', 'T51 Standard family', 'standard'),
  ('51c00000-0000-4000-8000-00000000000f', 'T51 Quiet family', 'standard');
insert into parents (user_id, family_id, name) values
  ('51a00000-0000-4000-8000-0000000000a1', '51a00000-0000-4000-8000-00000000000f', 'T51 Parent A'),
  ('51b00000-0000-4000-8000-0000000000b1', '51b00000-0000-4000-8000-00000000000f', 'T51 Parent B'),
  ('51c00000-0000-4000-8000-0000000000c1', '51c00000-0000-4000-8000-00000000000f', 'T51 Parent C');
select seed_consent('51a00000-0000-4000-8000-00000000000f', '51a00000-0000-4000-8000-0000000000a1');
select seed_consent('51b00000-0000-4000-8000-00000000000f', '51b00000-0000-4000-8000-0000000000b1');
select seed_consent('51c00000-0000-4000-8000-00000000000f', '51c00000-0000-4000-8000-0000000000c1');
-- Names that must never reach a public board.
insert into kids (id, family_id, user_id, name) values
  ('51a00000-0000-4000-8000-00000000000c', '51a00000-0000-4000-8000-00000000000f', '51a00000-0000-4000-8000-0000000000a2', 'Arabella Zephyr'),
  ('51b00000-0000-4000-8000-00000000000c', '51b00000-0000-4000-8000-00000000000f', '51b00000-0000-4000-8000-0000000000b2', 'Barnaby Quill'),
  ('51b00000-0000-4000-8000-00000000000d', '51b00000-0000-4000-8000-00000000000f', null, 'Delphine Quill'),
  ('51c00000-0000-4000-8000-00000000000c', '51c00000-0000-4000-8000-00000000000f', '51c00000-0000-4000-8000-0000000000c2', 'Cosimo Hush');

-- One quest per child; every accepted chore is a submission on it.
insert into quests (id, family_id, kid_id, title, xp)
select overlay(k.id::text placing 'e' from 25)::uuid, k.family_id, k.id, 'T51 chore', 30 from kids k where k.name in
  ('Arabella Zephyr', 'Barnaby Quill', 'Delphine Quill', 'Cosimo Hush');

/** Accepted chores for a child: n of them, from a moment, a second apart. */
create or replace function t51_done(p_kid uuid, p_at timestamptz, p_n int, p_paid int, p_base int)
returns void language sql as $$
  insert into submissions (family_id, quest_id, kid_id, status, decided_at, awarded_xp, base_xp)
  select k.family_id, overlay(k.id::text placing 'e' from 25)::uuid, k.id, 'approved',
         p_at + make_interval(secs => g), p_paid, p_base
    from kids k cross join generate_series(0, p_n - 1) g where k.id = p_kid;
$$;

-- The clock for this file: Wednesday 11 November 2026, noon UTC. The week
-- began Monday the 9th; the month on the 1st.
-- Arabella (Elite): three chores this week, paid 45 each with the boost but
-- worth 30 before it; one last week; one last month.
select t51_done('51a00000-0000-4000-8000-00000000000c', '2026-11-10 09:00+00', 3, 45, 30);
select t51_done('51a00000-0000-4000-8000-00000000000c', '2026-11-03 09:00+00', 1, 45, 30);
select t51_done('51a00000-0000-4000-8000-00000000000c', '2026-10-20 09:00+00', 1, 45, 30);
-- Barnaby (Standard): four this week at 30.
select t51_done('51b00000-0000-4000-8000-00000000000c', '2026-11-10 09:00+00', 4, 30, 30);
-- Delphine: a parent accepting 200 chores in one afternoon, and one chore
-- somebody set at 9,999 XP.
select t51_done('51b00000-0000-4000-8000-00000000000d', '2026-11-10 14:00+00', 200, 30, 30);
select t51_done('51b00000-0000-4000-8000-00000000000d', '2026-11-11 08:00+00', 1, 9999, 9999);
-- Cosimo: the most of anyone, and in Adventure throughout.
select t51_done('51c00000-0000-4000-8000-00000000000c', '2026-11-10 09:00+00', 8, 100, 100);
select t51_done('51c00000-0000-4000-8000-00000000000c', '2026-11-11 09:00+00', 8, 100, 100);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

-- ---------- everyone starts in Adventure ----------
do $$
declare r jsonb;
begin
  perform become('51a00000-0000-4000-8000-0000000000a2');   -- Arabella's own phone
  r := leaderboard_me('51a00000-0000-4000-8000-00000000000c');
  perform ok('a child starts in Adventure', r->>'mode' = 'adventure', r::text);
  perform ok('with a nickname made from word pieces', r->>'nickname' ~ '^[A-Z][a-z]+[A-Z][a-z]+[0-9]{2}$', r->>'nickname');
  perform ok('and may pick their first nickname straight away', (r->>'can_rename')::boolean);

  r := set_leaderboard_mode('51a00000-0000-4000-8000-00000000000c', 'arena');
  perform ok('a child cannot switch themselves into Arena', r->>'reason' = 'parent_only', r::text);
  r := set_leaderboard_mode('51a00000-0000-4000-8000-00000000000c', 'stadium');
  perform ok('there are two modes and only two', r->>'reason' = 'no_mode', r::text);
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'chores', 'all', 'world');
  perform ok('an Adventure child is shown no worldwide board', r->>'reason' = 'adventure', r::text);
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'chores', 'all', 'family');
  perform ok('but their family board is there', (r->>'ok')::boolean, r::text);

  -- Another family's child, by id: refused before anything is read.
  begin
    perform leaderboard_me('51b00000-0000-4000-8000-00000000000c');
    raise exception 'FAIL a child read another family''s child''s leaderboard profile';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS another family''s child is refused (%)', left(sqlerrm, 30);
  end;
  begin
    perform set_leaderboard_mode('51b00000-0000-4000-8000-00000000000c', 'adventure');
    raise exception 'FAIL a child changed another family''s child''s mode';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS and cannot change their mode';
  end;
  begin
    perform set_leaderboard_country('GB');
    raise exception 'FAIL a child set the family''s country';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child cannot set the country';
  end;
end $$;

-- ---------- parents: Arena and the country ----------
do $$
declare r jsonb;
begin
  perform become('51a00000-0000-4000-8000-0000000000a1');
  r := set_leaderboard_country('XX');
  perform ok('a country not on the list is refused', r->>'reason' = 'not_a_country', r::text);
  r := set_leaderboard_country('Narnia');
  perform ok('as is anything typed', r->>'reason' = 'not_a_country');
  r := set_leaderboard_country('gb');
  perform ok('a country from the list is kept, as its code', r->>'country' = 'GB', r::text);
  r := set_leaderboard_mode('51a00000-0000-4000-8000-00000000000c', 'arena');
  perform ok('a parent switches their child into Arena', r->>'mode' = 'arena', r::text);
  r := leaderboard_family_settings();
  perform ok('the parent''s screen shows each child''s mode and the country',
    r->>'country' = 'GB' and r->'kids'->0->>'mode' = 'arena', r::text);
  begin
    perform set_leaderboard_mode('51b00000-0000-4000-8000-00000000000c', 'arena');
    raise exception 'FAIL a parent put another family''s child in Arena';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent cannot put another family''s child in Arena';
  end;

  perform become('51b00000-0000-4000-8000-0000000000b1');
  perform set_leaderboard_country('GB');
  perform set_leaderboard_mode('51b00000-0000-4000-8000-00000000000c', 'arena');
  perform set_leaderboard_mode('51b00000-0000-4000-8000-00000000000d', 'arena');
  -- Family C never switches Arena on and picks no country.
end $$;

-- ---------- the job, on a fixed clock ----------
reset role;
do $$
declare r jsonb; n int;
begin
  r := refresh_leaderboards('2026-11-11 12:00+00');
  perform ok('the job runs', (r->>'ok')::boolean and r->>'week' = '2026-W46' and r->>'month' = '2026-11', r::text);

  -- Chores this week: Delphine's 200 in an afternoon count 8, plus 1 the next day.
  perform ok('the daily cap: 200 accepted in one day count as 8',
    (select chores_week from leaderboard_kid_stats where kid_id = '51b00000-0000-4000-8000-00000000000d') = 9);
  perform ok('and a 9,999 XP chore counts 200', (select xp_week from leaderboard_kid_stats
    where kid_id = '51b00000-0000-4000-8000-00000000000d') = 8 * 30 + 200);
  perform ok('chores this week, worldwide: Delphine, Barnaby, Arabella',
    (select string_agg(kid_id::text || ':' || rank || ':' || shown, ' ' order by rank, kid_id)
       from leaderboard_ranks where board = 'chores' and period = 'week' and scope = 'world')
    = '51b00000-0000-4000-8000-00000000000d:1:9 51b00000-0000-4000-8000-00000000000c:2:4 51a00000-0000-4000-8000-00000000000c:3:3');
  perform ok('the Elite boost buys nothing: 4 chores at 30 beat 3 paid 45 each',
    (select rank from leaderboard_ranks where board = 'xp' and period = 'week' and scope = 'world'
        and kid_id = '51b00000-0000-4000-8000-00000000000c')
    < (select rank from leaderboard_ranks where board = 'xp' and period = 'week' and scope = 'world'
          and kid_id = '51a00000-0000-4000-8000-00000000000c'));
  perform ok('Arabella''s XP this week is 90, what the chores were worth before the boost',
    (select shown from leaderboard_ranks where board = 'xp' and period = 'week' and scope = 'world'
        and kid_id = '51a00000-0000-4000-8000-00000000000c') = 90);
  perform ok('this month, 120 each: a tie shares the place',
    (select count(distinct rank) = 1 and min(rank) = 2 from leaderboard_ranks where board = 'xp' and period = 'month'
        and scope = 'world' and kid_id in ('51a00000-0000-4000-8000-00000000000c', '51b00000-0000-4000-8000-00000000000c')));
  perform ok('all time counts last month''s chore too',
    (select shown from leaderboard_ranks where board = 'chores' and period = 'all' and scope = 'world'
        and kid_id = '51a00000-0000-4000-8000-00000000000c') = 5);
  perform ok('rising stars: this week''s XP less last week''s',
    (select shown from leaderboard_ranks where board = 'rising' and period = 'week' and scope = 'world'
        and kid_id = '51a00000-0000-4000-8000-00000000000c') = 90 - 30);
  perform ok('the country boards hold the same children, in their country',
    (select count(*) from leaderboard_ranks where board = 'chores' and period = 'week' and scope = 'country' and scope_key = 'GB') = 3);
  perform ok('a child in Adventure is in no public ranking at all, however much they did',
    not exists (select 1 from leaderboard_ranks where kid_id = '51c00000-0000-4000-8000-00000000000c'));
  perform ok('though their own numbers are counted, for their family board',
    (select chores_week from leaderboard_kid_stats where kid_id = '51c00000-0000-4000-8000-00000000000c') = 16);
  perform ok('the week and month are labelled', (select bool_and(period_key = case period when 'week' then '2026-W46'
    when 'month' then '2026-11' else 'all' end) from leaderboard_ranks));

  -- The end of the week: still Sunday at 23:59:59, then Monday.
  perform refresh_leaderboards('2026-11-15 23:59:59+00');
  perform ok('on Sunday night this week''s board is still there',
    (select count(*) from leaderboard_ranks where board = 'chores' and period = 'week' and scope = 'world') = 3);
  perform refresh_leaderboards('2026-11-16 00:00:01+00');
  perform ok('one second into Monday (UTC) this week''s board is empty again',
    not exists (select 1 from leaderboard_ranks where board = 'chores' and period = 'week'));
  perform ok('while this month''s carries on',
    (select count(*) from leaderboard_ranks where board = 'chores' and period = 'month' and scope = 'world') = 3);
  perform ok('and the new week has its own label', leaderboard_period_key('week', '2026-11-16 00:00:01+00') = '2026-W47');
  perform refresh_leaderboards('2026-12-01 00:00:01+00');
  perform ok('on the 1st the month starts again too',
    not exists (select 1 from leaderboard_ranks where board = 'chores' and period = 'month'));
  perform ok('all time never resets',
    (select count(*) from leaderboard_ranks where board = 'chores' and period = 'all' and scope = 'world') = 3);
  perform ok('a child is told when: Monday, 00:00 UTC',
    leaderboard_resets_at('week', '2026-11-11 12:00+00') = '2026-11-16 00:00+00'
    and leaderboard_resets_at('month', '2026-11-11 12:00+00') = '2026-12-01 00:00+00'
    and leaderboard_resets_at('all', '2026-11-11 12:00+00') is null);

  -- The arrows: the rank at the day's first refresh is kept all day.
  update leaderboard_ranks set base_rank = 3 where board = 'chores' and period = 'all' and scope = 'world'
     and kid_id = '51a00000-0000-4000-8000-00000000000c';
  perform refresh_leaderboards('2026-12-01 00:10:00+00');
  perform ok('within the same day a child''s starting rank is kept, for the arrow',
    (select base_rank from leaderboard_ranks where board = 'chores' and period = 'all' and scope = 'world'
        and kid_id = '51a00000-0000-4000-8000-00000000000c') = 3);

  -- Today's real clock, for what the phones are sent.
  perform refresh_leaderboards();
end $$;
set role app_user;

-- ---------- what a caller is sent ----------
do $$
declare r jsonb;
begin
  perform become('51a00000-0000-4000-8000-0000000000a2');   -- Arabella, now in Arena
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'chores', 'all', 'world');
  perform ok('an Arena child sees the worldwide board', (r->>'ok')::boolean and jsonb_array_length(r->'rows') = 3, r::text);
  perform ok('it names nobody: no child''s name, no family''s, anywhere in it',
    position('Arabella' in r::text) = 0 and position('Barnaby' in r::text) = 0
    and position('Delphine' in r::text) = 0 and position('Quill' in r::text) = 0
    and position('Cosimo' in r::text) = 0 and position('T51' in r::text) = 0, r::text);
  perform ok('only nicknames, and the flag''s country',
    (select bool_and(x->>'name' ~ '^[A-Z][a-z]+[A-Z][a-z]+[0-9]{2}$' and x->>'country' = 'GB') from jsonb_array_elements(r->'rows') x));
  set local role postgres;
  perform ok('every one of them built from the word lists',
    (select bool_and(leaderboard_nickname_ok(x->>'name')) from jsonb_array_elements(r->'rows') x));
  set local role app_user;
  perform ok('their own row is marked, with their place', (r->'me'->>'rank')::int = (
    select (x->>'rank')::int from jsonb_array_elements(r->'rows') x where (x->>'you')::boolean));
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'chores', 'all', 'country');
  perform ok('and the country board', (r->>'ok')::boolean and r->>'country' = 'GB', r::text);
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'chores', 'all', 'guild');
  perform ok('a guild board needs a guild', r->>'reason' = 'not_a_member', r::text);
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'popularity', 'all', 'world');
  perform ok('a board that does not exist', r->>'reason' = 'no_board', r::text);
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'level', 'week', 'world');
  perform ok('nor a period a board does not have', r->>'reason' = 'no_board');
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'arcade', 'all', 'world', 'not-a-game');
  perform ok('nor a game the arcade does not have', r->>'reason' = 'no_board');
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'guilds', 'week', 'family');
  perform ok('guilds race worldwide and by country, not in a family', r->>'reason' = 'no_board');

  perform become('51c00000-0000-4000-8000-0000000000c2');   -- Cosimo, Adventure
  r := leaderboard_board('51c00000-0000-4000-8000-00000000000c', 'chores', 'week', 'world');
  perform ok('an Adventure child is still shown no public board', r->>'reason' = 'adventure');
  r := leaderboard_board('51c00000-0000-4000-8000-00000000000c', 'chores', 'all', 'family');
  perform ok('their family board, by the family''s own names', (r->>'ok')::boolean
    and r->'rows'->0->>'name' = 'Cosimo Hush' and (r->'rows'->0->>'you')::boolean, r::text);

  perform become('51c00000-0000-4000-8000-0000000000c1');   -- Cosimo's parent: Arena, no country
  perform set_leaderboard_mode('51c00000-0000-4000-8000-00000000000c', 'arena');
  r := leaderboard_board('51c00000-0000-4000-8000-00000000000c', 'chores', 'all', 'country');
  perform ok('with no country picked there is no country board', r->>'reason' = 'no_country', r::text);
  r := leaderboard_board('51c00000-0000-4000-8000-00000000000c', 'chores', 'all', 'world');
  perform ok('newly in Arena, they show at the next refresh, with their own numbers meanwhile',
    (r->>'ok')::boolean and r->'me'->>'rank' is null and (r->'me'->>'score')::int = 16, r::text);
  perform set_leaderboard_mode('51c00000-0000-4000-8000-00000000000c', 'adventure');
end $$;

-- ---------- nicknames ----------
do $$
declare r jsonb;
begin
  perform become('51a00000-0000-4000-8000-0000000000a2');
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'Swift', 'Comet', 42);
  perform ok('a nickname from three pieces', r->>'nickname' = 'SwiftComet42', r::text);
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'Brave', 'Otter', 7);
  perform ok('and not again for a week', r->>'reason' = 'name_cooldown' and r ? 'rename_at', r::text);
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'Swift', 'Comet', 42);
  perform ok('asking for the one they have is fine', (r->>'ok')::boolean);
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'Arabella', 'Comet', 42);
  perform ok('a word not on the first list is refused', r->>'reason' = 'not_in_list');
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'Swift', 'Zephyr', 42);
  perform ok('nor the second', r->>'reason' = 'not_in_list');
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'Swift', 'Comet', 100);
  perform ok('nor a number over 99', r->>'reason' = 'not_in_list');
  r := set_leaderboard_nickname('51a00000-0000-4000-8000-00000000000c', 'swift', 'comet', 1);
  perform ok('the pieces are exactly the list''s', r->>'reason' = 'not_in_list');
end $$;
reset role;
do $$
declare v_bad text;
begin
  perform ok('the lists check what they hold', leaderboard_nickname_ok('SwiftComet42')
    and not leaderboard_nickname_ok('SwiftComet') and not leaderboard_nickname_ok('SwiftComet420')
    and not leaderboard_nickname_ok('Swift Comet 42') and not leaderboard_nickname_ok(null)
    and not leaderboard_nickname_ok('ArabellaZephyr42'));
  select string_agg(f || s, ', ') into v_bad
    from unnest(leaderboard_first_words()) f, unnest(leaderboard_second_words()) s
   where not kid_words_ok(f || s || '00') or not kid_words_ok(f || ' ' || s);
  perform ok('every first word with every second word passes the rude-word filter', v_bad is null, v_bad);
  perform ok('a random nickname is always one the lists allow',
    (select bool_and(leaderboard_nickname_ok(leaderboard_random_nickname())) from generate_series(1, 300)));
  begin
    insert into leaderboard_profiles (kid_id, family_id, nickname)
    values ('51c00000-0000-4000-8000-00000000000c', '51c00000-0000-4000-8000-00000000000f', 'Cosimo99')
    on conflict (kid_id) do update set nickname = excluded.nickname;
    raise exception 'FAIL a nickname off the lists was stored';
  exception when check_violation then
    raise notice '  PASS the table itself refuses a nickname off the lists';
  end;
  begin
    insert into leaderboard_families (family_id, country) values ('51c00000-0000-4000-8000-00000000000f', 'ZZ');
    raise exception 'FAIL a country off the list was stored';
  exception when check_violation then
    raise notice '  PASS and a country off the list';
  end;
  perform ok('the country list holds codes, exactly', leaderboard_country_ok('GB') and leaderboard_country_ok('US')
    and not leaderboard_country_ok('gb') and not leaderboard_country_ok('') and not leaderboard_country_ok(null)
    and not leaderboard_country_ok('UK'));
  perform ok('no level is worked out in the database: the level board ranks by XP',
    to_regprocedure('leaderboard_level(bigint)') is null
    and not exists (select 1 from information_schema.columns where table_name = 'leaderboard_kid_stats' and column_name = 'level'));
  perform ok('the server''s boards are all of them, sixteen with their periods', (select count(*) from leaderboard_boards()) = 16);
end $$;

-- ---------- guilds on the public board ----------
do $$
declare v_guild uuid := '51a00000-0000-4000-8000-0000000000e5';
begin
  insert into guilds (id, name, crest, capacity, leader_kid_id, invite_code, owner_family_id)
  values (v_guild, 'Zephyr Street Gang', '🦊', 10, '51a00000-0000-4000-8000-00000000000c', 'T51GLD', '51a00000-0000-4000-8000-00000000000f');
  insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent, approved_by_owner) values
    (v_guild, '51a00000-0000-4000-8000-00000000000c', '51a00000-0000-4000-8000-00000000000f', 'leader', 'active', true, true),
    (v_guild, '51b00000-0000-4000-8000-00000000000c', '51b00000-0000-4000-8000-00000000000f', 'member', 'active', true, true);
  -- This week's chores, on today's clock.
  perform t51_done('51a00000-0000-4000-8000-00000000000c', now(), 1, 30, 30);
  perform t51_done('51b00000-0000-4000-8000-00000000000c', now(), 1, 30, 30);
  perform refresh_leaderboards();
  perform ok('a guild whose children are all in Arena is on the guild board',
    exists (select 1 from leaderboard_ranks where guild_id = v_guild and board = 'guilds' and scope = 'world'));
end $$;
set role app_user;
do $$
declare r jsonb; v_nick text;
begin
  perform become('51b00000-0000-4000-8000-0000000000b2');   -- Barnaby, in the guild
  r := leaderboard_board('51b00000-0000-4000-8000-00000000000c', 'guilds', 'week', 'world');
  perform ok('shown by a team name from the lists, never the name a parent typed',
    (r->>'ok')::boolean and position('Zephyr' in r::text) = 0 and position('Gang' in r::text) = 0
    and position('🦊' in r::text) = 0 and position('T51GLD' in r::text) = 0
    and (select bool_or((x->>'you')::boolean and x->>'name' like 'Team %') from jsonb_array_elements(r->'rows') x), r::text);
  r := leaderboard_board('51b00000-0000-4000-8000-00000000000c', 'chores', 'week', 'guild');
  perform ok('the guild''s own board uses the names the roster shows, to its members',
    (r->>'ok')::boolean and position('Arabella Zephyr' in r::text) > 0, r::text);

  -- Barnaby goes back to Adventure himself: no permission needed.
  r := set_leaderboard_mode('51b00000-0000-4000-8000-00000000000c', 'adventure');
  perform ok('a child can switch themselves back to Adventure', r->>'mode' = 'adventure', r::text);
  set local role postgres;
  perform ok('and is off every public board at once, before any refresh',
    not exists (select 1 from leaderboard_ranks where kid_id = '51b00000-0000-4000-8000-00000000000c'));
  perform ok('and so is their guild, which is no longer all Arena',
    not exists (select 1 from leaderboard_ranks where guild_id = '51a00000-0000-4000-8000-0000000000e5'));
  set local role app_user;
  set local role postgres;
  v_nick := (select nickname from leaderboard_profiles where kid_id = '51b00000-0000-4000-8000-00000000000c');
  set local role app_user;
  perform become('51a00000-0000-4000-8000-0000000000a2');
  r := leaderboard_board('51a00000-0000-4000-8000-00000000000c', 'chores', 'all', 'world');
  perform ok('and another child''s board no longer has them',
    v_nick is not null and position(v_nick in r::text) = 0, r::text);
end $$;
reset role;
do $$
begin
  perform refresh_leaderboards();
  perform ok('and the next refresh does not put them back',
    not exists (select 1 from leaderboard_ranks where kid_id = '51b00000-0000-4000-8000-00000000000c')
    and not exists (select 1 from leaderboard_ranks where guild_id = '51a00000-0000-4000-8000-0000000000e5'));
end $$;

-- ---------- deleting a child, and withdrawing consent ----------
do $$
begin
  perform ok('Delphine is on the boards', exists (select 1 from leaderboard_ranks where kid_id = '51b00000-0000-4000-8000-00000000000d'));
  delete from kids where id = '51b00000-0000-4000-8000-00000000000d';
  perform ok('a deleted child is gone from every board, at once',
    not exists (select 1 from leaderboard_ranks where kid_id = '51b00000-0000-4000-8000-00000000000d')
    and not exists (select 1 from leaderboard_kid_stats where kid_id = '51b00000-0000-4000-8000-00000000000d')
    and not exists (select 1 from leaderboard_profiles where kid_id = '51b00000-0000-4000-8000-00000000000d'));
end $$;
set role app_user;
do $$
begin
  perform become('51a00000-0000-4000-8000-0000000000a1');
  perform revoke_parental_consent('T51');
  set local role postgres;
  perform ok('withdrawing consent takes the family''s children off every board',
    not exists (select 1 from leaderboard_ranks where kid_id = '51a00000-0000-4000-8000-00000000000c')
    and not exists (select 1 from leaderboard_profiles where family_id = '51a00000-0000-4000-8000-00000000000f'));
end $$;
reset role;

-- ---------- "Download my data" holds it ----------
set role app_user;
do $$
declare r jsonb;
begin
  perform become('51b00000-0000-4000-8000-0000000000b1');
  r := export_family_data();
  perform ok('the export holds each child''s mode and nickname, and the country',
    r->'leaderboards'->>'country' = 'GB' and jsonb_array_length(r->'leaderboards'->'children') >= 1, (r->'leaderboards')::text);
end $$;
reset role;

-- Leave nothing behind for the app's tests.
delete from leaderboard_ranks;
delete from families where id in ('51a00000-0000-4000-8000-00000000000f', '51b00000-0000-4000-8000-00000000000f',
                                  '51c00000-0000-4000-8000-00000000000f');
drop function t51_done(uuid, timestamptz, int, int, int);
