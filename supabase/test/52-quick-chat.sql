-- ---------------------------------------------------------------------------
-- Guild quick chat (supabase/guilds.sql): the only way children talk in a
-- guild. Only ids on the list are accepted, nothing typed is, and a child can
-- send at most one every three seconds and eight a minute. The old free-text
-- messages are no longer shown to children. (05-guilds.sql has the basics.)
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('52a00000-0000-4000-8000-0000000000a1', 't52-parent@example.com'),
  ('52a00000-0000-4000-8000-0000000000a2', null);
insert into families (id, name, tier) values ('52a00000-0000-4000-8000-00000000000f', 'T52 family', 'standard');
insert into parents (user_id, family_id, name) values
  ('52a00000-0000-4000-8000-0000000000a1', '52a00000-0000-4000-8000-00000000000f', 'T52 Parent');
select seed_consent('52a00000-0000-4000-8000-00000000000f', '52a00000-0000-4000-8000-0000000000a1');
insert into kids (id, family_id, user_id, name) values
  ('52a00000-0000-4000-8000-00000000000c', '52a00000-0000-4000-8000-00000000000f', '52a00000-0000-4000-8000-0000000000a2', 'Quinn');
insert into guilds (id, name, crest, capacity, leader_kid_id, invite_code, owner_family_id) values
  ('52a00000-0000-4000-8000-0000000000e5', 'T52 guild', '🛡️', 5, '52a00000-0000-4000-8000-00000000000c', 'T52GLD', '52a00000-0000-4000-8000-00000000000f');
insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent, approved_by_owner) values
  ('52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', '52a00000-0000-4000-8000-00000000000f', 'leader', 'active', true, true);
-- A message typed before quick chat, still in the table.
insert into guild_messages (id, guild_id, kid_id, body, created_at) values
  ('52a00000-0000-4000-8000-0000000000d1', '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'T52 typed long ago', now() - interval '30 days');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;
do $$
declare r jsonb; v_id uuid := gen_random_uuid(); m jsonb;
begin
  perform become('52a00000-0000-4000-8000-0000000000a2');
  m := guild_messages_for('52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c');
  perform ok('a message typed before quick chat is not shown to children',
    jsonb_array_length(m->'messages') = 0 and position('T52 typed' in m::text) = 0, m::text);

  r := post_quick_chat(v_id, '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'goal.hit');
  perform ok('a quick message is sent', (r->>'ok')::boolean, r::text);
  r := post_quick_chat(v_id, '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'goal.hit');
  perform ok('sent again with the same id (a lost answer), it is the same message, not "too fast"', (r->>'ok')::boolean, r::text);
  m := guild_messages_for('52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c');
  perform ok('and appears once, as its id, with no words in it',
    jsonb_array_length(m->'messages') = 1 and m->'messages'->0->>'quick_id' = 'goal.hit'
    and not (m->'messages'->0 ? 'body'), m::text);
  r := post_quick_chat(gen_random_uuid(), '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'emoji.fire');
  perform ok('three seconds between messages', r->>'reason' = 'too_fast', r::text);
  r := post_quick_chat(gen_random_uuid(), '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', '<b>hi</b>');
  perform ok('markup is not an id', r->>'reason' = 'unknown_message');
  r := post_quick_chat(gen_random_uuid(), '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', repeat('x', 100000));
  perform ok('nor is a hundred thousand characters', r->>'reason' = 'unknown_message');
end $$;

-- Seven more over the last minute, each far enough apart: the eighth is the cap.
reset role;
insert into guild_messages (guild_id, kid_id, quick_id, created_at)
select '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'react.wow', now() - make_interval(secs => 10 + g * 6)
  from generate_series(0, 6) g;
update guild_messages set created_at = now() - interval '5 seconds'
 where kid_id = '52a00000-0000-4000-8000-00000000000c' and quick_id = 'goal.hit';
set role app_user;
do $$
declare r jsonb;
begin
  perform become('52a00000-0000-4000-8000-0000000000a2');
  r := post_quick_chat(gen_random_uuid(), '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'hello.hi');
  perform ok('eight in a minute is the most: the ninth waits', r->>'reason' = 'slow_down', r::text);
end $$;
reset role;
update guild_messages set created_at = created_at - interval '2 minutes' where kid_id = '52a00000-0000-4000-8000-00000000000c';
set role app_user;
do $$
declare r jsonb;
begin
  perform become('52a00000-0000-4000-8000-0000000000a2');
  r := post_quick_chat(gen_random_uuid(), '52a00000-0000-4000-8000-0000000000e5', '52a00000-0000-4000-8000-00000000000c', 'hello.hi');
  perform ok('a minute later they can chat again', (r->>'ok')::boolean, r::text);
end $$;
reset role;

do $$
declare n int;
begin
  perform ok('every quick chat id is accepted, and only those', quick_chat_ok('cheer.nice') and quick_chat_ok('emoji.wave')
    and not quick_chat_ok('cheer.Nice') and not quick_chat_ok('') and not quick_chat_ok(null));
  select count(*) into n from pg_proc where proname = 'quick_chat_ok';
  perform ok('there is one list', n = 1);
end $$;

delete from families where id = '52a00000-0000-4000-8000-00000000000f';
