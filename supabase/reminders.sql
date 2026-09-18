-- ---------------------------------------------------------------------------
-- Reminder schedules, so a reminder can fire while the app is shut.
--
-- Run after schema.sql and notifications.sql.
--
-- The app has always had reminder times, but they lived in one device's
-- settings, which meant they could only fire while that device had RankUp open
-- — the one moment a reminder is useless. Moving the schedule to the server
-- lets a scheduled job send them properly.
--
-- TIME ZONES ARE THE WHOLE PROBLEM HERE. "07:30" means half past seven where
-- the family lives, not in UTC, and a family that moves or changes clocks must
-- not start getting breakfast reminders at midnight. So the row stores a local
-- wall-clock time plus an IANA zone, and the due check converts at read time
-- rather than storing a computed UTC instant that silently rots twice a year.
-- ---------------------------------------------------------------------------

create table if not exists reminder_schedules (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  role         text not null check (role in ('parent', 'kid')),
  kid_id       uuid references kids(id) on delete cascade,
  label        text not null default 'Reminder',
  at_local     time not null,
  timezone     text not null default 'UTC',
  enabled      boolean not null default true,
  -- The local date this last fired on. Comparing against "today, there" is what
  -- makes the job idempotent: it can run every five minutes all day and still
  -- send each reminder once.
  last_sent_on date,
  updated_at   timestamptz not null default now()
);

create index if not exists reminder_schedules_family_idx
  on reminder_schedules (family_id, role);

alter table reminder_schedules enable row level security;
revoke all on reminder_schedules from public;

/**
 * Replace this device's role's schedule wholesale.
 *
 * A whole-list replace rather than per-row edits because the app's settings
 * screen edits a list and saves a list; reconciling ids across devices would be
 * a sync problem this does not need to have.
 *
 * `last_sent_on` is carried over for any reminder whose time is unchanged, so
 * editing an unrelated reminder at lunchtime cannot cause the morning one to
 * fire a second time.
 */
create or replace function save_reminder_schedule(
  p_role text, p_kid_id uuid, p_timezone text, p_reminders jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_tz     text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  v_kept   jsonb;
begin
  if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;
  if p_role not in ('parent', 'kid') then
    return jsonb_build_object('ok', false, 'reason', 'bad_role');
  end if;
  -- An unknown zone would make every due check throw, so it is refused here,
  -- once, rather than breaking the job for everybody later.
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  -- A kid id is accepted from the caller, so it has to belong to them. Nothing
  -- reachable is broken by this today only because push_targets filters on
  -- family_id as well; relying on that is one refactor from a leak.
  if p_kid_id is not null and not exists (
       select 1 from kids k where k.id = p_kid_id and k.family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_kid');
  end if;

  -- Held in a variable rather than a temp table: a temp table inside a
  -- security-definer function depends on the caller's transaction shape, and
  -- there are only ever a handful of reminders.
  select coalesce(jsonb_object_agg(to_char(at_local, 'HH24:MI'), last_sent_on), '{}'::jsonb)
    into v_kept
    from reminder_schedules
   where family_id = v_family and role = p_role
     and (p_kid_id is null or kid_id is not distinct from p_kid_id)
     and last_sent_on is not null;

  delete from reminder_schedules
   where family_id = v_family and role = p_role
     and (p_kid_id is null or kid_id is not distinct from p_kid_id);

  insert into reminder_schedules (family_id, role, kid_id, label, at_local, timezone, enabled, last_sent_on)
  select v_family, p_role, p_kid_id,
         left(coalesce(r->>'label', 'Reminder'), 40),
         (r->>'time')::time,
         v_tz,
         coalesce((r->>'on')::boolean, true),
         (v_kept ->> to_char((r->>'time')::time, 'HH24:MI'))::date
    from jsonb_array_elements(coalesce(p_reminders, '[]'::jsonb)) r
   where r ? 'time';

  return jsonb_build_object('ok', true);
end $$;

create or replace function my_reminder_schedule(p_role text, p_kid_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;
  return jsonb_build_object('ok', true, 'reminders', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'time', to_char(at_local, 'HH24:MI'),
                                        'on', enabled) order by at_local)
      from reminder_schedules
     where family_id = v_family and role = p_role
       and (p_kid_id is null or kid_id is not distinct from p_kid_id)
  ), '[]'::jsonb));
end $$;

/**
 * Everything that should have fired by now and has not fired today.
 *
 * Service-role only. It returns family ids and roles, which is exactly the
 * information needed to address a push and nothing a customer should be able to
 * enumerate.
 *
 * `at_local <= local now` rather than `= now` on purpose: a job that misses a
 * run — a deploy, an outage — should still deliver the reminder late rather
 * than skip the day silently. The grace window stops it delivering breakfast at
 * bedtime.
 */
create or replace function due_reminders(p_grace_minutes int default 120)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'family_id', family_id, 'role', role,
           'kid_id', kid_id, 'label', label)), '[]'::jsonb)
    into v_rows
    from (
      select r.*,
             (now() at time zone r.timezone) as local_now
        from reminder_schedules r
       where r.enabled
    ) s
   where s.at_local <= s.local_now::time
     -- Measured in minutes within the local day, not by subtracting an interval
     -- from the timestamp: at 00:30 that subtraction wraps to 22:30 yesterday,
     -- and a reminder set for 00:15 would then never be due at all.
     and extract(epoch from (s.local_now::time - s.at_local)) / 60 <= p_grace_minutes
     and (s.last_sent_on is null or s.last_sent_on < s.local_now::date);

  return jsonb_build_object('ok', true, 'reminders', v_rows);
end $$;

/** Marks one as delivered, against the family's own local date. */
create or replace function mark_reminder_sent(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update reminder_schedules
     set last_sent_on = (now() at time zone timezone)::date
   where id = p_id;
$$;

grant execute on function save_reminder_schedule(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function my_reminder_schedule(text, uuid) to anon, authenticated;

-- The job's two functions are service-role only: due_reminders would otherwise
-- let any signed-in account enumerate every family id in the database.
revoke execute on function due_reminders(int) from public;
revoke execute on function mark_reminder_sent(uuid) from public;
