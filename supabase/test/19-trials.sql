-- ---------------------------------------------------------------------------
-- The free fortnight.
--
-- Nobody buys a chore app on a feature list. They buy it the first time their
-- child photographs a made bed and it lands on their phone — so the product
-- has to be real before a card is mentioned.
--
-- The rule that makes that safe: a trial is kept in its OWN columns and never
-- written over `tier`, which belongs to Stripe's webhook. Entitlement is the
-- better of the two. Get that wrong and a trial ending takes a paying family's
-- subscription down with it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('3a111111-1111-1111-1111-111111111111', 'trial-parent@example.com');
insert into families (id, name, tier) values
  ('3a222222-0000-0000-0000-000000000001', 'Trial Family', 'starter'),
  ('3a222222-0000-0000-0000-000000000002', 'Paying Family', 'elite');
insert into parents (user_id, family_id, name) values
  ('3a111111-1111-1111-1111-111111111111', '3a222222-0000-0000-0000-000000000001', 'Tri');
select seed_consent('3a222222-0000-0000-0000-000000000001', '3a111111-1111-1111-1111-111111111111');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- a trial raises, and only raises ----------
do $$
begin
  perform ok('with no trial, they get what they pay for',
    effective_tier('3a222222-0000-0000-0000-000000000001') = 'starter');

  perform grant_trial('3a222222-0000-0000-0000-000000000001', 'elite', 14);
  perform ok('a fortnight of Elite is exactly that',
    effective_tier('3a222222-0000-0000-0000-000000000001') = 'elite');
  perform ok('and what they pay for is untouched underneath',
    (select tier from families where id = '3a222222-0000-0000-0000-000000000001') = 'starter');

  -- The one that would hurt: a referral handing a paying family a lesser trial.
  perform grant_trial('3a222222-0000-0000-0000-000000000002', 'standard', 30);
  perform ok('a Standard trial never demotes a family already on Elite',
    effective_tier('3a222222-0000-0000-0000-000000000002') = 'elite');

  -- Nor may a second grant cut a better one short.
  perform grant_trial('3a222222-0000-0000-0000-000000000001', 'standard', 3);
  perform ok('a shorter, lesser grant does not replace a better one',
    effective_tier('3a222222-0000-0000-0000-000000000001') = 'elite');
  perform ok('and it does not shorten the end date either',
    (select trial_ends_at from families where id = '3a222222-0000-0000-0000-000000000001')
      > now() + interval '10 days');

  perform ok('a tier nobody sells is refused',
    (grant_trial('3a222222-0000-0000-0000-000000000001', 'platinum', 30)->>'ok')::boolean = false);
end $$;

-- ---------- when it ends, it ends ----------
do $$
begin
  set local role postgres;
  update families set trial_ends_at = now() - interval '1 minute'
   where id = '3a222222-0000-0000-0000-000000000001';
  perform ok('an expired trial gives back exactly what they pay for',
    effective_tier('3a222222-0000-0000-0000-000000000001') = 'starter');
  perform ok('and the paying family is still paying',
    effective_tier('3a222222-0000-0000-0000-000000000002') = 'elite');
  set local role app_user;
end $$;

-- ---------- a trial is real everywhere, not just on the screens ----------
--
-- The point of routing every gate through effective_tier. A trial that the
-- plan screen honours and the guild function refuses is worse than no trial.
do $$
declare res jsonb; kid uuid;
begin
  set local role postgres;
  insert into kids (id, family_id, name)
  values ('3a444444-0000-0000-0000-000000000001', '3a222222-0000-0000-0000-000000000001', 'Tria')
  returning id into kid;
  update families set trial_tier = null, trial_ends_at = null
   where id = '3a222222-0000-0000-0000-000000000001';
  set local role app_user;

  perform become('3a111111-1111-1111-1111-111111111111');

  -- Starter: one child, no AI check, no guild.
  perform ok('on Starter the AI check is not included',
    (claim_photo_check()->>'reason') = 'not_on_this_plan');
  res := create_guild(kid, 'Trial Guild');
  perform ok('on Starter there is no guild either',
    (res->>'ok')::boolean = false and res->>'reason' = 'plan_has_no_guilds');

  set local role postgres;
  perform grant_trial('3a222222-0000-0000-0000-000000000001', 'elite', 14);
  set local role app_user;
  perform become('3a111111-1111-1111-1111-111111111111');

  perform ok('the trial turns the AI check on for real',
    (claim_photo_check()->>'ok')::boolean = true);
  res := create_guild(kid, 'Trial Guild');
  perform ok('and the guild opens, at the Elite size',
    (res->>'ok')::boolean = true);
  -- Read as the owner: guilds.sql drops the read policy on purpose, so a
  -- select here as the app role returns nothing and would pass for the wrong
  -- reason rather than fail.
  set local role postgres;
  perform ok('ten slots, not five',
    (select capacity from guilds where id = (res->>'guild_id')::uuid) = 10);
  set local role app_user;
  perform become('3a111111-1111-1111-1111-111111111111');

  -- A second child is the other thing Starter will not do.
  set local role postgres;
  insert into kids (family_id, name)
  values ('3a222222-0000-0000-0000-000000000001', 'Second');
  perform ok('a second child is allowed during the trial',
    (select count(*) from kids where family_id = '3a222222-0000-0000-0000-000000000001') = 2);
  set local role app_user;
end $$;

-- ---------- and a browser cannot give itself one, or read anyone else's ----------
set role app_user;
do $$
begin
  perform become('3a111111-1111-1111-1111-111111111111');
  begin
    perform grant_trial('3a222222-0000-0000-0000-000000000001', 'elite', 90);
    raise exception 'FAIL a signed-in parent granted themselves a trial';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT grant themselves a trial (%)', left(sqlerrm, 32);
  end;

  -- effective_tier is security definer and takes any family id. Granted, it
  -- would let a signed-in parent learn what plan every other household is on,
  -- one guess at a time — the leak alliance_capacity is revoked for.
  begin
    perform effective_tier('3a222222-0000-0000-0000-000000000002');
    raise exception 'FAIL a parent read another household''s plan';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT read another household''s plan (%)', left(sqlerrm, 32);
  end;
end $$;
reset role;

-- ---------- a new family starts on one ----------
do $$
declare res jsonb;
begin
  set local role postgres;
  insert into auth.users (id, email) values
    ('3a999999-9999-9999-9999-999999999999', 'brand-new@example.com');
  set local role app_user;

  perform become('3a999999-9999-9999-9999-999999999999');
  res := create_family('Brand New', 'Newbie');
  perform ok('creating a family starts the fortnight', res->>'trial_tier' = 'elite');
  perform ok('and says when it runs out, so the app can say so too',
    (res->>'trial_ends_at')::timestamptz > now() + interval '13 days');
  set local role postgres;
  perform ok('so the very first thing they see is the whole product',
    effective_tier((res->>'family_id')::uuid) = 'elite');
end $$;

reset role;
