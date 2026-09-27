-- ---------------------------------------------------------------------------
-- Pocket money.
--
-- Run after schema.sql.
--
-- What this is NOT: a bank, a card, a wallet, or anything that moves money.
-- RankUp never holds a penny. It keeps the answer to "what am I owed?" — which
-- is the argument the money causes, and the reason the chart on the fridge
-- stopped working. The parent settles in cash, or a bank transfer, or by
-- taking it off what they were going to buy anyway, and records that they did.
--
-- Two decisions worth stating.
--
-- It is a LEDGER, not a balance column. A number that goes up and down on its
-- own is a number nobody can argue with and everybody does; a list of lines
-- that add up can be read out loud to a child who thinks they are owed more.
-- Every penny in the pot can be pointed at.
--
-- And the amount is paid EXACTLY as set — no streak bonus, no Elite
-- multiplier, no surprise double. XP is a game currency and multipliers make
-- it fun. Real money with surprise multipliers is a parent's budget going
-- wrong, and it is the one number in this app that leaves the app.
-- ---------------------------------------------------------------------------

create table if not exists allowance_entries (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  kid_id        uuid not null references kids(id) on delete cascade,
  -- Signed minor units. Positive is owed to the child, negative is settled.
  pence         int not null check (pence <> 0 and abs(pence) <= 1000000),
  kind          text not null check (kind in ('earned','paid','gift','adjustment')),
  -- The chore this came from, when it came from one. Unique, so a submission
  -- can never pay twice however many times anything is retried.
  submission_id uuid unique references submissions(id) on delete set null,
  note          text not null default '',
  created_by    uuid references parents(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists allowance_entries_kid_idx
  on allowance_entries (kid_id, created_at desc);

alter table allowance_entries enable row level security;

/*
 * A child may READ their own lines and nothing else, which is the whole point
 * of the feature — "how much am I owed" answered without asking.
 *
 * There is deliberately no write policy at all. Every line is written by a
 * security-definer function that checks who is asking. A child who could
 * insert a row could pay themselves, and unlike XP this is money somebody
 * actually hands over.
 */
drop policy if exists allowance_read on allowance_entries;
create policy allowance_read on allowance_entries
  for select using (
    family_id = current_family_id()
    and (is_parent() or kid_id = current_kid_id())
  );

/**
 * Pay a chore's cash value into the child's pot.
 *
 * Called from approve_submission, so the money and the XP land on the same
 * tap and cannot disagree about whether a chore was approved.
 *
 * `on conflict do nothing` against the unique submission_id is the whole
 * idempotency story: a retried approval, a replayed outbox entry, two parents
 * tapping at once — none of them can pay twice.
 */
create or replace function credit_allowance(p_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub   submissions;
  v_pence int;
begin
  select * into v_sub from submissions where id = p_submission_id;
  if not found then return; end if;

  select q.pence into v_pence from quests q where q.id = v_sub.quest_id;
  if coalesce(v_pence, 0) <= 0 then return; end if;

  insert into allowance_entries (family_id, kid_id, pence, kind, submission_id, note)
  values (v_sub.family_id, v_sub.kid_id, v_pence, 'earned', p_submission_id,
          (select title from quests where id = v_sub.quest_id))
  on conflict (submission_id) do nothing;
exception when others then
  -- Never fail an approval over the money line. The chore is approved, the XP
  -- is paid, and a missing pocket-money row can be added by hand; an approval
  -- that errored in front of a child cannot be.
  return;
end $$;

revoke execute on function credit_allowance(uuid) from public;

/**
 * Record that a parent actually handed the money over.
 *
 * Refuses more than is in the pot. Paying out money that was never earned is
 * almost always a slipped decimal point, and a pot that can go negative turns
 * a simple question — what am I owed — into a debt a child has to understand.
 * A parent who wants to give extra gives a gift, which is its own line and
 * says so.
 */
create or replace function record_payout(p_kid_id uuid, p_pence int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_pot    int;
  v_me     uuid;
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can record a payment';
  end if;
  if not exists (select 1 from kids where id = p_kid_id and family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'no_such_kid');
  end if;
  if p_pence is null or p_pence <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_an_amount');
  end if;

  select coalesce(sum(pence), 0) into v_pot
    from allowance_entries where kid_id = p_kid_id;
  if p_pence > v_pot then
    return jsonb_build_object('ok', false, 'reason', 'more_than_the_pot', 'pot', v_pot);
  end if;

  select id into v_me from parents where user_id = auth.uid();
  insert into allowance_entries (family_id, kid_id, pence, kind, note, created_by)
  values (v_family, p_kid_id, -p_pence, 'paid', coalesce(p_note, ''), v_me);

  return jsonb_build_object('ok', true, 'pot', v_pot - p_pence);
end $$;

grant execute on function record_payout(uuid, int, text) to authenticated;

/**
 * Money from outside the chore list: a birthday, a one-off job, a correction.
 *
 * Capped harder than a chore because nothing generates this automatically —
 * every one is somebody typing a number, and the only realistic way it goes
 * wrong is by typing too many noughts.
 */
create or replace function record_gift(p_kid_id uuid, p_pence int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_me     uuid;
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can add to the pot';
  end if;
  if not exists (select 1 from kids where id = p_kid_id and family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'no_such_kid');
  end if;
  if p_pence is null or p_pence <= 0 or p_pence > 50000 then
    return jsonb_build_object('ok', false, 'reason', 'not_an_amount');
  end if;

  select id into v_me from parents where user_id = auth.uid();
  insert into allowance_entries (family_id, kid_id, pence, kind, note, created_by)
  values (v_family, p_kid_id, p_pence, 'gift', coalesce(p_note, ''), v_me);

  return jsonb_build_object('ok', true);
end $$;

grant execute on function record_gift(uuid, int, text) to authenticated;

/**
 * The pot, and how it got there.
 *
 * One call for the whole screen. A child calling it sees only their own,
 * because the policy above does the filtering rather than an argument to this
 * function that somebody could change.
 *
 * The pots are summed over EVERY line; the lines themselves stop at the most
 * recent two hundred, because a screen showing four years of pocket money is
 * not one anybody reads. Those two facts are why the app must take the pot
 * from here rather than adding up the lines it was sent — doing that would
 * quietly lose every penny older than the two hundredth line.
 */
create or replace function allowance_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'currency', (select currency from families where id = current_family_id()),
    'pots', coalesce((
      select jsonb_agg(jsonb_build_object('kidId', k.id, 'name', k.name, 'pence', p.pence)
                     order by k.name)
        from kids k
        join lateral (
          select coalesce(sum(e.pence), 0) as pence
            from allowance_entries e where e.kid_id = k.id
        ) p on true
       where k.family_id = current_family_id()
         and (is_parent() or k.id = current_kid_id())
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'kidId', e.kid_id, 'pence', e.pence,
               'kind', e.kind, 'note', e.note, 'at', e.created_at)
             order by e.created_at desc)
        from (select * from allowance_entries
               where family_id = current_family_id()
                 and (is_parent() or kid_id = current_kid_id())
               order by created_at desc limit 200) e
    ), '[]'::jsonb)
  );
$$;

grant execute on function allowance_summary() to authenticated;
