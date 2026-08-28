-- ---------------------------------------------------------------------------
-- Real guilds, across families.
--
-- Run after schema.sql and sync.sql.
--
-- This is the most sensitive feature in the product. Everything else keeps a
-- child's data inside their own family; a guild deliberately puts them in
-- contact with children elsewhere. So the rules here are stricter than
-- anywhere else in the schema:
--
--   1. NO KID JOINS WITHOUT TWO PARENTS AGREEING. The joining child's parent
--      consents to their child being in contact with others; the guild owner's
--      parent consents to a new child joining theirs. A membership sits
--      'pending' until both have said yes, and a pending member sees nothing
--      and is seen by nobody.
--   2. MEMBERS SEE A PROJECTION, NEVER EACH OTHER'S ROWS. The roster function
--      returns a display name, a level and a weekly XP total. It does not
--      return another family's kids table rows, so a guild cannot become a way
--      to read someone else's child's profile, accessibility notes or photos.
--   3. EVERY MESSAGE IS ATTRIBUTABLE AND REPORTABLE, and obvious contact
--      details are refused outright — a phone number or an address leaving a
--      child's guild chat is the specific harm worth engineering against.
-- ---------------------------------------------------------------------------

-- The read policies in schema.sql query guild_members from inside a policy ON
-- guild_members, which Postgres rejects at runtime as infinite recursion. They
-- are dropped rather than repaired: nothing reads these three tables directly
-- from a browser any more. Every path goes through the security-definer
-- functions below, which check membership once, in one place — the same
-- approach taken for pairing_codes and for the same reason.
drop policy if exists guilds_read on guilds;
drop policy if exists guild_members_read on guild_members;
drop policy if exists guild_messages_read on guild_messages;
drop policy if exists guild_messages_insert on guild_messages;

alter table guilds add column if not exists invite_code text unique;
alter table guilds add column if not exists owner_family_id uuid references families(id) on delete cascade;
alter table guilds add column if not exists created_at timestamptz not null default now();

alter table guild_members add column if not exists family_id uuid references families(id) on delete cascade;
alter table guild_members add column if not exists approved_by_own_parent boolean not null default false;
alter table guild_members add column if not exists approved_by_owner boolean not null default false;
alter table guild_members add column if not exists requested_at timestamptz not null default now();

alter table guild_messages add column if not exists reported_by uuid references kids(id) on delete set null;
alter table guild_messages add column if not exists reported_at timestamptz;

create index if not exists guild_members_kid_idx on guild_members (kid_id, status);
create index if not exists guild_messages_guild_idx on guild_messages (guild_id, created_at);

/** Is this kid an active member of this guild? */
create or replace function is_guild_member(p_guild_id uuid, p_kid_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guild_members
     where guild_id = p_guild_id and kid_id = p_kid_id and status = 'active'
  );
$$;

/** Does the caller belong to the family that owns this kid? */
create or replace function may_act_for_kid(p_kid_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from kids k
     where k.id = p_kid_id
       and (k.user_id = auth.uid()
            or exists (select 1 from parents p where p.user_id = auth.uid() and p.family_id = k.family_id))
  );
$$;

/**
 * Start a guild. The kid's own parent must do this — a child cannot create a
 * space for other people's children on their own.
 */
create or replace function create_guild(p_kid_id uuid, p_name text, p_crest text default '🛡️')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid    kids;
  v_guild  guilds;
  v_code   text;
  v_cap    int;
begin
  select * into v_kid from kids where id = p_kid_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  if not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'a parent has to create the guild';
  end if;

  select case when tier = 'elite' then 10 else 5 end into v_cap
    from families where id = v_kid.family_id;

  -- Six upper-case letters and digits, ambiguous characters left out so a code
  -- can be read aloud in a playground without confusion.
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from guilds where invite_code = v_code);
  end loop;

  insert into guilds (name, crest, capacity, leader_kid_id, invite_code, owner_family_id)
  values (left(trim(p_name), 40), p_crest, v_cap, p_kid_id, v_code, v_kid.family_id)
  returning * into v_guild;

  -- The founder is active immediately: both consents are their own parent's.
  insert into guild_members (guild_id, kid_id, family_id, role, status,
                             approved_by_own_parent, approved_by_owner)
  values (v_guild.id, p_kid_id, v_kid.family_id, 'leader', 'active', true, true);

  return jsonb_build_object('ok', true, 'guild_id', v_guild.id, 'invite_code', v_code);
end $$;

/**
 * Ask to join. This does NOT make anyone a member — it creates a request that
 * two parents have to approve.
 */
create or replace function request_guild_join(p_kid_id uuid, p_invite_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid   kids;
  v_guild guilds;
  v_count int;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed to act for this kid'; end if;
  select * into v_kid from kids where id = p_kid_id;
  select * into v_guild from guilds where invite_code = upper(trim(p_invite_code));
  if v_guild is null then return jsonb_build_object('ok', false, 'reason', 'no_guild'); end if;

  if exists (select 1 from guild_members where guild_id = v_guild.id and kid_id = p_kid_id and status <> 'removed') then
    return jsonb_build_object('ok', false, 'reason', 'already_requested');
  end if;

  select count(*) into v_count from guild_members where guild_id = v_guild.id and status = 'active';
  if v_count >= v_guild.capacity then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into guild_members (guild_id, kid_id, family_id, role, status)
  values (v_guild.id, p_kid_id, v_kid.family_id, 'member', 'invited');

  return jsonb_build_object('ok', true, 'guild_id', v_guild.id, 'guild_name', v_guild.name,
                            'status', 'awaiting_approval');
end $$;

/**
 * A parent approves a pending membership.
 *
 * Each parent can only give their own half of the consent — the joining child's
 * parent cannot wave themselves into someone else's guild, and the guild
 * owner's parent cannot add a child their family does not have.
 */
create or replace function approve_guild_member(p_guild_id uuid, p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member guild_members;
  v_guild  guilds;
  v_count  int;
  v_is_own_parent boolean;
  v_is_owner_parent boolean;
begin
  select * into v_member from guild_members where guild_id = p_guild_id and kid_id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_request'); end if;
  select * into v_guild from guilds where id = p_guild_id;

  v_is_own_parent := exists (
    select 1 from parents where user_id = auth.uid() and family_id = v_member.family_id);
  v_is_owner_parent := exists (
    select 1 from parents where user_id = auth.uid() and family_id = v_guild.owner_family_id);

  if not (v_is_own_parent or v_is_owner_parent) then
    raise exception 'only a parent on one side of this request can approve it';
  end if;

  update guild_members
     set approved_by_own_parent = approved_by_own_parent or v_is_own_parent,
         approved_by_owner      = approved_by_owner or v_is_owner_parent
   where guild_id = p_guild_id and kid_id = p_kid_id
  returning * into v_member;

  if v_member.approved_by_own_parent and v_member.approved_by_owner then
    select count(*) into v_count from guild_members where guild_id = p_guild_id and status = 'active';
    if v_count >= v_guild.capacity then
      return jsonb_build_object('ok', false, 'reason', 'full');
    end if;
    update guild_members set status = 'active'
     where guild_id = p_guild_id and kid_id = p_kid_id;
    return jsonb_build_object('ok', true, 'status', 'active');
  end if;

  return jsonb_build_object('ok', true, 'status', 'awaiting_approval',
                            'own_parent', v_member.approved_by_own_parent,
                            'owner', v_member.approved_by_owner);
end $$;

/** Either parent can remove a member at any time, and a kid can leave. */
create or replace function leave_guild(p_guild_id uuid, p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_member guild_members; v_guild guilds;
begin
  select * into v_member from guild_members where guild_id = p_guild_id and kid_id = p_kid_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_a_member'); end if;
  select * into v_guild from guilds where id = p_guild_id;

  if not may_act_for_kid(p_kid_id)
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_guild.owner_family_id) then
    raise exception 'not allowed';
  end if;

  update guild_members set status = 'removed' where guild_id = p_guild_id and kid_id = p_kid_id;
  return jsonb_build_object('ok', true);
end $$;

/**
 * The roster.
 *
 * Returns a projection on purpose: a display name, a level and this week's XP.
 * Not the kids rows themselves — a guild must never become a way to read
 * another family's child's profile, notes or photos.
 */
create or replace function guild_roster(p_guild_id uuid, p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  if not is_guild_member(p_guild_id, p_kid_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  return jsonb_build_object(
    'ok', true,
    'guild', (select jsonb_build_object('id', g.id, 'name', g.name, 'crest', g.crest,
                                        'capacity', g.capacity, 'weekly_goal_xp', g.weekly_goal_xp,
                                        'invite_code', case when g.owner_family_id in
                                            (select family_id from kids where id = p_kid_id)
                                          then g.invite_code else null end)
                from guilds g where g.id = p_guild_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kid_id', k.id,
        'name', k.name,
        'xp', k.xp,
        'is_you', k.id = p_kid_id,
        'weekly_xp', coalesce((
          select sum((e.meta->>'xp')::int) from events e
           where e.kid_id = k.id and e.type = 'quest_approved'
             and e.day > current_date - 7), 0)
      ) order by k.name)
      from guild_members m join kids k on k.id = m.kid_id
      where m.guild_id = p_guild_id and m.status = 'active'), '[]'::jsonb)
  );
end $$;

/**
 * Posting a message.
 *
 * Contact details are refused rather than filtered, so a child gets a clear
 * "you can't share that here" instead of quietly mangled text. This is a blunt
 * check and it will not catch everything — it is a guard rail, not moderation.
 */
create or replace function post_guild_message(p_message_id uuid, p_guild_id uuid, p_kid_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_clean text := trim(p_body);
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  if not is_guild_member(p_guild_id, p_kid_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if length(v_clean) = 0 then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if length(v_clean) > 300 then return jsonb_build_object('ok', false, 'reason', 'too_long'); end if;

  -- Seven or more digits in a row, or an email address, is a contact detail.
  if v_clean ~ '[0-9][0-9 ()+-]{6,}' or v_clean ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}' then
    return jsonb_build_object('ok', false, 'reason', 'contact_details');
  end if;
  if v_clean ~* '(https?://|www\.)' then
    return jsonb_build_object('ok', false, 'reason', 'link');
  end if;

  insert into guild_messages (id, guild_id, kid_id, body)
  values (p_message_id, p_guild_id, p_kid_id, v_clean)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

/** Anyone in the guild can report a message; it hides at once and parents see it. */
create or replace function report_guild_message(p_message_id uuid, p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_msg guild_messages;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  select * into v_msg from guild_messages where id = p_message_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not is_guild_member(v_msg.guild_id, p_kid_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  update guild_messages set flagged = true, reported_by = p_kid_id, reported_at = now()
   where id = p_message_id;
  return jsonb_build_object('ok', true);
end $$;

/** Recent chat. Reported messages are withheld from everyone but a parent. */
create or replace function guild_messages_for(p_guild_id uuid, p_kid_id uuid, p_limit int default 50)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  if not is_guild_member(p_guild_id, p_kid_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  return jsonb_build_object('ok', true, 'messages', coalesce((
    select jsonb_agg(m order by m->>'at')
    from (
      select jsonb_build_object(
        'id', gm.id, 'kid_id', gm.kid_id, 'author', k.name,
        'body', gm.body, 'at', gm.created_at, 'mine', gm.kid_id = p_kid_id
      ) as m
      from guild_messages gm join kids k on k.id = gm.kid_id
      where gm.guild_id = p_guild_id and gm.flagged = false
      order by gm.created_at desc
      limit least(greatest(p_limit, 1), 100)
    ) recent), '[]'::jsonb));
end $$;

/** What a parent needs to decide on: join requests touching their family. */
create or replace function pending_guild_requests()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid();
  if v_family is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'guild_id', m.guild_id, 'guild_name', g.name, 'kid_id', m.kid_id, 'kid_name', k.name,
      'is_our_kid', m.family_id = v_family,
      'we_own_the_guild', g.owner_family_id = v_family,
      'approved_by_own_parent', m.approved_by_own_parent,
      'approved_by_owner', m.approved_by_owner,
      'requested_at', m.requested_at))
    from guild_members m
    join guilds g on g.id = m.guild_id
    join kids k on k.id = m.kid_id
    where m.status = 'invited'
      and (m.family_id = v_family or g.owner_family_id = v_family)), '[]'::jsonb);
end $$;

/** Messages a child reported, for the parents on both sides to look at. */
create or replace function reported_guild_messages()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid();
  if v_family is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', gm.id, 'guild_name', g.name, 'author', k.name, 'body', gm.body,
      'at', gm.created_at, 'reported_at', gm.reported_at))
    from guild_messages gm
    join guilds g on g.id = gm.guild_id
    join kids k on k.id = gm.kid_id
    where gm.flagged = true
      and exists (select 1 from guild_members m
                   where m.guild_id = gm.guild_id and m.family_id = v_family and m.status = 'active')), '[]'::jsonb);
end $$;

/** Which guild is this kid in, if any? */
create or replace function my_guild(p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_member guild_members;
begin
  if not may_act_for_kid(p_kid_id) then raise exception 'not allowed'; end if;
  select * into v_member from guild_members
   where kid_id = p_kid_id and status in ('active', 'invited')
   order by requested_at desc limit 1;
  if not found then return jsonb_build_object('ok', true, 'guild', null); end if;

  return jsonb_build_object('ok', true, 'status', v_member.status,
    'guild', (select jsonb_build_object('id', g.id, 'name', g.name, 'crest', g.crest)
                from guilds g where g.id = v_member.guild_id));
end $$;

grant execute on function create_guild(uuid, text, text) to authenticated;
grant execute on function request_guild_join(uuid, text) to anon, authenticated;
grant execute on function approve_guild_member(uuid, uuid) to authenticated;
grant execute on function leave_guild(uuid, uuid) to anon, authenticated;
grant execute on function guild_roster(uuid, uuid) to anon, authenticated;
grant execute on function post_guild_message(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function report_guild_message(uuid, uuid) to anon, authenticated;
grant execute on function guild_messages_for(uuid, uuid, int) to anon, authenticated;
grant execute on function pending_guild_requests() to authenticated;
grant execute on function reported_guild_messages() to authenticated;
grant execute on function my_guild(uuid) to anon, authenticated;
grant execute on function is_guild_member(uuid, uuid) to anon, authenticated;
grant execute on function may_act_for_kid(uuid) to anon, authenticated;
