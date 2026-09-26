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
                             'pairing_codes','pairing_claim_attempts',
                             'reminder_schedules','digest_sends','job_runs',
                             'crash_reports','billing_events','push_subscriptions',
                             'parental_consents','deletions','referrals');
  perform ok('no table is left locked with no policy at all', coalesce(bare, '') = '',
             'bare: ' || coalesce(bare, ''));
end $$;
