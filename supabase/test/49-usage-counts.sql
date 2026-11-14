-- ---------------------------------------------------------------------------
-- The daily usage counts (health.sql: usage_daily, the usage_* triggers,
-- count_help_view, usage_daily_counts; pruned by run_retention).
--
--   * each of the six counts goes up by one for the thing it counts, through
--     the same functions the app calls, and not for anything else;
--   * a count holds a day, a name and a number: no column could hold a
--     family, a child, an adult, a device or a time of day;
--   * the last 30 days come back every day present, oldest first, with the
--     totals; only the server can ask;
--   * anybody can count a help page view, and that is all they can do;
--   * kept 400 days.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into auth.users (id, email) values
  ('49a00000-0000-4000-8000-0000000000a1', 't49-parent@example.com'),
  ('49a00000-0000-4000-8000-0000000000a2', null),
  ('49a00000-0000-4000-8000-0000000000a3', 't49-head@example.com');

-- Today's total of one count, read straight from the table.
-- Security definer, so it can be asked while the test is a parent.
create or replace function t49_today(p_metric text) returns bigint language sql security definer as $$
  select coalesce(sum(n), 0)::bigint from usage_daily
   where day = (now() at time zone 'utc')::date and metric = p_metric;
$$;
create temp table t49_before as
  select m, t49_today(m) as n from unnest(array['families_signed_up', 'chores_accepted', 'rewards_bought',
                                               'games_played', 'schools_signed_up', 'help_views']) m;
grant all on t49_before to app_user;
create or replace function t49_added(p_metric text) returns bigint language sql security definer as $$
  select t49_today(p_metric) - (select n from t49_before where m = p_metric);
$$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on usage_daily from anon, authenticated;

-- ---------- each count, through the app's own functions ----------
set role app_user;
do $$
declare v jsonb; v_family uuid; v_kid uuid := '49a00000-0000-4000-8000-00000000000c';
begin
  perform become('49a00000-0000-4000-8000-0000000000a1');
  v := create_family('T49 Family', 'T49 Parent');
  set local role postgres;
  select family_id into v_family from parents where user_id = '49a00000-0000-4000-8000-0000000000a1';
  perform ok('a family signing up is counted once', t49_added('families_signed_up') = 1, t49_added('families_signed_up')::text);

  perform seed_consent(v_family, '49a00000-0000-4000-8000-0000000000a1');
  insert into kids (id, family_id, user_id, name, coins, play_tokens) values
    (v_kid, v_family, '49a00000-0000-4000-8000-0000000000a2', 'T49 Kid', 0, 0);
  insert into quests (id, family_id, kid_id, title, xp) values
    ('49a00000-0000-4000-8000-0000000000e1', v_family, v_kid, 'T49 bins', 10);
  insert into submissions (id, family_id, quest_id, kid_id, status) values
    ('49a00000-0000-4000-8000-0000000000d1', v_family, '49a00000-0000-4000-8000-0000000000e1', v_kid, 'pending');
  perform ok('a chore sent for checking is not counted as accepted', t49_added('chores_accepted') = 0);

  set local role app_user;
  perform become('49a00000-0000-4000-8000-0000000000a1');
  perform approve_submission('49a00000-0000-4000-8000-0000000000d1', 0, 0, '', null, 'UTC');
  perform ok('a parent accepting it is counted once', t49_added('chores_accepted') = 1, t49_added('chores_accepted')::text);
  perform approve_submission('49a00000-0000-4000-8000-0000000000d1', 0, 0, '', null, 'UTC');
  set local role postgres;
  update submissions set parent_note = 'well done', status = 'approved' where id = '49a00000-0000-4000-8000-0000000000d1';
  perform ok('and only once: not again when the phone retries, nor when the row is saved again',
    t49_added('chores_accepted') = 1, t49_added('chores_accepted')::text);
  insert into submissions (id, family_id, quest_id, kid_id, status) values
    ('49a00000-0000-4000-8000-0000000000d2', v_family, '49a00000-0000-4000-8000-0000000000e1', v_kid, 'rejected');
  perform ok('a chore sent back is not counted', t49_added('chores_accepted') = 1);

  -- Accepting the chore gave a play token; the child plays, and spends coins.
  update kids set coins = 50, play_tokens = 1 where id = v_kid;
  insert into rewards (id, family_id, name, cost) values ('49a00000-0000-4000-8000-0000000000b1', v_family, 'T49 film night', 5);
  set local role app_user;
  perform become('49a00000-0000-4000-8000-0000000000a2');
  v := play_minigame(v_kid, 'stack', 40, null, 'UTC', 60000);
  perform ok('(the game was played)', (v->>'ok')::boolean, v::text);
  perform ok('a game played is counted', t49_added('games_played') = 1, t49_added('games_played')::text);
  v := play_minigame(v_kid, 'stack', 40, null, 'UTC', 60000);
  perform ok('a game refused (no token) is not', t49_added('games_played') = 1, v::text);

  v := redeem_reward('49a00000-0000-4000-8000-0000000000f1', '49a00000-0000-4000-8000-0000000000b1', v_kid);
  perform ok('(the reward was bought)', (v->>'ok')::boolean, v::text);
  perform ok('a reward bought is counted', t49_added('rewards_bought') = 1);
  v := redeem_reward('49a00000-0000-4000-8000-0000000000f1', '49a00000-0000-4000-8000-0000000000b1', v_kid);
  perform ok('and a purchase sent twice is counted once', t49_added('rewards_bought') = 1, v::text);

  perform become('49a00000-0000-4000-8000-0000000000a3');
  v := register_school('T49 School', 'T49 District', 'T49 Town', 120, 'T49 Head');
  perform ok('(the school signed up)', (v->>'ok')::boolean, v::text);
  perform ok('a school signing up is counted', t49_added('schools_signed_up') = 1);

  -- A help page, read by somebody with no account at all.
  perform become(null);
  perform count_help_view();
  perform become('49a00000-0000-4000-8000-0000000000a1');
  perform count_help_view();
  perform ok('a help page view is counted, signed in or not', t49_added('help_views') = 2);

  -- Other activity counts as nothing.
  set local role postgres;
  insert into events (family_id, kid_id, type) values (v_family, v_kid, 'quest_approved');
  perform ok('an event that is not a game is not counted as one', t49_added('games_played') = 1);
end $$;
reset role;

-- ---------- nothing in it could point at anybody ----------
do $$
begin
  perform ok('a count holds a day, which count, a random shard and a number: nothing else',
    (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position)
       from information_schema.columns where table_schema = 'public' and table_name = 'usage_daily')
    = 'day:date,metric:text,shard:smallint,n:bigint');
  perform ok('no row for any one family, only totals: the six counts, nothing more',
    (select count(distinct metric) from usage_daily) <= 6
    and not exists (select 1 from usage_daily where metric not in
      ('families_signed_up', 'chores_accepted', 'rewards_bought', 'games_played', 'schools_signed_up', 'help_views')));
end $$;

-- ---------- the last 30 days ----------
do $$
declare v jsonb; v_days jsonb;
begin
  insert into usage_daily (day, metric, shard, n) values
    ((now() at time zone 'utc')::date - 29, 'help_views', 0, 7),
    ((now() at time zone 'utc')::date - 30, 'help_views', 0, 1000);
  v := usage_daily_counts(30);
  v_days := v->'days';
  perform ok('thirty days, every one present', jsonb_array_length(v_days) = 30, jsonb_array_length(v_days)::text);
  perform ok('oldest first, ending today (UTC)',
    (v_days->0->>'day')::date = (now() at time zone 'utc')::date - 29
    and (v_days->29->>'day')::date = (now() at time zone 'utc')::date);
  perform ok('each day has all six counts',
    (select bool_and(d ?& array['families_signed_up', 'chores_accepted', 'rewards_bought', 'games_played',
                                'schools_signed_up', 'help_views']) from jsonb_array_elements(v_days) d));
  perform ok('a day with nothing counted says 0', (v_days->1->>'families_signed_up')::int >= 0
    and (v_days->1->>'help_views')::int = 0);
  perform ok('today''s numbers are the sum of its rows',
    (v_days->29->>'chores_accepted')::bigint = t49_today('chores_accepted'));
  perform ok('the day 30 days ago is not in it, and the totals add up',
    (v->'totals'->>'help_views')::bigint = 7 + t49_today('help_views'), v->'totals'->>'help_views');
  perform ok('asking for more than 400 days gives 400',
    jsonb_array_length(usage_daily_counts(5000)->'days') = 400);
end $$;

-- ---------- only the server reads them ----------
set role app_user;
do $$
declare f text; v_open text[] := '{}';
begin
  perform become('49a00000-0000-4000-8000-0000000000a1');
  foreach f in array array['select usage_daily_counts(30)', 'select usage_bump(''help_views'')',
                           'select 1 from usage_daily', 'insert into usage_daily values (current_date, ''help_views'', 0, 1)',
                           'update usage_daily set n = 0', 'delete from usage_daily'] loop
    begin
      execute f;
      -- A delete or update that RLS quietly limits to nothing is still not a hole.
      if f not like 'update%' and f not like 'delete%' then v_open := v_open || f; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform ok('a parent can neither read nor change the counts, nor bump one but help views',
    cardinality(v_open) = 0, array_to_string(v_open, '; '));
end $$;
reset role;
do $$
begin
  perform ok('(nor did the update or delete touch a row)', (select sum(n) from usage_daily) > 0);
  perform ok('the server-only functions are shut to the browser''s two roles',
    not has_function_privilege('anon', 'usage_daily_counts(int)', 'execute')
    and not has_function_privilege('authenticated', 'usage_daily_counts(int)', 'execute')
    and not has_function_privilege('anon', 'usage_bump(text)', 'execute')
    and not has_function_privilege('authenticated', 'usage_bump(text)', 'execute')
    and has_function_privilege('anon', 'count_help_view()', 'execute'));
end $$;

-- ---------- kept 400 days ----------
do $$
begin
  insert into usage_daily (day, metric, shard, n) values
    ((now() at time zone 'utc')::date - 401, 'chores_accepted', 3, 5),
    ((now() at time zone 'utc')::date - 399, 'chores_accepted', 3, 5);
  perform run_retention(14, 90, 2);
  perform ok('retention removes a day more than 400 days old',
    not exists (select 1 from usage_daily where day < (now() at time zone 'utc')::date - 400));
  perform ok('and keeps one inside the 400',
    exists (select 1 from usage_daily where day = (now() at time zone 'utc')::date - 399));
end $$;

rollback;
