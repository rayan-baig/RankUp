-- ---------------------------------------------------------------------------
-- Theme Genesis (sync.sql: kid_themes, theme_submissions, seasons,
-- season_themes and their functions; run_retention; export_family_data).
--
--   * a child keeps up to five themes of their own, sees only their own, and
--     writes only the look and the names: never when it was sent, never the
--     Season it was picked for, never another child's or family's;
--   * a name or design with a rude word, markup, or anything outside the
--     app's lists is refused, whoever writes it;
--   * a parent sees, renames and removes every theme in the family; a child
--     wearing a removed theme goes back to its base theme;
--   * nobody outside the family can read, change or remove one, and
--     family_snapshot hands them to nobody else;
--   * only a parent sends one to RankUp (submit_kid_theme), it carries the
--     theme alone, the words are checked again, no other company's game,
--     league or brand is named in it (kid_brands_ok, the server's alone;
--     a family's own theme may carry one), one a child a month;
--   * the operator's functions are the server's only; a picked theme is in
--     no family's picker until its Season starts, then in every family's,
--     and the family it came from is told; a family leaving takes its credit;
--   * declined and unpicked submissions go after 90 days.
-- Everything here is rolled back at the end, so no Season it makes is left
-- for the app's tests to find.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into auth.users (id, email) values
  ('50a00000-0000-4000-8000-0000000000a1', 't50-parent-a@example.com'),
  ('50a00000-0000-4000-8000-0000000000a2', null),
  ('50b00000-0000-4000-8000-0000000000b1', 't50-parent-b@example.com'),
  ('50b00000-0000-4000-8000-0000000000b2', null),
  ('50c00000-0000-4000-8000-0000000000c1', null);
insert into families (id, name, tier) values
  ('50a00000-0000-4000-8000-00000000000f', 'T50 Family A', 'elite'),
  ('50b00000-0000-4000-8000-00000000000f', 'T50 Family B', 'elite');
insert into parents (id, user_id, family_id, name, is_owner) values
  ('50a00000-0000-4000-8000-0000000000aa', '50a00000-0000-4000-8000-0000000000a1', '50a00000-0000-4000-8000-00000000000f', 'Ada', true),
  ('50b00000-0000-4000-8000-0000000000bb', '50b00000-0000-4000-8000-0000000000b1', '50b00000-0000-4000-8000-00000000000f', 'Bea', true);
select seed_consent('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-0000000000a1');
select seed_consent('50b00000-0000-4000-8000-00000000000f', '50b00000-0000-4000-8000-0000000000b1');
insert into kids (id, family_id, user_id, name, theme_id, xp, coins) values
  ('50a00000-0000-4000-8000-00000000000c', '50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-0000000000a2', 'Quillon', 'matrixblocks', 4200, 90),
  ('50a00000-0000-4000-8000-00000000000d', '50a00000-0000-4000-8000-00000000000f', null, 'Sibling', 'aura', 0, 0),
  ('50b00000-0000-4000-8000-00000000000c', '50b00000-0000-4000-8000-00000000000f', '50b00000-0000-4000-8000-0000000000b2', 'Bodhi', 'aura', 0, 0);

-- A design as the app makes it.
create or replace function t50_design(p_mascot text default '🚀') returns jsonb language sql as $$
  select jsonb_build_object('v', 1, 'vibe', 'space', 'base', 'aura', 'bg', '#0b0f2e', 'a', '#7cc4ff', 'a2', '#ffd166',
    'pat', 'stars', 'mascot', p_mascot, 'cur', 'Star Bits',
    'worlds', jsonb_build_array('Moon Base', 'Asteroid Belt', 'Ring Planet', 'Edge of Space'));
$$;
grant execute on function t50_design(text) to app_user;

-- The worst case: every table granted to the browser roles, as Supabase's
-- defaults would. Row level security and the guard are all that is left.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- the filter ----------
do $$
begin
  perform ok('ordinary names pass the word filter',
    kid_words_ok('Star Voyage') and kid_words_ok('Class Act') and kid_words_ok('Scrap Yard') and kid_words_ok(null));
  perform ok('rude words do not, whole or hidden',
    not kid_words_ok('big ass') and not kid_words_ok('Sh1t World') and not kid_words_ok('f u c k')
    and not kid_words_ok('FUUUCK') and not kid_words_ok('$h!t') and not kid_words_ok('Nazis rule'));
  perform ok('another company''s name is caught, as a whole word or phrase, however it is written',
    not kid_brands_ok('F1 Fever') and not kid_brands_ok('Formula-1 Fun') and not kid_brands_ok('Mine Craft Land')
    and not kid_brands_ok('POKÉMON Park') and not kid_brands_ok('Pokémon Park') and not kid_brands_ok('McDonald''s Diner')
    and not kid_brands_ok('Rocket League Cup') and not kid_brands_ok('nba hoops') and not kid_brands_ok('GTA'));
  perform ok('and ordinary words are not',
    kid_brands_ok('Marvellous Mountains') and kid_brands_ok('Legolas Woods') and kid_brands_ok('Gorilla Grove')
    and kid_brands_ok('Grand Prix') and kid_brands_ok('Speed Circuit') and kid_brands_ok('Marioland')
    and kid_brands_ok('Formula Fun') and kid_brands_ok(null) and kid_brands_ok(''));
  perform ok('the new mascots and patterns are ones a design may hold',
    kid_theme_design_ok(t50_design('🏎️') || '{"pat": "checkers"}') and kid_theme_design_ok(t50_design('🚂') || '{"pat": "hearts"}')
    and not kid_theme_design_ok(t50_design() || '{"pat": "plaid"}'));
end $$;

-- ---------- a child, their own themes ----------
set role app_user;
do $$
declare v_n int; v_state text;
begin
  perform become('50a00000-0000-4000-8000-0000000000a2');
  insert into kid_themes (id, family_id, kid_id, name, design, status, sent_at, picked_season) values
    ('50a00000-0000-4000-8000-0000000000e1', '50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c',
     '  Star   Voyage ', t50_design(), 'ready', now(), 7);
  select count(*) into v_n from kid_themes where id = '50a00000-0000-4000-8000-0000000000e1' and sent_at is null and picked_season is null and name = 'Star Voyage';
  perform ok('a child saves a theme of their own; "sent" and "picked" are not theirs to write, and the name is tidied', v_n = 1);

  update kid_themes set picked_season = 3, sent_at = now(), kid_id = '50a00000-0000-4000-8000-00000000000d',
                        name = 'Star Voyage II', use_ask = true where id = '50a00000-0000-4000-8000-0000000000e1';
  select count(*) into v_n from kid_themes where id = '50a00000-0000-4000-8000-0000000000e1'
     and picked_season is null and sent_at is null and kid_id = '50a00000-0000-4000-8000-00000000000c'
     and name = 'Star Voyage II' and use_ask;
  perform ok('they change its name and ask to wear it, and cannot mark it sent, picked, or a sibling''s', v_n = 1);

  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000d', 'For you', t50_design());
    v_state := 'inserted';
  exception when others then v_state := sqlstate;
  end;
  perform ok('a child cannot make a theme for a brother or sister', v_state = '42501', v_state);

  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c', 'Poo Sh1t', t50_design());
    v_state := 'inserted';
  exception when others then v_state := sqlerrm;
  end;
  perform ok('a rude name is refused by the database', v_state = 'kid_theme_name', v_state);

  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c', '<b>Bold</b>', t50_design());
    v_state := 'inserted';
  exception when others then v_state := sqlerrm;
  end;
  perform ok('so is markup in a name', v_state = 'kid_theme_name', v_state);

  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c', 'Odd', t50_design('💩'));
    v_state := 'inserted';
  exception when others then v_state := sqlerrm;
  end;
  perform ok('a mascot from outside the set is refused', v_state = 'kid_theme_design', v_state);

  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c', 'Odd',
       t50_design() || jsonb_build_object('note', 'my real name is Quillon'));
    v_state := 'inserted';
  exception when others then v_state := sqlerrm;
  end;
  perform ok('as is anything a design does not hold (an extra field)', v_state = 'kid_theme_design', v_state);

  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c', 'Odd',
       jsonb_set(t50_design(), '{worlds,2}', '"Big Ass Land"'));
    v_state := 'inserted';
  exception when others then v_state := sqlerrm;
  end;
  perform ok('and a rude world name', v_state = 'kid_theme_design', v_state);

  -- Four more makes five; a sixth is one too many.
  insert into kid_themes (id, family_id, kid_id, name, design, status)
  select ('50a00000-0000-4000-8000-0000000000f' || g)::uuid, '50a00000-0000-4000-8000-00000000000f',
         '50a00000-0000-4000-8000-00000000000c', 'Theme ' || g, t50_design(), case when g = 1 then 'ready' else 'draft' end
    from generate_series(1, 4) g;
  begin
    insert into kid_themes (family_id, kid_id, name, design) values
      ('50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000c', 'Sixth', t50_design());
    v_state := 'inserted';
  exception when others then v_state := sqlerrm;
  end;
  perform ok('five themes a child, and not a sixth', v_state = 'kid_theme_limit', v_state);
end $$;
reset role;

-- A parent's theme for the sibling, which the first child must not see.
insert into kid_themes (id, family_id, kid_id, name, design, status) values
  ('50a00000-0000-4000-8000-0000000000e9', '50a00000-0000-4000-8000-00000000000f', '50a00000-0000-4000-8000-00000000000d',
   'Sibling Secret', t50_design('🐬'), 'ready');
insert into kid_themes (id, family_id, kid_id, name, design, status) values
  ('50b00000-0000-4000-8000-0000000000e1', '50b00000-0000-4000-8000-00000000000f', '50b00000-0000-4000-8000-00000000000c',
   'Bodhi Own', t50_design('🦊'), 'ready');

set role app_user;
do $$
declare v_snap jsonb; v_n int;
begin
  perform become('50a00000-0000-4000-8000-0000000000a2');
  select count(*) into v_n from kid_themes;
  perform ok('a child reads their own themes and nobody else''s', v_n = 5, v_n::text);
  v_snap := family_snapshot(0);
  perform ok('their sync hands them their own five, not a sibling''s',
    jsonb_array_length(v_snap->'kid_themes') = 5 and position('Sibling Secret' in (v_snap->'kid_themes')::text) = 0);

  perform become('50a00000-0000-4000-8000-0000000000a1');
  select count(*) into v_n from kid_themes;
  perform ok('a parent reads every theme in the family', v_n = 6, v_n::text);
  update kid_themes set name = 'Renamed By Parent' where id = '50a00000-0000-4000-8000-0000000000f2';
  perform ok('and renames any of them', exists (select 1 from kid_themes where name = 'Renamed By Parent'));

  -- Family B, parent and child, against family A's themes.
  foreach v_n in array array[1, 2] loop
    perform become(case v_n when 1 then '50b00000-0000-4000-8000-0000000000b1'::uuid else '50b00000-0000-4000-8000-0000000000b2'::uuid end);
    perform ok(format('another family''s %s reads none of them', case v_n when 1 then 'parent' else 'child' end),
      not exists (select 1 from kid_themes where family_id = '50a00000-0000-4000-8000-00000000000f'));
    update kid_themes set name = 'Hacked' where family_id = '50a00000-0000-4000-8000-00000000000f';
    delete from kid_themes where family_id = '50a00000-0000-4000-8000-00000000000f';
    v_snap := family_snapshot(0);
    perform ok('nor finds them in its sync', position('Star Voyage' in coalesce(v_snap::text, '')) = 0
      and position('50a00000' in coalesce(v_snap->>'kid_themes', '')) = 0);
  end loop;

  perform become('50c00000-0000-4000-8000-0000000000c1');
  perform ok('a signed-in phone in no family reads none', not exists (select 1 from kid_themes));
end $$;
reset role;

do $$
begin
  perform ok('and nothing of family A''s was changed by family B',
    (select count(*) from kid_themes where family_id = '50a00000-0000-4000-8000-00000000000f' and name = 'Hacked') = 0
    and (select count(*) from kid_themes where family_id = '50a00000-0000-4000-8000-00000000000f') = 6);
end $$;

-- ---------- wearing one, and removing it ----------
update kids set theme_id = 'custom-50a00000-0000-4000-8000-0000000000f3' where id = '50a00000-0000-4000-8000-00000000000c';
set role app_user;
do $$
declare v_kid kids;
begin
  perform become('50a00000-0000-4000-8000-0000000000a2');
  delete from kid_themes where id = '50a00000-0000-4000-8000-0000000000f3';
  reset role;
  select * into v_kid from kids where id = '50a00000-0000-4000-8000-00000000000c';
  perform ok('a child removing the theme they wear goes back to the one it was made from', v_kid.theme_id = 'aura', v_kid.theme_id);
  perform ok('with their XP and coins exactly as they were', v_kid.xp = 4200 and v_kid.coins = 90);
  perform ok('and every phone hears it was removed', exists (select 1 from deletions
    where table_name = 'kid_themes' and row_id = '50a00000-0000-4000-8000-0000000000f3'));
end $$;
reset role;

-- ---------- sending one to RankUp ----------
set role app_user;
do $$
declare v jsonb; v_sub theme_submissions;
begin
  perform become('50a00000-0000-4000-8000-0000000000a2');
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e1', null);
  perform ok('a child cannot send a theme to RankUp themselves', v->>'reason' = 'not_allowed', v::text);
  perform become('50b00000-0000-4000-8000-0000000000b1');
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e1', null);
  perform ok('nor can another family''s parent send it', v->>'reason' = 'not_allowed', v::text);

  perform become('50a00000-0000-4000-8000-0000000000a1');
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000f2', null);
  perform ok('a draft is not sent: it has to be finished', v->>'reason' = 'not_ready', v::text);
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e1', 'sam@example.com');
  perform ok('a credit is a first name or nickname, in letters: no email address', v->>'reason' = 'bad_credit', v::text);
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e1', 'Twat');
  perform ok('and no rude word', v->>'reason' = 'words', v::text);

  -- Another company's name: fine for the family's own theme, not for a Season.
  update kid_themes set name = 'Minecraft Quest' where id = '50a00000-0000-4000-8000-0000000000f1';
  perform ok('a family''s own theme may be named after a game', exists (select 1 from kid_themes where id = '50a00000-0000-4000-8000-0000000000f1' and name = 'Minecraft Quest'));
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000f1', null);
  perform ok('but it is not sent for a Season', v->>'reason' = 'brand', v::text);
  update kid_themes set name = 'Theme 1', design = jsonb_set(t50_design(), '{worlds,1}', '"F1 Track"') where id = '50a00000-0000-4000-8000-0000000000f1';
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000f1', null);
  perform ok('nor with one in a world''s name', v->>'reason' = 'brand', v::text);
  update kid_themes set design = t50_design() || '{"cur": "Roblox Bucks"}' where id = '50a00000-0000-4000-8000-0000000000f1';
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000f1', null);
  perform ok('nor in the coins', v->>'reason' = 'brand', v::text);
  update kid_themes set design = t50_design() where id = '50a00000-0000-4000-8000-0000000000f1';
  perform ok('and nothing went: the theme is still the family''s, unsent',
    exists (select 1 from kid_themes where id = '50a00000-0000-4000-8000-0000000000f1' and sent_at is null and not send_ask));

  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e1', 'Q');
  perform ok('a parent sends a finished theme, with a credit they chose', (v->>'ok')::boolean, v::text);
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e1', null);
  perform ok('once', v->>'reason' = 'already_sent', v::text);
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000f1', null);
  perform ok('and one theme a child a month', v->>'reason' = 'limit', v::text);
  perform ok('the family sees it went', exists (select 1 from kid_themes
    where id = '50a00000-0000-4000-8000-0000000000e1' and sent_at is not null and not send_ask));
  perform ok('but cannot read what was sent, or anyone else''s', not exists (select 1 from theme_submissions));
  perform ok('nor see a Season before it starts', not exists (select 1 from seasons));
end $$;
reset role;

do $$
declare v_sub theme_submissions;
begin
  select * into v_sub from theme_submissions where source_theme_id = '50a00000-0000-4000-8000-0000000000e1';
  perform ok('what is sent is the theme: its name and design, nothing else',
    (select array_agg(k order by k) from jsonb_object_keys(v_sub.payload) k) = array['design', 'name']
    and (select array_agg(k order by k) from jsonb_object_keys(v_sub.payload->'design') k)
        = array['a', 'a2', 'base', 'bg', 'cur', 'mascot', 'pat', 'v', 'vibe', 'worlds'],
    v_sub.payload::text);
  perform ok('with no family, no child, no name of theirs in it',
    position('50a00000' in v_sub.payload::text) = 0 and position('Quillon' in v_sub.payload::text) = 0
    and v_sub.credit = 'Q');
  -- A rude name slipped into a theme by some other route is caught on the way out.
  update kid_themes set status = 'ready' where id = '50a00000-0000-4000-8000-0000000000e9';
  alter table kid_themes disable trigger kid_themes_guard;
  update kid_themes set name = 'Sh1t Land' where id = '50a00000-0000-4000-8000-0000000000e9';
  alter table kid_themes enable trigger kid_themes_guard;
end $$;

set role app_user;
do $$
declare v jsonb;
begin
  perform become('50a00000-0000-4000-8000-0000000000a1');
  v := submit_kid_theme('50a00000-0000-4000-8000-0000000000e9', null);
  perform ok('the words are checked again when it is sent', v->>'reason' = 'words', v::text);
end $$;
reset role;

-- ---------- only the server runs the inbox ----------
do $$
declare f text; v_open text[] := '{}';
begin
  foreach f in array array['operator_theme_inbox()', 'operator_create_season(integer,text,date)',
                           'operator_pick_theme(uuid,uuid)', 'operator_decline_theme(uuid)', 'operator_remove_theme(uuid)',
                           'kid_brands_ok(text)']
  loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      v_open := v_open || f;
    end if;
  end loop;
  perform ok('the operator''s functions, and the brand check, cannot be called from a browser', cardinality(v_open) = 0, array_to_string(v_open, ', '));
  perform ok('a parent sends with submit_kid_theme, and reads Seasons with live_seasons',
    has_function_privilege('authenticated', 'submit_kid_theme(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'submit_kid_theme(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'live_seasons()', 'execute'));
end $$;

-- ---------- the operator: Seasons, picks ----------
do $$
declare v jsonb; v_inbox jsonb; v_sub uuid; v_next uuid; v_live uuid;
begin
  select id into v_sub from theme_submissions where source_theme_id = '50a00000-0000-4000-8000-0000000000e1';
  v_inbox := operator_theme_inbox();
  perform ok('the inbox lists what came in, by month, with its credit line',
    exists (select 1 from jsonb_array_elements(v_inbox->'submissions') e
             where e->>'id' = v_sub::text and e->>'credit' = 'Q' and e->>'month' = to_char(now() at time zone 'utc', 'YYYY-MM')));
  perform ok('and nothing that leads to a family or a child',
    position('family' in v_inbox::text) = 0 and position('kid_id' in v_inbox::text) = 0
    and position('50a00000' in v_inbox::text) = 0 and position('Quillon' in v_inbox::text) = 0);

  v := operator_create_season(0, 'Nope', current_date);
  perform ok('a Season needs a number from 1 to 999 and a name', v->>'reason' = 'bad_season', v::text);
  v := operator_create_season(950, 'T50 Next', ((now() at time zone 'utc')::date + 10));
  perform ok('the operator makes the next Season', (v->>'ok')::boolean, v::text);
  v_next := (v->>'id')::uuid;
  v := operator_create_season(950, 'Again', current_date + 20);
  perform ok('one Season to a number', v->>'reason' = 'season_exists', v::text);
  v := operator_create_season(949, 'T50 Now', (now() at time zone 'utc')::date);
  v_live := (v->>'id')::uuid;

  v := operator_pick_theme(gen_random_uuid(), v_next);
  perform ok('picking needs a submission', v->>'reason' = 'no_submission', v::text);
  v := operator_pick_theme(v_sub, gen_random_uuid());
  perform ok('and a Season', v->>'reason' = 'no_season', v::text);
  v := operator_pick_theme(v_sub, v_live);
  perform ok('one that has not started yet', v->>'reason' = 'season_started', v::text);
  v := operator_pick_theme(v_sub, v_next);
  perform ok('"Pick for next Season"', (v->>'ok')::boolean, v::text);
  v := operator_pick_theme(v_sub, v_next);
  perform ok('once', v->>'reason' = 'already_picked', v::text);
  v := operator_decline_theme(v_sub);
  perform ok('a picked theme is not then declined', v->>'reason' = 'already_picked', v::text);
  v := operator_decline_theme(gen_random_uuid());
  perform ok('declining needs a submission', v->>'reason' = 'no_submission', v::text);
  v := operator_remove_theme(gen_random_uuid());
  perform ok('as does removing', v->>'reason' = 'no_submission', v::text);
  perform ok('the family it came from is told, by their own theme',
    (select picked_season from kid_themes where id = '50a00000-0000-4000-8000-0000000000e1') = 950);
end $$;

set role app_user;
do $$
declare v jsonb; who uuid;
begin
  foreach who in array array['50a00000-0000-4000-8000-0000000000a1', '50b00000-0000-4000-8000-0000000000b2',
                             '50c00000-0000-4000-8000-0000000000c1']::uuid[] loop
    perform become(who);
    v := live_seasons();
    perform ok('before its start day the picked theme is in nobody''s Seasons', position('Star Voyage' in v::text) = 0, v::text);
  end loop;
  perform become('50a00000-0000-4000-8000-0000000000a1');
  perform ok('and its family''s sync carries the news', position('"picked_season": 950' in family_snapshot(0)::text) > 0);
end $$;
reset role;

update seasons set starts_on = (now() at time zone 'utc')::date where number = 950;

set role app_user;
do $$
declare v jsonb;
begin
  perform become('50b00000-0000-4000-8000-0000000000b2');
  v := live_seasons();
  perform ok('on its start day it is in every family''s Seasons, another family''s child''s included',
    exists (select 1 from jsonb_array_elements(v) s, jsonb_array_elements(s->'themes') t
             where (s->>'number')::int = 950 and t->>'name' = 'Star Voyage II' and t->>'credit' = 'Q'), v::text);
  perform ok('as the theme and its credit alone', position('50a00000' in v::text) = 0 and position('Quillon' in v::text) = 0);
  perform become('50c00000-0000-4000-8000-0000000000c1');
  perform ok('any signed-in phone can read it', jsonb_array_length(live_seasons()) >= 1);
end $$;
reset role;

set role anon;
do $$
begin
  perform become(null);
  perform ok('the anon key reads no Season', not exists (select 1 from seasons) and not exists (select 1 from season_themes));
end $$;
reset role;

-- ---------- decline, remove, and how long they are kept ----------
do $$
declare v jsonb; v_declined uuid; v_new uuid; v_gone uuid; v_kept int;
begin
  insert into theme_submissions (family_id, kid_id, payload, status, created_at) values
    ('50b00000-0000-4000-8000-00000000000f', '50b00000-0000-4000-8000-00000000000c', '{"name":"Old one"}', 'new', now() - interval '91 days')
    returning id into v_declined;
  v := operator_decline_theme(v_declined);
  perform ok('"Decline"', (v->>'ok')::boolean and (select status from theme_submissions where id = v_declined) = 'declined');
  insert into theme_submissions (family_id, kid_id, payload, created_at) values
    ('50b00000-0000-4000-8000-00000000000f', '50b00000-0000-4000-8000-00000000000c', '{"name":"Never looked at"}', now() - interval '91 days')
    returning id into v_new;
  insert into theme_submissions (family_id, kid_id, payload) values
    ('50b00000-0000-4000-8000-00000000000f', '50b00000-0000-4000-8000-00000000000c', '{"name":"Remove me"}')
    returning id into v_gone;
  v := operator_remove_theme(v_gone);
  perform ok('"Remove"', (v->>'ok')::boolean and not exists (select 1 from theme_submissions where id = v_gone));

  update theme_submissions set created_at = now() - interval '200 days' where status = 'picked'
     and source_theme_id = '50a00000-0000-4000-8000-0000000000e1';
  v := run_retention(14, 90, 2);
  perform ok('declined and unpicked themes go after 90 days',
    not exists (select 1 from theme_submissions where id in (v_declined, v_new))
    and (v->>'theme_submissions_deleted')::int >= 2, v::text);
  select count(*) into v_kept from theme_submissions where status = 'picked' and source_theme_id = '50a00000-0000-4000-8000-0000000000e1';
  perform ok('a picked one stays', v_kept = 1);
end $$;

-- ---------- the family's own copy ----------
set role app_user;
do $$
declare v jsonb;
begin
  perform become('50a00000-0000-4000-8000-0000000000a1');
  v := export_family_data();
  perform ok('"Download my data" has the children''s themes and what was sent',
    jsonb_array_length(v->'kid_themes') = 5 and jsonb_array_length(v->'theme_submissions') = 1);
end $$;
reset role;

-- ---------- a family leaving ----------
do $$
begin
  delete from kids where id = '50a00000-0000-4000-8000-00000000000c';
  perform ok('a child deleted takes their themes and what was sent with them',
    not exists (select 1 from kid_themes where kid_id = '50a00000-0000-4000-8000-00000000000c')
    and not exists (select 1 from theme_submissions where kid_id = '50a00000-0000-4000-8000-00000000000c'));
  perform ok('a theme already in a Season stays for everyone, its credit gone',
    exists (select 1 from season_themes where name = 'Star Voyage II' and credit is null and submission_id is null));
end $$;

rollback;
