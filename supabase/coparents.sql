-- ---------------------------------------------------------------------------
-- A second adult.
--
-- Run after schema.sql.
--
-- Until now a family had exactly one grown-up, which is wrong about a lot of
-- households and badly wrong about separated ones — where chores are precisely
-- the thing that falls apart between two houses, and where the app was asking
-- two people to share one password.
--
-- The mechanism is the pairing code again, because it is the one this app has
-- already got right: short, expiring, one-time, and rate limited against the
-- account doing the guessing rather than against the code. What differs is who
-- ends up on the other side — an adult with their own account, not a child's
-- device — and that adults are never auto-accepted into anything: the invite
-- has to come from inside the family.
-- ---------------------------------------------------------------------------

/*
 * The invitations. No policies and no grants: every read and write goes
 * through the functions below, all of which are security definer and check who
 * is asking. A readable invite table hands out every live code at once.
 */
create table if not exists parent_invites (
  -- The same alphabet the referral codes use: no O/0 and no I/1, because a
  -- parent reads this down the phone to the other parent.
  code        text primary key check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$'),
  family_id   uuid not null references families(id) on delete cascade,
  invited_by  uuid references parents(id) on delete set null,
  role        text not null default 'parent' check (role in ('parent','supporter')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  claimed_at  timestamptz,
  claimed_by  uuid references parents(id) on delete set null,
  revoked_at  timestamptz
);

create index if not exists parent_invites_family_idx on parent_invites (family_id);
create index if not exists parent_invites_expiry_idx on parent_invites (expires_at);

alter table parent_invites enable row level security;

/*
 * Failed guesses, counted against the account making them.
 *
 * The five-attempt counter on a code only bites when a guess lands on a code
 * that exists, so on its own it does nothing against someone walking the code
 * space. This does. Same shape as pairing_claim_attempts and deliberately a
 * separate budget: a parent pairing a child's phone should not be able to
 * spend the budget that protects invitations, or the other way round.
 */
create table if not exists adult_invite_attempts (
  id       bigserial primary key,
  user_id  uuid not null,
  tried_at timestamptz not null default now()
);
create index if not exists adult_invite_attempts_idx
  on adult_invite_attempts (user_id, tried_at);
alter table adult_invite_attempts enable row level security;

create or replace function adult_invite_attempts_exhausted()
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= 10 from adult_invite_attempts
   where user_id = auth.uid() and tried_at > now() - interval '10 minutes';
$$;

revoke execute on function adult_invite_attempts_exhausted() from public;

/*
 * How many grown-ups one family may have.
 *
 * Not a plan limit, on purpose. Charging for the second parent would tax the
 * single most valuable thing that can happen to this product — another adult
 * installing it, inside a household that already pays. The cap exists only so
 * that "a family" cannot quietly become a classroom of thirty.
 */
create or replace function max_adults_per_family()
returns int language sql immutable as $$ select 6 $$;

revoke execute on function max_adults_per_family() from public;

-- A six-character code from the readable alphabet, unique among live ones.
create or replace function new_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
  i       int;
  guard   int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from parent_invites where code = v_code);
    guard := guard + 1;
    if guard > 50 then raise exception 'could not find a free invite code'; end if;
  end loop;
  return v_code;
end $$;

revoke execute on function new_invite_code() from public;

/**
 * Invite another adult.
 *
 * Any parent may invite, not only the owner — a second parent adding a third
 * is an ordinary thing in a blended family, and making it the owner's job
 * means one person is the bottleneck for their own household.
 *
 * Supporters are allowed now that current_family_id() excludes them, which
 * means they reach no table at all and see the family only through
 * supporter_view() below.
 */
create or replace function create_parent_invite(p_role text default 'parent')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_me     uuid;
  v_code   text;
  v_until  timestamptz := now() + interval '7 days';
  v_adults int;
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can invite another adult';
  end if;
  if p_role not in ('parent', 'supporter') then
    return jsonb_build_object('ok', false, 'reason', 'role_not_available');
  end if;

  select id into v_me from parents where user_id = auth.uid();

  -- Tidy up before counting, so codes nobody used do not hold a seat forever.
  delete from parent_invites
   where family_id = v_family and claimed_at is null and expires_at < now();

  select (select count(*) from parents where family_id = v_family)
       + (select count(*) from parent_invites
           where family_id = v_family and claimed_at is null
             and revoked_at is null and expires_at > now())
    into v_adults;

  if v_adults >= max_adults_per_family() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_adults');
  end if;

  v_code := new_invite_code();
  insert into parent_invites (code, family_id, invited_by, role, expires_at)
  values (v_code, v_family, v_me, p_role, v_until);

  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_until,
                            'role', p_role);
end $$;

grant execute on function create_parent_invite(text) to authenticated;

/**
 * The other adult's side.
 *
 * One call, one transaction: check the code is usable and create the parents
 * row, or record a failed attempt and refuse. `for update` takes a row lock so
 * two people racing on the same code cannot both win.
 *
 * The attempt is counted BEFORE the code is looked up, so a guess costs the
 * same whether or not it happens to hit a live code — otherwise the timing
 * alone tells an attacker which codes exist.
 */
create or replace function claim_parent_invite(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row    parent_invites;
  v_parent uuid;
  v_family families;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;

  if exists (select 1 from parents where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'already_in_family');
  end if;
  if exists (select 1 from kids where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'this_is_a_kid_device');
  end if;

  delete from adult_invite_attempts where tried_at < now() - interval '1 hour';
  if adult_invite_attempts_exhausted() then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into adult_invite_attempts (user_id) values (auth.uid());

  select * into v_row from parent_invites
   where code = upper(trim(p_code)) for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_code');
  end if;

  if v_row.attempts >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'code_burned');
  end if;
  if v_row.revoked_at is not null then
    update parent_invites set attempts = attempts + 1 where code = v_row.code;
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v_row.claimed_at is not null then
    update parent_invites set attempts = attempts + 1 where code = v_row.code;
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Re-check the cap at the moment of joining. Two invitations sent while
  -- there was one seat left must not both be able to take it.
  if (select count(*) from parents where family_id = v_row.family_id)
       >= max_adults_per_family() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_adults');
  end if;

  insert into parents (user_id, family_id, name, is_owner, role)
  values (auth.uid(), v_row.family_id,
          coalesce(nullif(trim(p_name), ''), 'Parent'), false, v_row.role)
  returning id into v_parent;

  update parent_invites
     set claimed_at = now(), claimed_by = v_parent
   where code = v_row.code;

  select * into v_family from families where id = v_row.family_id;

  return jsonb_build_object('ok', true, 'family_id', v_family.id,
                            'family_name', v_family.name, 'role', v_row.role);
end $$;

grant execute on function claim_parent_invite(text, text) to authenticated;

-- Take a code back. Any parent may revoke any of their family's invitations:
-- the person who sent it may not be the person who realises it went to the
-- wrong number.
create or replace function revoke_parent_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can revoke an invitation';
  end if;

  update parent_invites set revoked_at = now()
   where code = upper(trim(p_code)) and family_id = v_family
     and claimed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_code');
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function revoke_parent_invite(text) to authenticated;

/**
 * Who is in this family, and what invitations are outstanding.
 *
 * Emails are deliberately not returned. A co-parent's address is theirs, and
 * nothing on the screen this feeds needs it.
 */
create or replace function family_adults()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'me', (select id from parents where user_id = auth.uid()),
    'adults', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'role', p.role,
               'isOwner', p.is_owner, 'isMe', p.user_id = auth.uid(),
               'joinedAt', p.created_at) order by p.created_at)
        from parents p where p.family_id = current_family_id()), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', i.code, 'role', i.role, 'expiresAt', i.expires_at)
             order by i.created_at)
        from parent_invites i
       where i.family_id = current_family_id()
         and i.claimed_at is null and i.revoked_at is null
         and i.expires_at > now()), '[]'::jsonb),
    'max', max_adults_per_family()
  );
$$;

grant execute on function family_adults() to authenticated;

/**
 * Remove an adult.
 *
 * Only the owner may, and the owner cannot be removed — including by
 * themselves. Somebody has to hold the subscription and the consent record,
 * and a family with nobody in charge of those is a support ticket that cannot
 * be answered. Leaving for good is account deletion, which already exists.
 */
create or replace function remove_adult(p_parent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_target parents;
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can remove an adult';
  end if;
  if not exists (select 1 from parents
                  where user_id = auth.uid() and is_owner) then
    return jsonb_build_object('ok', false, 'reason', 'not_the_owner');
  end if;

  select * into v_target from parents
   where id = p_parent_id and family_id = v_family;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_adult');
  end if;
  if v_target.is_owner then
    return jsonb_build_object('ok', false, 'reason', 'cannot_remove_owner');
  end if;

  delete from parents where id = p_parent_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function remove_adult(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Supporters: the grandparents.
--
-- They already fund rewards, in cash, badly — a tenner at the door and nobody
-- remembers what it was for. This gives that money somewhere to land and
-- gives them a reason to open the app, which is the point: a second adult
-- inside a household that already pays, who did not have to be acquired.
--
-- What a supporter can do is deliberately tiny. They see how the children are
-- getting on and they can put something in a pot. They cannot approve a
-- chore, cannot see a proof photo, cannot read a private note, cannot change
-- anything. Everything about that is enforced by them having no table access
-- whatsoever — see current_family_id() in schema.sql — rather than by a list
-- of screens that remember to check.
-- ---------------------------------------------------------------------------

/** The family this account supports, or null if it is not a supporter. */
create or replace function supporter_family_id()
returns uuid language sql stable security definer set search_path = public as $$
  select family_id from parents
   where user_id = auth.uid() and role = 'supporter';
$$;

revoke execute on function supporter_family_id() from public;

/**
 * Everything a supporter sees, in one call.
 *
 * Names, levels and what each child is owed. No photographs, no chore
 * history, no notes, no consent record, no other adult's details. If
 * something is not in this function, a supporter cannot reach it — there is
 * no second route.
 */
create or replace function supporter_view()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_family uuid := supporter_family_id();
begin
  if v_family is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_supporter');
  end if;

  return jsonb_build_object(
    'ok', true,
    'familyName', (select name from families where id = v_family),
    'currency', (select currency from families where id = v_family),
    'kids', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id,
               'name', k.name,
               'xp', k.xp,
               -- The streak is the one number that makes a grandparent
               -- message the child, which is the behaviour worth encouraging.
               'streak', k.streak_count,
               'pence', (select coalesce(sum(e.pence), 0)
                           from allowance_entries e where e.kid_id = k.id))
             order by k.name)
        from kids k where k.family_id = v_family), '[]'::jsonb)
  );
end $$;

grant execute on function supporter_view() to authenticated;

/**
 * A supporter putting something into a child's pot.
 *
 * Separate from record_gift rather than sharing it, because the two have
 * different rules: a parent may gift freely, a supporter is a guest and is
 * capped. The line is marked as a gift like any other, so the parent sees it
 * in the same ledger and nothing about the pot has to know who paid.
 *
 * RankUp still holds no money. This records an intention between two adults
 * who will settle it the way they already do.
 */
create or replace function supporter_gift(p_kid_id uuid, p_pence int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := supporter_family_id();
  v_me     uuid;
begin
  if v_family is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_supporter');
  end if;
  if not exists (select 1 from kids where id = p_kid_id and family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'no_such_kid');
  end if;
  -- £100 a go. A guest typing an extra nought should hit a wall, not a
  -- conversation with the child's parents.
  if p_pence is null or p_pence <= 0 or p_pence > 10000 then
    return jsonb_build_object('ok', false, 'reason', 'not_an_amount');
  end if;

  select id into v_me from parents where user_id = auth.uid();
  insert into allowance_entries (family_id, kid_id, pence, kind, note, created_by)
  values (v_family, p_kid_id, p_pence, 'gift',
          coalesce(nullif(trim(p_note), ''), 'From ' ||
                   (select name from parents where id = v_me)), v_me);

  return jsonb_build_object('ok', true);
end $$;

grant execute on function supporter_gift(uuid, int, text) to authenticated;
