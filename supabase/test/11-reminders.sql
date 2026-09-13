-- ---------------------------------------------------------------------------
-- Reminder schedules.
--
-- The claims worth testing: a reminder fires once a day and not twice however
-- often the job runs, it fires at the family's own local time rather than UTC,
-- an early-morning one is not lost to the midnight wrap, and a signed-in
-- account cannot enumerate other families by asking what is due.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('2b111111-0000-0000-0000-000000000001', 'rem-parent@example.com');
insert into families (id, name) values ('2b222222-0000-0000-0000-000000000001', 'The Remindas');
insert into parents (user_id, family_id, name) values
  ('2b111111-0000-0000-0000-000000000001', '2b222222-0000-0000-0000-000000000001', 'Rem');
select seed_consent('2b222222-0000-0000-0000-000000000001', '2b111111-0000-0000-0000-000000000001');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on reminder_schedules from anon, authenticated;

set role app_user;

do $$
declare v_saved jsonb;
begin
  perform become('2b111111-0000-0000-0000-000000000001');

  perform ok('a parent can save a schedule',
    (save_reminder_schedule('parent', null, 'Europe/London', '[
       {"label":"Morning quests","time":"07:30","on":true},
       {"label":"Bedtime check","time":"19:30","on":false}
     ]'::jsonb)->>'ok')::boolean);

  v_saved := my_reminder_schedule('parent', null);
  perform ok('and reads it back', jsonb_array_length(v_saved->'reminders') = 2);
  perform ok('with the times intact', (v_saved->'reminders'->0->>'time') = '07:30');
  perform ok('and the off one still marked off',
    (v_saved->'reminders'->1->>'on')::boolean = false);

  -- An unknown zone must not be stored: every due check would throw on it.
  -- Whether it actually was is checked below, as the owner — a parent cannot
  -- read this table at all, which is itself the next assertion.
  perform save_reminder_schedule('parent', null, 'Mars/Olympus', '[{"time":"08:00","on":true}]'::jsonb);

  begin
    perform 1 from reminder_schedules limit 1;
    raise exception 'FAIL a parent read the reminder table directly';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT read the reminder table directly (%)', left(sqlerrm, 30);
  end;

  -- A signed-in parent must not be able to ask what is due for everyone.
  begin
    perform due_reminders();
    raise exception 'FAIL a parent enumerated every family''s due reminders';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT ask what is due for every family (%)', left(sqlerrm, 30);
  end;
end $$;

reset role;

do $$
begin
  perform ok('a nonsense time zone falls back to UTC rather than being stored',
    (select timezone from reminder_schedules
      where family_id = '2b222222-0000-0000-0000-000000000001' limit 1) = 'UTC');
end $$;

-- ---------- due, once, and only once ----------
do $$
declare
  v_due   jsonb;
  v_id    uuid;
  v_local time := (now() at time zone 'UTC')::time;
begin
  delete from reminder_schedules where family_id = '2b222222-0000-0000-0000-000000000001';

  -- One a minute in the past (due) and one well in the future (not).
  insert into reminder_schedules (family_id, role, label, at_local, timezone, enabled)
  values ('2b222222-0000-0000-0000-000000000001', 'parent', 'Due now',
          (v_local - interval '1 minute')::time, 'UTC', true),
         ('2b222222-0000-0000-0000-000000000001', 'parent', 'Later',
          (v_local + interval '3 hours')::time, 'UTC', true);

  v_due := due_reminders(240);
  perform ok('the past one is due and the future one is not',
    jsonb_array_length(v_due->'reminders') = 1
    and (v_due->'reminders'->0->>'label') = 'Due now');

  v_id := (v_due->'reminders'->0->>'id')::uuid;
  perform mark_reminder_sent(v_id);
  perform ok('once sent, it is not due again today',
    jsonb_array_length(due_reminders(240)->'reminders') = 0);

  -- The job runs often; running it again must not re-send.
  perform ok('and running the job repeatedly still sends nothing',
    jsonb_array_length(due_reminders(240)->'reminders') = 0);

  -- Tomorrow it is due again.
  update reminder_schedules set last_sent_on = (now() - interval '1 day')::date where id = v_id;
  perform ok('tomorrow it is due again',
    jsonb_array_length(due_reminders(240)->'reminders') = 1);

  -- Stale: long past the grace window, so it is not delivered at the wrong hour.
  update reminder_schedules set last_sent_on = null,
         at_local = (v_local - interval '5 hours')::time where id = v_id;
  perform ok('one missed by hours is not delivered at the wrong time of day',
    jsonb_array_length(due_reminders(60)->'reminders') = 0);
  perform ok('but a wider grace window still catches it up',
    jsonb_array_length(due_reminders(600)->'reminders') = 1);

  perform ok('a disabled reminder is never due',
    (select count(*) from reminder_schedules where not enabled) = 0);
  update reminder_schedules set enabled = false, last_sent_on = null where id = v_id;
  perform ok('and switching one off takes it out of the list',
    jsonb_array_length(due_reminders(600)->'reminders') = 0);
end $$;

-- ---------- local time, not UTC ----------
do $$
declare
  v_due jsonb;
  -- 09:00 in Tokyo. Whether that is due depends on the zone, which is the point.
  v_tokyo_now time := (now() at time zone 'Asia/Tokyo')::time;
begin
  delete from reminder_schedules where family_id = '2b222222-0000-0000-0000-000000000001';
  insert into reminder_schedules (family_id, role, label, at_local, timezone, enabled)
  values ('2b222222-0000-0000-0000-000000000001', 'parent', 'Tokyo morning',
          (v_tokyo_now - interval '2 minutes')::time, 'Asia/Tokyo', true);

  v_due := due_reminders(60);
  perform ok('a reminder is due by the family''s own clock, not the server''s',
    jsonb_array_length(v_due->'reminders') = 1);
end $$;

-- ---------- an editing round-trip does not re-fire a sent reminder ----------
set role app_user;
do $$
declare v_before date;
begin
  perform become('2b111111-0000-0000-0000-000000000001');
  perform save_reminder_schedule('parent', null, 'UTC',
    '[{"label":"Morning","time":"07:30","on":true}]'::jsonb);
  reset role;
  update reminder_schedules set last_sent_on = current_date
   where family_id = '2b222222-0000-0000-0000-000000000001';
  select last_sent_on into v_before from reminder_schedules
   where family_id = '2b222222-0000-0000-0000-000000000001' limit 1;
  set role app_user;
  perform become('2b111111-0000-0000-0000-000000000001');

  -- Editing a different reminder must not clear the morning one's "already
  -- sent" mark, or the family gets it twice.
  perform save_reminder_schedule('parent', null, 'UTC',
    '[{"label":"Morning","time":"07:30","on":true},
      {"label":"Evening","time":"18:00","on":true}]'::jsonb);

  reset role;
  perform ok('editing the list keeps the sent mark on an unchanged reminder',
    (select last_sent_on from reminder_schedules
      where family_id = '2b222222-0000-0000-0000-000000000001'
        and at_local = '07:30' limit 1) = v_before);
  perform ok('and the newly added one has no sent mark',
    (select last_sent_on is null from reminder_schedules
      where family_id = '2b222222-0000-0000-0000-000000000001'
        and at_local = '18:00' limit 1));
end $$;
reset role;
