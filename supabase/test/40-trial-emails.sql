-- ---------------------------------------------------------------------------
-- The free trial's two reminder emails (digests.sql, api/send-trial-emails.js).
--
-- What has to hold: a family on a trial of a better plan than it pays for is
-- reminded three days before and on the day, in its own time zone; each
-- reminder goes once per family, ever, even with two runs at once; a send
-- that failed is tried again; only parents with an email address are written
-- to; and nobody but the scheduled job can list who is due.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('40a00000-0000-4000-8000-0000000000a1', 't40-parent@example.com'),
  ('40a00000-0000-4000-8000-0000000000a2', 't40-coparent@example.com'),
  ('40a00000-0000-4000-8000-0000000000a3', 't40-gran@example.com'),
  ('40a00000-0000-4000-8000-0000000000b1', 't40-paying@example.com'),
  ('40a00000-0000-4000-8000-0000000000c1', 't40-later@example.com'),
  ('40a00000-0000-4000-8000-0000000000d1', 't40-la@example.com'),
  ('40a00000-0000-4000-8000-0000000000e1', 't40-over@example.com');

insert into families (id, name, tier, trial_tier, trial_ends_at, timezone) values
  -- Ends in two and a half days, pays for nothing: due its three-day email.
  ('40a00000-0000-4000-8000-00000000000a', 'Trial Family', 'starter', 'elite', now() + interval '60 hours', 'UTC'),
  -- Already pays for Elite: an Elite trial ending takes nothing away.
  ('40a00000-0000-4000-8000-00000000000b', 'Paying Family', 'elite', 'elite', now() + interval '60 hours', 'UTC'),
  -- Ends in five days: not yet.
  ('40a00000-0000-4000-8000-00000000000c', 'Later Family', 'starter', 'elite', now() + interval '5 days', 'UTC'),
  -- In Los Angeles; moments set by each test below.
  ('40a00000-0000-4000-8000-00000000000d', 'LA Family', 'standard', 'elite', now() + interval '10 days', 'America/Los_Angeles'),
  -- Already over.
  ('40a00000-0000-4000-8000-00000000000e', 'Over Family', 'starter', 'elite', now() - interval '1 hour', 'UTC');

insert into parents (user_id, family_id, name, role, is_owner) values
  ('40a00000-0000-4000-8000-0000000000a1', '40a00000-0000-4000-8000-00000000000a', 'Pat', 'parent', true),
  ('40a00000-0000-4000-8000-0000000000a2', '40a00000-0000-4000-8000-00000000000a', 'Chris', 'parent', false),
  ('40a00000-0000-4000-8000-0000000000a3', '40a00000-0000-4000-8000-00000000000a', 'Gran', 'supporter', false),
  ('40a00000-0000-4000-8000-0000000000b1', '40a00000-0000-4000-8000-00000000000b', 'Bo', 'parent', true),
  ('40a00000-0000-4000-8000-0000000000c1', '40a00000-0000-4000-8000-00000000000c', 'Cy', 'parent', true),
  ('40a00000-0000-4000-8000-0000000000d1', '40a00000-0000-4000-8000-00000000000d', 'Lu', 'parent', true),
  ('40a00000-0000-4000-8000-0000000000e1', '40a00000-0000-4000-8000-00000000000e', 'Ov', 'parent', true);

create or replace function t40_due(p_now timestamptz, p_family uuid)
returns jsonb language sql as $$
  select e from jsonb_array_elements(due_trial_reminders_at(p_now)->'reminders') e
   where (e->>'family_id')::uuid = p_family;
$$;

-- ---------- who is due, and for which reminder ----------
do $$
declare r jsonb;
begin
  r := t40_due(now(), '40a00000-0000-4000-8000-00000000000a');
  perform ok('a trial ending within three days is due its first reminder', r->>'kind' = 'three_days', coalesce(r::text, 'not due'));
  perform ok('with the plan it is a trial of and the plan they pay for',
    r->>'trial_tier' = 'elite' and r->>'paid_tier' = 'starter');
  perform ok('and how many days are left where they live', (r->>'days_left')::int between 2 and 3, r->>'days_left');
  perform ok('written to both parents',
    (select count(*) from jsonb_array_elements(r->'recipients')) = 2
    and (r->'recipients')::text like '%t40-parent@example.com%'
    and (r->'recipients')::text like '%t40-coparent@example.com%');
  perform ok('never to a supporter', (r->'recipients')::text not like '%t40-gran%');

  perform ok('a family already paying for the plan it is trying is told nothing',
    t40_due(now(), '40a00000-0000-4000-8000-00000000000b') is null);
  perform ok('a trial ending in five days is not due yet',
    t40_due(now(), '40a00000-0000-4000-8000-00000000000c') is null);
  perform ok('nor one that has already ended',
    t40_due(now(), '40a00000-0000-4000-8000-00000000000e') is null);
  perform ok('three days on, the five-day trial is due',
    t40_due(now() + interval '2 days 1 hour', '40a00000-0000-4000-8000-00000000000c')->>'kind' = 'three_days');
end $$;

-- ---------- "on the day" is the family's day ----------
do $$
declare r jsonb;
begin
  -- Ends at 01:00 on Tuesday 10 November in Los Angeles, which is 09:00 UTC.
  update families set trial_ends_at = '2026-11-10 01:00 America/Los_Angeles'
   where id = '40a00000-0000-4000-8000-00000000000d';

  -- 22:00 on Monday 9th there, 06:00 on Tuesday 10th in UTC: the same day as
  -- the end in UTC, but the day before where they live.
  r := t40_due('2026-11-09 22:00 America/Los_Angeles', '40a00000-0000-4000-8000-00000000000d');
  perform ok('the evening before, in their zone, is not "the day" even though it is in UTC',
    r->>'kind' = 'three_days' and (r->>'days_left')::int = 1, coalesce(r::text, 'not due'));
  perform ok('the end is given as their own date', r->>'ends_local' = 'Tuesday 10 November', r->>'ends_local');

  r := t40_due('2026-11-10 00:30 America/Los_Angeles', '40a00000-0000-4000-8000-00000000000d');
  perform ok('after midnight there, it is the last day', r->>'kind' = 'last_day', coalesce(r::text, 'not due'));

  r := t40_due('2026-11-10 02:00 America/Los_Angeles', '40a00000-0000-4000-8000-00000000000d');
  perform ok('and once it has ended, nothing', r is null);

  r := t40_due('2026-11-06 12:00 America/Los_Angeles', '40a00000-0000-4000-8000-00000000000d');
  perform ok('four days before, nothing yet', r is null);

  -- Paying for Standard, trying Elite: the email names both (the job's words).
  r := t40_due('2026-11-08 12:00 America/Los_Angeles', '40a00000-0000-4000-8000-00000000000d');
  perform ok('a Standard family trying Elite is reminded too', r->>'paid_tier' = 'standard' and r->>'kind' = 'three_days');
end $$;

-- ---------- once, and only once ----------
do $$
declare first boolean; second boolean; r jsonb;
begin
  first := claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', now() + interval '60 hours');
  second := claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', now() + interval '60 hours');
  perform ok('the first run to claim a reminder gets it', first);
  perform ok('a second run at the same time does not', not second);
  perform ok('and while it is claimed it is not listed as due',
    t40_due(now(), '40a00000-0000-4000-8000-00000000000a') is null);

  -- The send failed: the claim is given back, and the next run tries again.
  perform finish_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', false);
  perform ok('a send that failed is due again', t40_due(now(), '40a00000-0000-4000-8000-00000000000a')->>'kind' = 'three_days');
  perform ok('and can be claimed again',
    claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', now() + interval '60 hours'));

  perform finish_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', true);
  perform ok('once sent, it is never due again',
    t40_due(now(), '40a00000-0000-4000-8000-00000000000a') is null
    and t40_due(now() + interval '1 day', '40a00000-0000-4000-8000-00000000000a') is null);
  perform ok('and cannot be claimed again',
    not claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', now() + interval '60 hours'));
  perform finish_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'three_days', false);
  perform ok('a late "failed" does not undo a send',
    (select sent_at from trial_reminder_sends where family_id = '40a00000-0000-4000-8000-00000000000a' and kind = 'three_days') is not null);

  -- The day it ends is the other reminder, and it too goes once.
  -- An hour before the end, or its midnight if that is later: always its day.
  r := t40_due((select greatest(date_trunc('day', trial_ends_at) + interval '1 second', trial_ends_at - interval '1 hour')
                  from families where id = '40a00000-0000-4000-8000-00000000000a'),
               '40a00000-0000-4000-8000-00000000000a');
  perform ok('on the last day the second reminder is due', r->>'kind' = 'last_day', coalesce(r::text, 'not due'));
  perform ok('and claimed once',
    claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'last_day', now() + interval '60 hours')
    and not claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'last_day', now() + interval '60 hours'));
  perform finish_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'last_day', true);
  perform ok('two reminders in all for the family, each sent once',
    (select count(*) from trial_reminder_sends where family_id = '40a00000-0000-4000-8000-00000000000a' and sent_at is not null) = 2);
end $$;

-- ---------- a run that died after claiming ----------
do $$
begin
  perform ok('a claim is held',
    claim_trial_reminder('40a00000-0000-4000-8000-00000000000c', 'three_days', now() + interval '5 days'));
  update trial_reminder_sends set claimed_at = now() - interval '2 hours'
   where family_id = '40a00000-0000-4000-8000-00000000000c' and kind = 'three_days';
  perform ok('an hour after a run died holding it, it can be taken again',
    claim_trial_reminder('40a00000-0000-4000-8000-00000000000c', 'three_days', now() + interval '5 days'));
  perform finish_trial_reminder('40a00000-0000-4000-8000-00000000000c', 'three_days', true);
end $$;

-- ---------- deleting the family takes its record with it ----------
do $$
begin
  delete from families where id = '40a00000-0000-4000-8000-00000000000c';
  perform ok('a deleted family leaves no reminder record',
    not exists (select 1 from trial_reminder_sends where family_id = '40a00000-0000-4000-8000-00000000000c'));
end $$;

-- ---------- only the scheduled job ----------
grant usage on schema public to anon, authenticated;
set role app_user;
do $$
begin
  perform become('40a00000-0000-4000-8000-0000000000a1');
  begin
    perform due_trial_reminders();
    raise exception 'FAIL a signed-in parent listed every family on a trial, with their emails';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-in parent CANNOT list families on a trial (%)', left(sqlerrm, 34);
  end;
  begin
    perform claim_trial_reminder('40a00000-0000-4000-8000-00000000000a', 'last_day', now());
    raise exception 'FAIL a signed-in parent claimed a reminder';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-in parent CANNOT claim or stop a reminder (%)', left(sqlerrm, 34);
  end;
  -- Earlier files grant every table to the browser roles for their own
  -- checks; row level security with no policy is what still keeps it shut.
  begin
    perform ok('nor read the record of who was sent what, not even their own family''s',
      (select count(*) from trial_reminder_sends) = 0);
  exception when insufficient_privilege then
    raise notice '  PASS nor read the record of who was sent what (no access at all)';
  end;
end $$;
reset role;

drop function t40_due(timestamptz, uuid);
