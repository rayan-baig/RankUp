-- ---------------------------------------------------------------------------
-- The offline-sync review: what a phone that retries, or a family in another
-- time zone, could do to a child's balance and chores.
--
-- A phone that sends a request and never hears back sends it again. Each of
-- these was reproduced (two calls, one action, charged twice) before it was
-- fixed.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('7f111111-0000-0000-0000-00000000000a', 'sr-parent-a@example.com'),
  ('7f111111-0000-0000-0000-00000000000b', 'sr-parent-b@example.com'),
  ('7f111111-0000-0000-0000-0000000000e1', 'sr-granny@example.com'),
  ('7f111111-0000-0000-0000-0000000000c1', 'sr-ava-device@example.com');

insert into families (id, name, tier) values
  ('7f222222-0000-0000-0000-00000000000a', 'Sync A', 'standard'),
  ('7f222222-0000-0000-0000-00000000000b', 'Sync B', 'standard');
insert into parents (user_id, family_id, name, role) values
  ('7f111111-0000-0000-0000-00000000000a', '7f222222-0000-0000-0000-00000000000a', 'Pat', 'parent'),
  ('7f111111-0000-0000-0000-00000000000b', '7f222222-0000-0000-0000-00000000000b', 'Bo', 'parent'),
  ('7f111111-0000-0000-0000-0000000000e1', '7f222222-0000-0000-0000-00000000000a', 'Granny', 'supporter');
select seed_consent('7f222222-0000-0000-0000-00000000000a', '7f111111-0000-0000-0000-00000000000a');
select seed_consent('7f222222-0000-0000-0000-00000000000b', '7f111111-0000-0000-0000-00000000000b');

insert into kids (id, family_id, name, user_id) values
  ('7f444444-0000-0000-0000-0000000000a1', '7f222222-0000-0000-0000-00000000000a', 'Ava', '7f111111-0000-0000-0000-0000000000c1'),
  ('7f444444-0000-0000-0000-0000000000b1', '7f222222-0000-0000-0000-00000000000b', 'Cal', null);
update kids set coins = 1000, play_tokens = 5 where family_id::text like '7f222222-%';

insert into rewards (id, family_id, name, cost)
values ('7f777777-0000-0000-0000-000000000001', '7f222222-0000-0000-0000-00000000000a', 'Film night', 30);

-- A daily chore approved yesterday, as the phone in Sydney sees it.
insert into quests (id, family_id, kid_id, title, recurrence, status, completed_at, last_reset_on) values
  ('7f555555-0000-0000-0000-0000000000a1', '7f222222-0000-0000-0000-00000000000a',
   '7f444444-0000-0000-0000-0000000000a1', 'Feed the cat', 'daily', 'approved',
   now() - interval '1 day', (now() at time zone 'UTC')::date - 1);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

create or replace function pg_temp.coins(p uuid) returns int language sql as $$ select coins from kids where id = p $$;

-- ---------- a retried redemption is not a second charge ----------
do $$
declare before int;
begin
  perform become('7f111111-0000-0000-0000-0000000000c1');
  before := pg_temp.coins('7f444444-0000-0000-0000-0000000000a1');
  perform redeem_reward('7f999999-0000-0000-0000-000000000001', '7f777777-0000-0000-0000-000000000001', '7f444444-0000-0000-0000-0000000000a1');
  perform ok('the retry of a redemption answers ok',
    (redeem_reward('7f999999-0000-0000-0000-000000000001', '7f777777-0000-0000-0000-000000000001', '7f444444-0000-0000-0000-0000000000a1')->>'ok')::boolean);
  perform ok('and the child paid once', pg_temp.coins('7f444444-0000-0000-0000-0000000000a1') = before - 30,
             format('%s -> %s', before, pg_temp.coins('7f444444-0000-0000-0000-0000000000a1')));
  perform ok('for one redemption', (select count(*) from redemptions where id = '7f999999-0000-0000-0000-000000000001') = 1);
end $$;

-- ---------- a retried game is paid once ----------
do $$
declare before int; tokens int; first jsonb; again jsonb;
begin
  perform become('7f111111-0000-0000-0000-0000000000c1');
  before := pg_temp.coins('7f444444-0000-0000-0000-0000000000a1');
  select play_tokens into tokens from kids where id = '7f444444-0000-0000-0000-0000000000a1';
  first := play_minigame('7f444444-0000-0000-0000-0000000000a1', 'stack', 100, '7f999999-0000-0000-0000-000000000002');
  again := play_minigame('7f444444-0000-0000-0000-0000000000a1', 'stack', 100, '7f999999-0000-0000-0000-000000000002');
  perform ok('the same game sent twice gets the same answer', (again->>'coins') = (first->>'coins') and (again->>'repeat')::boolean);
  perform ok('and pays once', pg_temp.coins('7f444444-0000-0000-0000-0000000000a1') = before + (first->>'coins')::int);
  perform ok('using one token', (select play_tokens from kids where id = '7f444444-0000-0000-0000-0000000000a1') = tokens - 1);
  perform play_minigame('7f444444-0000-0000-0000-0000000000a1', 'stack', 100, '7f999999-0000-0000-0000-000000000003');
  perform ok('a different game is a different game', (select play_tokens from kids where id = '7f444444-0000-0000-0000-0000000000a1') = tokens - 2);
  perform ok('an old phone with no request id still plays', (play_minigame('7f444444-0000-0000-0000-0000000000a1', 'stack', 10)->>'ok')::boolean);
end $$;

-- ---------- a skin is never bought twice ----------
do $$
declare before int;
begin
  perform become('7f111111-0000-0000-0000-0000000000c1');
  update kids set coins = 1000 where id = '7f444444-0000-0000-0000-0000000000a1';
  perform buy_market_skin('7f444444-0000-0000-0000-0000000000a1', 'ember', 0, false, '7f999999-0000-0000-0000-000000000004');
  before := pg_temp.coins('7f444444-0000-0000-0000-0000000000a1');
  perform buy_market_skin('7f444444-0000-0000-0000-0000000000a1', 'ember', 0, false, '7f999999-0000-0000-0000-000000000004');
  perform ok('a retried purchase costs nothing more', pg_temp.coins('7f444444-0000-0000-0000-0000000000a1') = before);
  perform buy_market_skin('7f444444-0000-0000-0000-0000000000a1', 'ember', 0, false, '7f999999-0000-0000-0000-000000000005');
  perform ok('and neither does buying a skin already owned', pg_temp.coins('7f444444-0000-0000-0000-0000000000a1') = before);
end $$;

-- ---------- a parent's tax, payout and gift, retried ----------
do $$
declare before int; pot int;
begin
  perform become('7f111111-0000-0000-0000-00000000000a');
  before := pg_temp.coins('7f444444-0000-0000-0000-0000000000a1');
  perform apply_currency_tax('7f444444-0000-0000-0000-0000000000a1', 50, '7f999999-0000-0000-0000-000000000006');
  perform apply_currency_tax('7f444444-0000-0000-0000-0000000000a1', 50, '7f999999-0000-0000-0000-000000000006');
  perform ok('a tax sent twice is taken once', pg_temp.coins('7f444444-0000-0000-0000-0000000000a1') = before - floor(before / 2.0)::int,
             format('%s -> %s', before, pg_temp.coins('7f444444-0000-0000-0000-0000000000a1')));

  perform record_gift('7f444444-0000-0000-0000-0000000000a1', 500, 'Birthday', '7f999999-0000-0000-0000-000000000007');
  perform record_gift('7f444444-0000-0000-0000-0000000000a1', 500, 'Birthday', '7f999999-0000-0000-0000-000000000007');
  select coalesce(sum(pence), 0) into pot from allowance_entries where kid_id = '7f444444-0000-0000-0000-0000000000a1';
  perform ok('a gift sent twice is one gift', pot = 500, format('pot %s', pot));

  perform record_payout('7f444444-0000-0000-0000-0000000000a1', 200, '', '7f999999-0000-0000-0000-000000000008');
  perform record_payout('7f444444-0000-0000-0000-0000000000a1', 200, '', '7f999999-0000-0000-0000-000000000008');
  select coalesce(sum(pence), 0) into pot from allowance_entries where kid_id = '7f444444-0000-0000-0000-0000000000a1';
  perform ok('a payment sent twice is recorded once', pot = 300, format('pot %s', pot));
end $$;

-- ---------- receipts belong to their child ----------
do $$
declare before int;
begin
  perform become('7f111111-0000-0000-0000-00000000000b');
  update kids set coins = 1000 where id = '7f444444-0000-0000-0000-0000000000b1';
  before := pg_temp.coins('7f444444-0000-0000-0000-0000000000b1');
  -- Another family reusing Ava's request id gets its own, real, answer.
  perform apply_currency_tax('7f444444-0000-0000-0000-0000000000b1', 10, '7f999999-0000-0000-0000-000000000006');
  perform ok('somebody else''s request id is not a free pass or a leak',
             pg_temp.coins('7f444444-0000-0000-0000-0000000000b1') = before - 100);
  -- Row level security with no policy: even with table grants (which this
  -- harness hands out wholesale), a browser sees nothing.
  begin
    perform ok('a browser CANNOT read the receipts', (select count(*) from rpc_receipts) = 0);
  exception when insufficient_privilege then
    perform ok('a browser CANNOT read the receipts', true);
  end;
end $$;

-- ---------- "mark given" reaches the server ----------
do $$
begin
  perform become('7f111111-0000-0000-0000-0000000000e1');
  begin
    perform mark_redemption_given('7f999999-0000-0000-0000-000000000001');
    perform ok('a supporter CANNOT mark a reward given', false);
  exception when raise_exception then
    perform ok('a supporter CANNOT mark a reward given', true);
  end;
  perform become('7f111111-0000-0000-0000-00000000000b');
  perform ok('another family''s parent cannot either',
             not (mark_redemption_given('7f999999-0000-0000-0000-000000000001')->>'ok')::boolean);
  perform become('7f111111-0000-0000-0000-00000000000a');
  perform ok('a parent can', (mark_redemption_given('7f999999-0000-0000-0000-000000000001')->>'ok')::boolean);
  perform ok('and it is given, with a time',
             (select status = 'given' and given_at is not null from redemptions where id = '7f999999-0000-0000-0000-000000000001'));
end $$;

-- ---------- unlinking a phone takes its access away ----------
do $$
begin
  perform become('7f111111-0000-0000-0000-00000000000b');
  perform ok('another family cannot unlink Ava''s phone',
             not (unlink_kid_device('7f444444-0000-0000-0000-0000000000a1')->>'ok')::boolean);
  perform become('7f111111-0000-0000-0000-0000000000c1');
  begin
    perform unlink_kid_device('7f444444-0000-0000-0000-0000000000a1');
    perform ok('nor can the child''s own phone', false);
  exception when raise_exception then
    perform ok('nor can the child''s own phone', true);
  end;
  perform become('7f111111-0000-0000-0000-00000000000a');
  perform ok('her parent can', (unlink_kid_device('7f444444-0000-0000-0000-0000000000a1')->>'ok')::boolean);
  perform become('7f111111-0000-0000-0000-0000000000c1');
  perform ok('and the old phone can no longer spend her coins',
             (select count(*) from kids where id = '7f444444-0000-0000-0000-0000000000a1') = 0);
end $$;

-- ---------- "today" is the family's day ----------
do $$
declare far_east text;
begin
  perform become('7f111111-0000-0000-0000-00000000000a');
  -- A zone where the date is already tomorrow compared with UTC right now,
  -- if there is one; otherwise the check below is about UTC and still holds.
  far_east := case when (now() at time zone 'Pacific/Kiritimati')::date > (now() at time zone 'UTC')::date
                   then 'Pacific/Kiritimati' else 'UTC' end;
  update quests set last_reset_on = (now() at time zone 'UTC')::date where id = '7f555555-0000-0000-0000-0000000000a1';
  perform reset_due_recurring_quests(far_east);
  perform ok('a daily chore comes back on the family''s own morning',
             far_east = 'UTC' or (select status from quests where id = '7f555555-0000-0000-0000-0000000000a1') = 'assigned');
  perform ok('a made-up zone is treated as UTC, not as an error',
             (reset_due_recurring_quests('Not/AZone')->>'ok')::boolean);
  perform ok('and a phone that says nothing still works', (reset_due_recurring_quests()->>'ok')::boolean);
end $$;

reset role;

-- ---------- a retried submission is recognised, not refused ----------
insert into quests (id, family_id, kid_id, title) values
  ('7f555555-0000-0000-0000-0000000000a2', '7f222222-0000-0000-0000-00000000000a',
   '7f444444-0000-0000-0000-0000000000a1', 'Tidy up');
set role app_user;
do $$
begin
  perform become('7f111111-0000-0000-0000-00000000000a');
  perform ok('the first send is accepted',
    (submit_quest('7f666666-0000-0000-0000-0000000000a1', '7f555555-0000-0000-0000-0000000000a2', '7f444444-0000-0000-0000-0000000000a1')->>'ok')::boolean);
  perform ok('the same send again is a repeat, not "not open"',
    (submit_quest('7f666666-0000-0000-0000-0000000000a1', '7f555555-0000-0000-0000-0000000000a2', '7f444444-0000-0000-0000-0000000000a1')->>'repeat')::boolean);
  perform ok('and there is still one submission',
    (select count(*) from submissions where quest_id = '7f555555-0000-0000-0000-0000000000a2') = 1);
end $$;
reset role;

-- ---------- a score is held to 0..100, not refused ----------
-- 999 typed by mistake broke the table's 0..100 check, so the whole chore
-- bounced back to the child's phone.
insert into quests (id, family_id, kid_id, title, test_score) values
  ('7f555555-0000-0000-0000-0000000000a3', '7f222222-0000-0000-0000-00000000000a',
   '7f444444-0000-0000-0000-0000000000a1', 'Spelling test', true);
set role app_user;
do $$
begin
  perform become('7f111111-0000-0000-0000-00000000000a');
  perform ok('a score of 999 is accepted',
    (submit_quest('7f666666-0000-0000-0000-0000000000a3', '7f555555-0000-0000-0000-0000000000a3',
                  '7f444444-0000-0000-0000-0000000000a1', '{"test_score": 999}'::jsonb)->>'ok')::boolean);
  perform ok('and kept as 100',
    (select test_score from submissions where id = '7f666666-0000-0000-0000-0000000000a3') = 100);
end $$;
reset role;

-- ---------- an hour's outage: a retried accept or send-back is a repeat ----------
-- The server is down, or its answer is lost on the way back, and the phone
-- sends the same decision again when it can. The same parent's second call
-- is answered as done and changes nothing; another parent's is still told
-- the chore was already decided.
insert into auth.users (id, email) values ('7f111111-0000-0000-0000-00000000000c', 'sr-parent-c@example.com');
insert into parents (user_id, family_id, name, role) values
  ('7f111111-0000-0000-0000-00000000000c', '7f222222-0000-0000-0000-00000000000a', 'Lee', 'parent');
insert into quests (id, family_id, kid_id, title, status) values
  ('7f555555-0000-0000-0000-0000000000b1', '7f222222-0000-0000-0000-00000000000a', '7f444444-0000-0000-0000-0000000000a1', 'Outage accept', 'submitted'),
  ('7f555555-0000-0000-0000-0000000000b2', '7f222222-0000-0000-0000-00000000000a', '7f444444-0000-0000-0000-0000000000a1', 'Outage send back', 'submitted');
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('7f666666-0000-0000-0000-0000000000b1', '7f222222-0000-0000-0000-00000000000a', '7f555555-0000-0000-0000-0000000000b1', '7f444444-0000-0000-0000-0000000000a1', 'pending'),
  ('7f666666-0000-0000-0000-0000000000b2', '7f222222-0000-0000-0000-00000000000a', '7f555555-0000-0000-0000-0000000000b2', '7f444444-0000-0000-0000-0000000000a1', 'pending');
set role app_user;
do $$
declare xp0 int; coins0 int; xp1 int; coins1 int; tokens1 int; events1 int; again jsonb; other jsonb;
begin
  perform become('7f111111-0000-0000-0000-00000000000a');
  select xp, coins into xp0, coins0 from kids where id = '7f444444-0000-0000-0000-0000000000a1';
  perform approve_submission('7f666666-0000-0000-0000-0000000000b1', 0, 0, 'well done');
  select xp, coins, play_tokens into xp1, coins1, tokens1 from kids where id = '7f444444-0000-0000-0000-0000000000a1';
  select count(*) into events1 from events where type = 'quest_approved' and meta->>'questId' = '7f555555-0000-0000-0000-0000000000b1';
  perform ok('the accept lands and pays', xp1 > xp0);

  -- The phone never heard back, and sends it again an hour later.
  perform approve_submission('7f666666-0000-0000-0000-0000000000b1', 0, 0, 'well done');
  perform ok('the same parent sending the accept again is answered, not refused', true);
  perform ok('and pays nothing more: XP, coins and tokens as they were',
    (select xp = xp1 and coins = coins1 and play_tokens = tokens1 from kids where id = '7f444444-0000-0000-0000-0000000000a1'));
  perform ok('and records it once',
    (select count(*) from events where type = 'quest_approved' and meta->>'questId' = '7f555555-0000-0000-0000-0000000000b1') = events1);

  -- Another parent accepting the same chore is a different decision: refused.
  perform become('7f111111-0000-0000-0000-00000000000c');
  begin
    perform approve_submission('7f666666-0000-0000-0000-0000000000b1', 0, 0, '');
    raise exception 'FAIL a second parent paid the same chore again';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    perform ok('another parent''s accept is still "already decided"', sqlerrm like '%already decided%', sqlerrm);
  end;

  -- The same for sending back.
  perform become('7f111111-0000-0000-0000-00000000000a');
  perform ok('the send-back lands', (reject_submission('7f666666-0000-0000-0000-0000000000b2', 'Not yet')->>'ok')::boolean);
  again := reject_submission('7f666666-0000-0000-0000-0000000000b2', 'Not yet');
  perform ok('sent again by the same parent, it is a repeat', (again->>'ok')::boolean and (again->>'repeat')::boolean, again::text);
  perform ok('and the chore is sent back once, not twice',
    (select redo_count from quests where id = '7f555555-0000-0000-0000-0000000000b2') = 1);
  perform become('7f111111-0000-0000-0000-00000000000c');
  other := reject_submission('7f666666-0000-0000-0000-0000000000b2', 'Me too');
  perform ok('another parent''s send-back is still refused as decided', other->>'reason' = 'decided', other::text);
end $$;
reset role;
