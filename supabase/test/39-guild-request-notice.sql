-- ---------------------------------------------------------------------------
-- The guild request notice: who is told, and only once.
--
-- When a child asks to join a guild, a parent on each side has to say yes.
-- api/send-push.js asks claim_guild_request_notice whom to tell. It must name
-- the parents (not supporters) whose yes is still missing, on both sides, and
-- mark the request as told, so a child cannot buzz another family's phones
-- again and again by asking for the same notice.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('39a00000-0000-4000-8000-0000000000a1', 't39-owner-parent@example.com'),
  ('39a00000-0000-4000-8000-0000000000a2', 't39-owner-coparent@example.com'),
  ('39a00000-0000-4000-8000-0000000000a3', 't39-owner-supporter@example.com'),
  ('39a00000-0000-4000-8000-0000000000a4', 't39-owner-kid@example.com'),
  ('39b00000-0000-4000-8000-0000000000b1', 't39-asking-parent@example.com'),
  ('39b00000-0000-4000-8000-0000000000b2', 't39-asking-kid@example.com');
insert into families (id, name, tier) values
  ('39a00000-0000-4000-8000-00000000000f', 'T39 Owners', 'elite'),
  ('39b00000-0000-4000-8000-00000000000f', 'T39 Askers', 'elite');
insert into parents (user_id, family_id, name, is_owner, role) values
  ('39a00000-0000-4000-8000-0000000000a1', '39a00000-0000-4000-8000-00000000000f', 'Owner', true, 'parent'),
  ('39a00000-0000-4000-8000-0000000000a2', '39a00000-0000-4000-8000-00000000000f', 'Coparent', false, 'parent'),
  ('39a00000-0000-4000-8000-0000000000a3', '39a00000-0000-4000-8000-00000000000f', 'Grandad', false, 'supporter'),
  ('39b00000-0000-4000-8000-0000000000b1', '39b00000-0000-4000-8000-00000000000f', 'Asker', true, 'parent');
select seed_consent('39a00000-0000-4000-8000-00000000000f', '39a00000-0000-4000-8000-0000000000a1');
select seed_consent('39b00000-0000-4000-8000-00000000000f', '39b00000-0000-4000-8000-0000000000b1');
insert into kids (id, family_id, user_id, name) values
  ('39a00000-0000-4000-8000-00000000000c', '39a00000-0000-4000-8000-00000000000f', '39a00000-0000-4000-8000-0000000000a4', 'Leader'),
  ('39b00000-0000-4000-8000-00000000000c', '39b00000-0000-4000-8000-00000000000f', '39b00000-0000-4000-8000-0000000000b2', 'Juno');
insert into guilds (id, name, crest, capacity, leader_kid_id, invite_code, owner_family_id)
  values ('39a00000-0000-4000-8000-0000000000e5', 'Sock Hunters', '🛡️', 10,
          '39a00000-0000-4000-8000-00000000000c', 'TNN392', '39a00000-0000-4000-8000-00000000000f');
insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent, approved_by_owner)
  values ('39a00000-0000-4000-8000-0000000000e5', '39a00000-0000-4000-8000-00000000000c',
          '39a00000-0000-4000-8000-00000000000f', 'leader', 'active', true, true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

do $$
declare
  res jsonb;
  g   constant uuid := '39a00000-0000-4000-8000-0000000000e5';
  kid constant uuid := '39b00000-0000-4000-8000-00000000000c';
  fam constant uuid := '39b00000-0000-4000-8000-00000000000f';
  owners constant uuid := '39a00000-0000-4000-8000-00000000000f';
begin
  -- No request yet: nothing to tell.
  res := claim_guild_request_notice(g, kid, fam);
  perform ok('with no request waiting, nobody is told', res->>'reason' = 'no_request', res::text);

  -- The child asks, from their own phone.
  set local role app_user;
  perform become('39b00000-0000-4000-8000-0000000000b2');
  res := request_guild_join(kid, 'TNN392');
  perform ok('the child asks to join', (res->>'ok')::boolean, res::text);
  set local role postgres;

  res := claim_guild_request_notice(g, kid, owners);
  perform ok('a family that is not the child''s cannot claim the notice for them',
    res->>'reason' = 'no_request', res::text);

  res := claim_guild_request_notice(g, kid, fam);
  perform ok('the request is told', (res->>'ok')::boolean, res::text);
  perform ok('in the database''s words: the child''s name and the guild''s',
    res->>'kid_name' = 'Juno' and res->>'guild_name' = 'Sock Hunters', res::text);
  perform ok('to both families', (res->'families') @> to_jsonb(array[fam, owners])
    and jsonb_array_length(res->'families') = 2, res::text);
  perform ok('to every parent on both sides',
    (res->'approvers') @> '["39a00000-0000-4000-8000-0000000000a1", "39a00000-0000-4000-8000-0000000000a2", "39b00000-0000-4000-8000-0000000000b1"]'::jsonb,
    res::text);
  perform ok('and not to a supporter, who cannot approve',
    not (res->'approvers') @> '["39a00000-0000-4000-8000-0000000000a3"]'::jsonb, res::text);

  res := claim_guild_request_notice(g, kid, fam);
  perform ok('asked for again, the same request is not told twice', res->>'reason' = 'already_told', res::text);

  -- Cancel and ask again at once: a new request, but not a new buzz yet.
  set local role app_user;
  perform become('39b00000-0000-4000-8000-0000000000b2');
  perform leave_guild(g, kid);
  res := request_guild_join(kid, 'TNN392');
  set local role postgres;
  res := claim_guild_request_notice(g, kid, fam);
  perform ok('cancelling and asking again within a day is not a way to buzz the other family again',
    res->>'reason' = 'already_told', res::text);

  -- A day later it is.
  update guild_members set request_told_at = now() - interval '25 hours', requested_at = now() - interval '1 minute'
   where guild_id = g and kid_id = kid;
  res := claim_guild_request_notice(g, kid, fam);
  perform ok('a request made a day after the last notice is told', (res->>'ok')::boolean, res::text);

  -- One side has already said yes: only the other is asked.
  update guild_members set request_told_at = null, approved_by_own_parent = true
   where guild_id = g and kid_id = kid;
  res := claim_guild_request_notice(g, kid, fam);
  perform ok('a side that has already said yes is not asked again',
    res->'families' = to_jsonb(array[owners])
    and not (res->'approvers') @> '["39b00000-0000-4000-8000-0000000000b1"]'::jsonb, res::text);

  -- Blocked: nothing.
  update guild_members set request_told_at = null, blocked_at = now() where guild_id = g and kid_id = kid;
  res := claim_guild_request_notice(g, kid, fam);
  perform ok('a blocked child''s request is not told', res->>'reason' = 'no_request', res::text);
end $$;

reset role;
