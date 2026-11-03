-- ---------------------------------------------------------------------------
-- A chore's history, and the pocket money record.
--
-- Chore history (ParentHistory) is read from the submissions; the one thing a
-- parent may change about a past chore is a note on it, and that must change
-- nothing else: not what it paid, not whether it was accepted, not when. And
-- it records which adult sent a chore back, as it records who accepted one.
--
-- The pocket money record (ParentMoney) is read from allowance_summary: every
-- child's own latest lines, however busy a brother's ledger, and totals over
-- all time that add up to the pot.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('43111111-0000-4000-8000-00000000000a', 'hm-parent@example.com'),
  ('43111111-0000-4000-8000-00000000000b', 'hm-coparent@example.com'),
  ('43111111-0000-4000-8000-00000000000c', 'hm-gran@example.com'),
  ('43111111-0000-4000-8000-00000000000d', 'hm-stranger@example.com'),
  ('43111111-0000-4000-8000-0000000000c1', null);
insert into families (id, name, tier) values
  ('43222222-0000-4000-8000-00000000000a', 'History Family', 'standard'),
  ('43222222-0000-4000-8000-00000000000b', 'Stranger Family', 'starter');
insert into parents (id, user_id, family_id, name, role, is_owner) values
  ('43333333-0000-4000-8000-00000000000a', '43111111-0000-4000-8000-00000000000a', '43222222-0000-4000-8000-00000000000a', 'Pat', 'parent', true),
  ('43333333-0000-4000-8000-00000000000b', '43111111-0000-4000-8000-00000000000b', '43222222-0000-4000-8000-00000000000a', 'Lee', 'parent', false),
  ('43333333-0000-4000-8000-00000000000c', '43111111-0000-4000-8000-00000000000c', '43222222-0000-4000-8000-00000000000a', 'Gran', 'supporter', false),
  ('43333333-0000-4000-8000-00000000000d', '43111111-0000-4000-8000-00000000000d', '43222222-0000-4000-8000-00000000000b', 'Stranger', 'parent', true);
select seed_consent('43222222-0000-4000-8000-00000000000a', '43111111-0000-4000-8000-00000000000a');
insert into kids (id, family_id, name, user_id) values
  ('43444444-0000-4000-8000-0000000000a1', '43222222-0000-4000-8000-00000000000a', 'Mia', '43111111-0000-4000-8000-0000000000c1'),
  ('43444444-0000-4000-8000-0000000000a2', '43222222-0000-4000-8000-00000000000a', 'Leo', null);
insert into quests (id, family_id, kid_id, title, xp, done_means, pence) values
  ('43555555-0000-4000-8000-000000000001', '43222222-0000-4000-8000-00000000000a', '43444444-0000-4000-8000-0000000000a1', 'Feed the cat', 20, 'Bowl full', 50),
  ('43555555-0000-4000-8000-000000000002', '43222222-0000-4000-8000-00000000000a', '43444444-0000-4000-8000-0000000000a1', 'Tidy the room', 30, 'Floor clear', 0);
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('43666666-0000-4000-8000-000000000001', '43222222-0000-4000-8000-00000000000a', '43555555-0000-4000-8000-000000000001', '43444444-0000-4000-8000-0000000000a1', 'pending'),
  ('43666666-0000-4000-8000-000000000002', '43222222-0000-4000-8000-00000000000a', '43555555-0000-4000-8000-000000000002', '43444444-0000-4000-8000-0000000000a1', 'pending');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

-- ---------- who decided ----------
do $$
declare r jsonb;
begin
  perform become('43111111-0000-4000-8000-00000000000a');
  perform approve_submission('43666666-0000-4000-8000-000000000001', 0, 0, '', 'proud');
  perform become('43111111-0000-4000-8000-00000000000b');
  r := reject_submission('43666666-0000-4000-8000-000000000002', 'The floor is not clear yet');

  set local role postgres;
  perform ok('an accepted chore says which adult accepted it',
    (select decided_by from submissions where id = '43666666-0000-4000-8000-000000000001') = '43333333-0000-4000-8000-00000000000a');
  perform ok('and a chore sent back says which adult sent it back (it was left empty)',
    (select decided_by from submissions where id = '43666666-0000-4000-8000-000000000002') = '43333333-0000-4000-8000-00000000000b');
end $$;

-- ---------- a note, and nothing else ----------
do $$
declare
  r jsonb;
  before submissions;
  after submissions;
  xp_before int;
begin
  set local role postgres;
  select * into before from submissions where id = '43666666-0000-4000-8000-000000000001';
  select xp into xp_before from kids where id = '43444444-0000-4000-8000-0000000000a1';
  set local role app_user;

  perform become('43111111-0000-4000-8000-00000000000b');
  r := set_history_note('43666666-0000-4000-8000-000000000001', '  Did it without being asked  ');
  perform ok('a parent can add a note to a past chore', (r->>'ok')::boolean, r::text);

  set local role postgres;
  select * into after from submissions where id = '43666666-0000-4000-8000-000000000001';
  perform ok('the note is kept, trimmed', after.history_note = 'Did it without being asked', after.history_note);
  perform ok('and nothing else about the chore moved: what it paid, the verdict, when, who',
    after.awarded_xp = before.awarded_xp and after.awarded_coins = before.awarded_coins and after.status = before.status
    and after.decided_at = before.decided_at and after.decided_by = before.decided_by and after.parent_note = before.parent_note
    and (select xp from kids where id = '43444444-0000-4000-8000-0000000000a1') = xp_before);
  set local role app_user;

  r := set_history_note('43666666-0000-4000-8000-000000000001', repeat('x', 1000));
  set local role postgres;
  perform ok('a note is cut to 300 characters', length((select history_note from submissions
    where id = '43666666-0000-4000-8000-000000000001')) = 300);
  set local role app_user;

  perform become('43111111-0000-4000-8000-0000000000c1');
  r := set_history_note('43666666-0000-4000-8000-000000000001', 'I did it twice really');
  perform ok('the child cannot write one', r->>'reason' = 'not_found', r::text);
  perform become('43111111-0000-4000-8000-00000000000c');
  r := set_history_note('43666666-0000-4000-8000-000000000001', 'Lovely');
  perform ok('nor can a supporter', r->>'reason' = 'not_found', r::text);
  perform become('43111111-0000-4000-8000-00000000000d');
  r := set_history_note('43666666-0000-4000-8000-000000000001', 'Hello');
  perform ok('nor another family''s parent, who is told no more than for a chore that does not exist',
    r->>'reason' = 'not_found', r::text);
  r := set_history_note('43666666-0000-4000-8000-0000000000ff', 'Hello');
  perform ok('as for one that does not', r->>'reason' = 'not_found', r::text);

  -- The table directly: a parent may write the note column, never the verdict.
  perform become('43111111-0000-4000-8000-00000000000a');
  update submissions set history_note = 'Straight to the table', awarded_xp = 9999
   where id = '43666666-0000-4000-8000-000000000001';
  set local role postgres;
  perform ok('a direct update can change the note but not what the chore paid',
    (select awarded_xp from submissions where id = '43666666-0000-4000-8000-000000000001') = before.awarded_xp);
  begin
    update submissions set history_note = repeat('y', 301) where id = '43666666-0000-4000-8000-000000000001';
    perform ok('a note over 300 characters is refused by the table', false);
  exception when check_violation then
    perform ok('a note over 300 characters is refused by the table', true);
  end;
end $$;

-- ---------- the pocket money record ----------
set role postgres;
-- Mia has a long history; Leo a short one, all of it newer than most of hers.
insert into allowance_entries (family_id, kid_id, pence, kind, note, created_at)
select '43222222-0000-4000-8000-00000000000a', '43444444-0000-4000-8000-0000000000a1', 10, 'earned', 'Chore ' || n,
       now() - interval '1 day' * (300 - n)
  from generate_series(1, 250) n;
insert into allowance_entries (family_id, kid_id, pence, kind, note, created_at, created_by) values
  ('43222222-0000-4000-8000-00000000000a', '43444444-0000-4000-8000-0000000000a2', 200, 'earned', 'Wash the car', now() - interval '400 days', null),
  ('43222222-0000-4000-8000-00000000000a', '43444444-0000-4000-8000-0000000000a2', 500, 'gift', 'Birthday', now() - interval '399 days', '43333333-0000-4000-8000-00000000000c'),
  ('43222222-0000-4000-8000-00000000000a', '43444444-0000-4000-8000-0000000000a2', -300, 'paid', '', now() - interval '398 days', '43333333-0000-4000-8000-00000000000b');
set role app_user;

do $$
declare
  r jsonb;
  pots jsonb;
  mia jsonb;
  leo jsonb;
begin
  perform become('43111111-0000-4000-8000-00000000000a');
  r := record_payout('43444444-0000-4000-8000-0000000000a1', 1000, 'Saturday', gen_random_uuid());
  perform ok('a parent records a payout', (r->>'ok')::boolean, r::text);

  r := allowance_summary();
  pots := r->'pots';
  select p into mia from jsonb_array_elements(pots) p where p->>'kidId' = '43444444-0000-4000-8000-0000000000a1';
  select p into leo from jsonb_array_elements(pots) p where p->>'kidId' = '43444444-0000-4000-8000-0000000000a2';

  perform ok('every line of a child with a long history counts towards the pot',
    (mia->>'pence')::int = 250 * 10 + 50 - 1000, mia::text);
  perform ok('and the totals over all time add up to it: earned + added - paid',
    (mia->>'earned')::int - (mia->>'paid')::int + (mia->>'added')::int = (mia->>'pence')::int
    and (mia->>'paid')::int = 1000 and (mia->>'earned')::int = 2550, mia::text);
  perform ok('with when they were last paid', (mia->>'lastPaidAt')::timestamptz > now() - interval '1 minute', mia::text);
  perform ok('a brother''s too', (leo->>'pence')::int = 400 and (leo->>'earned')::int = 200 and (leo->>'added')::int = 500
    and (leo->>'paid')::int = 300, leo::text);

  perform ok('the busy child''s record stops at their latest 200 lines',
    (select count(*) from jsonb_array_elements(r->'entries') e where e->>'kidId' = '43444444-0000-4000-8000-0000000000a1') = 200);
  perform ok('and the brother''s old lines are all still there (a family-wide cut lost them)',
    (select count(*) from jsonb_array_elements(r->'entries') e where e->>'kidId' = '43444444-0000-4000-8000-0000000000a2') = 3);
  perform ok('each typed line says who recorded it',
    (select e->>'by' from jsonb_array_elements(r->'entries') e where e->>'kind' = 'paid'
       and e->>'kidId' = '43444444-0000-4000-8000-0000000000a2') = 'Lee'
    and (select e->>'by' from jsonb_array_elements(r->'entries') e where e->>'note' = 'Saturday') = 'Pat');

  -- A child sees only their own.
  perform become('43111111-0000-4000-8000-0000000000c1');
  r := allowance_summary();
  perform ok('a child''s own record holds only them',
    jsonb_array_length(r->'pots') = 1 and (r->'pots'->0->>'kidId') = '43444444-0000-4000-8000-0000000000a1'
    and not exists (select 1 from jsonb_array_elements(r->'entries') e where e->>'kidId' <> '43444444-0000-4000-8000-0000000000a1'));
end $$;

set role postgres;
