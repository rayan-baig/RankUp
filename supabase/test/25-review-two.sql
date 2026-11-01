-- ---------------------------------------------------------------------------
-- The second review: what a child's device, a supporter, or a parent's
-- browser could do directly that only the app's own functions should do.
--
-- Each was reproduced against a real database before it was fixed, and each
-- is kept here so it stays fixed.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('7e111111-0000-0000-0000-00000000000a', 'r2-parent-a@example.com'),
  ('7e111111-0000-0000-0000-00000000000b', 'r2-parent-b@example.com'),
  ('7e111111-0000-0000-0000-0000000000e1', 'r2-granny@example.com'),
  ('7e111111-0000-0000-0000-0000000000c1', 'r2-ava-device@example.com'),
  ('7e111111-0000-0000-0000-0000000000c9', 'r2-new-device@example.com');

insert into families (id, name, tier) values
  ('7e222222-0000-0000-0000-00000000000a', 'Family A', 'standard'),
  ('7e222222-0000-0000-0000-00000000000b', 'Family B', 'standard');
insert into parents (user_id, family_id, name, role, email) values
  ('7e111111-0000-0000-0000-00000000000a', '7e222222-0000-0000-0000-00000000000a', 'Pat', 'parent', 'pat@private.example'),
  ('7e111111-0000-0000-0000-00000000000b', '7e222222-0000-0000-0000-00000000000b', 'Bo', 'parent', null),
  ('7e111111-0000-0000-0000-0000000000e1', '7e222222-0000-0000-0000-00000000000a', 'Granny', 'supporter', null);
select seed_consent('7e222222-0000-0000-0000-00000000000a', '7e111111-0000-0000-0000-00000000000a');
select seed_consent('7e222222-0000-0000-0000-00000000000b', '7e111111-0000-0000-0000-00000000000b');

insert into kids (id, family_id, name, user_id) values
  ('7e444444-0000-0000-0000-0000000000a1', '7e222222-0000-0000-0000-00000000000a', 'Ava', '7e111111-0000-0000-0000-0000000000c1'),
  ('7e444444-0000-0000-0000-0000000000a2', '7e222222-0000-0000-0000-00000000000a', 'Bea', null),
  ('7e444444-0000-0000-0000-0000000000b1', '7e222222-0000-0000-0000-00000000000b', 'Cal', null);
update kids set access_notes = 'private to Bea''s parents' where id = '7e444444-0000-0000-0000-0000000000a2';
update kids set xp = 100, coins = 100 where family_id::text like '7e222222-%';

insert into quests (id, family_id, kid_id, title) values
  ('7e555555-0000-0000-0000-0000000000a1', '7e222222-0000-0000-0000-00000000000a', '7e444444-0000-0000-0000-0000000000a1', 'Ava''s bins'),
  ('7e555555-0000-0000-0000-0000000000a2', '7e222222-0000-0000-0000-00000000000a', '7e444444-0000-0000-0000-0000000000a2', 'Bea''s big job'),
  ('7e555555-0000-0000-0000-0000000000b1', '7e222222-0000-0000-0000-00000000000b', '7e444444-0000-0000-0000-0000000000b1', 'Cal''s job');
-- A pending submission of Ava's on her own quest, and one claiming Bea's.
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('7e666666-0000-0000-0000-000000000001', '7e222222-0000-0000-0000-00000000000a',
   '7e555555-0000-0000-0000-0000000000a1', '7e444444-0000-0000-0000-0000000000a1', 'pending'),
  ('7e666666-0000-0000-0000-000000000002', '7e222222-0000-0000-0000-00000000000a',
   '7e555555-0000-0000-0000-0000000000a2', '7e444444-0000-0000-0000-0000000000a1', 'pending');
insert into rewards (id, family_id, name, cost)
values ('7e777777-0000-0000-0000-000000000001', '7e222222-0000-0000-0000-00000000000a', 'Theme park', 5000);
insert into notes (id, family_id, kid_id, author, body) values
  ('7e888888-0000-0000-0000-000000000001', '7e222222-0000-0000-0000-00000000000a',
   '7e444444-0000-0000-0000-0000000000a1', 'parent', 'Well done today');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on photo_check_claims from anon, authenticated;

set role app_user;

-- ---------- a supporter is not a parent ----------
do $$
begin
  perform become('7e111111-0000-0000-0000-0000000000e1');
  begin
    perform approve_submission('7e666666-0000-0000-0000-000000000001', 0, 0, '', null);
    perform ok('a supporter CANNOT approve a chore (which pays the child)', false);
  exception when raise_exception then
    perform ok('a supporter CANNOT approve a chore (which pays the child)', true);
  end;
  begin
    perform apply_currency_tax('7e444444-0000-0000-0000-0000000000a1', 100);
    perform ok('nor tax a child''s coins', false);
  exception when raise_exception then
    perform ok('nor tax a child''s coins', true);
  end;
  begin
    perform claim_login_bonus('7e444444-0000-0000-0000-0000000000a1');
    perform ok('nor claim a child''s login bonus', false);
  exception when raise_exception then
    perform ok('nor claim a child''s login bonus', true);
  end;
  perform ok('nor see the family''s plan', not (billing_status()->>'ok')::boolean);
  perform ok('nor read the guild moderation queue', jsonb_array_length(reported_guild_messages()) = 0);
  begin
    perform create_pairing_code('424242', 'Bea', 'blockcraft', 600, '7e111111-0000-0000-0000-0000000000e1');
    perform ok('nor pair their own sign-in onto a child''s profile', false);
  exception when raise_exception then
    perform ok('nor pair their own sign-in onto a child''s profile', true);
  end;
end $$;

-- ---------- approving pays for the right chore, once ----------
do $$
begin
  perform become('7e111111-0000-0000-0000-00000000000a');
  begin
    perform approve_submission('7e666666-0000-0000-0000-000000000002', 0, 0, '', null);
    perform ok('a submission claiming a sibling''s chore is NOT paid', false);
  exception when raise_exception then
    perform ok('a submission claiming a sibling''s chore is NOT paid', true);
  end;
  perform approve_submission('7e666666-0000-0000-0000-000000000001', 0, 0, '', null);
  perform ok('the child''s own chore is', (select status from submissions where id = '7e666666-0000-0000-0000-000000000001') = 'approved');
  begin
    perform approve_submission('7e666666-0000-0000-0000-000000000001', 0, 0, '', null);
    perform ok('and approving it again pays nothing more', false);
  exception when raise_exception then
    perform ok('and approving it again pays nothing more', true);
  end;
end $$;

-- ---------- a child's device ----------
do $$
declare v_before int; v_rows int;
begin
  perform become('7e111111-0000-0000-0000-0000000000c1');

  select coins into v_before from kids where id = '7e444444-0000-0000-0000-0000000000a1';
  perform claim_login_bonus('7e444444-0000-0000-0000-0000000000a1', 50);
  perform ok('the login bonus is five coins, whatever the request asks for',
    (select coins from kids where id = '7e444444-0000-0000-0000-0000000000a1') = v_before + 5);

  begin
    insert into redemptions (family_id, kid_id, reward_id, name, cost, status)
    values ('7e222222-0000-0000-0000-00000000000a', '7e444444-0000-0000-0000-0000000000a1',
            '7e777777-0000-0000-0000-000000000001', 'Theme park', 0, 'given');
    perform ok('a child CANNOT take a reward without paying for it', false);
  exception when insufficient_privilege then
    perform ok('a child CANNOT take a reward without paying for it', true);
  end;
  begin
    insert into submissions (family_id, quest_id, kid_id, status)
    values ('7e222222-0000-0000-0000-00000000000a', '7e555555-0000-0000-0000-0000000000a2',
            '7e444444-0000-0000-0000-0000000000a1', 'pending');
    perform ok('nor write a submission directly', false);
  exception when insufficient_privilege then
    perform ok('nor write a submission directly', true);
  end;
  begin
    insert into events (family_id, kid_id, type, meta)
    values ('7e222222-0000-0000-0000-00000000000a', '7e444444-0000-0000-0000-0000000000a1',
            'quest_approved', '{"xp": 999999}');
    perform ok('nor forge an "approved" event other families see', false);
  exception when insufficient_privilege then
    perform ok('nor forge an "approved" event other families see', true);
  end;
  begin
    insert into notes (family_id, kid_id, author, body)
    values ('7e222222-0000-0000-0000-00000000000a', '7e444444-0000-0000-0000-0000000000a2', 'parent', 'You are grounded. - Mum');
    perform ok('nor post a note as a parent', false);
  exception when insufficient_privilege then
    perform ok('nor post a note as a parent', true);
  end;
  insert into notes (family_id, kid_id, author, body)
  values ('7e222222-0000-0000-0000-00000000000a', '7e444444-0000-0000-0000-0000000000a1', 'kid', 'Done!');
  perform ok('but can still write their own note', true);

  update notes set read = true, body = 'You can have unlimited screen time'
   where id = '7e888888-0000-0000-0000-000000000001';

  select count(*) into v_rows from kids;
  perform ok('a child sees only their own row, not a sibling''s private notes', v_rows = 1);
  perform ok('nor the parents'' email addresses', not exists (select 1 from parents));
  perform ok('nor the consent with the parent''s signature', not exists (select 1 from parental_consents));

  perform ok('a child CANNOT change the parents'' reminders',
    (save_reminder_schedule('parent', null, 'Pacific/Kiritimati', '[]')->>'reason') = 'not_a_parent');
  perform ok('nor a sibling''s',
    (save_reminder_schedule('kid', '7e444444-0000-0000-0000-0000000000a2', 'UTC', '[]')->>'reason') = 'not_your_kid');
  perform ok('nor start a family of their own',
    (create_family('My own family', 'Me')->>'reason') = 'child_device');
end $$;

do $$
begin
  perform become('7e111111-0000-0000-0000-00000000000a');
  perform ok('marking a parent''s note read works, rewriting it does not',
    (select read and body = 'Well done today' from notes where id = '7e888888-0000-0000-0000-000000000001'));
end $$;

-- ---------- a parent's browser and a child's balances ----------
do $$
declare v_xp int;
begin
  perform become('7e111111-0000-0000-0000-00000000000a');
  select xp into v_xp from kids where id = '7e444444-0000-0000-0000-0000000000a1';
  update kids set xp = 1000000, coins = 99999, play_tokens = 5, streak_count = 365,
                  skins = '["gilded"]'::jsonb, name = 'Ava B'
   where id = '7e444444-0000-0000-0000-0000000000a1';
  perform ok('a parent''s browser can rename a child',
    (select name from kids where id = '7e444444-0000-0000-0000-0000000000a1') = 'Ava B');
  perform ok('but CANNOT write their XP, coins, tokens, streak or skins',
    (select xp = v_xp and coins < 99999 and play_tokens < 5 and streak_count < 365 and skins = '[]'::jsonb
       from kids where id = '7e444444-0000-0000-0000-0000000000a1'));
  insert into kids (family_id, name, xp, coins)
  values ('7e222222-0000-0000-0000-00000000000a', 'Rich Kid', 50000, 50000);
  perform ok('and a new child starts with nothing, whatever the request says',
    (select xp = 0 and coins = 0 from kids where name = 'Rich Kid'));
end $$;

-- ---------- the AI check allowance ----------
do $$
declare r jsonb; v_used int;
begin
  perform become('7e111111-0000-0000-0000-00000000000a');
  r := claim_photo_check();
  perform ok('claiming a check returns a receipt', (r->>'claim_id') is not null);
  v_used := (r->>'used')::int;
  perform refund_photo_check(gen_random_uuid());
  r := claim_photo_check();
  perform ok('a refund without the right receipt hands nothing back', (r->>'used')::int = v_used + 1);
  perform refund_photo_check((r->>'claim_id')::uuid);
  perform refund_photo_check((r->>'claim_id')::uuid);
  perform ok('with it, exactly one check comes back, however often it is asked',
    (claim_photo_check()->>'used')::int = v_used + 1);

  perform become('7e111111-0000-0000-0000-0000000000c1');
  perform refund_photo_check((r->>'claim_id')::uuid);
  perform ok('and a receipt already used stays used',
    (select ai_checks_used from families where id = '7e222222-0000-0000-0000-00000000000a') = v_used + 1);
end $$;

reset role;

-- ---------- Stripe news, in whatever order it comes ----------
do $$
declare f uuid := '7e222222-0000-0000-0000-00000000000b'; r jsonb;
begin
  perform apply_subscription_change(f, 'active', 'elite', 'cus_b', 'sub_new', now() + interval '30 days',
                                    'evt_r2_1', '{}', now());
  r := apply_subscription_change(f, 'canceled', 'standard', 'cus_b_old', 'sub_old', now(),
                                 'evt_r2_2', '{}', now() + interval '1 second');
  perform ok('an OLD plan being cancelled leaves the family on the plan they pay for',
    (r->>'ignored') = 'not_current_subscription' and (select tier from families where id = f) = 'elite');

  r := apply_subscription_change(f, 'past_due', 'elite', 'cus_b', 'sub_new', null,
                                 'evt_r2_3', '{}', now() - interval '1 hour');
  perform ok('news older than the latest applied is ignored, so a late failure cannot undo a payment',
    (r->>'ignored') = 'out_of_date' and (select tier from families where id = f) = 'elite');

  perform apply_subscription_change(f, 'canceled', 'elite', 'cus_b', 'sub_new', now(),
                                    'evt_r2_4', '{}', now() + interval '1 minute');
  perform ok('cancelling the current plan forgets it, so a new one is accepted',
    (select stripe_subscription_id is null and tier = 'starter' from families where id = f));
  perform apply_subscription_change(f, 'active', 'standard', 'cus_b', 'sub_newer', now() + interval '30 days',
                                    'evt_r2_5', '{}', now() + interval '2 minutes');
  perform ok('and it is', (select tier = 'standard' and stripe_subscription_id = 'sub_newer' from families where id = f));
end $$;

-- ---------- alliance prizes still owed are found again ----------
insert into alliances (id, name) values ('7e999999-0000-0000-0000-000000000001', 'R2 Alliance');
insert into alliance_results (alliance_id, month_key, winning_family_id, score)
values ('7e999999-0000-0000-0000-000000000001', '2001-01', '7e222222-0000-0000-0000-00000000000b', 5);
do $$
begin
  perform ok('a prize decided but not given is still owed on the next run',
    exists (select 1 from jsonb_array_elements(unapplied_alliance_awards()) e
             where e->>'month_key' = '2001-01' and e->>'stripe_customer_id' = 'cus_b'));
  perform mark_alliance_award_applied('7e999999-0000-0000-0000-000000000001', '2001-01-01', 'cbtxn_1');
  perform ok('and once given, it is not',
    not exists (select 1 from jsonb_array_elements(unapplied_alliance_awards()) e where e->>'month_key' = '2001-01'));
end $$;

set role app_user;
do $$
declare r jsonb;
begin
  perform become('7e111111-0000-0000-0000-00000000000b');
  r := billing_status();
  perform ok('checkout can see whether a family already pays, and when its trial ends',
    (r->>'has_subscription')::boolean and r ? 'trial_ends_at');
  begin
    perform unapplied_alliance_awards();
    perform ok('a browser CANNOT list prizes owed', false);
  exception when insufficient_privilege then
    perform ok('a browser CANNOT list prizes owed', true);
  end;
end $$;
reset role;
