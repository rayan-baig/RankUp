-- ---------------------------------------------------------------------------
-- Referrals.
--
-- Run after schema.sql.
--
-- The one design decision worth stating outright: the person doing the
-- inviting is NOT paid for a signup. They are paid when the family they
-- invited actually finishes a chore.
--
-- Paying for signups is how a referral programme turns into a farm. A parent
-- with five spare email addresses can create five families in ten minutes and
-- collect five rewards without a single child ever doing anything. Paying on a
-- first approved chore costs the farmer a real photograph of a real task
-- approved by a second real person, which is more work than the reward is
-- worth — and it means every reward we hand out is attached to a household
-- that has actually seen the product work.
--
-- Nothing here hands out money. The reward is trial time, which costs us
-- almost nothing and is the thing most likely to turn into a subscription.
-- ---------------------------------------------------------------------------

-- Who invited whom. One row per invited family, so a family can be referred
-- exactly once and the second person to send them a code gets nothing —
-- deliberately, because otherwise a code is worth re-claiming forever.
create table if not exists referrals (
  invited_family_id  uuid primary key references families(id) on delete cascade,
  referrer_family_id uuid not null references families(id) on delete cascade,
  created_at         timestamptz not null default now(),
  -- Null until the invited family's first chore is approved. Until then this
  -- row is a claim, not a debt.
  qualified_at       timestamptz,
  constraint referrals_not_self check (invited_family_id <> referrer_family_id)
);

create index if not exists referrals_referrer_idx on referrals (referrer_family_id);

-- No policies, on purpose. A browser never reads this table directly: every
-- read goes through my_referrals(), which is security definer and answers only
-- about the caller's own family. RLS on with no policy is the safe default —
-- it denies everything until something deliberately allows it.
alter table referrals enable row level security;

-- How long each side gets. One number, in one place, so the SQL and the share
-- text can never drift apart — the app asks for this rather than hardcoding
-- "30 days" into a sentence a child will read out loud.
create or replace function referral_reward_days()
returns int language sql immutable as $$ select 30 $$;

revoke execute on function referral_reward_days() from public;

/**
 * A family's invite code.
 *
 * Derived from the family id rather than stored: there is no code table to
 * keep in step, no collision to handle, and a code cannot be rotated out from
 * under a message someone already sent. Base32 without the characters that get
 * misread aloud — no O/0, no I/1 — because these get spelled out in a
 * playground.
 */
create or replace function referral_code_for(p_family_id uuid)
returns text language plpgsql immutable as $$
declare
  v_hash  bigint;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out   text := '';
  i       int;
begin
  if p_family_id is null then return null; end if;
  -- A stable 30-bit number from the uuid. hashtextextended is seeded, so this
  -- is the same answer on every call and on every machine.
  v_hash := abs(hashtextextended(p_family_id::text, 0)) % 1073741824;
  for i in 1..6 loop
    v_out := substr(v_chars, (v_hash % 32)::int + 1, 1) || v_out;
    v_hash := v_hash / 32;
  end loop;
  return v_out;
end $$;

-- Not granted: it takes an arbitrary family id, and a code is the one thing
-- about another household a stranger should not be able to ask for.
revoke execute on function referral_code_for(uuid) from public;

-- The caller's own code, which is the only one a browser may have.
create or replace function my_referral_code()
returns text language sql stable security definer set search_path = public as $$
  select referral_code_for(current_family_id());
$$;

grant execute on function my_referral_code() to authenticated;

/**
 * Claim someone's code as a newly signed-up family.
 *
 * Everything here is a rule about what cannot be farmed:
 *
 *   - a family may be referred once, ever
 *   - a family may not refer itself
 *   - only a NEW family may claim, where new means "signed up in the last 30
 *     days". Without this, a two-year-old household claims a code the day a
 *     friend joins and both collect, which is a discount for existing
 *     customers dressed up as growth.
 *
 * The reward does not land here. This records the claim; qualify_referral()
 * pays it, later, if the child does a chore.
 */
create or replace function claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family   uuid := current_family_id();
  v_referrer uuid;
  v_age      interval;
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can claim a referral';
  end if;

  if exists (select 1 from referrals where invited_family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'already_referred');
  end if;

  select now() - created_at into v_age from families where id = v_family;
  if v_age > interval '30 days' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_new_family');
  end if;

  -- Find whose code this is by generating every family's code and comparing.
  -- There is no index to use here and there does not need to be: this runs
  -- once per household, ever.
  select f.id into v_referrer
    from families f
   where referral_code_for(f.id) = upper(trim(p_code))
   limit 1;

  if v_referrer is null then
    return jsonb_build_object('ok', false, 'reason', 'no_such_code');
  end if;
  if v_referrer = v_family then
    return jsonb_build_object('ok', false, 'reason', 'own_code');
  end if;

  insert into referrals (invited_family_id, referrer_family_id)
  values (v_family, v_referrer);

  return jsonb_build_object('ok', true, 'days', referral_reward_days());
end $$;

grant execute on function claim_referral(text) to authenticated;

/**
 * Pay a referral out, if there is one waiting.
 *
 * Called from approve_submission, which means it runs inside a parent tapping
 * Approve. That is the reason for the exception handler: a referral is a nice
 * extra, and there is no version of this worth failing a child's approval
 * over. If the payout breaks, the approval still happens and the referral is
 * simply left unqualified.
 *
 * Idempotent through `qualified_at is null` — the second approved chore pays
 * nothing.
 */
create or replace function qualify_referral(p_family_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  update referrals
     set qualified_at = now()
   where invited_family_id = p_family_id
     and qualified_at is null
  returning referrer_family_id into v_referrer;

  if v_referrer is null then return; end if;

  -- Both sides. The family who invited gets their month for bringing someone
  -- who actually uses it; the family who arrived gets theirs for getting as
  -- far as a first finished chore.
  perform grant_trial(v_referrer, 'standard', referral_reward_days());
  perform grant_trial(p_family_id, 'standard', referral_reward_days());
exception when others then
  -- Deliberately swallowed. See above.
  return;
end $$;

-- Not granted: a browser calling this is a browser paying itself.
revoke execute on function qualify_referral(uuid) from public;

/**
 * What the caller has to show for their invites.
 *
 * Deliberately thin — a count of who has claimed and a count of who has
 * actually finished a chore. No names, no family ids, nothing that tells one
 * household anything about another.
 */
create or replace function my_referrals()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code',      my_referral_code(),
    'days',      referral_reward_days(),
    'claimed',   count(*),
    'qualified', count(*) filter (where qualified_at is not null),
    'referred',  exists (select 1 from referrals
                          where invited_family_id = current_family_id())
  )
  from referrals where referrer_family_id = current_family_id();
$$;

grant execute on function my_referrals() to authenticated;
