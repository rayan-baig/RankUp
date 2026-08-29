-- ---------------------------------------------------------------------------
-- Verifiable parental consent.
--
-- Run after schema.sql.
--
-- COPPA requires verifiable parental consent BEFORE a service collects
-- anything from a child under 13. RankUp collects a first name, activity, and
-- photographs taken inside the child's home — about as sensitive as children's
-- data gets.
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
 * If you change what you collect, you publish a new version and ask again. The
 * old rows stay, because "what exactly did this parent agree to, and when" is
 * the question a regulator asks, and pointing at today's policy is not an
 * answer.
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

alter table consent_notices enable row level security;
alter table parental_consents enable row level security;

drop policy if exists consent_notices_read on consent_notices;
create policy consent_notices_read on consent_notices for select using (true);

drop policy if exists parental_consents_read on parental_consents;
create policy parental_consents_read on parental_consents
  for select using (family_id = current_family_id());

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
  select * into v_parent from parents where user_id = auth.uid();
  if not found then raise exception 'only a parent can give consent'; end if;
  if length(trim(p_signed_name)) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'signature_required');
  end if;
  if not exists (select 1 from consent_notices where version = p_version) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_version');
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
create or replace function revoke_parental_consent(p_reason text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parent parents;
  v_kids int;
begin
  select * into v_parent from parents where user_id = auth.uid();
  if not found then raise exception 'only a parent can withdraw consent'; end if;

  update parental_consents
     set revoked_at = now(), revoke_reason = left(coalesce(p_reason, ''), 300)
   where family_id = v_parent.family_id and revoked_at is null;

  select count(*) into v_kids from kids where family_id = v_parent.family_id;
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
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid();
  if v_family is null then raise exception 'only a parent can export'; end if;

  return jsonb_build_object(
    'exported_at', now(),
    'family',      (select to_jsonb(f) from families f where f.id = v_family),
    'parents',     coalesce((select jsonb_agg(to_jsonb(p)) from parents p where p.family_id = v_family), '[]'::jsonb),
    'consents',    coalesce((select jsonb_agg(to_jsonb(c)) from parental_consents c where c.family_id = v_family), '[]'::jsonb),
    'children',    coalesce((select jsonb_agg(to_jsonb(k)) from kids k where k.family_id = v_family), '[]'::jsonb),
    'quests',      coalesce((select jsonb_agg(to_jsonb(q)) from quests q where q.family_id = v_family), '[]'::jsonb),
    'submissions', coalesce((
        select jsonb_agg(to_jsonb(s) - 'photo_data' || jsonb_build_object('photo_included', s.photo_data is not null))
          from submissions s where s.family_id = v_family), '[]'::jsonb),
    'rewards',     coalesce((select jsonb_agg(to_jsonb(r)) from rewards r where r.family_id = v_family), '[]'::jsonb),
    'notes',       coalesce((select jsonb_agg(to_jsonb(n)) from notes n where n.family_id = v_family), '[]'::jsonb),
    'activity',    coalesce((select jsonb_agg(to_jsonb(e)) from events e where e.family_id = v_family), '[]'::jsonb)
  );
end $$;

/** Delete the whole account. Everything cascades; nothing is kept. */
create or replace function delete_family_account(p_confirm text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid();
  if v_family is null then raise exception 'only a parent can delete the account'; end if;
  if p_confirm <> 'DELETE' then
    return jsonb_build_object('ok', false, 'reason', 'confirmation_required');
  end if;

  delete from families where id = v_family;
  return jsonb_build_object('ok', true);
end $$;

/**
 * Photo retention.
 *
 * Photographs of a child's home are the most sensitive thing here, and once a
 * parent has reviewed a submission the photo has done its job. Deleting it
 * removes risk that no amount of access control can: you cannot leak what you
 * do not hold.
 *
 * Run on a schedule (Supabase pg_cron, or any external scheduler).
 */
create or replace function purge_reviewed_photos(p_keep_days int default 30)
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with cleared as (
    update submissions
       set photo_data = null
     where photo_data is not null
       and status <> 'pending'
       and decided_at < now() - make_interval(days => greatest(0, p_keep_days))
    returning 1
  )
  select count(*) into v_count from cleared;
  return v_count;
end $$;

grant execute on function has_valid_consent(uuid) to anon, authenticated;
grant execute on function record_parental_consent(text, text, text, text) to authenticated;
grant execute on function revoke_parental_consent(text) to authenticated;
grant execute on function export_family_data() to authenticated;
grant execute on function delete_family_account(text) to authenticated;
revoke execute on function purge_reviewed_photos(int) from public;

-- The wording in force. Change what you collect, publish a new version, ask again.
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

Photographs are the most sensitive part. They are stored so you can review
them and are deleted automatically once reviewed (see Settings). If you have
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
