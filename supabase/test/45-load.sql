-- ---------------------------------------------------------------------------
-- What the load test changed (docs/LOAD-TEST.md, tools/loadtest.mjs).
--
--   * The three helpers every policy calls are PL/pgSQL, whose plans are kept
--     for the connection, and every policy on the tables a phone pulls calls
--     them inside a subselect, so they are asked once per query rather than
--     once per row. Same answers: the security files (01, 21, 31, 32) prove
--     that; this proves the shape stays, so a later edit cannot quietly put
--     the cost back.
--   * A time zone is checked by is_time_zone, never by reading
--     pg_timezone_names, which cost 9 ms a family in the Sunday digest.
--   * A guild roster's "this week" reads one child's week of events, by
--     events_kid_type_day_idx.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- is_time_zone ----------
do $$
begin
  perform ok('a real zone is a zone', is_time_zone('Europe/London') and is_time_zone('America/Los_Angeles'));
  perform ok('UTC is a zone', is_time_zone('UTC'));
  perform ok('a made-up one is not', not is_time_zone('Mars/Olympus'));
  perform ok('nor is nothing', not is_time_zone('') and not is_time_zone(null) and not is_time_zone('   '));
  perform ok('nor is something a person typed into a text box',
    not is_time_zone('Europe/London; drop table families') and not is_time_zone(repeat('x', 500)));
end $$;

do $$
declare n int;
begin
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and prosrc ~* 'from\s+pg_timezone_names';
  perform ok('no function reads the whole time zone database to check one zone', n = 0, n || ' still do');
end $$;

-- The digest still counts a family with a broken zone, in UTC.
do $$
declare d jsonb;
begin
  insert into auth.users (id, email) values ('45a00000-0000-4000-8000-0000000000a1', 't45@example.com');
  insert into families (id, name, tier, timezone) values ('45f00000-0000-4000-8000-000000000001', 'T45', 'elite', 'Mars/Olympus');
  d := family_week_digest('45f00000-0000-4000-8000-000000000001', date_trunc('week', now())::date);
  perform ok('a family whose zone is not one still gets a digest, counted in UTC',
    d ? 'approved' and (d->>'approved')::int = 0);
  delete from families where id = '45f00000-0000-4000-8000-000000000001';
  delete from auth.users where id = '45a00000-0000-4000-8000-0000000000a1';
end $$;

-- A reminder schedule given a broken zone is kept in UTC, as before.
do $$
begin
  perform ok('save_reminder_schedule still turns an unknown zone into UTC',
    (select prosrc from pg_proc where proname = 'save_reminder_schedule') ~ 'not is_time_zone\(v_tz\)');
end $$;

-- ---------- the policy helpers ----------
do $$
declare v_lang text;
begin
  for v_lang in
    select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('current_family_id', 'is_parent', 'current_kid_id')
  loop
    perform ok('a policy helper keeps its plan (PL/pgSQL)', v_lang = 'plpgsql', v_lang);
  end loop;
  perform ok('all three helpers are there',
    (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('current_family_id', 'is_parent', 'current_kid_id')) = 3);
end $$;

-- Every policy on a table a phone pulls asks each helper once per query.
do $$
declare r record; v_text text; v_bare int;
begin
  for r in
    select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as body
      from pg_policies
     where schemaname = 'public'
       and tablename in ('families', 'kids', 'quests', 'submissions', 'rewards', 'redemptions',
                         'notes', 'family_goals', 'overrides')
  loop
    -- Every call of a helper, minus the ones written as a subselect.
    v_bare := (length(r.body) - length(replace(r.body, 'current_family_id()', ''))) / length('current_family_id()')
            - (length(r.body) - length(replace(r.body, 'SELECT current_family_id()', ''))) / length('SELECT current_family_id()')
            + (length(r.body) - length(replace(r.body, 'is_parent()', ''))) / length('is_parent()')
            - (length(r.body) - length(replace(r.body, 'SELECT is_parent()', ''))) / length('SELECT is_parent()')
            + (length(r.body) - length(replace(r.body, 'current_kid_id()', ''))) / length('current_kid_id()')
            - (length(r.body) - length(replace(r.body, 'SELECT current_kid_id()', ''))) / length('SELECT current_kid_id()');
    perform ok(format('%s on %s asks each helper once per query', r.policyname, r.tablename), v_bare = 0, r.body);
  end loop;
end $$;

-- And the plan says so: a parent reading a family's chores asks "is this a
-- parent?" once (an InitPlan), not in a filter run on every row.
begin;
insert into auth.users (id, email) values ('45a00000-0000-4000-8000-0000000000a2', 't45b@example.com');
insert into families (id, name, tier) values ('45f00000-0000-4000-8000-000000000002', 'T45 B', 'elite');
insert into parents (user_id, family_id, name) values
  ('45a00000-0000-4000-8000-0000000000a2', '45f00000-0000-4000-8000-000000000002', 'B');

do $$
declare v_plan text := '';
declare v_line text;
begin
  perform become('45a00000-0000-4000-8000-0000000000a2');
  execute 'set local role app_user';
  for v_line in execute 'explain (costs off) select * from submissions where rev > 0' loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  execute 'set local role postgres';
  perform become(null);
  perform ok('a phone''s pull asks who it is once per query, not once per chore',
    v_plan ~ 'InitPlan' and v_plan !~ 'Filter: \(is_parent\(\)', v_plan);
end $$;
rollback;

-- ---------- a guild roster's week ----------
begin;
insert into auth.users (id, email) values ('45a00000-0000-4000-8000-0000000000a3', 't45c@example.com');
insert into families (id, name, tier) values ('45f00000-0000-4000-8000-000000000003', 'T45 C', 'elite');
insert into parents (user_id, family_id, name) values
  ('45a00000-0000-4000-8000-0000000000a3', '45f00000-0000-4000-8000-000000000003', 'C');
do $$ begin perform seed_consent('45f00000-0000-4000-8000-000000000003', '45a00000-0000-4000-8000-0000000000a3'); end $$;
insert into kids (id, family_id, name)
select ('45c00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '45f00000-0000-4000-8000-000000000003', 'K' || g
  from generate_series(1, 40) g;
-- Ninety days of a chore or two a day, for forty children.
insert into events (family_id, kid_id, type, meta, day)
select '45f00000-0000-4000-8000-000000000003', ('45c00000-0000-4000-8000-' || lpad((1 + g % 40)::text, 12, '0'))::uuid,
       case when g % 5 = 0 then 'streak_freeze' else 'quest_approved' end,
       jsonb_build_object('xp', 30), current_date - (g % 90)
  from generate_series(1, 8000) g;
analyze events;

do $$
declare v_plan text := '';
declare v_line text;
begin
  for v_line in execute format(
      'explain (costs off) select sum((e.meta->>''xp'')::int) from events e where e.kid_id = %L and e.type = ''quest_approved'' and e.day > current_date - 7',
      '45c00000-0000-4000-8000-000000000001') loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  perform ok('a guild roster reads one child''s week of chores, not their ninety days',
    v_plan ~ 'events_kid_type_day_idx' and v_plan ~ 'day >', v_plan);
  perform ok('and the index it replaces is gone',
    not exists (select 1 from pg_indexes where indexname = 'events_kid_type_idx'));
end $$;
rollback;
