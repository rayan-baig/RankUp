-- ---------------------------------------------------------------------------
-- Chores that come back.
--
-- Reopening a quest is how it gets paid a second time, so "which ones are due"
-- must never be the caller's opinion. The device asks; these rules decide.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('b1a11111-1111-1111-1111-111111111111', 'rec-parent@example.com'),
  ('b1a33333-3333-3333-3333-333333333333', null),
  ('b1a55555-5555-5555-5555-555555555555', 'rec-stranger@example.com');
insert into families (id, name, tier) values
  ('b1a22222-0000-0000-0000-000000000001', 'Recurring Family', 'standard'),
  ('b1a22222-0000-0000-0000-000000000002', 'Other Family', 'standard');
insert into parents (user_id, family_id, name) values
  ('b1a11111-1111-1111-1111-111111111111', 'b1a22222-0000-0000-0000-000000000001', 'Rec Parent'),
  ('b1a55555-5555-5555-5555-555555555555', 'b1a22222-0000-0000-0000-000000000002', 'Stranger');
select seed_consent('b1a22222-0000-0000-0000-000000000001', 'b1a11111-1111-1111-1111-111111111111');
select seed_consent('b1a22222-0000-0000-0000-000000000002', 'b1a55555-5555-5555-5555-555555555555');
insert into kids (id, family_id, user_id, name) values
  ('b1a44444-0000-0000-0000-000000000001', 'b1a22222-0000-0000-0000-000000000001',
   'b1a33333-3333-3333-3333-333333333333', 'Rory');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

-- ---------- what comes back, and what does not ----------
do $$
declare n int;
begin
  set local role postgres;
  insert into quests (id, family_id, kid_id, title, xp, recurrence, status, completed_at) values
    ('b1a60000-0000-0000-0000-00000000000a', 'b1a22222-0000-0000-0000-000000000001',
     'b1a44444-0000-0000-0000-000000000001', 'Daily done yesterday', 20, 'daily', 'approved', now() - interval '1 day'),
    ('b1a60000-0000-0000-0000-00000000000b', 'b1a22222-0000-0000-0000-000000000001',
     'b1a44444-0000-0000-0000-000000000001', 'Daily done today', 20, 'daily', 'approved', now()),
    ('b1a60000-0000-0000-0000-00000000000c', 'b1a22222-0000-0000-0000-000000000001',
     'b1a44444-0000-0000-0000-000000000001', 'Weekly done three days ago', 20, 'weekly', 'approved', now() - interval '3 days'),
    ('b1a60000-0000-0000-0000-00000000000d', 'b1a22222-0000-0000-0000-000000000001',
     'b1a44444-0000-0000-0000-000000000001', 'Weekly done eight days ago', 20, 'weekly', 'approved', now() - interval '8 days'),
    ('b1a60000-0000-0000-0000-00000000000e', 'b1a22222-0000-0000-0000-000000000001',
     'b1a44444-0000-0000-0000-000000000001', 'One-off done long ago', 20, 'once', 'approved', now() - interval '30 days'),
    -- Still owed. Bringing this back would wipe the note the parent just wrote.
    ('b1a60000-0000-0000-0000-00000000000f', 'b1a22222-0000-0000-0000-000000000001',
     'b1a44444-0000-0000-0000-000000000001', 'Daily sent back', 20, 'daily', 'redo', null);
  update quests set redo_note = 'Under the bed too, please'
   where id = 'b1a60000-0000-0000-0000-00000000000f';
  set local role app_user;

  perform become('b1a11111-1111-1111-1111-111111111111');
  n := (reset_due_recurring_quests()->>'count')::int;
  perform ok('exactly the two that were due came back', n = 2);

  perform ok('yesterday''s daily chore is on the list again',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000a') = 'assigned');
  perform ok('today''s is not back a second time',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000b') = 'approved');
  perform ok('a weekly chore three days old waits',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000c') = 'approved');
  perform ok('a weekly chore eight days old returns',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000d') = 'assigned');
  perform ok('a one-off never returns, however old',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000e') = 'approved');
  perform ok('a chore sent back to redo is left alone',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000f') = 'redo');
  perform ok('and its send-back note survives',
    (select redo_note from quests where id = 'b1a60000-0000-0000-0000-00000000000f') = 'Under the bed too, please');

  -- Whoever opens the app first brings them back; the second device must not
  -- bring the same chore back again.
  perform ok('running it again brings nothing back',
    (reset_due_recurring_quests()->>'count')::int = 0);

  perform ok('a returned chore is clean, not half-finished',
    (select completed_at is null and redo_count = 0 and last_reset_on = current_date
       from quests where id = 'b1a60000-0000-0000-0000-00000000000a'));
end $$;

-- ---------- a child's own phone may do it ----------
--
-- Deliberate: whoever looks first in the morning brings the day's chores back
-- for everybody. Safe because the DATABASE decides which are due — the phone
-- cannot name a quest to reopen.
do $$
begin
  set local role postgres;
  update quests set status = 'approved', completed_at = now() - interval '2 days',
                    last_reset_on = current_date - 2
   where id = 'b1a60000-0000-0000-0000-00000000000a';
  set local role app_user;

  perform become('b1a33333-3333-3333-3333-333333333333');
  perform ok('a child''s phone can bring the day''s chores back',
    (reset_due_recurring_quests()->>'count')::int = 1);
  perform ok('and it really is back',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000a') = 'assigned');
end $$;

-- ---------- and only ever for their own family ----------
do $$
begin
  set local role postgres;
  update quests set status = 'approved', completed_at = now() - interval '2 days',
                    last_reset_on = current_date - 2
   where id = 'b1a60000-0000-0000-0000-00000000000a';
  set local role app_user;

  perform become('b1a55555-5555-5555-5555-555555555555');
  perform ok('another family''s parent reopens nothing here',
    (reset_due_recurring_quests()->>'count')::int = 0);
  -- Read as the owner: row level security means the stranger cannot see this
  -- quest at all, and a select that returns nothing would pass for the wrong
  -- reason.
  set local role postgres;
  perform ok('so the chore is still closed',
    (select status from quests where id = 'b1a60000-0000-0000-0000-00000000000a') = 'approved');
  set local role app_user;
end $$;

-- ---------- a reopened chore can be submitted again ----------
--
-- The whole point. If submit_quest refused it, a repeating chore would come
-- back on the list and then be impossible to hand in.
do $$
declare res jsonb;
begin
  perform become('b1a11111-1111-1111-1111-111111111111');
  perform reset_due_recurring_quests();

  perform become('b1a33333-3333-3333-3333-333333333333');
  res := submit_quest('b1a70000-0000-0000-0000-000000000001',
                      'b1a60000-0000-0000-0000-00000000000a',
                      'b1a44444-0000-0000-0000-000000000001');
  perform ok('a chore that came back can be handed in again', (res->>'ok')::boolean);
end $$;

reset role;
