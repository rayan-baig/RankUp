-- ---------------------------------------------------------------------------
-- Every refusal, given at least once.
--
-- supabase/test/refusals.mjs reads every `{ ok: false, reason }` out of the
-- SQL files and fails for any that the suite never actually produces. These
-- are the ones nothing else here reached: mostly the plain ones ("no such
-- child", "you are in no family", a name left blank), and a few that need a
-- full room to reach (a guild or an alliance with no seat left, a family
-- with six adults, a school with three rivals already). Each is called the
-- way the app or the server calls it, and must say exactly that reason.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('38a00000-0000-4000-8000-000000000001', 'rf-p1@example.com'),
  ('38a00000-0000-4000-8000-000000000002', 'rf-k1@example.com'),
  ('38a00000-0000-4000-8000-000000000003', 'rf-p2@example.com'),
  ('38a00000-0000-4000-8000-000000000004', 'rf-k2@example.com'),
  ('38a00000-0000-4000-8000-000000000005', 'rf-k3@example.com'),
  ('38a00000-0000-4000-8000-000000000006', 'rf-supporter@example.com'),
  ('38a00000-0000-4000-8000-000000000007', 'rf-nofamily@example.com'),
  ('38a00000-0000-4000-8000-000000000011', 'rf-a1@example.com'),
  ('38a00000-0000-4000-8000-000000000012', 'rf-a2@example.com'),
  ('38a00000-0000-4000-8000-000000000013', 'rf-a3@example.com'),
  ('38a00000-0000-4000-8000-000000000014', 'rf-a4@example.com'),
  ('38a00000-0000-4000-8000-000000000015', 'rf-a5@example.com'),
  ('38a00000-0000-4000-8000-000000000016', 'rf-a6@example.com'),
  ('38a00000-0000-4000-8000-000000000021', 'rf-f3a@example.com'),
  ('38a00000-0000-4000-8000-000000000022', 'rf-f3b@example.com'),
  ('38a00000-0000-4000-8000-000000000023', 'rf-f3c@example.com'),
  ('38a00000-0000-4000-8000-000000000024', 'rf-f3d@example.com'),
  ('38a00000-0000-4000-8000-000000000025', 'rf-f3e@example.com'),
  ('38a00000-0000-4000-8000-000000000026', 'rf-f3f@example.com'),
  ('38a00000-0000-4000-8000-000000000031', 'rf-t1@example.com'),
  ('38a00000-0000-4000-8000-000000000032', 'rf-t2@example.com'),
  ('38a00000-0000-4000-8000-000000000033', 'rf-t3@example.com'),
  ('38a00000-0000-4000-8000-000000000034', 'rf-t4@example.com'),
  ('38a00000-0000-4000-8000-000000000035', 'rf-t5@example.com'),
  ('38a00000-0000-4000-8000-000000000036', 'rf-t6@example.com');

insert into families (id, name, tier) values
  ('38b00000-0000-4000-8000-000000000001', 'Refusals One', 'elite'),
  ('38b00000-0000-4000-8000-000000000002', 'Refusals Two', 'elite'),
  ('38b00000-0000-4000-8000-000000000003', 'Refusals Six Adults', 'standard');

insert into parents (user_id, family_id, name, role) values
  ('38a00000-0000-4000-8000-000000000001', '38b00000-0000-4000-8000-000000000001', 'Pat', 'parent'),
  ('38a00000-0000-4000-8000-000000000006', '38b00000-0000-4000-8000-000000000001', 'Gran', 'supporter'),
  ('38a00000-0000-4000-8000-000000000003', '38b00000-0000-4000-8000-000000000002', 'Lee', 'parent'),
  ('38a00000-0000-4000-8000-000000000021', '38b00000-0000-4000-8000-000000000003', 'A', 'parent'),
  ('38a00000-0000-4000-8000-000000000022', '38b00000-0000-4000-8000-000000000003', 'B', 'parent'),
  ('38a00000-0000-4000-8000-000000000023', '38b00000-0000-4000-8000-000000000003', 'C', 'supporter'),
  ('38a00000-0000-4000-8000-000000000024', '38b00000-0000-4000-8000-000000000003', 'D', 'supporter'),
  ('38a00000-0000-4000-8000-000000000025', '38b00000-0000-4000-8000-000000000003', 'E', 'supporter'),
  ('38a00000-0000-4000-8000-000000000026', '38b00000-0000-4000-8000-000000000003', 'F', 'supporter');
select seed_consent('38b00000-0000-4000-8000-000000000001', '38a00000-0000-4000-8000-000000000001');
select seed_consent('38b00000-0000-4000-8000-000000000002', '38a00000-0000-4000-8000-000000000003');

insert into kids (id, family_id, name, user_id) values
  ('38c00000-0000-4000-8000-000000000001', '38b00000-0000-4000-8000-000000000001', 'Ari', '38a00000-0000-4000-8000-000000000002'),
  ('38c00000-0000-4000-8000-000000000002', '38b00000-0000-4000-8000-000000000001', 'Bo', null),
  ('38c00000-0000-4000-8000-000000000003', '38b00000-0000-4000-8000-000000000001', 'Cy', null),
  ('38c00000-0000-4000-8000-000000000004', '38b00000-0000-4000-8000-000000000001', 'Di', null),
  ('38c00000-0000-4000-8000-000000000005', '38b00000-0000-4000-8000-000000000001', 'Ez', null),
  ('38c00000-0000-4000-8000-000000000011', '38b00000-0000-4000-8000-000000000002', 'Fen', '38a00000-0000-4000-8000-000000000004'),
  ('38c00000-0000-4000-8000-000000000012', '38b00000-0000-4000-8000-000000000002', 'Gus', '38a00000-0000-4000-8000-000000000005');

-- A guild with all five seats taken by the first family's children, and a
-- child from the second family whose own parent has already said yes.
insert into guilds (id, name, capacity, leader_kid_id, invite_code, owner_family_id) values
  ('38d00000-0000-4000-8000-000000000001', 'Full House', 5, '38c00000-0000-4000-8000-000000000001',
   'RFGLD1', '38b00000-0000-4000-8000-000000000001');
insert into guild_members (guild_id, kid_id, family_id, role, status) values
  ('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', '38b00000-0000-4000-8000-000000000001', 'leader', 'active'),
  ('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000002', '38b00000-0000-4000-8000-000000000001', 'member', 'active'),
  ('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000003', '38b00000-0000-4000-8000-000000000001', 'member', 'active'),
  ('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000004', '38b00000-0000-4000-8000-000000000001', 'member', 'active'),
  ('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000005', '38b00000-0000-4000-8000-000000000001', 'member', 'active');
insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent) values
  ('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000011', '38b00000-0000-4000-8000-000000000002', 'member', 'invited', true);

-- An alliance of one seat, taken by its owner.
insert into alliances (id, name, capacity, invite_code, owner_family_id) values
  ('38e00000-0000-4000-8000-000000000001', 'One Seat', 1, 'RFALL1', '38b00000-0000-4000-8000-000000000002');
insert into alliance_members (alliance_id, family_id) values
  ('38e00000-0000-4000-8000-000000000001', '38b00000-0000-4000-8000-000000000002');

-- Chores in each state a refusal needs: one already decided, one waiting
-- for a parent, one with a submission already waiting on it.
insert into quests (id, family_id, kid_id, title, status) values
  ('38f00000-0000-4000-8000-000000000001', '38b00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', 'Decided', 'approved'),
  ('38f00000-0000-4000-8000-000000000002', '38b00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', 'Submitted', 'submitted'),
  ('38f00000-0000-4000-8000-000000000003', '38b00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', 'Open, one waiting', 'assigned');
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('38f00000-0000-4000-8000-000000000011', '38b00000-0000-4000-8000-000000000001', '38f00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', 'approved'),
  ('38f00000-0000-4000-8000-000000000013', '38b00000-0000-4000-8000-000000000001', '38f00000-0000-4000-8000-000000000003', '38c00000-0000-4000-8000-000000000001', 'pending');

-- Second-parent invitations in every dead state, and one for a family that
-- already has six adults.
insert into parent_invites (code, family_id, expires_at, attempts, revoked_at) values
  ('BRNDAB', '38b00000-0000-4000-8000-000000000001', now() + interval '1 day', 5, null),
  ('RVKDAB', '38b00000-0000-4000-8000-000000000001', now() + interval '1 day', 0, now()),
  ('XPRDAB', '38b00000-0000-4000-8000-000000000001', now() - interval '1 minute', 0, null),
  ('FULLAB', '38b00000-0000-4000-8000-000000000003', now() + interval '1 day', 0, null);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

/** The call was refused, and for exactly this reason. */
create or replace function pg_temp.refused(label text, r jsonb, reason text) returns void
language sql as $$
  select ok(label, coalesce((r->>'ok')::boolean, true) = false and r->>'reason' = reason, coalesce(r::text, 'null'))
$$;

-- ---------- the server's own calls (service role) ----------
do $$
begin
  perform pg_temp.refused('a full refund with no charge or family is refused as no_charge',
    apply_charge_refund(null, 'ch_rf', null, true), 'no_charge');
  perform pg_temp.refused('a ticket credit of nothing is refused as bad_count',
    credit_flash_tickets('38b00000-0000-4000-8000-000000000001', 0), 'bad_count');
  perform pg_temp.refused('a ticket credit for a family that is gone is refused as no_family',
    credit_flash_tickets(gen_random_uuid(), 2), 'no_family');
  perform pg_temp.refused('a payment with no Stripe event id is refused as no_event_id',
    record_payment('38b00000-0000-4000-8000-000000000001', null, 'invoice.paid', 999), 'no_event_id');
  perform pg_temp.refused('a subscription for a school that is gone is refused as no_school',
    apply_school_subscription(gen_random_uuid(), 'active'), 'no_school');
  perform pg_temp.refused('a school status that is not one of the four is refused as bad_status',
    set_school_status(gen_random_uuid(), 'closed'), 'bad_status');
end $$;

set role app_user;

-- ---------- a child who is not there ----------
do $$
declare nobody uuid := gen_random_uuid();
begin
  perform become('38a00000-0000-4000-8000-000000000002');
  perform pg_temp.refused('the Sunday Market, for a child who is not there: no_kid',
    buy_market_skin(nobody, 'ember', 1), 'no_kid');
  perform pg_temp.refused('the daily bonus, for a child who is not there: no_kid',
    claim_login_bonus(nobody), 'no_kid');
  perform pg_temp.refused('a game, for a child who is not there: no_kid',
    play_minigame(nobody, 'snake', 10), 'no_kid');
  perform pg_temp.refused('a new look, for a child who is not there: no_kid',
    set_kid_look(nobody, 'blockcraft'), 'no_kid');
  perform pg_temp.refused('a streak freeze, for a child who is not there: no_kid',
    use_streak_freeze(nobody), 'no_kid');
  perform become('38a00000-0000-4000-8000-000000000001');
  perform pg_temp.refused('a Currency Tax on a child who is not there: no_kid',
    apply_currency_tax(nobody, 50), 'no_kid');
  perform pg_temp.refused('a guild for a child who is not there: no_kid',
    create_guild(nobody, 'Ghosts'), 'no_kid');
end $$;

-- ---------- a signed-in account in no family ----------
do $$
begin
  perform become('38a00000-0000-4000-8000-000000000007');
  perform pg_temp.refused('the alliance table, for an account in no family: no_family',
    alliance_standings(), 'no_family');
  perform pg_temp.refused('reading reminders, in no family: no_family',
    my_reminder_schedule('parent'), 'no_family');
  perform pg_temp.refused('saving reminders, in no family: no_family',
    save_reminder_schedule('parent', null, 'UTC', '[]'::jsonb), 'no_family');
  perform pg_temp.refused('bringing back repeating chores, in no family: no_family',
    reset_due_recurring_quests('UTC'), 'no_family');
  perform pg_temp.refused('turning on notifications, in no family: no_family',
    save_push_subscription('https://push.example.test/rf', '{"p256dh":"x","auth":"y"}'::jsonb), 'no_family');
  perform pg_temp.refused('leaving a school, as nobody on its staff: not_school_staff',
    leave_school_staff(), 'not_school_staff');
end $$;

-- ---------- a parent's everyday refusals ----------
do $$
begin
  perform become('38a00000-0000-4000-8000-000000000001');
  perform pg_temp.refused('reminders for somebody who is neither a parent nor a child: bad_role',
    save_reminder_schedule('teacher', null, 'UTC', '[]'::jsonb), 'bad_role');
  perform pg_temp.refused('deleting the account without typing DELETE: confirmation_required',
    delete_family_account('delete'), 'confirmation_required');
  perform ok('and the family is still there',
    exists (select 1 from families where id = '38b00000-0000-4000-8000-000000000001'));
  perform pg_temp.refused('sending back a submission that is not there: not_found',
    reject_submission(gen_random_uuid(), 'again'), 'not_found');
  perform pg_temp.refused('sending back one a parent already accepted: decided',
    reject_submission('38f00000-0000-4000-8000-000000000011', 'again'), 'decided');
  perform pg_temp.refused('joining an alliance whose one seat is taken: full',
    join_alliance('rfall1'), 'full');
end $$;

-- ---------- a child's chores ----------
do $$
begin
  perform become('38a00000-0000-4000-8000-000000000002');
  perform pg_temp.refused('"I did it!" on a chore that is not there: no_quest',
    submit_quest(gen_random_uuid(), gen_random_uuid(), '38c00000-0000-4000-8000-000000000001'), 'no_quest');
  perform pg_temp.refused('"I did it!" on a chore already waiting for a parent: not_open',
    submit_quest(gen_random_uuid(), '38f00000-0000-4000-8000-000000000002', '38c00000-0000-4000-8000-000000000001'), 'not_open');
  perform pg_temp.refused('"I did it!" again while one is still waiting: already_pending',
    submit_quest(gen_random_uuid(), '38f00000-0000-4000-8000-000000000003', '38c00000-0000-4000-8000-000000000001'), 'already_pending');
  perform pg_temp.refused('a blank guild message: empty',
    post_guild_message(gen_random_uuid(), '38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', '   '), 'empty');
  perform pg_temp.refused('a guild message over 300 characters: too_long',
    post_guild_message(gen_random_uuid(), '38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000001', repeat('a', 301)), 'too_long');
end $$;

-- ---------- a guild with no seat left ----------
do $$
begin
  perform become('38a00000-0000-4000-8000-000000000001');
  perform pg_temp.refused('both parents say yes, but all five seats are taken: full',
    approve_guild_member('38d00000-0000-4000-8000-000000000001', '38c00000-0000-4000-8000-000000000011'), 'full');
  perform become('38a00000-0000-4000-8000-000000000004');
  perform pg_temp.refused('asking again while the first ask is waiting: already_requested',
    request_guild_join('38c00000-0000-4000-8000-000000000011', 'rfgld1'), 'already_requested');
  perform become('38a00000-0000-4000-8000-000000000005');
  perform pg_temp.refused('asking to join a guild with every seat taken: full',
    request_guild_join('38c00000-0000-4000-8000-000000000012', 'RFGLD1'), 'full');
end $$;

-- Read as the owner: neither family's parent can see the other's child's row.
reset role;
do $$
begin
  perform ok('and the child refused a seat is still waiting, not in',
    (select status from guild_members where guild_id = '38d00000-0000-4000-8000-000000000001'
        and kid_id = '38c00000-0000-4000-8000-000000000011') = 'invited');
  perform ok('and the guild still has five, not six',
    (select count(*) from guild_members where guild_id = '38d00000-0000-4000-8000-000000000001' and status = 'active') = 5);
end $$;
set role app_user;

-- ---------- a second parent's invitation, dead every way ----------
do $$
begin
  perform become('38a00000-0000-4000-8000-000000000011');
  perform pg_temp.refused('a code guessed at five times: code_burned', claim_parent_invite('BRNDAB', 'Sam'), 'code_burned');
  perform become('38a00000-0000-4000-8000-000000000012');
  perform pg_temp.refused('a code the parent took back: revoked', claim_parent_invite('RVKDAB', 'Sam'), 'revoked');
  perform become('38a00000-0000-4000-8000-000000000013');
  perform pg_temp.refused('a code past its time: expired', claim_parent_invite('xprdab', 'Sam'), 'expired');
  perform become('38a00000-0000-4000-8000-000000000014');
  perform pg_temp.refused('a family that already has six adults: too_many_adults',
    claim_parent_invite('FULLAB', 'Sam'), 'too_many_adults');
end $$;
reset role;
do $$ begin
  perform ok('and nobody was added to the family of six',
    (select count(*) from parents where family_id = '38b00000-0000-4000-8000-000000000003') = 6);
end $$;
set role app_user;

-- ---------- a grandparent's gift ----------
do $$
begin
  perform become('38a00000-0000-4000-8000-000000000006');
  perform pg_temp.refused('a gift to a child who is not in the family: no_such_kid',
    supporter_gift(gen_random_uuid(), 500), 'no_such_kid');
  perform pg_temp.refused('a gift of nothing: not_an_amount',
    supporter_gift('38c00000-0000-4000-8000-000000000001', 0), 'not_an_amount');
  perform pg_temp.refused('a gift over a hundred pounds: not_an_amount',
    supporter_gift('38c00000-0000-4000-8000-000000000001', 10001), 'not_an_amount');
end $$;

-- ---------- schools: signing up and joining ----------
do $$
declare r jsonb;
begin
  perform become('38a00000-0000-4000-8000-000000000016');
  perform pg_temp.refused('a school with a one-letter district: bad_district',
    register_school('Refusal High', 'x', 'Town', 300, 'Ms Head'), 'bad_district');
  perform pg_temp.refused('a school signed up by nobody named: bad_your_name',
    register_school('Refusal High', 'Refusal Vale', 'Town', 300, '   '), 'bad_your_name');
  perform become(null);
  perform pg_temp.refused('joining a school staff while signed out: not_signed_in',
    join_school_staff('ANYCODE1', 'Mr Nobody'), 'not_signed_in');

  -- Six schools in one district, each signed up by its own head.
  perform become('38a00000-0000-4000-8000-000000000031');
  r := register_school('Refusal School A', 'Refusal Vale', 'Town', 300, 'Head A');
  perform ok('school A signs up', (r->>'ok')::boolean, r::text);
  perform become('38a00000-0000-4000-8000-000000000032');
  perform ok('school B signs up', (register_school('Refusal School B', 'Refusal Vale', 'Town', 300, 'Head B')->>'ok')::boolean);
  perform become('38a00000-0000-4000-8000-000000000033');
  perform ok('school C signs up', (register_school('Refusal School C', 'Refusal Vale', 'Town', 300, 'Head C')->>'ok')::boolean);
  perform become('38a00000-0000-4000-8000-000000000034');
  perform ok('school D signs up', (register_school('Refusal School D', 'Refusal Vale', 'Town', 300, 'Head D')->>'ok')::boolean);
  perform become('38a00000-0000-4000-8000-000000000035');
  perform ok('school E signs up', (register_school('Refusal School E', 'Refusal Vale', 'Town', 300, 'Head E')->>'ok')::boolean);
  perform become('38a00000-0000-4000-8000-000000000036');
  perform ok('school F signs up', (register_school('Refusal School F', 'Refusal Vale', 'Town', 300, 'Head F')->>'ok')::boolean);

  perform become('38a00000-0000-4000-8000-000000000031');
  perform pg_temp.refused('joining a second school staff: already_staff',
    join_school_staff('ANYCODE1', 'Head A'), 'already_staff');
  perform become('38a00000-0000-4000-8000-000000000015');
  perform pg_temp.refused('joining a school staff with no name: bad_your_name',
    join_school_staff('ANYCODE1', '  '), 'bad_your_name');
end $$;

-- The operator verifies them; A's plan has lapsed, the rest are paying, and
-- B already has three rivals.
reset role;
update schools set verified = true, status = 'active' where name like 'Refusal School %';
update schools set status = 'lapsed' where name = 'Refusal School A';
insert into school_rivalries (challenger_id, rival_id)
select b.id, o.id from schools b, schools o
 where b.name = 'Refusal School B' and o.name in ('Refusal School C', 'Refusal School D', 'Refusal School E');
-- School F's id, for the heads below: a head cannot look another school up.
select set_config('rf.school_f', id::text, false) from schools where name = 'Refusal School F';
set role app_user;

do $$
begin
  perform become('38a00000-0000-4000-8000-000000000031');
  perform pg_temp.refused('a challenge from a school whose plan has lapsed: plan_not_active',
    challenge_school(current_setting('rf.school_f')::uuid), 'plan_not_active');
  perform pg_temp.refused('publishing School Stars for a month with none: nothing_to_publish',
    publish_top_students('2026-01'), 'nothing_to_publish');
  perform pg_temp.refused('a school of no students: bad_size', update_school_size(0), 'bad_size');
  perform become('38a00000-0000-4000-8000-000000000032');
  perform pg_temp.refused('a fourth rival: too_many_rivals',
    challenge_school(current_setting('rf.school_f')::uuid), 'too_many_rivals');
end $$;

reset role;
update schools set status = 'suspended' where name = 'Refusal School A';
set role app_user;

do $$
begin
  perform become('38a00000-0000-4000-8000-000000000031');
  perform pg_temp.refused('paying, for a school the operator suspended: suspended',
    school_checkout_info(), 'suspended');
end $$;

reset role;
