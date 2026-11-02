-- ---------------------------------------------------------------------------
-- The monthly prizes, and the guild rules, under the cases that break them.
--
--   alliances  a month is settled once, only after it is over, by families
--              that were in the alliance that month; ties go to whoever
--              joined first, and always the same way.
--   schools    a tie for District Champion goes to the school with more
--              children taking part, then the one that signed up first, then
--              by id; and a school never sees a child whose parent said no.
--   guilds     no child joins without a parent on each side agreeing; report,
--              remove and block work, and a removed or blocked child's own
--              parent cannot put them back on their own.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- A family with one parent, one child and one chore, in one call.
create or replace function t35_family(p_n int, p_name text, p_kid text default null) returns uuid
language plpgsql as $$
declare
  f uuid := ('35f00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  u uuid := ('35a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  k uuid := ('35c00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  ku uuid := ('35b00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
begin
  insert into auth.users (id, email) values (u, 't35-' || p_n || '@example.com'), (ku, 't35-kid-' || p_n || '@example.com');
  insert into families (id, name, tier) values (f, p_name, 'elite');
  insert into parents (user_id, family_id, name) values (u, f, p_name || ' parent');
  perform seed_consent(f, u);
  insert into kids (id, family_id, user_id, name) values (k, f, ku, coalesce(p_kid, p_name || ' kid'));
  insert into quests (id, family_id, kid_id, title) values (('35e00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid, f, k, 'Chore');
  return f;
end $$;
create or replace function t35_parent(p_n int) returns uuid language sql as $$ select ('35a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t35_kid(p_n int) returns uuid language sql as $$ select ('35c00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t35_kid_user(p_n int) returns uuid language sql as $$ select ('35b00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t35_fam(p_n int) returns uuid language sql as $$ select ('35f00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
/** n approved chores for family p_n's child, at a given moment. */
create or replace function t35_done(p_n int, p_count int, p_at timestamptz) returns void language sql as $$
  insert into submissions (family_id, quest_id, kid_id, status, decided_at)
  select t35_fam(p_n), ('35e00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid, t35_kid(p_n), 'approved', p_at
    from generate_series(1, p_count);
$$;

-- ===========================================================================
-- Alliances
-- ===========================================================================
select t35_family(n, 'T35 Alliance ' || n) from generate_series(1, 4) n;

do $$
declare
  v_last date := (date_trunc('month', now()) - interval '1 month')::date;
  v_all uuid := '35d00000-0000-4000-8000-000000000001';
  r jsonb;
begin
  insert into alliances (id, name, invite_code, owner_family_id) values (v_all, 'T35 Alliance', 'T35ALL', t35_fam(1));
  -- 1 and 2 were in it all last month and tie on five chores; 1 joined first.
  -- 3 did more, but only joined this month, after last month was over.
  insert into alliance_members (alliance_id, family_id, joined_at) values
    (v_all, t35_fam(2), v_last + interval '2 days'),
    (v_all, t35_fam(1), v_last + interval '1 day'),
    (v_all, t35_fam(3), date_trunc('month', now()) + interval '1 minute');
  perform t35_done(1, 5, v_last + interval '10 days');
  perform t35_done(2, 5, v_last + interval '11 days');
  perform t35_done(3, 9, v_last + interval '12 days');

  r := settle_alliances(date_trunc('month', now())::date);
  perform ok('the month still going is not settled', r->>'reason' = 'month_not_over'
    and not exists (select 1 from alliance_results where alliance_id = v_all));

  -- Asked with a day in the middle of last month: it is last month that is settled.
  r := settle_alliances(v_last + 14);
  perform ok('last month is settled, whatever day of it the job names',
    (select month_key from alliance_results where alliance_id = v_all) = to_char(v_last, 'YYYY-MM'));
  perform ok('a family that joined after the month was over does not win it with that month''s chores',
    (select winning_family_id from alliance_results where alliance_id = v_all) <> t35_fam(3));
  perform ok('on a tie, the family that joined first wins',
    (select winning_family_id from alliance_results where alliance_id = v_all) = t35_fam(1));

  -- And the month is never paid twice, whatever happens after it is settled.
  perform t35_done(2, 20, v_last + interval '20 days');
  r := settle_alliances(v_last);
  perform ok('settling the same month again awards nothing',
    jsonb_array_length(r->'awards') = 0
    and (select count(*) from alliance_results where alliance_id = v_all) = 1
    and (select winning_family_id from alliance_results where alliance_id = v_all) = t35_fam(1));
  perform mark_alliance_award_applied(v_all, v_last, 'T35COUPON');
  perform ok('and once its discount is given, it is not owed again',
    not exists (select 1 from jsonb_array_elements(unapplied_alliance_awards()) a
                 where (a->>'alliance_id')::uuid = v_all));
end $$;

-- ===========================================================================
-- Schools: the District Champion on a tie
-- ===========================================================================

/** A verified school on its trial, its children each with p_each chores last month. */
create or replace function t35_school(p_id uuid, p_name text, p_district text, p_first int, p_kids int, p_each int,
                                      p_created timestamptz) returns void language plpgsql as $$
declare n int; v_last date := (date_trunc('month', now()) - interval '1 month')::date;
begin
  insert into schools (id, name, district, district_key, city, student_count, size_band, join_code, staff_code,
                       status, verified, trial_ends_at, created_at)
  values (p_id, p_name, p_district, lower(p_district), 'Town', 300, 'medium',
          upper(substr(md5(p_id::text), 1, 6)), upper(substr(md5(p_id::text), 7, 8)), 'trial', true,
          now() + interval '20 days', p_created);
  for n in p_first .. p_first + p_kids - 1 loop
    -- One word: a school is only ever shown a first name.
    perform t35_family(n, 'T35 School family ' || n, 'Pupil' || n);
    insert into school_members (kid_id, school_id, family_id, show_name, joined_at)
    values (t35_kid(n), p_id, t35_fam(n), true, v_last);
    -- One a day, so the per-day cap never comes into it.
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    select t35_fam(n), ('35e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, t35_kid(n), 'approved',
           v_last + make_interval(days => d, hours => 12)
      from generate_series(1, p_each) d;
  end loop;
end $$;

do $$
declare
  v_last date := (date_trunc('month', now()) - interval '1 month')::date;
  v_key text := to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM');
  r jsonb;
begin
  -- District one: the same average (two each); six children beat five.
  perform t35_school('35500000-0000-4000-8000-000000000011', 'T35 Five', 'T35 Tie One', 100, 5, 2, now() - interval '300 days');
  perform t35_school('35500000-0000-4000-8000-000000000012', 'T35 Six',  'T35 Tie One', 110, 6, 2, now() - interval '100 days');
  -- District two: the same average and the same number; the older school wins.
  perform t35_school('35500000-0000-4000-8000-000000000021', 'T35 Newer', 'T35 Tie Two', 120, 5, 3, now() - interval '50 days');
  perform t35_school('35500000-0000-4000-8000-000000000022', 'T35 Older', 'T35 Tie Two', 130, 5, 3, now() - interval '90 days');
  -- District three: identical in every way, signed up in the same instant.
  perform t35_school('35500000-0000-4000-8000-000000000032', 'T35 Twin B', 'T35 Tie Three', 140, 5, 1, '2026-01-01 00:00+00');
  perform t35_school('35500000-0000-4000-8000-000000000031', 'T35 Twin A', 'T35 Tie Three', 150, 5, 1, '2026-01-01 00:00+00');
  -- District four: a clear winner, to show ties are the only thing decided this way.
  perform t35_school('35500000-0000-4000-8000-000000000041', 'T35 Busy',  'T35 Clear', 160, 5, 4, now() - interval '10 days');
  perform t35_school('35500000-0000-4000-8000-000000000042', 'T35 Quiet', 'T35 Clear', 170, 9, 1, now() - interval '400 days');

  r := settle_school_month(v_last);
  perform ok('a tie on score goes to the school with more children taking part',
    (select school_id from school_awards where district_key = 't35 tie one' and month_key = v_key)
      = '35500000-0000-4000-8000-000000000012');
  perform ok('a tie on score and children goes to the school that signed up first',
    (select school_id from school_awards where district_key = 't35 tie two' and month_key = v_key)
      = '35500000-0000-4000-8000-000000000022');
  perform ok('and a tie on everything is still decided, the same way every time',
    (select school_id from school_awards where district_key = 't35 tie three' and month_key = v_key)
      = '35500000-0000-4000-8000-000000000031');
  perform ok('a higher average wins outright, however small or new the school',
    (select school_id from school_awards where district_key = 't35 clear' and month_key = v_key)
      = '35500000-0000-4000-8000-000000000041');
  perform ok('one Champion per district',
    (select count(*) from school_awards where district_key like 't35 %' and month_key = v_key) = 4);

  perform settle_school_month(v_last);
  perform ok('closing the month again changes no Champion',
    (select count(*) from school_awards where district_key like 't35 %' and month_key = v_key) = 4
    and (select school_id from school_awards where district_key = 't35 tie three' and month_key = v_key)
      = '35500000-0000-4000-8000-000000000031');
end $$;

-- ===========================================================================
-- Schools: a child whose parent said no is never shown
-- ===========================================================================

do $$
declare v_last date := (date_trunc('month', now()) - interval '1 month')::date;
begin
  insert into auth.users (id, email) values ('35a00000-0000-4000-8000-0000000005aa', 't35-staff@example.com');
  insert into school_staff (user_id, school_id, name, role)
  values ('35a00000-0000-4000-8000-0000000005aa', '35500000-0000-4000-8000-000000000041', 'Head', 'admin');
  -- Two of T35 Busy's children's parents said no to their names being shown.
  update school_members set show_name = false where kid_id in (t35_kid(160), t35_kid(161));
  update kids set name = 'Zebedee' where id = t35_kid(160);
  update kids set name = 'Quixote' where id = t35_kid(161);
  -- And a child in the same town whose family never joined at all.
  perform t35_family(190, 'T35 Never joined', 'Ozymandias');
  perform t35_done(190, 25, v_last + interval '3 days');
end $$;

set role app_user;
do $$
declare v_all text := '';
begin
  perform become('35a00000-0000-4000-8000-0000000005aa');
  -- Everything a school's staff can ask for.
  v_all := coalesce(school_overview()::text, '') || coalesce(school_league(null)::text, '')
        || coalesce(my_schools()::text, '');
  perform ok('(the school''s staff see their school''s page, with its Stars)',
    v_all like '%T35 Busy%' and v_all like '%Pupil162%');
  perform ok('a child whose parent said no is not named to the school anywhere',
    position('Zebedee' in v_all) = 0 and position('Quixote' in v_all) = 0);
  perform ok('nor is a child whose family never joined',
    position('Ozymandias' in v_all) = 0);
  perform ok('and the school cannot read any child''s row directly',
    (select count(*) from kids) = 0 and (select count(*) from school_members) = 0
    and (select count(*) from school_top_students) = 0);
end $$;
reset role;

-- ===========================================================================
-- Guilds
-- ===========================================================================

-- 201 owns the guild; 202 wants to join; 203 is nobody to either; 204 is a
-- supporter (a grandparent, say) in 202's family.
select t35_family(n, 'T35 Guild ' || n, 'Guildkid ' || n) from generate_series(201, 203) n;
insert into auth.users (id, email) values ('35a00000-0000-4000-8000-000000000204', 't35-supporter@example.com');
insert into parents (user_id, family_id, name, role) values ('35a00000-0000-4000-8000-000000000204', t35_fam(202), 'Grandad', 'supporter');

set role app_user;
do $$
declare r jsonb; v_guild uuid; v_code text; v_msg uuid := '35900000-0000-4000-8000-000000000001';
begin
  perform become(t35_parent(201));
  r := create_guild(t35_kid(201), 'T35 Guild', '🛡️');
  v_guild := (r->>'guild_id')::uuid; v_code := r->>'invite_code';

  perform become(t35_kid_user(202));
  perform ok('a child can ask to join', (request_guild_join(t35_kid(202), v_code)->>'ok')::boolean);

  -- Nobody but a parent on each side can let them in.
  perform become(t35_kid_user(202));
  begin perform approve_guild_member(v_guild, t35_kid(202)); perform ok('the child cannot approve themselves', false);
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; perform ok('the child cannot approve themselves', true); end;
  perform become('35a00000-0000-4000-8000-000000000204');
  begin perform approve_guild_member(v_guild, t35_kid(202)); perform ok('a supporter cannot approve', false);
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; perform ok('a supporter cannot approve', true); end;
  perform become(t35_parent(203));
  begin perform approve_guild_member(v_guild, t35_kid(202)); perform ok('an unrelated parent cannot approve', false);
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; perform ok('an unrelated parent cannot approve', true); end;

  perform become(t35_parent(202));
  perform approve_guild_member(v_guild, t35_kid(202));
  perform approve_guild_member(v_guild, t35_kid(202));
  perform ok('their own parent alone, even twice, does not let them in',
    (my_guild(t35_kid(202))->>'status') = 'invited');
  perform become(t35_parent(201));
  r := approve_guild_member(v_guild, t35_kid(202));
  perform ok('with the guild owner''s parent too, they are in', r->>'status' = 'active');

  -- Report.
  perform become(t35_kid_user(202));
  perform post_guild_message(v_msg, v_guild, t35_kid(202), 'T35 something unkind');
  perform become(t35_kid_user(201));
  perform ok('a child can report a message', (report_guild_message(v_msg, t35_kid(201))->>'ok')::boolean);
  perform ok('and it is gone from the chat at once',
    position('T35 something unkind' in guild_messages_for(v_guild, t35_kid(201))::text) = 0);
  perform become(t35_parent(201));
  r := (select m from jsonb_array_elements(reported_guild_messages()) m where (m->>'id')::uuid = v_msg);
  perform ok('the guild owner''s parent sees it, with what they need to act on it',
    r is not null and (r->>'kid_id')::uuid = t35_kid(202) and (r->>'we_own_the_guild')::boolean
    and not (r->>'is_our_kid')::boolean);
  perform become(t35_parent(202));
  perform ok('and so does the writer''s own parent',
    exists (select 1 from jsonb_array_elements(reported_guild_messages()) m where (m->>'id')::uuid = v_msg));

  -- Remove.
  perform become(t35_parent(203));
  begin perform leave_guild(v_guild, t35_kid(202)); perform ok('an unrelated parent cannot remove a child', false);
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; perform ok('an unrelated parent cannot remove a child', true); end;
  perform become(t35_parent(201));
  perform ok('the guild owner''s parent can remove them', (leave_guild(v_guild, t35_kid(202))->>'ok')::boolean);
  perform become(t35_parent(202));
  r := approve_guild_member(v_guild, t35_kid(202));
  perform ok('their own parent cannot put them back on their own (it was approved before; that does not count now)',
    r->>'reason' = 'no_request');
  perform become(t35_kid_user(202));
  perform ok('they are out', (my_guild(t35_kid(202))->'guild') = 'null'::jsonb);
  perform ok('asking again goes back in front of both parents',
    (request_guild_join(t35_kid(202), v_code)->>'ok')::boolean
    and (my_guild(t35_kid(202))->>'status') = 'invited');

  -- Block.
  perform become(t35_kid_user(201));
  begin perform block_guild_member(v_guild, t35_kid(202)); perform ok('a child cannot block', false);
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; perform ok('a child cannot block', true); end;
  perform become(t35_parent(203));
  begin perform block_guild_member(v_guild, t35_kid(202)); perform ok('an unrelated parent cannot block', false);
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; perform ok('an unrelated parent cannot block', true); end;
  perform become(t35_parent(201));
  perform ok('the guild owner''s parent can block them', (block_guild_member(v_guild, t35_kid(202))->>'ok')::boolean);
  perform ok('which the report now says',
    (select (m->>'author_blocked')::boolean from jsonb_array_elements(reported_guild_messages()) m
      where (m->>'id')::uuid = v_msg));
  perform ok('but not the child who started the guild', block_guild_member(v_guild, t35_kid(201))->>'reason' = 'is_leader');
  perform become(t35_kid_user(202));
  perform ok('a blocked child asking again is refused, and nobody is asked',
    request_guild_join(t35_kid(202), v_code)->>'reason' = 'blocked');
  perform become(t35_parent(201));
  perform ok('so nothing waits for the owner''s parent',
    not exists (select 1 from jsonb_array_elements(pending_guild_requests()) q where (q->>'kid_id')::uuid = t35_kid(202)));
  perform become(t35_parent(202));
  perform ok('and their own parent cannot approve them back in',
    approve_guild_member(v_guild, t35_kid(202))->>'reason' = 'no_request');
  perform become(t35_kid_user(202));
  perform ok('they see nothing of the guild',
    (guild_roster(v_guild, t35_kid(202))->>'reason') = 'not_a_member'
    and (guild_messages_for(v_guild, t35_kid(202))->>'reason') = 'not_a_member');
end $$;
reset role;

drop function t35_done(int, int, timestamptz);
drop function t35_school(uuid, text, text, int, int, int, timestamptz);
drop function t35_family(int, text, text);
drop function t35_parent(int);
drop function t35_kid(int);
drop function t35_kid_user(int);
drop function t35_fam(int);
