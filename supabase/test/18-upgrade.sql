-- ---------------------------------------------------------------------------
-- The upgrade path.
--
-- This project has no migration tool. The upgrade procedure is "re-run the SQL
-- files over the live database", which only works if every one of them is safe
-- to run twice — and which fails SILENTLY in the worst way if it is not: a
-- `create table` that errors leaves the rest of that file unapplied, so the
-- database ends up half-upgraded with no obvious sign.
--
-- run.sh applies every file before this one runs, so reaching this point at
-- all proves they applied once. What this file proves is the part that matters
-- after launch: that the data survives them being applied AGAIN.
--
-- The re-run itself happens in run.sh's second pass — this file checks the
-- damage afterwards.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- the columns that were added after the first release ----------
--
-- `create table if not exists` leaves an existing table alone, so a column
-- added to a CREATE TABLE would never reach a database made before it. Each
-- one is repeated as an ALTER at the end of schema.sql; these checks are what
-- notice when somebody adds a column and forgets that half.
do $$
declare missing text := '';
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'quests' and column_name = 'recurrence') then
    missing := missing || 'quests.recurrence ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'quests' and column_name = 'last_reset_on') then
    missing := missing || 'quests.last_reset_on ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'submissions' and column_name = 'sticker') then
    missing := missing || 'submissions.sticker ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'families' and column_name = 'timezone') then
    missing := missing || 'families.timezone ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'family_goals' and column_name = 'start_xp') then
    missing := missing || 'family_goals.start_xp ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'family_goals' and column_name = 'rev') then
    missing := missing || 'family_goals.rev ';
  end if;
  perform ok('every column added since the first release is present', missing = '',
             'missing: ' || missing);
end $$;

-- ---------- the widened constraints came with them ----------
do $$
begin
  -- A check constraint cannot be replaced in place. If the ALTER that rebuilds
  -- it were missing, an existing database would still refuse 'weekdays' while
  -- the app happily offered it — and a parent would pick School days and watch
  -- the save fail with nothing on screen to explain why.
  perform ok('a school-days chore is accepted',
    (select true from (values ('weekdays')) v(r)
      where v.r in ('once','daily','weekdays','weekly')));

  begin
    insert into quests (family_id, kid_id, title, xp, recurrence)
    select f.id, k.id, 'Upgrade probe', 10, 'weekdays'
      from kids k join families f on f.id = k.family_id limit 1;
    perform ok('the database really takes a weekdays chore', true);
    delete from quests where title = 'Upgrade probe';
  exception when check_violation then
    perform ok('the database really takes a weekdays chore', false,
               'the recurrence check was not rebuilt');
  end;

  begin
    update submissions set sticker = 'proud'
     where id = (select id from submissions limit 1);
    perform ok('the database really takes a sticker', true);
  exception when check_violation then
    perform ok('the database really takes a sticker', false,
               'the sticker check was not added');
  end;
end $$;

-- ---------- nothing was lost by applying the files again ----------
--
-- run.sh applies every file twice before this runs. A `create table` without
-- IF NOT EXISTS would have aborted its file; a policy recreated without a drop
-- would have errored; and either way the rows below would be gone or the
-- earlier suites would have failed outright.
do $$
begin
  perform ok('families survived the second application',
    (select count(*) from families) > 0);
  perform ok('so did their children', (select count(*) from kids) > 0);
  perform ok('and their finished work', (select count(*) from submissions) > 0);
  perform ok('row level security is still switched on everywhere',
    not exists (
      select 1 from pg_tables t
       join pg_class c on c.relname = t.tablename
       where t.schemaname = 'public'
         and t.tablename in ('families','kids','quests','submissions','rewards',
                             'redemptions','notes','overrides','events')
         and not c.relrowsecurity));
end $$;

-- ---------- and every policy is still there ----------
--
-- The rewrite that made this file re-runnable put a `drop policy if exists`
-- before each `create policy`. A drop that ran without its create — a typo in
-- the table name, say — would leave a table with row level security ON and no
-- policy at all, which reads as "nobody can see anything" rather than as an
-- error. That is a silent outage, so it is checked rather than assumed.
do $$
declare bare text := '';
begin
  select string_agg(t.tablename, ', ') into bare
    from pg_tables t
    join pg_class c on c.relname = t.tablename
   where t.schemaname = 'public'
     and c.relrowsecurity
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.tablename)
     -- These are reached only through security-definer functions and have no
     -- policies on purpose; see the notes in guilds.sql and alliances.sql.
     and t.tablename not in ('guilds','guild_members','guild_messages',
                             'alliances','alliance_members','alliance_results',
                             'schools','school_staff','school_members','school_rivalries',
                             'school_month_scores','school_awards','school_rivalry_results',
                             'school_top_students', 'push_sends',
                             'pairing_codes','pairing_claim_attempts',
                             'reminder_schedules','digest_sends','trial_reminder_sends','job_runs',
                             'crash_reports','billing_events','push_subscriptions',
                             'parental_consents','deletions','referrals',
                             'parent_invites','adult_invite_attempts','rpc_receipts',
                             'billing_cancellations');
  perform ok('no table is left locked with no policy at all', coalesce(bare, '') = '',
             'bare: ' || coalesce(bare, ''));
end $$;

-- ---------- every function, trigger, policy and grant came through the same ----------
--
-- run.sh recorded the schema after the first application and again after the
-- second (upgrade-snapshot.sql). They must be identical. Nothing here lists
-- functions by name: one added to any SQL file is in both records, so it is
-- checked the day it is written. What this catches that the rest does not: a
-- `drop trigger` whose `create trigger` was renamed, so the trigger is gone
-- after an upgrade; a grant that the second run gives back to PUBLIC after the
-- first took it away; a function whose settings (search_path, security
-- definer) differ between two definitions in two files, so the later file
-- wins only on the second run.
do $$
declare
  v_diff  text;
  v_count int;
begin
  select count(*) into v_count from upgrade_check.objects where pass = 'first';
  perform ok('the schema was recorded after each application', v_count > 0
    and v_count = (select count(*) from upgrade_check.objects where pass = 'second'),
    v_count::text || ' first, ' || (select count(*) from upgrade_check.objects where pass = 'second') || ' second');

  select string_agg(coalesce(a.kind, b.kind) || ' ' || coalesce(a.name, b.name)
                    || case when a.name is null then ' (only after the second run)'
                            when b.name is null then ' (gone after the second run)'
                            else ' (changed: ' || a.detail || '  ->  ' || b.detail || ')' end, E'\n')
    into v_diff
    from (select * from upgrade_check.objects where pass = 'first') a
    full join (select * from upgrade_check.objects where pass = 'second') b
      on a.kind = b.kind and a.name = b.name
   where a.name is null or b.name is null or a.detail is distinct from b.detail;
  perform ok(format('all %s functions, triggers, policies and tables are the same after the second run',
                    (select count(*) from upgrade_check.objects where pass = 'second')),
             v_diff is null, coalesce(v_diff, ''));

  select count(*) into v_count from upgrade_check.objects where pass = 'second' and kind = 'function';
  perform ok(format('%s functions among them, each with its grants and settings', v_count), v_count > 100);
end $$;
