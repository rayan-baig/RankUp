-- ---------------------------------------------------------------------------
-- The weekly digest.
--
-- Two things have to hold. A family must never be messaged twice for the same
-- week, because a scheduler firing twice is normal. And a family with nothing
-- to report must not be messaged at all — a push saying "0 chores this week,
-- same as last week" is a product telling a struggling family off.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('7a111111-1111-1111-1111-111111111111', 'digest-parent@example.com');
insert into families (id, name, tier, timezone) values
  ('7a222222-0000-0000-0000-000000000001', 'Digest Family', 'standard', 'UTC'),
  ('7a222222-0000-0000-0000-000000000002', 'Quiet Family', 'standard', 'UTC');
insert into parents (user_id, family_id, name) values
  ('7a111111-1111-1111-1111-111111111111', '7a222222-0000-0000-0000-000000000001', 'Didge');
select seed_consent('7a222222-0000-0000-0000-000000000001', '7a111111-1111-1111-1111-111111111111');
select seed_consent('7a222222-0000-0000-0000-000000000002', '7a111111-1111-1111-1111-111111111111');
insert into kids (id, family_id, name) values
  ('7a444444-0000-0000-0000-000000000001', '7a222222-0000-0000-0000-000000000001', 'Dee'),
  ('7a444444-0000-0000-0000-000000000002', '7a222222-0000-0000-0000-000000000001', 'Eli');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- the numbers ----------
do $$
declare week_start date := date_trunc('week', current_date)::date; d jsonb; i int;
begin
  -- Four for Dee and one for Eli this week; two for Dee last week.
  for i in 1..4 loop
    insert into quests (id, family_id, kid_id, title, xp, status)
    values (('7a600000-0000-0000-0000-00000000000' || i)::uuid,
            '7a222222-0000-0000-0000-000000000001', '7a444444-0000-0000-0000-000000000001',
            'Chore ' || i, 20, 'approved');
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    values ('7a222222-0000-0000-0000-000000000001',
            ('7a600000-0000-0000-0000-00000000000' || i)::uuid,
            '7a444444-0000-0000-0000-000000000001', 'approved', week_start + 1);
  end loop;

  insert into quests (id, family_id, kid_id, title, xp, status)
  values ('7a600000-0000-0000-0000-000000000009',
          '7a222222-0000-0000-0000-000000000001', '7a444444-0000-0000-0000-000000000002',
          'Eli chore', 20, 'approved');
  insert into submissions (family_id, quest_id, kid_id, status, decided_at)
  values ('7a222222-0000-0000-0000-000000000001', '7a600000-0000-0000-0000-000000000009',
          '7a444444-0000-0000-0000-000000000002', 'approved', week_start + 2);

  for i in 5..6 loop
    insert into quests (id, family_id, kid_id, title, xp, status)
    values (('7a600000-0000-0000-0000-00000000000' || i)::uuid,
            '7a222222-0000-0000-0000-000000000001', '7a444444-0000-0000-0000-000000000001',
            'Old chore ' || i, 20, 'approved');
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    values ('7a222222-0000-0000-0000-000000000001',
            ('7a600000-0000-0000-0000-00000000000' || i)::uuid,
            '7a444444-0000-0000-0000-000000000001', 'approved', week_start - 5);
  end loop;

  d := family_week_digest('7a222222-0000-0000-0000-000000000001', week_start);
  perform ok('this week is counted', (d->>'approved')::int = 5);
  perform ok('and last week too, because a number alone says nothing',
    (d->>'approved_last_week')::int = 2);
  perform ok('each child is listed, busiest first',
    d->'kids'->0->>'name' = 'Dee' and (d->'kids'->0->>'done')::int = 4);
  perform ok('a child who did one is still listed',
    d->'kids'->1->>'name' = 'Eli' and (d->'kids'->1->>'done')::int = 1);
  perform ok('the quietest day is named, so a parent can act on it',
    length(d->>'quietest_day') > 2);
  perform ok('nothing is waiting to be reviewed yet',
    (d->>'waiting_for_you')::int = 0);
end $$;

-- ---------- what is waiting is the one call to action ----------
do $$
declare d jsonb;
begin
  insert into quests (id, family_id, kid_id, title, xp, status)
  values ('7a600000-0000-0000-0000-00000000000a',
          '7a222222-0000-0000-0000-000000000001', '7a444444-0000-0000-0000-000000000001',
          'Waiting chore', 20, 'submitted');
  insert into submissions (family_id, quest_id, kid_id, status)
  values ('7a222222-0000-0000-0000-000000000001', '7a600000-0000-0000-0000-00000000000a',
          '7a444444-0000-0000-0000-000000000001', 'pending');

  d := family_week_digest('7a222222-0000-0000-0000-000000000001',
                          date_trunc('week', current_date)::date);
  perform ok('a photo waiting for the parent is counted', (d->>'waiting_for_you')::int = 1);
end $$;

-- ---------- due, once, and only once ----------
do $$
declare res jsonb; n int;
begin
  -- Hour 0 and weekday 1 so the check is "any time today", whatever day the
  -- suite happens to run on.
  -- Counted by looking for OUR family rather than by the size of the list:
  -- earlier files in this suite leave approved chores of their own behind, and
  -- an exact count would break every time one of them changed.
  res := due_digests(1, 0);
  select count(*) into n from jsonb_array_elements(res->'digests') e
   where (e->>'family_id')::uuid = '7a222222-0000-0000-0000-000000000001';
  perform ok('the family with a week to report is due', n = 1);
  perform ok('the week it covers is named, which is what stops a repeat',
    (select e->>'week_key' from jsonb_array_elements(res->'digests') e
      where (e->>'family_id')::uuid = '7a222222-0000-0000-0000-000000000001') ~ '^\d{4}-W\d{2}$');

  perform ok('a family that has done nothing at all is left out',
    not exists (
      select 1 from jsonb_array_elements(res->'digests') e
       where (e->>'family_id')::uuid = '7a222222-0000-0000-0000-000000000002'));

  perform mark_digest_sent(
    '7a222222-0000-0000-0000-000000000001',
    (select e->>'week_key' from jsonb_array_elements(res->'digests') e
      where (e->>'family_id')::uuid = '7a222222-0000-0000-0000-000000000001'));
  res := due_digests(1, 0);
  perform ok('once sent, it is not due again this week',
    not exists (
      select 1 from jsonb_array_elements(res->'digests') e
       where (e->>'family_id')::uuid = '7a222222-0000-0000-0000-000000000001'));

  -- A scheduler firing twice in the same minute is normal.
  perform mark_digest_sent('7a222222-0000-0000-0000-000000000001',
                           to_char(date_trunc('week', current_date)::date, 'IYYY-"W"IW'));
  perform ok('marking it twice is harmless',
    (select count(*) from digest_sends
      where family_id = '7a222222-0000-0000-0000-000000000001') = 1);
end $$;

-- ---------- not before the evening, where the family lives ----------
do $$
declare res jsonb;
begin
  delete from digest_sends;
  -- Hour 25 can never have arrived, so nothing may be due whatever the clock says.
  res := due_digests(1, 25);
  perform ok('an hour that has not come round yet means nobody is due',
    jsonb_array_length(res->'digests') = 0);
  -- And a weekday that has not arrived either. Saturday is 6; asking for a day
  -- after today can only be empty.
  res := due_digests(least(7, extract(isodow from current_date)::int + 1), 0);
  perform ok('nor a day that has not come round yet',
    extract(isodow from current_date) = 7
    or jsonb_array_length(res->'digests') = 0);
end $$;

-- ---------- and the job's own functions are not public ----------
set role app_user;
do $$
begin
  perform become('7a111111-1111-1111-1111-111111111111');
  begin
    perform due_digests(1, 0);
    raise exception 'FAIL a signed-in parent listed every family in the database';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-in parent CANNOT list every family (%)', left(sqlerrm, 34);
  end;
  begin
    perform mark_digest_sent('7a222222-0000-0000-0000-000000000001', '2026-W01');
    raise exception 'FAIL a signed-in parent marked a digest sent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-in parent CANNOT mark one sent (%)', left(sqlerrm, 34);
  end;
end $$;
reset role;

-- ---------- a family's zone follows the reminder they set ----------
do $$
begin
  insert into reminder_schedules (family_id, role, at_local, timezone)
  values ('7a222222-0000-0000-0000-000000000002', 'parent', '07:30', 'Europe/London');
  perform ok('saving a reminder tells the digest where the family lives',
    (select timezone from families where id = '7a222222-0000-0000-0000-000000000002') = 'Europe/London');
end $$;
