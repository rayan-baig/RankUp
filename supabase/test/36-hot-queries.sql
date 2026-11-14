-- ---------------------------------------------------------------------------
-- The queries every phone and every job runs, on a large family.
--
-- One family with 30,000 chores among 2,000 others, generated inside a
-- transaction that is rolled back at the end. Each hot query is EXPLAINed as
-- the account that runs it, and must use the index made for it rather than
-- reading the table:
--
--   the sync pull            what changed since the phone last asked (every
--                            few seconds, on every phone)
--   submitting a chore       "is one already waiting for this chore?"
--   the Alliance score       a family's approvals in a month
--   the weekly digest        a family's approvals in a week, and what waits
--   the School League        one child's approvals in a month, for every
--                            child in every school whenever a league is shown
--   a child's chores         the quests of one child
--
-- Plans depend on statistics, which is why the data is realistic in size
-- and ANALYZEd: on a table of a hundred rows every plan is a scan, and
-- correctly so.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into auth.users (id, email) values ('36a00000-0000-4000-8000-0000000000a1', 't36@example.com');
insert into families (id, name, tier) values ('36f00000-0000-4000-8000-000000000001', 'T36 Big', 'elite');
insert into parents (user_id, family_id, name) values
  ('36a00000-0000-4000-8000-0000000000a1', '36f00000-0000-4000-8000-000000000001', 'Big');
select seed_consent('36f00000-0000-4000-8000-000000000001', '36a00000-0000-4000-8000-0000000000a1');
insert into kids (id, family_id, name)
select ('36c00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '36f00000-0000-4000-8000-000000000001', 'Kid ' || g
  from generate_series(1, 12) g;
insert into quests (id, family_id, kid_id, title, status)
select ('36e00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '36f00000-0000-4000-8000-000000000001',
       ('36c00000-0000-4000-8000-' || lpad((g % 12 + 1)::text, 12, '0'))::uuid, 'Quest ' || g,
       case when g % 50 = 0 then 'submitted' else 'approved' end
  from generate_series(1, 3000) g;
-- Ten a day for three hundred days.
insert into submissions (family_id, quest_id, kid_id, status, submitted_at, decided_at)
select '36f00000-0000-4000-8000-000000000001', ('36e00000-0000-4000-8000-' || lpad((g % 3000 + 1)::text, 12, '0'))::uuid,
       ('36c00000-0000-4000-8000-' || lpad(((g % 3000) % 12 + 1)::text, 12, '0'))::uuid,
       case when g % 500 = 0 then 'pending' else 'approved' end,
       now() - make_interval(mins => g * 14),
       case when g % 500 = 0 then null else now() - make_interval(mins => g * 14) end
  from generate_series(1, 30000) g;

-- Everybody else.
insert into families (id, name, tier)
select ('36f10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'T36 small ' || g, 'elite' from generate_series(1, 2000) g;
insert into auth.users (id, email)
select ('36a10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 't36-' || g || '@example.com' from generate_series(1, 2000) g;
insert into parents (id, user_id, family_id, name)
select ('36b10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, ('36a10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       ('36f10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'p' from generate_series(1, 2000) g;
insert into parental_consents (family_id, parent_id, version, method, signed_name)
select ('36f10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, ('36b10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       '2026-01', 'payment_card', 'x' from generate_series(1, 2000) g;
insert into kids (id, family_id, name)
select ('36c10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, ('36f10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'k'
  from generate_series(1, 2000) g;
insert into quests (id, family_id, kid_id, title)
select ('36e10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, ('36f10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       ('36c10000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'q' from generate_series(1, 2000) g;
insert into submissions (family_id, quest_id, kid_id, status, decided_at)
select ('36f10000-0000-4000-8000-' || lpad((g % 2000 + 1)::text, 12, '0'))::uuid,
       ('36e10000-0000-4000-8000-' || lpad((g % 2000 + 1)::text, 12, '0'))::uuid,
       ('36c10000-0000-4000-8000-' || lpad((g % 2000 + 1)::text, 12, '0'))::uuid,
       case when g % 40 = 0 then 'pending' else 'approved' end,
       case when g % 40 = 0 then null else now() - make_interval(hours => g % 4000) end
  from generate_series(1, 30000) g;

analyze families; analyze kids; analyze quests; analyze submissions; analyze parents;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

create function t36_plan(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute 'explain (format json, costs off) ' || p_sql into v;
  return v;
end $$;

/** Which indexes a plan uses, and whether it reads a whole table. */
create function t36_check(p_label text, p_plan text, p_index text) returns void language plpgsql as $$
begin
  perform ok(p_label,
             position(p_index in p_plan) > 0 and p_plan !~ '"Seq Scan"[^}]*"Relation Name": "(submissions|quests)"',
             'plan: ' || regexp_replace(p_plan, '\s+', ' ', 'g'));
end $$;

do $$
declare
  v_head bigint := (select last_value from sync_rev);
  v_month date := date_trunc('month', now())::date;
  v_week date := date_trunc('week', now())::date;
begin
  -- As the family's parent, under row level security, as a phone asks.
  execute 'set local role app_user';
  perform become('36a00000-0000-4000-8000-0000000000a1');
  perform t36_check('the sync pull reads only what changed, by the family''s revision index',
    t36_plan(format('select jsonb_agg(to_jsonb(s)) from submissions s where s.rev > %s', v_head - 20)),
    'submissions_sync_idx');
  perform t36_check('and the same for chores',
    t36_plan(format('select jsonb_agg(to_jsonb(q)) from quests q where q.rev > %s', v_head - 20)),
    'quests_sync_idx');
  execute 'set local role postgres';
  perform become(null);

  -- Inside the functions, which run as the owner.
  perform t36_check('submitting a chore asks about that chore alone',
    t36_plan('select exists (select 1 from submissions where quest_id = ''36e00000-0000-4000-8000-000000000050'' and status = ''pending'')'),
    'submissions_quest_idx');
  perform t36_check('the Alliance score reads one family''s month',
    t36_plan(format('select count(*) from submissions where family_id = %L and status = ''approved'' and decided_at >= %L and decided_at < %L',
                    '36f00000-0000-4000-8000-000000000001', v_month, v_month + interval '1 month')),
    'submissions_family_decided_idx');
  perform t36_check('the weekly digest reads one family''s week',
    t36_plan(format('select count(*) from submissions where family_id = %L and status = ''approved'' and decided_at >= %L and decided_at < %L',
                    '36f00000-0000-4000-8000-000000000001', v_week, v_week + 7)),
    'submissions_family_decided_idx');
  perform t36_check('and what is waiting for the parent',
    t36_plan(format('select count(*) from submissions where family_id = %L and status = ''pending''',
                    '36f00000-0000-4000-8000-000000000001')),
    'submissions_family_decided_idx');
  perform t36_check('the School League reads one child''s month',
    t36_plan(format('select count(*) from submissions s where s.kid_id = %L and s.status = ''approved'' and s.decided_at >= %L and s.decided_at < %L',
                    '36c00000-0000-4000-8000-000000000001', v_month, v_month + interval '1 month')),
    'submissions_kid_decided_idx');
  perform t36_check('a child''s chores are read by child',
    t36_plan('select * from quests where kid_id = ''36c00000-0000-4000-8000-000000000001'' and status = ''assigned'''),
    'quests_kid_status_idx');
end $$;

rollback;

-- The statistics go back to describing the real tables.
analyze families; analyze kids; analyze quests; analyze submissions; analyze parents;
