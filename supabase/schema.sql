-- ---------------------------------------------------------------------------
-- RankUp database schema (Supabase / Postgres)
--
-- NOT YET IN USE. The app currently stores everything in the browser. This file
-- is the design for when it moves to a real backend — see docs/BACKEND.md.
--
-- To use it: create a Supabase project, open the SQL editor, paste this whole
-- file in, and run it.
--
-- The most important part of this file is not the tables — it is the Row Level
-- Security policies at the bottom. Those are what stop one family reading
-- another family's data, and they are enforced by the database itself rather
-- than by the app, which anyone can edit.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Families and people
-- ---------------------------------------------------------------------------

create table families (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  parent_theme_id text not null default 'executive',
  tier            text not null default 'standard' check (tier in ('standard','elite')),
  -- Subscription state is written by the Stripe webhook, never by the browser.
  stripe_customer_id      text,
  stripe_subscription_id  text,
  subscription_status     text not null default 'none'
                          check (subscription_status in ('none','trialing','active','past_due','canceled')),
  subscription_renews_at  timestamptz,
  created_at      timestamptz not null default now()
);

-- One row per adult. `user_id` links to Supabase's built-in auth.users table.
create table parents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  family_id  uuid not null references families(id) on delete cascade,
  name       text not null,
  email      text,
  is_owner   boolean not null default true,
  created_at timestamptz not null default now()
);

-- Kids. `user_id` is nullable: a young child may share the parent's device and
-- never have their own login. An older kid can be given one later.
create table kids (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  user_id      uuid unique references auth.users(id) on delete set null,
  name         text not null,
  theme_id     text not null default 'matrixblocks',
  avatar_hue   int  not null default 200,

  xp           int  not null default 0 check (xp >= 0),
  coins        int  not null default 0 check (coins >= 0),

  streak_count      int not null default 0,
  streak_last_day   date,
  streak_freezes    int not null default 1,

  -- Adaptive / accessibility. Health-adjacent and among the most sensitive
  -- fields here: readable by the family's parents only, never by other kids.
  has_access_needs  boolean not null default false,
  access_notes      text    not null default '',
  access_supports   text[]  not null default '{}',

  profile_frame  text not null default 'none',
  drop_selector  text not null default 'standard',
  last_login_bonus date,

  -- The active lockout, if any (System Override Protocol).
  lockout_kind   text check (lockout_kind in ('dimension','red')),
  lockout_until  timestamptz,
  lockout_reason text,

  created_at   timestamptz not null default now()
);

create index kids_family_idx on kids(family_id);

-- ---------------------------------------------------------------------------
-- Quests and submissions
-- ---------------------------------------------------------------------------

create table quests (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families(id) on delete cascade,
  kid_id         uuid not null references kids(id) on delete cascade,
  created_by     uuid references parents(id) on delete set null,

  title          text not null,
  description    text not null default '',
  category       text not null default 'bedroom',
  difficulty     text not null default 'medium'
                 check (difficulty in ('easy','medium','hard','boss')),
  xp             int  not null default 30 check (xp between 0 and 9999),

  -- Adaptive tasks: same reward structure, difficulty and "done" scoped to one
  -- kid. `done_means` is what both the kid and the AI check read.
  adaptive       boolean not null default false,
  done_means     text not null default '',
  supports       text[] not null default '{}',
  why            text not null default '',

  requires_photo boolean not null default true,
  timer_seconds  int not null default 0,
  test_score     boolean not null default false,
  double_xp      boolean not null default false,
  recurrence     text not null default 'once' check (recurrence in ('once','daily','weekly')),

  status         text not null default 'assigned'
                 check (status in ('assigned','submitted','approved','redo')),
  redo_note      text,
  redo_count     int not null default 0,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index quests_kid_status_idx on quests(kid_id, status);

create table submissions (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  quest_id      uuid not null references quests(id) on delete cascade,
  kid_id        uuid not null references kids(id) on delete cascade,

  -- Path into the `proof-photos` Storage bucket, not the image itself.
  photo_path      text,
  photo_hash      text,        -- perceptual fingerprint, for duplicate detection
  capture_source  text not null default 'live-camera'
                  check (capture_source in ('live-camera','upload','none')),

  note          text not null default '',
  test_score    int check (test_score between 0 and 100),
  elapsed_ms    int,
  on_time       boolean not null default true,

  -- The advisory photo report. Advisory only: it never decides anything.
  ai_verdict    text check (ai_verdict in ('looks_good','needs_review','suspicious')),
  ai_score      int check (ai_score between 0 and 100),
  ai_report     jsonb,

  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  decided_at    timestamptz,
  decided_by    uuid references parents(id) on delete set null,
  parent_note   text not null default '',
  awarded_xp    int,
  awarded_coins int,

  submitted_at  timestamptz not null default now()
);

create index submissions_family_pending_idx on submissions(family_id, status);
create index submissions_kid_hash_idx on submissions(kid_id, photo_hash);

-- ---------------------------------------------------------------------------
-- Rewards, notes, goals
-- ---------------------------------------------------------------------------

create table rewards (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  name        text not null,
  description text not null default '',
  icon        text not null default '🎁',
  cost        int not null check (cost > 0),
  created_at  timestamptz not null default now()
);

create table redemptions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  reward_id  uuid references rewards(id) on delete set null,
  kid_id     uuid not null references kids(id) on delete cascade,
  name       text not null,
  cost       int not null,
  status     text not null default 'requested' check (status in ('requested','given')),
  created_at timestamptz not null default now(),
  given_at   timestamptz
);

create table notes (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  kid_id     uuid not null references kids(id) on delete cascade,
  author     text not null check (author in ('parent','kid')),
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create table family_goals (
  family_id  uuid primary key references families(id) on delete cascade,
  name       text not null,
  target_xp  int not null check (target_xp > 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- System Override Protocol (Elite)
-- ---------------------------------------------------------------------------

create table overrides (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  kid_id      uuid not null references kids(id) on delete cascade,
  applied_by  uuid references parents(id) on delete set null,
  kind        text not null check (kind in ('tax','dimension','red')),
  reason      text not null,          -- required by product rule, not just by the schema
  consequence text not null default '',
  percent     int,                    -- tax only
  amount      int,                    -- tax only: currency actually deducted
  minutes     int,                    -- dimension only
  until       timestamptz,            -- dimension only
  created_at  timestamptz not null default now(),
  lifted_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- Guilds — real cross-family guilds. See docs/LEGAL.md before enabling these:
-- connecting a child to children in other families needs verified consent on
-- both sides plus moderation.
-- ---------------------------------------------------------------------------

create table guilds (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  motto          text not null default '',
  crest          text not null default '🛡️',
  weekly_goal_xp int not null default 1500,
  -- Capacity is 5 on Standard and 10 on Elite; enforced against the leader's tier.
  capacity       int not null default 5 check (capacity in (5, 10)),
  leader_kid_id  uuid references kids(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table guild_members (
  guild_id  uuid not null references guilds(id) on delete cascade,
  kid_id    uuid not null references kids(id) on delete cascade,
  role      text not null default 'member' check (role in ('leader','member')),
  -- 'invited' until a parent on the other side approves. Never auto-accept.
  status    text not null default 'invited' check (status in ('invited','active','removed')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, kid_id)
);

create table guild_messages (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  kid_id     uuid not null references kids(id) on delete cascade,
  body       text not null,
  -- Moderation is not optional for kid-to-kid chat.
  flagged    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Parent Alliances (Elite) — the 20% Discount Tournament
-- ---------------------------------------------------------------------------

create table alliances (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  capacity   int not null default 10,
  created_at timestamptz not null default now()
);

create table alliance_members (
  alliance_id uuid not null references alliances(id) on delete cascade,
  family_id   uuid not null references families(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (alliance_id, family_id)
);

-- One row per month per alliance, written by a scheduled job that also has to
-- apply the actual billing discount. See docs/PAYMENTS.md.
create table alliance_results (
  alliance_id       uuid not null references alliances(id) on delete cascade,
  month_key         text not null,           -- 'YYYY-MM'
  winning_family_id uuid references families(id) on delete set null,
  discount_applied  boolean not null default false,
  primary key (alliance_id, month_key)
);

-- ---------------------------------------------------------------------------
-- Activity log — what the AI Behaviour Blueprint reads
-- ---------------------------------------------------------------------------

create table events (
  id         bigserial primary key,
  family_id  uuid not null references families(id) on delete cascade,
  kid_id     uuid references kids(id) on delete cascade,
  type       text not null,
  meta       jsonb not null default '{}',
  day        date not null default current_date,
  created_at timestamptz not null default now()
);

create index events_family_day_idx on events(family_id, day);
create index events_kid_type_idx on events(kid_id, type);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Everything above is useless without this. The anon key ships inside the
-- browser, so a determined person can send any query they like. These policies
-- are what make that safe.
-- ---------------------------------------------------------------------------

-- Which family does the logged-in user belong to?
create or replace function current_family_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select family_id from parents where user_id = auth.uid()),
    (select family_id from kids    where user_id = auth.uid())
  );
$$;

create or replace function is_parent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from parents where user_id = auth.uid());
$$;

create or replace function current_kid_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from kids where user_id = auth.uid();
$$;

alter table families        enable row level security;
alter table parents         enable row level security;
alter table kids            enable row level security;
alter table quests          enable row level security;
alter table submissions     enable row level security;
alter table rewards         enable row level security;
alter table redemptions     enable row level security;
alter table notes           enable row level security;
alter table family_goals    enable row level security;
alter table overrides       enable row level security;
alter table guilds          enable row level security;
alter table guild_members   enable row level security;
alter table guild_messages  enable row level security;
alter table alliances       enable row level security;
alter table alliance_members enable row level security;
alter table alliance_results enable row level security;
alter table events          enable row level security;

-- Family: everyone in it can read it. Only a parent can change it — and never
-- the subscription columns, which only the Stripe webhook (service role) writes.
create policy family_read on families
  for select using (id = current_family_id());
create policy family_update on families
  for update using (id = current_family_id() and is_parent());

create policy parents_read on parents
  for select using (family_id = current_family_id());
create policy parents_write on parents
  for all using (family_id = current_family_id() and is_parent())
  with check (family_id = current_family_id() and is_parent());

-- Kids: parents manage them. A kid may read their own row but may NOT update it
-- — otherwise they could set their own XP. All XP changes go through the
-- approve_submission function below, which runs with elevated rights.
create policy kids_read on kids
  for select using (family_id = current_family_id());
create policy kids_parent_write on kids
  for all using (family_id = current_family_id() and is_parent())
  with check (family_id = current_family_id() and is_parent());

-- Quests: a kid can read their own; only a parent can create or edit one.
-- This is the rule that keeps the game honest — a kid cannot raise a quest's XP.
create policy quests_read on quests
  for select using (
    family_id = current_family_id()
    and (is_parent() or kid_id = current_kid_id())
  );
create policy quests_parent_write on quests
  for all using (family_id = current_family_id() and is_parent())
  with check (family_id = current_family_id() and is_parent());

-- Submissions: a kid creates their own; only a parent decides one.
create policy submissions_read on submissions
  for select using (
    family_id = current_family_id()
    and (is_parent() or kid_id = current_kid_id())
  );
create policy submissions_kid_insert on submissions
  for insert with check (
    family_id = current_family_id()
    and kid_id = current_kid_id()
    and status = 'pending'
    and awarded_xp is null
  );
create policy submissions_parent_update on submissions
  for update using (family_id = current_family_id() and is_parent());

create policy rewards_read on rewards
  for select using (family_id = current_family_id());
create policy rewards_parent_write on rewards
  for all using (family_id = current_family_id() and is_parent())
  with check (family_id = current_family_id() and is_parent());

create policy redemptions_read on redemptions
  for select using (family_id = current_family_id());
create policy redemptions_kid_insert on redemptions
  for insert with check (family_id = current_family_id() and kid_id = current_kid_id());
create policy redemptions_parent_update on redemptions
  for update using (family_id = current_family_id() and is_parent());

create policy notes_read on notes
  for select using (
    family_id = current_family_id()
    and (is_parent() or kid_id = current_kid_id())
  );
create policy notes_insert on notes
  for insert with check (family_id = current_family_id());
create policy notes_update on notes
  for update using (family_id = current_family_id());

create policy goals_read on family_goals
  for select using (family_id = current_family_id());
create policy goals_parent_write on family_goals
  for all using (family_id = current_family_id() and is_parent())
  with check (family_id = current_family_id() and is_parent());

-- Overrides: a kid can see one applied to them (they are told the reason), but
-- obviously cannot create or lift one.
create policy overrides_read on overrides
  for select using (
    family_id = current_family_id()
    and (is_parent() or kid_id = current_kid_id())
  );
create policy overrides_parent_write on overrides
  for all using (family_id = current_family_id() and is_parent())
  with check (family_id = current_family_id() and is_parent());

-- Guilds: visible only to members of that guild.
create policy guilds_read on guilds
  for select using (
    exists (
      select 1 from guild_members gm
      join kids k on k.id = gm.kid_id
      where gm.guild_id = guilds.id
        and gm.status = 'active'
        and k.family_id = current_family_id()
    )
  );
create policy guild_members_read on guild_members
  for select using (
    exists (
      select 1 from guild_members mine
      join kids k on k.id = mine.kid_id
      where mine.guild_id = guild_members.guild_id
        and mine.status = 'active'
        and k.family_id = current_family_id()
    )
  );
create policy guild_messages_read on guild_messages
  for select using (
    exists (
      select 1 from guild_members gm
      join kids k on k.id = gm.kid_id
      where gm.guild_id = guild_messages.guild_id
        and gm.status = 'active'
        and k.family_id = current_family_id()
    )
  );
create policy guild_messages_insert on guild_messages
  for insert with check (kid_id = current_kid_id());

-- Alliances are for parents only.
create policy alliances_read on alliances
  for select using (
    is_parent() and exists (
      select 1 from alliance_members am
      where am.alliance_id = alliances.id and am.family_id = current_family_id()
    )
  );
create policy alliance_members_read on alliance_members
  for select using (
    is_parent() and exists (
      select 1 from alliance_members mine
      where mine.alliance_id = alliance_members.alliance_id
        and mine.family_id = current_family_id()
    )
  );
create policy alliance_results_read on alliance_results
  for select using (
    is_parent() and exists (
      select 1 from alliance_members am
      where am.alliance_id = alliance_results.alliance_id
        and am.family_id = current_family_id()
    )
  );

create policy events_read on events
  for select using (
    family_id = current_family_id()
    and (is_parent() or kid_id = current_kid_id())
  );
create policy events_insert on events
  for insert with check (family_id = current_family_id());

-- ---------------------------------------------------------------------------
-- Approving a submission
--
-- Awarding XP is done here, in the database, rather than in the browser. The
-- browser can be edited by anyone; this cannot. The function checks the caller
-- is a parent in the right family before it changes a single number.
--
-- The XP total passed in is calculated by the app (src/lib/xp.js). If the game
-- ever needs to be fully tamper-proof, move that calculation in here too.
-- ---------------------------------------------------------------------------

create or replace function approve_submission(
  p_submission_id uuid,
  p_xp int,
  p_coins int,
  p_note text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sub submissions;
  v_parent uuid;
begin
  select * into v_sub from submissions where id = p_submission_id;
  if not found then raise exception 'submission not found'; end if;
  if v_sub.status <> 'pending' then raise exception 'submission already decided'; end if;

  select id into v_parent from parents
   where user_id = auth.uid() and family_id = v_sub.family_id;
  if v_parent is null then raise exception 'only a parent in this family can approve'; end if;

  update submissions
     set status = 'approved',
         decided_at = now(),
         decided_by = v_parent,
         parent_note = p_note,
         awarded_xp = p_xp,
         awarded_coins = p_coins
   where id = p_submission_id;

  update quests set status = 'approved', completed_at = now() where id = v_sub.quest_id;

  update kids
     set xp = xp + p_xp,
         coins = coins + p_coins,
         streak_count = case
           when streak_last_day = current_date then streak_count
           when streak_last_day = current_date - 1 then streak_count + 1
           else 1
         end,
         streak_last_day = current_date
   where id = v_sub.kid_id;

  insert into events (family_id, kid_id, type, meta)
  values (v_sub.family_id, v_sub.kid_id, 'quest_approved',
          jsonb_build_object('questId', v_sub.quest_id, 'xp', p_xp, 'coins', p_coins));
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage
--
-- Create a bucket named `proof-photos` in the Supabase dashboard and leave it
-- PRIVATE. Serve images through signed URLs; a public bucket would put photos
-- of children's bedrooms on the open internet.
--
-- Also decide a retention policy before launch. Deleting a photo once the
-- parent has reviewed it removes most of the risk in this whole system.
-- See docs/LEGAL.md.
-- ---------------------------------------------------------------------------
