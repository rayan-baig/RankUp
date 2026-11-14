-- ---------------------------------------------------------------------------
-- A co-parent from invitation to removal, one step at a time.
--
-- 21-coparents.sql holds the rules about power; this walks the whole life of
-- one invitation and the adult it brings in: invited, joined, what they can
-- and cannot do as a parent (and as a supporter), removed, and what removal
-- leaves behind. Then the codes that must not work: one past its seven days,
-- one already used (by somebody else, and by the same adult again), and one
-- sent by an adult who has since been removed.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('44111111-0000-4000-8000-00000000000a', 'cw-owner@example.com'),
  ('44111111-0000-4000-8000-00000000000b', 'cw-second@example.com'),
  ('44111111-0000-4000-8000-00000000000c', 'cw-third@example.com'),
  ('44111111-0000-4000-8000-00000000000d', 'cw-gran@example.com'),
  ('44111111-0000-4000-8000-00000000000e', 'cw-late@example.com');
insert into families (id, name, tier) values ('44222222-0000-4000-8000-00000000000a', 'Walk Family', 'standard');
insert into parents (user_id, family_id, name, is_owner) values
  ('44111111-0000-4000-8000-00000000000a', '44222222-0000-4000-8000-00000000000a', 'Owner', true);
select seed_consent('44222222-0000-4000-8000-00000000000a', '44111111-0000-4000-8000-00000000000a');
insert into kids (id, family_id, name) values
  ('44444444-0000-4000-8000-0000000000a1', '44222222-0000-4000-8000-00000000000a', 'Kit');
insert into quests (id, family_id, kid_id, title, xp, done_means) values
  ('44555555-0000-4000-8000-000000000001', '44222222-0000-4000-8000-00000000000a', '44444444-0000-4000-8000-0000000000a1', 'Sweep', 20, 'Clean'),
  ('44555555-0000-4000-8000-000000000002', '44222222-0000-4000-8000-00000000000a', '44444444-0000-4000-8000-0000000000a1', 'Dust', 20, 'Clean');
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('44666666-0000-4000-8000-000000000001', '44222222-0000-4000-8000-00000000000a', '44555555-0000-4000-8000-000000000001', '44444444-0000-4000-8000-0000000000a1', 'pending'),
  ('44666666-0000-4000-8000-000000000002', '44222222-0000-4000-8000-00000000000a', '44555555-0000-4000-8000-000000000002', '44444444-0000-4000-8000-0000000000a1', 'pending');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

create temp table walk (k text primary key, v text);
grant all on walk to app_user, authenticated;

set role app_user;

-- ---------- invite, accept ----------
do $$
declare r jsonb; code text;
begin
  perform become('44111111-0000-4000-8000-00000000000a');
  r := create_parent_invite('parent');
  code := r->>'code';
  insert into walk values ('code', code);
  perform ok('the owner invites a second parent, for seven days',
    (r->>'ok')::boolean and (r->>'expires_at')::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute', r::text);
  perform ok('it is listed as waiting', (family_adults()->'invites'->0->>'code') = code);

  perform become('44111111-0000-4000-8000-00000000000b');
  perform ok('before joining, the other adult sees nothing of the family',
    current_family_id() is null and (select count(*) from kids) = 0);
  r := claim_parent_invite(lower(' ' || code || ' '), 'Second');
  perform ok('they join with it (typed in lower case, with spaces)', (r->>'ok')::boolean and r->>'role' = 'parent', r::text);
  perform ok('and are a parent of the family now',
    current_family_id() = '44222222-0000-4000-8000-00000000000a' and is_parent());

  perform become('44111111-0000-4000-8000-00000000000a');
  perform ok('the invitation is no longer waiting', jsonb_array_length(family_adults()->'invites') = 0);
  perform ok('and both adults are listed, the new one not the owner',
    jsonb_array_length(family_adults()->'adults') = 2
    and exists (select 1 from jsonb_array_elements(family_adults()->'adults') a where a->>'name' = 'Second' and not (a->>'isOwner')::boolean));
end $$;

-- ---------- the same code again ----------
do $$
declare r jsonb; code text := (select v from walk where k = 'code');
begin
  perform become('44111111-0000-4000-8000-00000000000c');
  r := claim_parent_invite(code, 'Third');
  perform ok('used by somebody else after it was accepted: refused as used', r->>'reason' = 'already_used', r::text);
  perform become('44111111-0000-4000-8000-00000000000b');
  r := claim_parent_invite(code, 'Second again');
  perform ok('used again by the adult who accepted it: they are already in a family', r->>'reason' = 'already_in_family', r::text);
end $$;

-- ---------- what the second parent can do ----------
do $$
declare r jsonb;
begin
  perform become('44111111-0000-4000-8000-00000000000b');
  perform ok('they see the children', (select count(*) from kids) = 1);
  perform approve_submission('44666666-0000-4000-8000-000000000001', 0, 0);
  set local role postgres;
  perform ok('they can accept a chore', (select status from submissions where id = '44666666-0000-4000-8000-000000000001') = 'approved');
  set local role app_user;
  r := create_parent_invite('parent');
  perform ok('they can invite another adult themselves', (r->>'ok')::boolean, r::text);
  insert into walk values ('second_code', r->>'code');
  r := remove_adult((select id from parents where user_id = '44111111-0000-4000-8000-00000000000a'));
  perform ok('they cannot remove the owner', r->>'reason' = 'not_the_owner', r::text);
end $$;

-- ---------- a supporter is not a parent ----------
do $$
declare r jsonb; code text;
begin
  perform become('44111111-0000-4000-8000-00000000000a');
  code := create_parent_invite('supporter')->>'code';
  perform become('44111111-0000-4000-8000-00000000000d');
  r := claim_parent_invite(code, 'Gran');
  perform ok('a grandparent joins as a supporter', (r->>'ok')::boolean and r->>'role' = 'supporter', r::text);
  perform ok('who sees the family only through supporter_view',
    current_family_id() is null and (select count(*) from kids) = 0
    and jsonb_array_length(supporter_view()->'kids') = 1);
  begin
    perform approve_submission('44666666-0000-4000-8000-000000000002', 0, 0);
    perform ok('a supporter cannot accept a chore', false);
  exception when others then
    perform ok('a supporter cannot accept a chore', true);
  end;
  begin
    perform create_parent_invite('parent');
    perform ok('nor invite anybody', false);
  exception when others then
    perform ok('nor invite anybody', true);
  end;
end $$;

-- ---------- removed ----------
do $$
declare r jsonb; second uuid; code text := (select v from walk where k = 'second_code');
begin
  set local role postgres;
  select id into second from parents where user_id = '44111111-0000-4000-8000-00000000000b';
  set local role app_user;

  perform become('44111111-0000-4000-8000-00000000000a');
  r := remove_adult(second);
  perform ok('the owner removes the second parent', (r->>'ok')::boolean, r::text);

  perform become('44111111-0000-4000-8000-00000000000b');
  perform ok('who is cut off at once: no family, no children, no chores',
    current_family_id() is null and not is_parent()
    and (select count(*) from kids) = 0 and (select count(*) from submissions) = 0);
  begin
    perform approve_submission('44666666-0000-4000-8000-000000000002', 0, 0);
    perform ok('and cannot accept a chore any more', false);
  exception when others then
    perform ok('and cannot accept a chore any more', true);
  end;

  -- The code they sent while they were a parent.
  perform become('44111111-0000-4000-8000-00000000000e');
  r := claim_parent_invite(code, 'Late');
  perform ok('an invitation the removed adult sent is dead with them (it stayed live)',
    r->>'reason' = 'revoked', r::text);
  set local role postgres;
  perform ok('so nobody joined through it',
    not exists (select 1 from parents where user_id = '44111111-0000-4000-8000-00000000000e'));
  set local role app_user;

  -- The owner can still bring them back, with a new invitation.
  perform become('44111111-0000-4000-8000-00000000000a');
  code := create_parent_invite('parent')->>'code';
  perform become('44111111-0000-4000-8000-00000000000b');
  r := claim_parent_invite(code, 'Second');
  perform ok('a removed adult can be invited back, with a new code', (r->>'ok')::boolean, r::text);
end $$;

-- ---------- expired ----------
do $$
declare r jsonb; v_code text;
begin
  perform become('44111111-0000-4000-8000-00000000000a');
  v_code := create_parent_invite('parent')->>'code';
  set local role postgres;
  update parent_invites set expires_at = now() - interval '1 minute' where code = v_code;
  set local role app_user;
  perform become('44111111-0000-4000-8000-00000000000c');
  r := claim_parent_invite(v_code, 'Third');
  perform ok('an invitation past its seven days is refused as expired', r->>'reason' = 'expired', r::text);
  set local role postgres;
  perform ok('and nobody joined through it',
    not exists (select 1 from parents where user_id = '44111111-0000-4000-8000-00000000000c'));
  set local role app_user;
  perform become('44111111-0000-4000-8000-00000000000a');
  perform ok('it is not listed as waiting',
    not exists (select 1 from jsonb_array_elements(family_adults()->'invites') i where i->>'code' = v_code));
end $$;

set role postgres;
