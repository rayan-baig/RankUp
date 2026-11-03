-- ---------------------------------------------------------------------------
-- Verifiable parental consent.
--
-- Run after schema.sql.
--
-- COPPA requires verifiable parental consent BEFORE a service collects
-- anything from a child under 13. RankUp collects a first name and the child's
-- chores and progress. It takes and keeps no photographs.
--
-- So consent is not a checkbox the app remembers. It is a row, and the database
-- REFUSES TO CREATE A CHILD without one. That is the difference between a
-- feature that documents compliance and one that enforces it: an app bug, a
-- tampered client, or a future developer forgetting the rule cannot get past it.
--
-- This file implements the mechanism. Whether your particular consent method
-- satisfies your regulator is a question for a lawyer — see docs/LEGAL.md.
-- ---------------------------------------------------------------------------

/**
 * The wording each parent agreed to, kept forever and by version.
 *
 * A published version is never edited: "what exactly did this parent agree
 * to, and when" is the question a regulator asks, and pointing at today's
 * policy is not an answer. A change of wording is a new row. The newest
 * published row is the one new parents read and sign (current_consent_version).
 *
 * A new version does not by itself undo the consents given to older ones:
 * has_valid_consent counts any consent not withdrawn. That is right when a
 * version collects the same or less (2026-11 only removed photographs). A
 * version that collects MORE needs every existing parent asked again, which
 * means changing has_valid_consent to require it and building the screen that
 * asks; neither exists yet. See docs/LEGAL.md.
 */
create table if not exists consent_notices (
  version      text primary key,
  published_at timestamptz not null default now(),
  summary      text not null,
  body         text not null
);

create table if not exists parental_consents (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  parent_id     uuid not null references parents(id) on delete cascade,
  version       text not null references consent_notices(version),

  /**
   * How the parent was verified. COPPA lists the acceptable methods; the one
   * that fits this product is `payment_card` — a real card transaction by the
   * account holder, which the subscription already requires. `signed_form`,
   * `video_call` and `government_id` are here because a service that ever takes
   * consent another way must be able to record which.
   */
  method        text not null check (method in
                  ('payment_card', 'signed_form', 'video_call', 'government_id', 'other')),
  method_detail text not null default '',

  -- The typed name is the signature. Storing it separately from the account
  -- name matters: it is what the parent actually wrote at that moment.
  signed_name   text not null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoke_reason text
);

create index if not exists parental_consents_family_idx on parental_consents (family_id, revoked_at);

/*
 * The wording of a published notice cannot be changed, only added to. A
 * version is what a parent signed; rewriting it afterwards would make the
 * record say they agreed to words they never saw.
 */
create or replace function consent_notice_is_fixed() returns trigger
language plpgsql as $$
begin
  if new.version is distinct from old.version or new.summary is distinct from old.summary
     or new.body is distinct from old.body or new.published_at is distinct from old.published_at then
    raise exception 'consent notice % is published and cannot be changed; publish a new version', old.version;
  end if;
  return new;
end $$;
drop trigger if exists consent_notices_fixed on consent_notices;
create trigger consent_notices_fixed before update on consent_notices
  for each row execute function consent_notice_is_fixed();

/** The version a new parent is shown and signs: the newest published. */
create or replace function current_consent_version()
returns text
language sql stable security definer set search_path = public as $$
  select version from consent_notices order by published_at desc, version desc limit 1;
$$;

alter table consent_notices enable row level security;
alter table parental_consents enable row level security;

drop policy if exists consent_notices_read on consent_notices;
-- Signed-in accounts only. The wording is public (the app ships it), but the
-- anon key reads no table at all, and supabase/test/31-every-table.sql holds
-- it to that.
create policy consent_notices_read on consent_notices for select to authenticated using (true);

drop policy if exists parental_consents_read on parental_consents;
drop policy if exists parental_consents_read on parental_consents;
create policy parental_consents_read on parental_consents
  -- Parents only: the consent holds the parent's signed name.
  for select using (family_id = current_family_id() and is_parent());

/** Does this family have consent that has not been withdrawn? */
create or replace function has_valid_consent(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from parental_consents
     where family_id = p_family_id and revoked_at is null
  );
$$;

/**
 * Record consent. Only a parent of the family may give it, and only for
 * themselves — the signature has to belong to the person signing.
 */
create or replace function record_parental_consent(
  p_version text,
  p_method text,
  p_signed_name text,
  p_method_detail text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parent parents;
begin
  -- A parent, not a supporter: consent for a child is a parent's to give.
  select * into v_parent from parents where user_id = auth.uid() and role = 'parent';
  if not found then raise exception 'only a parent can give consent'; end if;
  if length(trim(p_signed_name)) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'signature_required');
  end if;
  if not exists (select 1 from consent_notices where version = p_version) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_version');
  end if;
  -- New consent is to the wording in force. An app open since before a new
  -- version was published is showing the old words, and recording them as
  -- agreed to now would be wrong; it is told to reload and show the new ones.
  -- Consents already given to an older version are untouched.
  if p_version is distinct from current_consent_version() then
    return jsonb_build_object('ok', false, 'reason', 'outdated_version',
                              'current', current_consent_version());
  end if;

  insert into parental_consents (family_id, parent_id, version, method, method_detail, signed_name)
  values (v_parent.family_id, v_parent.id, p_version, p_method,
          left(coalesce(p_method_detail, ''), 200), left(trim(p_signed_name), 120));

  return jsonb_build_object('ok', true);
end $$;

/**
 * Withdrawing consent.
 *
 * COPPA gives a parent the right to withdraw at any time and have their
 * child's data deleted. Withdrawing here does exactly that: it deletes the
 * children, which cascades to their quests, submissions and photos. It is not
 * a flag that quietly leaves the data in place.
 */
/**
 * What is left of a family's children once their rows are deleted.
 *
 * Deleting the kids rows cascades to their chores, history, notes, guilds and
 * schools. Three things did not go with them, and each still named or pointed
 * at a child after the parent had been told it was all gone:
 *   - the pairing codes their phones showed, which carry the child's first
 *     name and the family's name, kept until the retention job a day or two
 *     later;
 *   - the receipts for retried coin calls, keyed by the child, for a month;
 *   - the sign-in each child's phone had, which outlived the child for good.
 * Called before the rows go (it reads which phones were theirs). Not callable
 * from a browser.
 */
create or replace function erase_child_traces(p_family uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_kids uuid[];
  v_devices uuid[];
  v_n int;
begin
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(user_id) filter (where user_id is not null), '{}')
    into v_kids, v_devices from kids where family_id = p_family;

  delete from pairing_codes
   where claimed_by_family_id = p_family or kid_id = any(v_kids) or kid_user_id = any(v_devices);
  delete from rpc_receipts where kid_id = any(v_kids);

  -- A child's phone signs in anonymously and that sign-in is theirs alone.
  -- Never an adult's account (a shared phone can play both roles) or staff.
  v_devices := array(select d from unnest(v_devices) d
                      where not exists (select 1 from parents p where p.user_id = d)
                        and not exists (select 1 from school_staff st where st.user_id = d));
  v_n := coalesce(array_length(v_devices, 1), 0);
  if v_n > 0 then
    delete from pairing_claim_attempts where user_id = any(v_devices);
    begin
      delete from auth.users where id = any(v_devices);
    exception when insufficient_privilege then
      -- The hosted auth schema refused; the rows are already unlinked from
      -- every child (kids.user_id goes with the child).
      v_n := 0;
    end;
  end if;
  return v_n;
end $$;
revoke all on function erase_child_traces(uuid) from public, anon, authenticated;

create or replace function revoke_parental_consent(p_reason text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parent parents;
  v_kids int;
begin
  -- A parent, not a supporter. Withdrawing consent deletes every child in the
  -- family; a grandparent with read-only access must not be able to do that.
  select * into v_parent from parents where user_id = auth.uid() and role = 'parent';
  if not found then raise exception 'only a parent can withdraw consent'; end if;

  update parental_consents
     set revoked_at = now(), revoke_reason = left(coalesce(p_reason, ''), 300)
   where family_id = v_parent.family_id and revoked_at is null;

  select count(*) into v_kids from kids where family_id = v_parent.family_id;
  -- Immediately, in this call: the notice promises the children's data goes
  -- with the consent, and no later job is relied on for it.
  perform erase_child_traces(v_parent.family_id);
  delete from kids where family_id = v_parent.family_id;

  return jsonb_build_object('ok', true, 'children_deleted', v_kids);
end $$;

/**
 * THE ENFORCEMENT.
 *
 * No child row can exist without consent on file. A trigger rather than a
 * policy, so it applies to every path in — the app, a pairing claim, a future
 * import script, or someone at a SQL prompt who has forgotten the rule.
 */
create or replace function require_parental_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not has_valid_consent(new.family_id) then
    raise exception 'no verifiable parental consent on file for this family'
      using hint = 'Call record_parental_consent first. See docs/LEGAL.md.';
  end if;
  return new;
end $$;

drop trigger if exists kids_require_consent on kids;
create trigger kids_require_consent
  before insert on kids
  for each row execute function require_parental_consent();

/**
 * Everything held about this family, for the parent to download.
 *
 * COPPA gives a parent the right to review what has been collected about their
 * child. Photographs are referenced rather than inlined — a JSON file with
 * thirty base64 images in it is not something a person can actually open.
 */
create or replace function export_family_data()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid;
  v_school jsonb;
begin
  -- A parent, not a supporter: a grandparent who can look in has no right to
  -- download the whole household's records.
  select family_id into v_family from parents where user_id = auth.uid() and role = 'parent';
  if v_family is null then raise exception 'only a parent can export'; end if;

  -- The School League lives in schools.sql, applied after this file, so it is
  -- asked for by name only when it exists. A database without it still exports.
  if to_regprocedure('public.export_family_school_data(uuid)') is not null then
    execute 'select public.export_family_school_data($1)' into v_school using v_family;
  end if;

  return jsonb_build_object(
    'school_league', coalesce(v_school, '[]'::jsonb),
    'exported_at', now(),
    'family',      (select to_jsonb(f) from families f where f.id = v_family),
    'parents',     coalesce((select jsonb_agg(to_jsonb(p)) from parents p where p.family_id = v_family), '[]'::jsonb),
    'consents',    coalesce((select jsonb_agg(to_jsonb(c)) from parental_consents c where c.family_id = v_family), '[]'::jsonb),
    'children',    coalesce((select jsonb_agg(to_jsonb(k)) from kids k where k.family_id = v_family), '[]'::jsonb),
    'quests',      coalesce((select jsonb_agg(to_jsonb(q)) from quests q where q.family_id = v_family), '[]'::jsonb),
    'submissions', coalesce((
        select jsonb_agg(to_jsonb(s))
          from submissions s where s.family_id = v_family), '[]'::jsonb),
    'rewards',     coalesce((select jsonb_agg(to_jsonb(r)) from rewards r where r.family_id = v_family), '[]'::jsonb),
    -- What each child spent their currency on. The readable summary the app
    -- builds from this export lists it per child; it was missing from both.
    'redemptions', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from redemptions r where r.family_id = v_family), '[]'::jsonb),
    'notes',       coalesce((select jsonb_agg(to_jsonb(n)) from notes n where n.family_id = v_family), '[]'::jsonb),
    'activity',    coalesce((select jsonb_agg(to_jsonb(e)) from events e where e.family_id = v_family), '[]'::jsonb)
  );
end $$;

/*
 * Subscriptions still to be cancelled at Stripe for families that deleted
 * their account.
 *
 * Deleting the family used to leave its Stripe subscription running: the
 * family's row, with the only link to it, was gone, and the card went on being
 * charged every month for an account that no longer existed. Stripe can only
 * be told with the secret key, which the database does not have, and Stripe
 * may not be answering at that moment. So the deletion writes the
 * subscription here in the same transaction as it removes the family, and a
 * server function holding the key cancels it: api/delete-account.js straight
 * away, and the daily api/run-retention.js for anything still waiting. A row
 * is only marked done once Stripe has confirmed, so nothing is forgotten, and
 * health_snapshot reports any that have waited more than a day.
 *
 * It holds no family id. `family_key` is a one-way fingerprint of it, enough
 * for the webhook to recognise news about a deleted family (a checkout page
 * left open and paid after the deletion, say) and nothing else. Every
 * deletion leaves one, with or without billing, for a week: that covers a
 * checkout page's 24 hours and Stripe's three days of webhook retries.
 * Cancelled rows go after 30 days. Not readable from a browser.
 */
create table if not exists billing_cancellations (
  id                     bigserial primary key,
  family_key             text not null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  queued_at              timestamptz not null default now(),
  attempts               int not null default 0,
  last_try_at            timestamptz,
  last_error             text,
  done_at                timestamptz
);
create unique index if not exists billing_cancellations_once
  on billing_cancellations (family_key, (coalesce(stripe_subscription_id, '')));
alter table billing_cancellations enable row level security;
revoke all on billing_cancellations from public, anon, authenticated;

create or replace function billing_family_key(p_family_id uuid)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_family_id::text, 'UTF8')), 'hex');
$$;

/**
 * Delete the whole account. Everything cascades. What stays is the row in
 * billing_cancellations above (Stripe ids under a fingerprint, no family id),
 * so the subscription is cancelled rather than left charging.
 */
create or replace function delete_family_account(p_confirm text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid;
  v_billing boolean;
  v_out jsonb;
begin
  -- A parent, not a supporter. Without the role check a grandparent with
  -- read-only access could delete the entire family, children and all.
  select family_id into v_family from parents where user_id = auth.uid() and role = 'parent';
  if v_family is null then raise exception 'only a parent can delete the account'; end if;
  if p_confirm <> 'DELETE' then
    return jsonb_build_object('ok', false, 'reason', 'confirmation_required');
  end if;

  -- Before the family row (and with it the Stripe ids) goes. Same
  -- transaction: if the deletion fails, nothing is queued; if it succeeds, the
  -- cancellation cannot be lost. See billing_cancellations above.
  insert into billing_cancellations (family_key, stripe_customer_id, stripe_subscription_id, done_at)
  select billing_family_key(f.id), f.stripe_customer_id, f.stripe_subscription_id,
         -- Nothing to cancel: kept only as the marker, already done.
         case when f.stripe_customer_id is null and f.stripe_subscription_id is null then now() end
    from families f where f.id = v_family
  on conflict do nothing;
  select stripe_customer_id is not null or stripe_subscription_id is not null into v_billing
    from families where id = v_family;

  perform erase_child_traces(v_family);
  delete from adult_invite_attempts where user_id = auth.uid();
  delete from pairing_claim_attempts where user_id = auth.uid();
  delete from families where id = v_family;

  -- The server function that called this cancels the subscription with
  -- Stripe now, and needs to know which. The family id is the caller's own.
  v_out := case when v_billing
                then jsonb_build_object('ok', true, 'billing', 'cancel_queued', 'family_id', v_family)
                else jsonb_build_object('ok', true, 'billing', 'none') end;

  -- The parent's own sign-in, which holds their email address: the privacy
  -- policy says deleting the account removes it, and it outlived the family.
  -- Another adult in the family keeps their own account, now empty.
  begin
    delete from auth.users where id = auth.uid()
       and not exists (select 1 from school_staff where user_id = auth.uid());
  exception when insufficient_privilege then
    return v_out || jsonb_build_object('sign_in_kept', true);
  end;
  return v_out;
end $$;

-- RankUp takes no photos, so there is none left to purge. Dropped; see
-- run_retention in retention.sql.
drop function if exists purge_stale_photos(int);

-- The database's own question, asked by the trigger on `kids`. Not a
-- browser's: given any family's id it said whether that family had signed.
revoke execute on function has_valid_consent(uuid) from public, anon, authenticated;
grant execute on function record_parental_consent(text, text, text, text) to authenticated;
grant execute on function revoke_parental_consent(text) to authenticated;
grant execute on function export_family_data() to authenticated;
grant execute on function delete_family_account(text) to authenticated;

-- The first published wording. Superseded by 2026-11 below and kept exactly as
-- it was, because it is what the parents who signed it agreed to. Do not edit
-- it (the trigger above refuses): publish a new version instead.
insert into consent_notices (version, summary, body) values (
  '2026-01',
  'What RankUp collects about your child, and your rights.',
  $notice$
RankUp collects the following about each child you add:

  * The first name you enter. Nothing else identifying — no surname, no
    birthday, no email, no address.
  * The chores you assign and whether they were completed.
  * Photographs your child takes in the app as proof a chore was done. These
    are usually pictures inside your home.
  * The theme they choose, and their XP, level and in-app currency.

Photographs are the most sensitive part. They are deleted the moment you
approve or send back a chore - we do not keep them at all. If you have
turned on the AI photo check, a photograph is sent to Anthropic's API to be
assessed and is not used to train models.

We do not sell or share your child's data. We show no advertising to children.
Your child is never asked for an email address or a password.

Your rights as a parent, at any time:

  * See everything held about your child (Settings, Download my data).
  * Delete it all (Settings, Delete account) — permanently and immediately.
  * Withdraw this consent, which deletes your children's data as well.

By signing you confirm you are this child's parent or legal guardian and that
you agree to RankUp collecting the above.
$notice$
) on conflict (version) do nothing;

-- The wording in force from November 2026: the same as src/data/legalText.js
-- (CONSENT_NOTICE), which is what the app shows. 2026-01 still described
-- photographs and an AI photo check that RankUp no longer has. This version
-- only collects less, so consents given to 2026-01 stay valid and nobody is
-- asked again; new parents sign this one. tests/consent.mjs checks the app's
-- words and these agree.
insert into consent_notices (version, summary, body) values (
  '2026-11',
  'What RankUp collects about your child, and your rights.',
  $notice$
What RankUp collects about your child

What we collect

  * The first name you enter for your child. Nothing else identifying — no
    surname, no birthday, no email address, no home address.
  * The chores you assign, and whether they were completed.
  * The theme they choose, and their XP, level and in-app currency.

No photographs

  * RankUp never takes, sends or keeps photographs. If you want to see that
    a chore is done, your child can send you a picture from their own
    phone's camera app, the way you already message each other. It never
    passes through RankUp.

What we never do

  * We do not sell your data or your child's data. To anyone. Ever.
  * We show no advertising to children.
  * Your child is never asked for an email address, a password or a phone
    number.
  * We do not track your child across other websites or apps.

Guilds, if you use them

  * A guild lets your child see other children's first names, levels and
    weekly XP, and exchange short messages with them.
  * Nobody joins a guild until a parent on each side has agreed — yours, and
    the other child's.
  * Phone numbers, email addresses and links are blocked in guild chat. Any
    child can report a message, which hides it immediately and shows it to
    both parents.
  * You can remove your child from a guild at any moment.

Your rights, at any time

  * See everything held about your child — Settings → Download my data.
  * Delete all of it — Settings → Delete account. It is immediate and
    permanent.
  * Withdraw this consent, which deletes your children's data with it.

I confirm I am the parent or legal guardian of the children I add to this
account, and I consent to RankUp collecting the information described above.
$notice$
) on conflict (version) do nothing;

grant execute on function current_consent_version() to anon, authenticated;
