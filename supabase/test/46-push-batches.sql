-- ---------------------------------------------------------------------------
-- The reminder and digest jobs claim their notices in batches
-- (claim_due_reminders, claim_due_digests; api/_shared/pushBatch.js).
--
--   * a batch is as many phones as the job can send, never fewer than one
--     notice, and comes with the phones;
--   * a claimed notice is nobody else's until it is finished or its claim
--     runs out, so two runs at once never send the same one;
--   * finishing marks it sent for the day (or week) it was due, once;
--   * a claim left by a run that was stopped is taken again when it runs
--     out, so nothing claimed is left unsent;
--   * the reminders' arithmetic is the same as due_reminders_at's, at every
--     hour of two days in four zones;
--   * failed phones are recorded in one call;
--   * none of it can be called from a browser.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into auth.users (id, email) values
  ('46a00000-0000-4000-8000-0000000000a1', 't46-a@example.com'),
  ('46a00000-0000-4000-8000-0000000000a2', 't46-b@example.com'),
  ('46a00000-0000-4000-8000-0000000000a3', 't46-c@example.com'),
  ('46a00000-0000-4000-8000-0000000000a4', 't46-gone@example.com');
insert into families (id, name, tier, timezone) values
  ('46f00000-0000-4000-8000-000000000001', 'T46 A', 'elite', 'UTC'),
  ('46f00000-0000-4000-8000-000000000002', 'T46 B', 'elite', 'UTC'),
  ('46f00000-0000-4000-8000-000000000003', 'T46 C', 'elite', 'UTC');
insert into parents (user_id, family_id, name) values
  ('46a00000-0000-4000-8000-0000000000a1', '46f00000-0000-4000-8000-000000000001', 'A'),
  ('46a00000-0000-4000-8000-0000000000a2', '46f00000-0000-4000-8000-000000000002', 'B'),
  ('46a00000-0000-4000-8000-0000000000a3', '46f00000-0000-4000-8000-000000000003', 'C');
-- Family A has three phones, B one, C one. A fourth phone was saved under A
-- by somebody no longer in it, and must not be in any batch.
insert into push_subscriptions (endpoint, keys, family_id, user_id, role) values
  ('https://push.example.test/t46/a1', '{"p256dh":"x","auth":"y"}', '46f00000-0000-4000-8000-000000000001', '46a00000-0000-4000-8000-0000000000a1', 'parent'),
  ('https://push.example.test/t46/a2', '{"p256dh":"x","auth":"y"}', '46f00000-0000-4000-8000-000000000001', '46a00000-0000-4000-8000-0000000000a1', 'parent'),
  ('https://push.example.test/t46/a3', '{"p256dh":"x","auth":"y"}', '46f00000-0000-4000-8000-000000000001', '46a00000-0000-4000-8000-0000000000a1', 'parent'),
  ('https://push.example.test/t46/b1', '{"p256dh":"x","auth":"y"}', '46f00000-0000-4000-8000-000000000002', '46a00000-0000-4000-8000-0000000000a2', 'parent'),
  ('https://push.example.test/t46/c1', '{"p256dh":"x","auth":"y"}', '46f00000-0000-4000-8000-000000000003', '46a00000-0000-4000-8000-0000000000a3', 'parent'),
  ('https://push.example.test/t46/left', '{"p256dh":"x","auth":"y"}', '46f00000-0000-4000-8000-000000000001', '46a00000-0000-4000-8000-0000000000a4', 'parent');

-- Only these families' reminders, for this test (rolled back at the end).
update reminder_schedules set enabled = false;
-- Due at 08:00 UTC; A's the most overdue.
insert into reminder_schedules (id, family_id, role, label, at_local, timezone) values
  ('46e00000-0000-4000-8000-00000000000a', '46f00000-0000-4000-8000-000000000001', 'parent', 'A', '07:00', 'UTC'),
  ('46e00000-0000-4000-8000-00000000000b', '46f00000-0000-4000-8000-000000000002', 'parent', 'B', '07:30', 'UTC'),
  ('46e00000-0000-4000-8000-00000000000c', '46f00000-0000-4000-8000-000000000003', 'parent', 'C', '07:45', 'UTC');

do $$
declare
  t0 timestamptz := '2026-11-04 08:00+00';
  v jsonb; w jsonb; x jsonb;
begin
  -- Room for two phones: A has three, but a batch always holds one notice.
  v := claim_due_reminders_at(t0, 120, 2, 300);
  perform ok('a batch holds at least one notice, even one with more phones than the batch',
    jsonb_array_length(v->'reminders') = 1 and v->'reminders'->0->>'label' = 'A', v::text);
  perform ok('the most overdue first, with its phones',
    jsonb_array_length(v->'reminders'->0->'targets') = 3 and (v->>'targets')::int = 3, v::text);
  perform ok('only the phones of people still in the family',
    not (v::text like '%t46/left%'));
  perform ok('and it says more are waiting', (v->>'more')::boolean);

  -- A second run at the same moment: A is claimed, so it gets B and C.
  w := claim_due_reminders_at(t0, 120, 100, 300);
  perform ok('a second run at the same moment does not get what the first claimed',
    (select array_agg(r->>'label' order by r->>'label') from jsonb_array_elements(w->'reminders') r) = array['B','C'], w::text);
  perform ok('and says nothing more is waiting', not (w->>'more')::boolean);
  perform ok('a third finds nothing', jsonb_array_length(claim_due_reminders_at(t0, 120, 100, 300)->'reminders') = 0);

  -- B and C go out. A's run was stopped before it finished.
  perform ok('finishing marks the batch sent',
    finish_reminders(jsonb_build_array('46e00000-0000-4000-8000-00000000000b', '46e00000-0000-4000-8000-00000000000c')) = 2);
  perform ok('finishing it again changes nothing',
    finish_reminders(jsonb_build_array('46e00000-0000-4000-8000-00000000000b')) = 0);
  perform ok('for the day they were due',
    (select bool_and(last_sent_on = '2026-11-04' and claimed_at is null) from reminder_schedules
      where id in ('46e00000-0000-4000-8000-00000000000b', '46e00000-0000-4000-8000-00000000000c')));

  perform ok('four minutes later, the stopped run''s claim still holds',
    jsonb_array_length(claim_due_reminders_at(t0 + interval '4 minutes', 120, 100, 300)->'reminders') = 0);
  x := claim_due_reminders_at(t0 + interval '6 minutes', 120, 100, 300);
  perform ok('once it runs out, the next run takes it, so nothing claimed is left unsent',
    jsonb_array_length(x->'reminders') = 1 and x->'reminders'->0->>'label' = 'A', x::text);
  perform finish_reminders(jsonb_build_array('46e00000-0000-4000-8000-00000000000a'));
  perform ok('and once sent it is not due again that day',
    jsonb_array_length(claim_due_reminders_at(t0 + interval '30 minutes', 120, 100, 300)->'reminders') = 0
    and jsonb_array_length(due_reminders_at(t0 + interval '30 minutes', 120)->'reminders') = 0);
  perform ok('but is the next morning',
    jsonb_array_length(claim_due_reminders_at(t0 + interval '1 day', 120, 100, 300)->'reminders') = 3);
end $$;

-- A reminder after midnight belongs to the day before, claimed or not.
do $$
declare v jsonb;
begin
  update reminder_schedules set last_sent_on = null, claimed_at = null, at_local = '23:30'
   where id = '46e00000-0000-4000-8000-00000000000a';
  v := claim_due_reminders_at('2026-11-05 00:20+00', 120, 100, 300);
  perform finish_reminders(jsonb_build_array('46e00000-0000-4000-8000-00000000000a'));
  perform ok('one due at 23:30 and sent after midnight counts for the day it was due',
    (select last_sent_on from reminder_schedules where id = '46e00000-0000-4000-8000-00000000000a') = '2026-11-04');
end $$;

-- The claim's arithmetic is due_reminders_at's, at every hour of two days.
do $$
declare
  t timestamptz;
  v_list text[]; v_day text[]; v_bad int := 0;
begin
  delete from reminder_schedules where family_id in ('46f00000-0000-4000-8000-000000000001',
    '46f00000-0000-4000-8000-000000000002', '46f00000-0000-4000-8000-000000000003');
  insert into reminder_schedules (family_id, role, label, at_local, timezone, last_sent_on)
  select '46f00000-0000-4000-8000-000000000001', 'parent', z || ' ' || h, make_time(h, 15, 0), z,
         case when h % 3 = 0 then date '2026-11-04' end
    from unnest(array['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland']) z,
         generate_series(0, 23, 5) h;
  for t in select generate_series('2026-11-04 00:10+00'::timestamptz, '2026-11-06 00:10+00', interval '1 hour') loop
    select coalesce(array_agg(r->>'label' order by r->>'label'), '{}') into v_list
      from jsonb_array_elements(due_reminders_at(t, 120)->'reminders') r
     where r->>'family_id' = '46f00000-0000-4000-8000-000000000001';
    select coalesce(array_agg(label order by label), '{}') into v_day
      from reminder_schedules
     where family_id = '46f00000-0000-4000-8000-000000000001' and enabled
       and reminder_due_day(at_local, timezone, last_sent_on, t, 120) is not null;
    if v_list is distinct from v_day then v_bad := v_bad + 1; end if;
  end loop;
  perform ok('the claim and the list agree on what is due, every hour for two days in four zones', v_bad = 0,
    v_bad || ' hours disagree');
end $$;

-- ---------- failed phones, in one call ----------
do $$
begin
  perform ok('failures are recorded in one call',
    record_push_failures('[{"endpoint":"https://push.example.test/t46/a1","gone":true},
                           {"endpoint":"https://push.example.test/t46/a2","gone":false},
                           {"endpoint":""}]'::jsonb) = 2);
  perform ok('a phone the push service says is gone is dropped',
    not exists (select 1 from push_subscriptions where endpoint = 'https://push.example.test/t46/a1'));
  perform ok('another refusal is counted against it',
    (select failures from push_subscriptions where endpoint = 'https://push.example.test/t46/a2') = 1);
  perform ok('nothing given is nothing done', record_push_failures(null) = 0);
end $$;

-- ---------- the digest ----------
do $$
declare
  sun timestamptz := '2026-11-08 19:00+00';
  v jsonb; w jsonb; x jsonb; v_after uuid;
begin
  -- The sweep above saved reminders in four zones under A, which moved A's
  -- zone with them (reminder_sets_family_timezone): all three in UTC again.
  update families set timezone = 'UTC' where id in ('46f00000-0000-4000-8000-000000000001',
    '46f00000-0000-4000-8000-000000000002', '46f00000-0000-4000-8000-000000000003');
  -- A and B did chores this week; C did nothing this week or last.
  perform seed_consent('46f00000-0000-4000-8000-000000000001', '46a00000-0000-4000-8000-0000000000a1');
  perform seed_consent('46f00000-0000-4000-8000-000000000002', '46a00000-0000-4000-8000-0000000000a2');
  insert into kids (id, family_id, name) values
    ('46c00000-0000-4000-8000-000000000001', '46f00000-0000-4000-8000-000000000001', 'KA'),
    ('46c00000-0000-4000-8000-000000000002', '46f00000-0000-4000-8000-000000000002', 'KB');
  insert into quests (id, family_id, kid_id, title, status) values
    ('46d00000-0000-4000-8000-000000000001', '46f00000-0000-4000-8000-000000000001', '46c00000-0000-4000-8000-000000000001', 'q', 'approved'),
    ('46d00000-0000-4000-8000-000000000002', '46f00000-0000-4000-8000-000000000002', '46c00000-0000-4000-8000-000000000002', 'q', 'approved');
  insert into submissions (family_id, quest_id, kid_id, status, decided_at) values
    ('46f00000-0000-4000-8000-000000000001', '46d00000-0000-4000-8000-000000000001', '46c00000-0000-4000-8000-000000000001', 'approved', '2026-11-05 12:00+00'),
    ('46f00000-0000-4000-8000-000000000002', '46d00000-0000-4000-8000-000000000002', '46c00000-0000-4000-8000-000000000002', 'approved', '2026-11-05 12:00+00');
  -- Only our three families are due: everyone else's week is already done.
  insert into digest_sends (family_id, week_key)
  select id, '2026-W45' from families
   where id not in ('46f00000-0000-4000-8000-000000000001', '46f00000-0000-4000-8000-000000000002',
                    '46f00000-0000-4000-8000-000000000003')
  on conflict do nothing;

  perform ok('nobody is due before Sunday evening',
    jsonb_array_length(claim_due_digests_at('2026-11-08 17:00+00', 7, 18, 100, null, 300)->'digests') = 0);
  v := claim_due_digests_at(sun, 7, 18, 1, null, 300);
  perform ok('a batch of one phone holds one family, with its phones and its numbers',
    jsonb_array_length(v->'digests') = 1 and (v->'digests'->0->>'approved')::int = 1
    and jsonb_array_length(v->'digests'->0->'targets') >= 1 and (v->>'more')::boolean, v::text);
  v_after := (v->>'after')::uuid;
  w := claim_due_digests_at(sun, 7, 18, 100, v_after, 300);
  perform ok('the next batch carries on after it',
    jsonb_array_length(w->'digests') = 1 and w->'digests'->0->>'family_id' <> v->'digests'->0->>'family_id', w::text);
  perform ok('a family with nothing to report is not in any batch',
    not ((v->'digests')::text like '%46f00000-0000-4000-8000-000000000003%')
    and not ((w->'digests')::text like '%46f00000-0000-4000-8000-000000000003%'));
  perform ok('and the week ends there', not (w->>'more')::boolean);

  perform ok('a run at the same moment gets neither claimed family',
    jsonb_array_length(claim_due_digests_at(sun, 7, 18, 100, null, 300)->'digests') = 0);
  perform ok('the old due list does not offer them either',
    jsonb_array_length(due_digests_at(sun, 7, 18)->'digests') = 0);

  perform ok('finishing a batch marks it sent',
    finish_digests(jsonb_build_array(jsonb_build_object('family_id', v->'digests'->0->>'family_id', 'week_key', '2026-W45'))) = 1);
  x := claim_due_digests_at(sun + interval '10 minutes', 7, 18, 100, null, 300);
  perform ok('the family whose run was stopped is taken again once its claim runs out, and only that one',
    jsonb_array_length(x->'digests') = 1 and x->'digests'->0->>'family_id' = w->'digests'->0->>'family_id', x::text);
  perform finish_digests(jsonb_build_array(jsonb_build_object('family_id', x->'digests'->0->>'family_id', 'week_key', '2026-W45')));
  perform ok('a week sent is never offered again',
    jsonb_array_length(claim_due_digests_at(sun + interval '2 hours', 7, 18, 100, null, 300)->'digests') = 0);
  perform ok('and claim_digest still says so', not claim_digest('46f00000-0000-4000-8000-000000000001', '2026-W45'));
end $$;

rollback;

-- ---------- none of it is a browser's ----------
do $$
declare f text;
begin
  foreach f in array array[
    'claim_due_reminders(integer,integer,integer)', 'claim_due_reminders_at(timestamptz,integer,integer,integer)',
    'finish_reminders(jsonb)', 'reminder_due_day(time,text,date,timestamptz,integer)',
    'claim_due_digests(integer,integer,integer,uuid,integer)',
    'claim_due_digests_at(timestamptz,integer,integer,integer,uuid,integer)',
    'finish_digests(jsonb)', 'record_push_failures(jsonb)']
  loop
    perform ok(f || ' cannot be called from a browser',
      to_regprocedure(f) is not null
      and not has_function_privilege('anon', to_regprocedure(f), 'execute')
      and not has_function_privilege('authenticated', to_regprocedure(f), 'execute'));
  end loop;
end $$;
