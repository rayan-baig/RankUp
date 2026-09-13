-- ---------------------------------------------------------------------------
-- Parent Alliances, and the monthly discount they compete for.
--
-- Run after schema.sql, sync.sql and billing.sql.
--
-- An alliance is a group of up to ten FAMILIES — not children. That distinction
-- is the whole safety story: alliances have no chat, no rosters of kids, and no
-- way to reach another family's child. What crosses the boundary is one number
-- per family per month, and the family's own name, which an adult chose.
--
-- The prize is 20% off next month's subscription. Because that is real money,
-- the standings are computed here, from approved submissions, rather than being
-- reported by the browser — a client that could name its own score could award
-- itself a discount. Settlement is a separate, idempotent step so that running
-- the monthly job twice cannot pay twice.
-- ---------------------------------------------------------------------------

-- The tables already exist in schema.sql as placeholders. They are extended
-- here rather than redefined, the same way guilds.sql extends the guild tables.
alter table alliances add column if not exists invite_code text unique;
alter table alliances add column if not exists owner_family_id uuid references families(id) on delete cascade;

-- The award row IS the payment record: written once, inside the transaction
-- that decides the winner, and the primary key (alliance, month) is what makes
-- a second run of the monthly job a no-op rather than a second discount.
-- `applied_at` is set only once Stripe has accepted the coupon, so an award
-- that was decided but never applied stays visible instead of looking paid.
alter table alliance_results add column if not exists score int not null default 0;
alter table alliance_results add column if not exists decided_at timestamptz not null default now();
alter table alliance_results add column if not exists applied_at timestamptz;
alter table alliance_results add column if not exists stripe_coupon text;

-- One family is in at most one alliance at a time; without this a family could
-- join ten alliances and win ten discounts in the same month.
create unique index if not exists alliance_members_one_per_family
  on alliance_members (family_id);

-- These three policies query alliance_members from inside a policy ON
-- alliance_members, which Postgres rejects at runtime as infinite recursion.
-- Dropped rather than repaired: nothing reads these tables directly from a
-- browser any more, exactly as for guilds and for the same reason.
drop policy if exists alliances_read on alliances;
drop policy if exists alliance_members_read on alliance_members;
drop policy if exists alliance_results_read on alliance_results;

revoke all on alliances from public;
revoke all on alliance_members from public;
revoke all on alliance_results from public;

/** Elite is the tier that includes alliances; everyone else gets a clear no. */
create or replace function alliance_capacity(p_family_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case tier when 'elite' then 10 else 0 end from families where id = p_family_id;
$$;

/**
 * This family's score for a month: quests actually approved by a parent.
 *
 * Approvals rather than XP on purpose. XP is inflated by the Elite 1.5x boost
 * and by quest difficulty, so ranking on it would mean the family paying most
 * wins the discount for paying most. A finished chore is a finished chore.
 */
create or replace function alliance_score(p_family_id uuid, p_month date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from submissions
   where family_id = p_family_id
     and status = 'approved'
     and decided_at >= p_month
     and decided_at < (p_month + interval '1 month');
$$;

/** Start an alliance. Elite only, and the caller's family joins it at once. */
create or replace function create_alliance(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_code   text;
  v_id     uuid;
begin
  if v_family is null or not is_parent() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_parent');
  end if;
  if alliance_capacity(v_family) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'plan_has_no_alliances');
  end if;
  if exists (select 1 from alliance_members where family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'already_in_one');
  end if;

  -- Same alphabet as a guild code: no characters that can be misread aloud.
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from alliances where invite_code = v_code);
  end loop;

  insert into alliances (name, invite_code, owner_family_id)
  values (left(trim(p_name), 40), v_code, v_family)
  returning id into v_id;

  insert into alliance_members (alliance_id, family_id) values (v_id, v_family);
  return jsonb_build_object('ok', true, 'alliance_id', v_id, 'invite_code', v_code);
end $$;

/**
 * Join by code. An adult joining a group of adults, so there is no second
 * approval step — nothing here can reach anyone's child.
 */
create or replace function join_alliance(p_invite_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_all    alliances;
  v_count  int;
begin
  if v_family is null or not is_parent() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_parent');
  end if;
  if alliance_capacity(v_family) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'plan_has_no_alliances');
  end if;
  if exists (select 1 from alliance_members where family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'already_in_one');
  end if;

  select * into v_all from alliances where invite_code = upper(trim(p_invite_code));
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_code'); end if;

  -- Counted and inserted under a lock on the alliance row, so two families
  -- joining an alliance with one seat left cannot both pass the check.
  perform 1 from alliances where id = v_all.id for update;
  select count(*) into v_count from alliance_members where alliance_id = v_all.id;
  if v_count >= v_all.capacity then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into alliance_members (alliance_id, family_id) values (v_all.id, v_family);
  return jsonb_build_object('ok', true, 'alliance_id', v_all.id, 'name', v_all.name);
end $$;

create or replace function leave_alliance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null or not is_parent() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_parent');
  end if;
  delete from alliance_members where family_id = v_family;
  -- An alliance nobody is left in is deleted rather than lingering as a code
  -- that resolves to an empty leaderboard.
  delete from alliances a
   where not exists (select 1 from alliance_members m where m.alliance_id = a.id);
  return jsonb_build_object('ok', true);
end $$;

/**
 * The standings.
 *
 * Returns a name and a number per member family and nothing else — no family
 * ids, no kids, no events. A leaderboard is the only thing an alliance is for,
 * so it is also the only thing it can see.
 */
create or replace function alliance_standings(p_month date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_all    alliances;
  v_month  date := coalesce(p_month, date_trunc('month', now())::date);
  v_rows   jsonb;
begin
  if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;

  select a.* into v_all from alliances a
    join alliance_members m on m.alliance_id = a.id
   where m.family_id = v_family;
  if not found then return jsonb_build_object('ok', true, 'alliance', null); end if;

  select jsonb_agg(r order by r->>'score' desc) into v_rows
    from (
      select jsonb_build_object(
               'name', f.name,
               'score', alliance_score(f.id, v_month),
               'you', f.id = v_family
             ) as r
        from alliance_members m
        join families f on f.id = m.family_id
       where m.alliance_id = v_all.id
    ) s;

  return jsonb_build_object(
    'ok', true,
    'month', v_month,
    'alliance', jsonb_build_object('id', v_all.id, 'name', v_all.name,
                                   'invite_code', v_all.invite_code,
                                   'capacity', v_all.capacity),
    'standings', coalesce(v_rows, '[]'::jsonb),
    'last_award', (
      select jsonb_build_object('month', w.month_key, 'name', f.name,
                                'score', w.score, 'applied', w.applied_at is not null)
        from alliance_results w join families f on f.id = w.winning_family_id
       where w.alliance_id = v_all.id order by w.month_key desc limit 1
    )
  );
end $$;

/**
 * Decide last month's winners. Called by the billing job, never by a browser.
 *
 * Idempotent by construction: the award row's primary key is (alliance, month),
 * so a second run inserts nothing and returns nothing to charge for. Ties are
 * broken by who joined first, which is at least a rule nobody can game after
 * the fact.
 *
 * A month with no approved quests at all has no winner — an alliance where
 * nobody did anything does not get 20% off for it.
 */
create or replace function settle_alliances(p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb;
begin
  with winners as (
    select distinct on (m.alliance_id)
           m.alliance_id, m.family_id, alliance_score(m.family_id, p_month) as score
      from alliance_members m
     order by m.alliance_id, alliance_score(m.family_id, p_month) desc, m.joined_at asc
  ), inserted as (
    insert into alliance_results (alliance_id, month_key, winning_family_id, score)
    select alliance_id, to_char(p_month, 'YYYY-MM'), family_id, score
      from winners where score > 0
    on conflict (alliance_id, month_key) do nothing
    returning alliance_id, winning_family_id as family_id, score
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'alliance_id', i.alliance_id, 'family_id', i.family_id, 'score', i.score,
           'stripe_customer_id', f.stripe_customer_id)), '[]'::jsonb)
    into v_new
    from inserted i join families f on f.id = i.family_id;

  return jsonb_build_object('ok', true, 'month', p_month, 'awards', v_new);
end $$;

/** Records that Stripe accepted the coupon, so an unapplied award stays visible. */
create or replace function mark_alliance_award_applied(
  p_alliance_id uuid, p_month date, p_coupon text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update alliance_results
     set applied_at = now(), stripe_coupon = p_coupon, discount_applied = true
   where alliance_id = p_alliance_id
     and month_key = to_char(p_month, 'YYYY-MM')
     and applied_at is null;
  return jsonb_build_object('ok', found);
end $$;

grant execute on function create_alliance(text) to authenticated;
grant execute on function join_alliance(text) to authenticated;
grant execute on function leave_alliance() to authenticated;
grant execute on function alliance_standings(date) to authenticated;
grant execute on function alliance_capacity(uuid) to authenticated;
grant execute on function alliance_score(uuid, date) to authenticated;

-- settle_alliances and mark_alliance_award_applied are deliberately NOT granted
-- to authenticated. They decide and record real money off a real bill, so they
-- are reachable only by the service role the monthly job runs as.
revoke execute on function settle_alliances(date) from public;
revoke execute on function mark_alliance_award_applied(uuid, date, text) from public;
