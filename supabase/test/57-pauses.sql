-- ---------------------------------------------------------------------------
-- Pause instead of cancel, and the half-price month (billing.sql).
--
-- tests/keepplan.mjs walks the same through the real /api/keep-plan and the
-- signed webhook against a stand-in Stripe; tests/pauseplan.mjs is what a
-- parent and a child see. This file holds every rule on its own:
--
--   - only an active, monthly, paid plan that is not ending can pause, for
--     1, 2 or 3 months, one pause at a time;
--   - while paused the plan they pay for counts as the free level, a trial
--     or a gift still counts, and nothing a child has is touched;
--   - Stripe refusing undoes the pause, Stripe taking it counts it once;
--   - resuming early, and billing starting again on the date by itself;
--   - Stripe's own news about a pause, out of order and replayed;
--   - the half-price month once per family, ever, and given back only when
--     Stripe did not apply it;
--   - pauses, half-price months and cancellations counted, totals only;
--   - the reminder three days before, once per date;
--   - a browser can reach none of it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t57_fam(p_n int) returns uuid language sql immutable as $$
  select ('57f00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t57_user(p_n int) returns uuid language sql immutable as $$
  select ('57a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- A family with a parent, paying for `p_tier` with the given status and period.
create or replace function t57_family(p_n int, p_tier text default 'standard', p_status text default 'active',
                                      p_cycle text default 'month')
returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email) values (t57_user(p_n), 't57-parent-' || p_n || '@example.com');
  insert into families (id, name, tier, subscription_status, stripe_customer_id, stripe_subscription_id,
                        billing_cycle, billing_event_at)
  values (t57_fam(p_n), 'T57 Household ' || p_n, p_tier, p_status,
          case when p_status <> 'none' then 'cus_t57_' || p_n end,
          case when p_status <> 'none' then 'sub_t57_' || p_n end,
          p_cycle, now() - interval '1 day');
  insert into parents (user_id, family_id, name, role) values (t57_user(p_n), t57_fam(p_n), 'T57 Parent ' || p_n, 'parent');
  perform seed_consent(t57_fam(p_n), t57_user(p_n));
  return t57_fam(p_n);
end $$;

-- Today's total of one count, and how much it has gone up since the start.
create or replace function t57_today(p_metric text) returns bigint language sql security definer as $$
  select coalesce(sum(n), 0)::bigint from usage_daily
   where day = (now() at time zone 'utc')::date and metric = p_metric $$;
create temp table t57_before as
  select m, t57_today(m) as n from unnest(array['plans_paused', 'plans_saved', 'plans_cancelled']) m;
create or replace function t57_added(p_metric text) returns bigint language sql as $$
  select t57_today(p_metric) - (select n from t57_before where m = p_metric) $$;

-- A Stripe subscription event, as the webhook passes it on.
create or replace function t57_news(p_n int, p_event text, p_status text, p_payload jsonb,
                                    p_created timestamptz default now())
returns jsonb language sql as $$
  select apply_subscription_change(t57_fam(p_n), p_status, 'standard', 'cus_t57_' || p_n, 'sub_t57_' || p_n,
                                   now() + interval '20 days', p_event, p_payload, p_created) $$;

select t57_family(1);                              -- the family that pauses
select t57_family(2, 'standard', 'trialing');      -- on Stripe's trial: nothing charged yet
select t57_family(3, 'standard', 'past_due');      -- a payment failed
select t57_family(4, 'standard', 'active', 'year');
select t57_family(5, 'starter', 'none');           -- no plan at all
select t57_family(6);                              -- cancelled, running to its end
update families set subscription_ends_at = now() + interval '10 days' where id = t57_fam(6);
select t57_family(7);                              -- pauses with an Elite trial running
select t57_family(8);                              -- pauses with a gift running
select t57_family(9);                              -- the half-price month
select t57_family(10);                             -- Stripe's news, out of order
select t57_family(11);                             -- the reminder
select t57_family(12, 'standard', 'active', null); -- period not known yet
select t57_family(13);                             -- cancelled straight away

-- ---------- who may pause ----------
do $$
declare v jsonb;
begin
  foreach v in array array[start_plan_pause(t57_fam(1), 0), start_plan_pause(t57_fam(1), 4), start_plan_pause(t57_fam(1), null)] loop
    perform ok('a pause is 1, 2 or 3 months, nothing else (' || v::text || ')', v->>'reason' = 'bad_months');
  end loop;
  perform ok('no such family', start_plan_pause('57f00000-0000-4000-8000-00000000ffff', 1)->>'reason' = 'no_family');
  perform ok('a family with no plan at Stripe has nothing to pause', start_plan_pause(t57_fam(5), 1)->>'reason' = 'no_subscription');
  perform ok('on Stripe''s free trial nothing is charged yet, so nothing to pause', start_plan_pause(t57_fam(2), 1)->>'reason' = 'not_active');
  perform ok('behind on a payment: the card comes first', start_plan_pause(t57_fam(3), 1)->>'reason' = 'not_active');
  perform ok('a plan already cancelled and running to its end is not paused', start_plan_pause(t57_fam(6), 1)->>'reason' = 'plan_ending');
  perform ok('a yearly plan is not paused (a month off stops no payment)', start_plan_pause(t57_fam(4), 1)->>'reason' = 'not_monthly');
  perform ok('nor one Stripe says is yearly, whatever the family row thought', start_plan_pause(t57_fam(1), 1, 'year')->>'reason' = 'not_monthly');
  perform ok('nor one whose period is not known yet', start_plan_pause(t57_fam(12), 1)->>'reason' = 'not_monthly');
  v := start_plan_pause(t57_fam(12), 1, 'month');
  perform ok('which Stripe''s answer settles', (v->>'ok')::boolean
    and (select billing_cycle from families where id = t57_fam(12)) = 'month');
  perform finish_plan_pause((select max(id) from plan_pauses where family_id = t57_fam(12)), false);
  perform ok('none of the refusals left a pause behind',
    not exists (select 1 from plan_pauses where family_id in (t57_fam(1), t57_fam(2), t57_fam(3), t57_fam(4), t57_fam(5), t57_fam(6), t57_fam(12)))
    and not exists (select 1 from families where id in (t57_fam(2), t57_fam(3), t57_fam(4), t57_fam(6), t57_fam(12)) and paused_until is not null));
end $$;

-- ---------- a pause, and what it changes ----------
do $$
declare v jsonb; v2 jsonb; v_id bigint; v_kid uuid := '57c00000-0000-4000-8000-000000000001';
begin
  -- Two children with earnings, on Standard: what a pause must not touch.
  insert into kids (id, family_id, name, xp, coins, skins, skin_id, play_tokens) values
    (v_kid, t57_fam(1), 'T57 Kid', 840, 120, '["ember"]', 'ember', 3),
    ('57c00000-0000-4000-8000-000000000002', t57_fam(1), 'T57 Sister', 300, 40, '[]', null, 0);
  perform ok('(paying for Standard, before the pause)', effective_tier(t57_fam(1)) = 'standard');

  v := start_plan_pause(t57_fam(1), 2);
  v_id := (v->>'pause_id')::bigint;
  perform ok('an active monthly plan can pause for two months', (v->>'ok')::boolean and v_id is not null, v::text);
  perform ok('billing starts again two months from now', abs(extract(epoch from (v->>'resumes_at')::timestamptz - (now() + interval '2 months'))) < 5);
  perform ok('the server is told which subscription to pause', v->>'subscription_id' = 'sub_t57_1');
  perform ok('the family row says until when', (select paused_until from families where id = t57_fam(1)) = (v->>'resumes_at')::timestamptz);
  perform ok('while paused, the plan they pay for counts as the free level', effective_tier(t57_fam(1)) = 'starter');
  perform ok('but what they pay for is still written down, untouched', (select tier from families where id = t57_fam(1)) = 'standard');
  perform ok('nothing a child has is touched: XP, coins, items, tokens, both children',
    (select xp = 840 and coins = 120 and skins = '["ember"]'::jsonb and skin_id = 'ember' and play_tokens = 3 from kids where id = v_kid)
    and (select count(*) from kids where family_id = t57_fam(1)) = 2);
  begin
    insert into kids (family_id, name) values (t57_fam(1), 'T57 Third');
    perform ok('a third child waits for the plan to come back (the free level is one child)', false);
  exception when others then
    perform ok('a third child waits for the plan to come back (the free level is one child)', sqlerrm like '%Starter plan covers one child%');
  end;
  perform ok('the Elite XP boost is not given while paused either',
    (select case effective_tier(t57_fam(1)) when 'elite' then 1.5 else 1 end) = 1);

  v2 := start_plan_pause(t57_fam(1), 1);
  perform ok('one pause at a time', v2->>'reason' = 'already_paused' and v2->>'paused_until' is not null);

  -- Stripe's answer.
  perform ok('no such pause', finish_plan_pause(-1, true)->>'reason' = 'no_pause');
  v2 := finish_plan_pause(v_id, true);
  perform ok('Stripe took it: confirmed', (v2->>'ok')::boolean
    and (select confirmed_at is not null from plan_pauses where id = v_id));
  perform ok('and counted once for the owner''s console', t57_added('plans_paused') = 1, t57_added('plans_paused')::text);
  perform finish_plan_pause(v_id, true);
  perform ok('not twice when told again', t57_added('plans_paused') = 1);
  v2 := finish_plan_pause(v_id, false);
  perform ok('a confirmed pause is never undone by a late failure', (v2->>'kept')::boolean
    and (select paused_until is not null from families where id = t57_fam(1)));

  -- Billing starting again by itself, on the day.
  update families set paused_until = now() - interval '1 second' where id = t57_fam(1);
  perform ok('on the date, the plan they pay for counts again, with no message needed', effective_tier(t57_fam(1)) = 'standard');
  perform ok('and resuming is then not needed', end_plan_pause(t57_fam(1))->>'reason' = 'not_paused');
  update families set paused_until = (v->>'resumes_at')::timestamptz where id = t57_fam(1);

  -- Resuming early.
  perform ok('no such family to resume', end_plan_pause('57f00000-0000-4000-8000-00000000ffff')->>'reason' = 'no_family');
  v2 := end_plan_pause(t57_fam(1));
  perform ok('resuming early ends the pause', (v2->>'ok')::boolean
    and (select paused_until is null from families where id = t57_fam(1))
    and (select ended_at is not null from plan_pauses where id = v_id));
  perform ok('and the plan is back at once', effective_tier(t57_fam(1)) = 'standard');
  perform ok('resuming twice says there is no pause', end_plan_pause(t57_fam(1))->>'reason' = 'not_paused');
end $$;

-- ---------- Stripe refusing undoes it ----------
do $$
declare v jsonb; v2 jsonb;
begin
  v := start_plan_pause(t57_fam(1), 1);
  perform ok('(paused again for a month)', (v->>'ok')::boolean and effective_tier(t57_fam(1)) = 'starter');
  v2 := finish_plan_pause((v->>'pause_id')::bigint, false);
  perform ok('Stripe refused: the pause is undone, as if it never was',
    (v2->>'undone')::boolean
    and not exists (select 1 from plan_pauses where id = (v->>'pause_id')::bigint)
    and (select paused_until is null from families where id = t57_fam(1))
    and effective_tier(t57_fam(1)) = 'standard');
  perform ok('and not counted', t57_added('plans_paused') = 1);
end $$;

-- ---------- a trial or a gift still counts while paused ----------
do $$
begin
  update families set trial_tier = 'elite', trial_ends_at = now() + interval '5 days' where id = t57_fam(7);
  perform start_plan_pause(t57_fam(7), 1);
  perform ok('paused with an Elite trial running: still Elite until the trial ends', effective_tier(t57_fam(7)) = 'elite');
  update families set trial_ends_at = now() - interval '1 minute' where id = t57_fam(7);
  perform ok('then the free level, until the pause ends', effective_tier(t57_fam(7)) = 'starter');
  update families set paused_until = now() - interval '1 second' where id = t57_fam(7);
  perform ok('then the plan they pay for', effective_tier(t57_fam(7)) = 'standard');

  update families set gift_tier = 'standard', gift_starts_at = now() - interval '1 day', gift_until = now() + interval '300 days'
   where id = t57_fam(8);
  update families set tier = 'elite' where id = t57_fam(8);
  perform start_plan_pause(t57_fam(8), 3);
  perform ok('paused with a gift of Standard running: Standard, the gift''s, for the whole pause', effective_tier(t57_fam(8)) = 'standard');
  perform ok('the gift itself is untouched', (select gift_tier = 'standard' and gift_until > now() + interval '299 days' from families where id = t57_fam(8)));
  update families set paused_until = now() - interval '1 second' where id = t57_fam(8);
  perform ok('and when the pause ends, Elite, what they pay for, again', effective_tier(t57_fam(8)) = 'elite');
end $$;

-- ---------- Stripe's own news about a pause ----------
do $$
declare v jsonb; v_until timestamptz := date_trunc('second', now() + interval '40 days'); v_id bigint;
begin
  perform t57_news(10, 'evt_t57_cycle', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', null, 'cycle', 'year'));
  perform ok('the webhook writes down monthly or yearly from the price', (select billing_cycle from families where id = t57_fam(10)) = 'year');
  perform t57_news(10, 'evt_t57_cycle2', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', null, 'cycle', 'month'));
  perform t57_news(10, 'evt_t57_nocycle', 'active', jsonb_build_object('type', 'customer.subscription.updated'));
  perform ok('and keeps it when an event does not say', (select billing_cycle from families where id = t57_fam(10)) = 'month');

  -- Paused in Stripe's own dashboard: the webhook writes it down.
  perform t57_news(10, 'evt_t57_dash', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', v_until));
  select id into v_id from plan_pauses where family_id = t57_fam(10) and ended_at is null;
  perform ok('a pause made in Stripe''s dashboard is written down, with no months', v_id is not null
    and (select months is null and resumes_at = v_until and confirmed_at is not null from plan_pauses where id = v_id));
  perform ok('the family is paused until Stripe''s date', (select paused_until from families where id = t57_fam(10)) = v_until
    and effective_tier(t57_fam(10)) = 'starter');
  perform ok('and it is counted', t57_added('plans_paused') = 2, t57_added('plans_paused')::text);
  perform t57_news(10, 'evt_t57_dash', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', v_until));
  perform t57_news(10, 'evt_t57_dash_again', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', v_until));
  perform ok('Stripe saying it again makes no second pause and no second count',
    (select count(*) from plan_pauses where family_id = t57_fam(10)) = 1 and t57_added('plans_paused') = 2);

  -- The date moved in Stripe: the reminder follows it.
  update plan_pauses set reminder_sent_at = now() where id = v_id;
  perform t57_news(10, 'evt_t57_moved', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', v_until + interval '7 days'));
  perform ok('a new date from Stripe moves the pause, and the reminder is due again for it',
    (select resumes_at = v_until + interval '7 days' and reminder_sent_at is null from plan_pauses where id = v_id)
    and (select paused_until from families where id = t57_fam(10)) = v_until + interval '7 days');

  -- Old news, written before the pause began, does not end it. (Older than
  -- the last event applied is ignored anyway; this is news newer than that
  -- but still from before the pause.)
  update families set billing_event_at = now() - interval '1 day' where id = t57_fam(10);
  perform t57_news(10, 'evt_t57_old', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', null),
                   now() - interval '1 hour');
  perform ok('news written before the pause began does not end it', (select paused_until is not null from families where id = t57_fam(10)));

  -- Stripe resuming it (the date came, or the parent resumed in the portal).
  perform t57_news(10, 'evt_t57_resumed', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', null),
                   now() + interval '1 second');
  perform ok('Stripe saying it is not paused any more ends the pause',
    (select paused_until is null from families where id = t57_fam(10)) and (select ended_at is not null from plan_pauses where id = v_id)
    and effective_tier(t57_fam(10)) = 'standard');

  -- And late news from while it was paused does not pause it again.
  update families set billing_event_at = now() - interval '1 day' where id = t57_fam(10);
  perform t57_news(10, 'evt_t57_late_pause', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', v_until),
                   now() - interval '30 minutes');
  perform ok('late news from before it was resumed does not pause it again', (select paused_until is null from families where id = t57_fam(10)));
end $$;

do $$
declare v jsonb;
begin
  -- A pause the app is still telling Stripe about is left alone.
  update families set billing_event_at = now() - interval '1 day' where id = t57_fam(10);
  v := start_plan_pause(t57_fam(10), 1);
  perform t57_news(10, 'evt_t57_midflight', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'paused_until', null),
                   now() + interval '2 seconds');
  perform ok('news while the app waits for Stripe''s answer does not undo the pause', (select paused_until is not null from families where id = t57_fam(10)));
  perform finish_plan_pause((v->>'pause_id')::bigint, true);

  -- The plan ends while paused: the pause ends with it, and nothing is deleted.
  perform t57_news(10, 'evt_t57_gone', 'canceled', jsonb_build_object('type', 'customer.subscription.deleted', 'ended_at', now()),
                   now() + interval '3 seconds');
  perform ok('a plan that ends while paused ends the pause with it',
    (select paused_until is null and tier = 'starter' from families where id = t57_fam(10))
    and not exists (select 1 from plan_pauses where family_id = t57_fam(10) and ended_at is null));
end $$;

-- ---------- cancelling, counted ----------
do $$
declare v_before bigint := t57_added('plans_cancelled');
begin
  perform t57_news(1, 'evt_t57_cancel', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'cancel_at', now() + interval '20 days'));
  perform ok('a plan cancelled in the portal is counted once, when it is set to stop', t57_added('plans_cancelled') = v_before + 1);
  perform t57_news(1, 'evt_t57_cancel', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'cancel_at', now() + interval '20 days'));
  perform t57_news(1, 'evt_t57_cancel_more', 'active', jsonb_build_object('type', 'customer.subscription.updated', 'cancel_at', now() + interval '20 days'));
  perform ok('not again when Stripe repeats itself', t57_added('plans_cancelled') = v_before + 1);
  perform t57_news(1, 'evt_t57_cancel_end', 'canceled', jsonb_build_object('type', 'customer.subscription.deleted', 'ended_at', now()));
  perform ok('nor when it then ends on the day', t57_added('plans_cancelled') = v_before + 1);
  perform t57_news(13, 'evt_t57_cancel_now', 'canceled', jsonb_build_object('type', 'customer.subscription.deleted', 'ended_at', now()));
  perform ok('a plan cancelled at once is counted once too', t57_added('plans_cancelled') = v_before + 2);
end $$;

-- ---------- the half-price month: once per family, ever ----------
do $$
declare v jsonb;
begin
  perform ok('no such family', claim_save_offer('57f00000-0000-4000-8000-00000000ffff')->>'reason' = 'no_family');
  perform ok('no plan, no half-price month', claim_save_offer(t57_fam(5))->>'reason' = 'no_subscription');
  perform ok('not on Stripe''s free trial', claim_save_offer(t57_fam(2))->>'reason' = 'not_active');
  perform ok('not on a yearly plan (it would be half a year)', claim_save_offer(t57_fam(4))->>'reason' = 'not_monthly');
  perform ok('not for a plan already ending', claim_save_offer(t57_fam(6))->>'reason' = 'plan_ending');
  update families set paused_until = now() + interval '1 month' where id = t57_fam(8);
  perform ok('not while paused: nothing is charged to take half off', claim_save_offer(t57_fam(8))->>'reason' = 'paused');
  update families set paused_until = null where id = t57_fam(8);

  v := claim_save_offer(t57_fam(9));
  perform ok('an active monthly plan can have it, and the server is told which subscription', (v->>'ok')::boolean and v->>'subscription_id' = 'sub_t57_9');
  perform ok('it is marked taken before Stripe is asked', (select save_offer_used_at is not null from families where id = t57_fam(9)));
  perform ok('so a second tap at the same time cannot have it too', claim_save_offer(t57_fam(9))->>'reason' = 'already_used');
  v := finish_save_offer(t57_fam(9), false);
  perform ok('Stripe did not apply it: given back', (v->>'given_back')::boolean
    and (select save_offer_used_at is null from families where id = t57_fam(9)));
  perform ok('and not counted', t57_added('plans_saved') = 0);
  v := claim_save_offer(t57_fam(9));
  perform ok('so it can be tried again', (v->>'ok')::boolean);
  v := finish_save_offer(t57_fam(9), true);
  perform ok('Stripe applied it: counted', (v->>'ok')::boolean and t57_added('plans_saved') = 1);
  perform ok('and never again for this family', claim_save_offer(t57_fam(9))->>'reason' = 'already_used');
  update families set subscription_status = 'canceled', stripe_subscription_id = null where id = t57_fam(9);
  update families set subscription_status = 'active', stripe_subscription_id = 'sub_t57_9_again' where id = t57_fam(9);
  perform ok('not even after cancelling and paying again', claim_save_offer(t57_fam(9))->>'reason' = 'already_used');
  v := finish_save_offer(t57_fam(1), true);
  perform ok('a finish for a family that never claimed it counts nothing', v->>'reason' = 'not_claimed'
    and t57_added('plans_saved') = 1);

  -- The month it takes half off is the next invoice, which a pause would void.
  perform ok('a pause in the month after it is refused, so the half-price invoice is not voided',
    start_plan_pause(t57_fam(9), 1)->>'reason' = 'half_price_month');
  update families set save_offer_used_at = now() - interval '40 days' where id = t57_fam(9);
  v := start_plan_pause(t57_fam(9), 1);
  perform ok('after that month, a pause is fine', (v->>'ok')::boolean);
end $$;

-- ---------- the reminder, three days before billing starts again ----------
insert into auth.users (id, email) values ('57a00000-0000-4000-8000-0000000000e1', 't57-gran@example.com'),
                                         ('57a00000-0000-4000-8000-0000000000e2', null);
insert into parents (user_id, family_id, name, role) values
  ('57a00000-0000-4000-8000-0000000000e1', t57_fam(11), 'T57 Gran', 'supporter'),
  ('57a00000-0000-4000-8000-0000000000e2', t57_fam(11), 'T57 No Email', 'parent');
do $$
declare v jsonb; v_id bigint; v_due jsonb; r jsonb;
begin
  v := start_plan_pause(t57_fam(11), 1);
  v_id := (v->>'pause_id')::bigint;
  perform finish_plan_pause(v_id, true);
  select x into r from jsonb_array_elements(due_pause_reminders()->'reminders') x where (x->>'pause_id')::bigint = v_id;
  perform ok('a month away, no reminder yet', r is null);

  -- Three days before.
  update plan_pauses set resumes_at = now() + interval '2 days 20 hours' where id = v_id;
  update families set paused_until = now() + interval '2 days 20 hours' where id = t57_fam(11);
  select x into r from jsonb_array_elements(due_pause_reminders()->'reminders') x where (x->>'pause_id')::bigint = v_id;
  perform ok('within three days of billing starting again, it is due', r is not null, coalesce(r::text, 'not due'));
  perform ok('with the plan, the period and the day in the family''s own words', r->>'paid_tier' = 'standard' and r->>'cycle' = 'month'
    and r->>'resumes_local' ~ '^[A-Z][a-z]+ [0-9]{1,2} [A-Z][a-z]+$', r::text);
  perform ok('written to the parent with an email address, never the supporter', jsonb_array_length(r->'recipients') = 1
    and r->'recipients'->0->>'email' = 't57-parent-11@example.com', (r->'recipients')::text);
  perform ok('and not one day more than three days ahead',
    not exists (select 1 from jsonb_array_elements(due_pause_reminders(now() - interval '1 day')->'reminders') x
                 where (x->>'pause_id')::bigint = v_id));

  perform ok('one run claims it', claim_pause_reminder(v_id));
  perform ok('a second run at the same time does not', not claim_pause_reminder(v_id));
  perform ok('and a claimed reminder is not listed again for an hour',
    not exists (select 1 from jsonb_array_elements(due_pause_reminders()->'reminders') x where (x->>'pause_id')::bigint = v_id));
  perform finish_pause_reminder(v_id, false);
  perform ok('a send that failed gives the claim back', claim_pause_reminder(v_id));
  perform finish_pause_reminder(v_id, true);
  perform ok('once sent, never again for this date',
    not claim_pause_reminder(v_id)
    and not exists (select 1 from jsonb_array_elements(due_pause_reminders()->'reminders') x where (x->>'pause_id')::bigint = v_id));

  -- Resumed early: nothing to remind about.
  update plan_pauses set reminder_sent_at = null, reminder_claimed_at = null where id = v_id;
  perform end_plan_pause(t57_fam(11));
  perform ok('a pause resumed early is not reminded about',
    not exists (select 1 from jsonb_array_elements(due_pause_reminders()->'reminders') x where (x->>'pause_id')::bigint = v_id)
    and not claim_pause_reminder(v_id));
end $$;

-- ---------- what the plan screen is told, and what a browser can reach ----------
do $$
declare v jsonb; v_seen int;
begin
  update families set paused_until = now() + interval '20 days' where id = t57_fam(1);
  update families set subscription_status = 'active', subscription_ends_at = null where id = t57_fam(1);
  perform become(t57_user(1));
  set local role app_user;
  v := billing_status();
  perform ok('billing_status tells the parent when billing starts again, monthly or yearly, and that the half-price month is unused',
    (v->>'paused_until')::timestamptz > now() and v->>'cycle' = 'month' and (v->>'save_offer_used')::boolean = false, v::text);
  begin
    select count(*) into v_seen from plan_pauses;
  exception when insufficient_privilege then v_seen := 0;
  end;
  perform ok('a signed-in parent reads no pause rows, not even their own', v_seen = 0);
  begin
    perform start_plan_pause(t57_fam(1), 1);
    perform ok('nor can a browser pause a plan itself (Stripe would not know)', false);
  exception when insufficient_privilege then
    perform ok('nor can a browser pause a plan itself (Stripe would not know)', true);
  end;
  begin
    perform claim_save_offer(t57_fam(1));
    perform ok('nor claim the half-price month', false);
  exception when insufficient_privilege then
    perform ok('nor claim the half-price month', true);
  end;
  begin
    update families set paused_until = null, save_offer_used_at = null where id = t57_fam(1);
    perform ok('nor write the pause or the half-price month on its family row', false);
  exception when insufficient_privilege then
    perform ok('nor write the pause or the half-price month on its family row', true);
  end;
  reset role;
  perform become(null);
end $$;

do $$
declare
  f text;
  v_open text[] := '{}';
begin
  foreach f in array array[
    'stripe_subscription_for_family(uuid)', 'start_plan_pause(uuid,integer,text)', 'finish_plan_pause(bigint,boolean)',
    'end_plan_pause(uuid)', 'sync_plan_pause(uuid,timestamptz,boolean,timestamptz)', 'claim_save_offer(uuid,text)',
    'finish_save_offer(uuid,boolean)', 'due_pause_reminders(timestamptz)', 'claim_pause_reminder(bigint)',
    'finish_pause_reminder(bigint,boolean)', 'count_plan_change(text)']
  loop
    if to_regprocedure(f) is null then
      v_open := v_open || (f || ' (missing)');
    elsif has_function_privilege('anon', to_regprocedure(f), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(f), 'execute')
       or has_function_privilege('public', to_regprocedure(f), 'execute') then
      v_open := v_open || f;
    end if;
  end loop;
  perform ok('every pause and half-price function is the server''s alone: not public, anon or authenticated',
    cardinality(v_open) = 0, array_to_string(v_open, ', '));
  perform ok('row level security is on for plan_pauses, with no policy',
    (select relrowsecurity from pg_class where relname = 'plan_pauses')
    and not exists (select 1 from pg_policies where tablename = 'plan_pauses'));
end $$;

delete from families where id in (select t57_fam(n) from generate_series(1, 13) n);
delete from auth.users where id::text like '57a00000-%';
drop function t57_news(int, text, text, jsonb, timestamptz);
drop function t57_added(text);
drop function t57_today(text);
drop function t57_family(int, text, text, text);
drop function t57_user(int);
drop function t57_fam(int);
