-- ---------------------------------------------------------------------------
-- Deals and Seasons (0.23.0).
--
--   - Founding Families: the places left are counted, never made up; the
--     last place is never given twice; one place per family; a held place
--     lapses or is given back; Stripe's webhook confirms it; the half-price
--     month and a founding year are never both had.
--   - "Keep what you've paid": the paid months billing_status reports.
--   - The Season autopilot: Season 1 on launch day, each Season 4 months
--     after the one before, made ahead and secret until its first day; only
--     themes the owner queued go into it; a reminder seven days before a
--     Season with no theme, once; run twice, nothing changes.
--
-- Every Season and setting made here is removed at the end: a Season that
-- had started would greet every child in the browser tests.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t61_id(p_kind text, p_n int) returns uuid language sql immutable as $$
  select ('61' || p_kind || '00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;

insert into auth.users (id, email) select t61_id('a', n), 't61-parent-' || n || '@example.com' from generate_series(1, 6) n;
insert into families (id, name, tier) select t61_id('b', n), 'T61 family ' || n, 'starter' from generate_series(1, 6) n;
insert into parents (user_id, family_id, name) select t61_id('a', n), t61_id('b', n), 'P' || n from generate_series(1, 6) n;

-- ---------- Founding Families ----------
do $$
declare r jsonb; v_left int; base int;
begin
  base := founding_places_taken();
  perform ok('with no place taken, every place is left', founding_places_left(base + 2) = 2);
  r := reserve_founding_place(t61_id('b', 1), base + 2, now() + interval '1 day');
  perform ok('a family holds a place for its yearly checkout', (r->>'ok')::boolean and (r->>'left')::int = 1, r::text);
  r := reserve_founding_place(t61_id('b', 1), base + 2, now() + interval '1 day');
  perform ok('a second tap gets the same place back, not a second one', (r->>'ok')::boolean and (r->>'left')::int = 1, r::text);
  r := reserve_founding_place(t61_id('b', 2), base + 2, null);
  perform ok('the last place goes to the next family', (r->>'ok')::boolean and (r->>'left')::int = 0, r::text);
  r := reserve_founding_place(t61_id('b', 3), base + 2, null);
  perform ok('and then there are none: refused, never made up', r->>'reason' = 'full', r::text);
  r := reserve_founding_place(t61_id('b', 3), base + 10, now() - interval '1 second');
  perform ok('after the end date, refused', r->>'reason' = 'ended', r::text);
  r := reserve_founding_place(t61_id('f', 9), base + 10, null);
  perform ok('a family that does not exist gets nothing', r->>'reason' = 'no_family', r::text);

  -- Stripe's news, through the webhook's functions.
  perform ok('the checkout is noted', (note_founding_session(t61_id('b', 1), 'cs_t61_one')->>'ok')::boolean);
  perform ok('a family with no place held has nothing to note', note_founding_session(t61_id('b', 4), 'cs_t61_x')->>'reason' = 'no_place');
  perform ok('paid: the place is the family''s for good', (confirm_founding_place(t61_id('b', 1), 'cs_t61_one')->>'ok')::boolean);
  perform ok('the same news twice changes nothing', (confirm_founding_place(t61_id('b', 1), 'cs_t61_one')->>'duplicate')::boolean);
  perform ok('no family, no place', confirm_founding_place(null, 'cs_t61_none')->>'reason' = 'no_family');
  r := reserve_founding_place(t61_id('b', 1), base + 10, null);
  perform ok('one place per family, ever', r->>'reason' = 'already_founding', r::text);
  perform ok('a confirmed place is never given back by an expired checkout',
    release_founding_place(t61_id('b', 1), 'cs_t61_one')->>'reason' = 'no_place');

  -- Family 2's checkout closes unpaid: its place goes back.
  perform ok('an expired checkout gives its place back', (release_founding_place(t61_id('b', 2), null)->>'ok')::boolean);
  perform ok('so a place is left again, counted', founding_places_left(base + 2) = 1);

  -- A hold that lapses (two hours) stops counting by itself.
  r := reserve_founding_place(t61_id('b', 3), base + 2, null);
  update founding_places set reserved_at = now() - interval '3 hours' where family_id = t61_id('b', 3);
  perform ok('a hold left for more than two hours is not counted', founding_places_left(base + 2) = 1);

  -- The half-price month and a founding year are never both had.
  update families set save_offer_used_at = now() - interval '5 days' where id = t61_id('b', 5);
  r := reserve_founding_place(t61_id('b', 5), base + 10, null);
  perform ok('not within a month of the half-price month', r->>'reason' = 'save_offer_recent', r::text);

  perform ok('the Founding functions are the server''s alone',
    not has_function_privilege('authenticated', 'reserve_founding_place(uuid,integer,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'founding_places_left(integer)', 'execute')
    and not has_function_privilege('authenticated', 'confirm_founding_place(uuid,text)', 'execute'));
end $$;

-- ---------- "keep what you've paid": the months a family has paid ----------
do $$
begin
  insert into billing_events (family_id, stripe_event, type, payload, amount_pence, currency) values
    (t61_id('b', 6), 'invoice:in_t61_1', 'invoice.paid', '{}', 999, 'USD'),
    (t61_id('b', 6), 'invoice:in_t61_2', 'invoice.paid', '{}', 999, 'USD'),
    (t61_id('b', 6), 'invoice:in_t61_trial', 'invoice.paid', '{}', null, 'USD');
  perform ok('two paid months, not counting a trial''s empty invoice', family_paid_invoices(t61_id('b', 6)) = 2);
end $$;
set role app_user;
do $$
begin
  perform become(t61_id('a', 6));
  perform ok('the plan screen is told how many months have been paid', (billing_status()->>'paid_months')::int = 2);
end $$;
reset role;

-- ---------- the Season autopilot ----------
do $$
declare r jsonb; v_launch date := (now() at time zone 'utc')::date + 10;
begin
  delete from season_plan;
  delete from season_reminders;
  r := run_season_autopilot();
  perform ok('with no launch day it does nothing', r->>'idle' = 'no_launch_date', r::text);
  perform ok('the launch day must be a real day', operator_set_launch_date(null)->>'reason' = 'bad_date');
  perform ok('the owner sets launch day', (operator_set_launch_date(v_launch)->>'ok')::boolean);

  perform ok('the rule: Season 1 on launch day', season_start_for(v_launch, 1) = v_launch);
  perform ok('Season 2 four months later', season_start_for(date '2027-03-01', 2) = date '2027-07-01');
  perform ok('Season 4 a year after launch', season_start_for(date '2027-03-01', 4) = date '2028-03-01');
  perform ok('Season 1 is called the Founding Season', season_name_for(1) = 'Founding Season' and season_name_for(3) = 'Season 3');

  -- A theme sent by a family, not yet chosen, and one the owner queues.
  insert into theme_submissions (id, family_id, kid_id, payload, status)
  select t61_id('c', n), t61_id('b', 1),
         (select id from kids limit 1), jsonb_build_object('name', 'T61 theme ' || n, 'design', '{}'::jsonb), 'new'
    from generate_series(1, 2) n;
  perform ok('the owner queues one for the next Season', (operator_queue_theme(t61_id('c', 1))->>'ok')::boolean);
  perform ok('a theme that is not there cannot be queued', operator_queue_theme(t61_id('c', 9))->>'reason' = 'no_submission');

  r := run_season_autopilot(v_launch - 40);
  perform ok('more than 30 days before launch, no Season is made yet', jsonb_array_length(r->'made') = 0, r::text);
  r := run_season_autopilot(v_launch - 20);
  perform ok('30 days before, Season 1 is made, secretly', r->'made' = '[1]'::jsonb
    and exists (select 1 from seasons where number = 1 and name = 'Founding Season' and starts_on = v_launch), r::text);
  perform ok('the queued theme goes into it', (r->>'moved')::int = 1
    and exists (select 1 from season_themes t join seasons s on s.id = t.season_id where s.number = 1 and t.name = 'T61 theme 1'));
  perform ok('and is marked picked for Season 1',
    (select status from theme_submissions where id = t61_id('c', 1)) = 'picked');
  perform ok('a theme the owner did not choose is never published',
    (select status from theme_submissions where id = t61_id('c', 2)) = 'new'
    and not exists (select 1 from season_themes where name = 'T61 theme 2'));
  r := run_season_autopilot(v_launch - 20);
  perform ok('run again the same day, nothing changes', jsonb_array_length(r->'made') = 0 and (r->>'moved')::int = 0, r::text);
  perform ok('no reminder for a Season that has a theme', r->'reminder' = 'null'::jsonb, r::text);

  -- Season 2: nothing queued. Made 30 days ahead; reminded seven days before.
  r := run_season_autopilot(season_start_for(v_launch, 2) - 30);
  perform ok('Season 2 is made four months after Season 1', r->'made' = '[2]'::jsonb
    and (select starts_on from seasons where number = 2) = season_start_for(v_launch, 2), r::text);
  r := run_season_autopilot(season_start_for(v_launch, 2) - 8);
  perform ok('eight days before, no reminder yet', r->'reminder' = 'null'::jsonb, r::text);
  r := run_season_autopilot(season_start_for(v_launch, 2) - 7);
  perform ok('seven days before a Season with no theme, the owner is reminded', (r->'reminder'->>'number')::int = 2, r::text);
  r := run_season_autopilot(season_start_for(v_launch, 2) - 6);
  perform ok('once', r->'reminder' = 'null'::jsonb, r::text);
  perform ok('the reminder waits to be emailed', jsonb_array_length(due_season_reminders()) = 1);
  perform ok('and is marked sent', (mark_season_reminder_sent(2)->>'ok')::boolean);
  perform ok('so nothing waits any more', jsonb_array_length(due_season_reminders()) = 0);
  perform ok('a reminder is marked sent once', mark_season_reminder_sent(2)->>'reason' = 'no_reminder');
  perform ok('the Season starts all the same, with no new theme',
    exists (select 1 from seasons where number = 2) and not exists (
      select 1 from season_themes t join seasons s on s.id = t.season_id where s.number = 2));

  -- A Season made by hand with the next number is left alone.
  r := run_season_autopilot(season_start_for(v_launch, 3) - 30);
  perform ok('Season 3 is made too', r->'made' = '[3]'::jsonb, r::text);
  perform ok('a theme already picked cannot be queued again', operator_queue_theme(t61_id('c', 1))->>'reason' = 'already_picked');

  -- Launch day can move until Season 1 starts; Season 1 moves with it.
  perform ok('launch day moves before Season 1 starts', (operator_set_launch_date(v_launch + 1)->>'ok')::boolean);
  perform ok('and Season 1 moves with it', (select starts_on from seasons where number = 1) = v_launch + 1);
  update seasons set starts_on = (now() at time zone 'utc')::date - 1 where number = 1;
  perform ok('but not once Season 1 has started', operator_set_launch_date(v_launch + 5)->>'reason' = 'season_started');
  perform ok('the newest Season that has started is the one the deal follows', (current_season()->>'number')::int = 1);

  perform ok('the autopilot and the console are the server''s alone',
    not has_function_privilege('authenticated', 'run_season_autopilot(date)', 'execute')
    and not has_function_privilege('anon', 'operator_set_launch_date(date)', 'execute')
    and not has_function_privilege('authenticated', 'operator_queue_theme(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'current_season()', 'execute'));
end $$;

-- Gone again, every Season, plan and reminder made here.
delete from season_themes where season_id in (select id from seasons where number in (1, 2, 3));
delete from seasons where number in (1, 2, 3);
delete from season_reminders;
delete from season_plan;
delete from theme_submissions where id in (t61_id('c', 1), t61_id('c', 2));
delete from founding_places where family_id in (select t61_id('b', n) from generate_series(1, 6) n);
delete from families where id in (select t61_id('b', n) from generate_series(1, 6) n);
drop function t61_id(text, int);
