# RankUp — complete handoff

Everything needed to pick this project up cold, on a new machine or in a new
Claude account, and be productive in under an hour.

**Its companion is [`ESSAY.md`](ESSAY.md)** — the same project explained as
continuous prose rather than tables: what it is, why every part of it is the way
it is, and what each mistake cost to learn. Read the essay to understand the
project; read this file to find things in it.

Every number in this document was counted from the repository on
**25 October 2026**, not remembered. Where something is a mockup it says so.

- **Repository:** `github.com/rayan-baig/RankUp`
- **Working branch:** `claude/rankup-chore-app-8ofgut`
- **Scale:** 110 commits · 43,923 lines · 263 source files
- **Stack:** Vite + React 18 (plain JSX, deliberately not TypeScript), Tailwind
  v3, Postgres/Supabase, Cloudflare Pages or Vercel functions

---

## Table of contents

1. [What RankUp is](#1-what-rankup-is)
2. [Run it in two minutes](#2-run-it-in-two-minutes)
3. [The demo, and a script for showing it](#3-the-demo-and-a-script-for-showing-it)
4. [Architecture](#4-architecture)
5. [State model](#5-state-model)
6. [Database](#6-database)
7. [Every screen](#7-every-screen)
8. [The economy](#8-the-economy)
9. [Themes, worlds and storylines](#9-themes-worlds-and-storylines)
10. [The arcade: 24 games](#10-the-arcade-24-games)
11. [The AI photo check](#11-the-ai-photo-check)
12. [Plans, billing and Charity Week](#12-plans-billing-and-charity-week)
13. [Security model](#13-security-model)
14. [Testing](#14-testing)
15. [Deployment](#15-deployment)
16. [What is real and what is not](#16-what-is-real-and-what-is-not)
17. [Known gaps and what to do next](#17-known-gaps-and-what-to-do-next)
18. [House rules learned the hard way](#18-house-rules-learned-the-hard-way)
19. [File map](#19-file-map)
20. [Starting a new Claude session on this](#20-starting-a-new-claude-session-on-this)

---

## 1. What RankUp is

A gamified chore app for families. One sentence: **a parent assigns a chore, the
child photographs the proof, software checks the photo isn't faked, the parent
approves, and the child earns XP, in-game currency and — optionally — real
pocket money.**

The loop, in full:

```
PARENT                        CHILD                        SYSTEM
  │
  ├─ assigns a quest ────────▶ sees it on Quests
  │   (title, difficulty,         with every bonus
  │    optional £ price,          itemised BEFORE
  │    optional photo proof,      they start
  │    optional timer,
  │    optional recurrence)
  │                                │
  │                                ├─ does the chore
  │                                ├─ opens in-app camera
  │                                │        │
  │                                │        ├──────────────▶ on-device checks
  │                                │                         (blur, darkness,
  │                                │                          screen-of-a-screen,
  │                                │                          duplicate, staleness)
  │                                │                              │
  │                                │                              ├─ optional
  │                                │                              │  Claude vision call
  │                                │                              ▼
  ◀─ submission lands in Review ───┘                         ADVISORY verdict
  │   with the photo and the                                 (never auto-decides)
  │   verdict as a hint
  │
  ├─ approve ──────────────────────────────────────────────▶ XP + coins + money
  │     or                                                   awarded, photo DELETED
  ├─ send back with a note ──▶ quest reappears on the
  │                            child's list with the note
  ▼
```

**The product's weakest assumption, stated plainly:** that a parent will
actually open the app to approve things. Everything else is downstream of that.
Nothing in the codebase can fix it; only a week of real use will tell you.

### What makes it different from a chore chart

- **Proof is photographic and checked.** Not "tick when done".
- **The checker never accuses.** It produces a hint for the parent and nothing
  more. A false accusation against an honest child is far more damaging in a
  family app than a missed cheat. This is a product rule, enforced in code.
- **The child's app is a game, not a form.** 15 themes, each with an evolving
  world, a storyline and an avatar that levels through five forms; a 24-game
  arcade whose tokens can only be earned by finishing real chores.
- **Money is first-class.** A chore can carry a real price, and there is a real
  allowance ledger with payouts and gifts.

---

## 2. Run it in two minutes

```bash
git clone https://github.com/rayan-baig/RankUp
cd RankUp
git checkout claude/rankup-chore-app-8ofgut
npm install
npm run dev          # http://localhost:5173
```

Then click **“Have a look around →”** on the welcome screen. That is the demo.

**No configuration is needed.** No account, no database, no API key. The whole
app runs on one device against `localStorage`. Everything in `.env.example` is
optional and each block says what switching it on buys you.

Optional extras:

```bash
npm run build                   # production build
npm run lint                    # eslint over src and tests
npm run test:awards             # pure-node logic tests, no browser (fast)
npm run test:smoke              # the browser suite — needs the dev server up
./supabase/test/up.sh           # full local stack: postgres + mock API + vite
npm run test:db                 # 24 SQL test files against real postgres
```

Browser tests need Chromium. In this sandbox:
`export CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`

---

## 3. The demo, and a script for showing it

### What the demo contains

Built fresh by `src/lib/demoFamily.js` every time it is out of date:

- **The Rivera Family**, parent **Sam**, parent PIN **1234**
- Two children, **Ava** and **Noah**, both on the **Block Craft** theme
- **Elite tier**, so every paid feature is visible
- Three quest packs assigned (kid: 7 quests, teen: 6, adaptive: 6)
- Five of the chores carry real prices — `Take the bins out` 100p through
  `Mow the lawn` 500p. Deliberately only five: most chores are unpaid, and a
  demo where everything paid would advertise something no family does.
- **A fortnight of history**, already approved
- **Unlimited arcade tokens** — demo only, enforced in one place
  (`KidArcade.jsx`: `const unlimited = Boolean(state.demo)`)

Two honest details worth knowing, because they look like bugs and are not:

- **No proof photos in the history.** The app destroys a photo the moment a
  parent decides, so a demo built the normal way has none. Showing fake ones
  would misrepresent what is on screen.
- **No level-up card waiting on arrival.** Approving five chores earns a level,
  and the celebration was queued when the demo opened — so the first thing a
  visitor saw was a full-screen modal about a child they had not met.

### A five-minute script

| # | Do this | What it shows |
|---|---|---|
| 1 | Click **Have a look around** | Lands on Ava's home, not a setup screen |
| 2 | Point at the background | It is a live scene, not a JPEG: parallax, aurora, drifting dust, all in the theme's colours |
| 3 | **Quests** → open one | Every bonus itemised *before* they start — XP, coins, money, 2× flags |
| 4 | **Arcade** | 24 games, a daily featured game, shelves by kind, each tile saying how long a round takes |
| 5 | Play **Blackjack** or **Go Fish** | Real games, not chore-themed filler |
| 6 | **You** tab | Avatar forms, the theme's storyline, "what happens next" |
| 7 | Settings → switch theme to **Coquette Circuit** or **Cyber Grid** | The entire app changes world, not just its accent colour |
| 8 | Switch to the parent side, PIN **1234** | Ten dashboard themes, a different visual language entirely |
| 9 | **Review** | Where a submission's photo and its advisory verdict land |
| 10 | Parent → **Plan** | The comparison table, which reads its rows from the live data and so cannot lie |

### Showing the world progression

The most demo-able thing in the app. A child's theme changes world as they
level, at 10 / 25 / 50 / 100 (Block Craft has nine forms and goes to 399).

To jump a demo kid to level 50, in the browser console:

```js
const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
s.kids[0].xp = 15172          // ≈ level 50
localStorage.setItem('rankup.state.v1', JSON.stringify(s))
location.reload()
```

Block Craft at 125 becomes **The Nether Portal**; at 250, **The End**; at 399,
**The Dragon**. The others travel by light rather than geometry — see §9.

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ BROWSER                                                     │
│                                                             │
│  App.jsx ── hash router (src/lib/router.js)                 │
│     │                                                       │
│     ├── AppContext ── ONE reducer, ONE store                │
│     │     src/state/reducer.js  (60 action types)           │
│     │     src/state/initialState.js                         │
│     │          │                                            │
│     │          └── debounced persistence                    │
│     │              src/lib/storage.js → localStorage        │
│     │                                                       │
│     ├── screens/kid/*      (11 screens)                     │
│     ├── screens/parent/*   (11 screens)                     │
│     ├── components/*       (79 files)                       │
│     │     └── games/*      (24 games + engines)             │
│     └── lib/sync/*         ── outbox → Supabase             │
│                                                             │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│ SUPABASE / POSTGRES                                         │
│  40 tables · 143 SECURITY DEFINER functions · 36 RLS policies│
│  All writes go through functions. No table is writable      │
│  directly by a client.                                      │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│ SERVERLESS (api/, served by functions/api/[[route]].js)     │
│  verify-photo · create-checkout · billing-portal            │
│  stripe-webhook · send-push · send-reminders                │
│  send-digests · settle-alliances · run-retention · health   │
│  school-checkout · settle-schools                           │
└────────────────────────────────────────────────────────────┘
```

### Deliberate choices, and why

| Choice | Reason |
|---|---|
| **Plain JSX, not TypeScript** | The owner has no coding background. Types would be a second language to debug on top of the first. |
| **One reducer, one store** | 60 action types in one file beats state scattered across 90 components. Every state change is greppable. |
| **Hash routing** | Works from `file://`, from a subdirectory, and from any static host with no server rewrites. |
| **Offline-first, localStorage primary** | The app is fully usable with no backend at all. Sync is an upgrade, not a dependency. |
| **An outbox, not direct writes** | `src/lib/sync/` queues changes. A bad afternoon on the server must not delete a child's work — there is a test named exactly that. |
| **SECURITY DEFINER everywhere** | A client that can write a table can grant itself XP. A client that can only call `approve_submission()` cannot. |
| **CSS `color-mix()` for theming** | One rule serves all 25 themes. No per-theme stylesheet. |
| **Inline SVG scenes, no image files** | Backgrounds re-colour themselves from the active theme and cost no network. |

---

## 5. State model

`src/state/reducer.js` — one function, 60 action types:

```
ADD_KID ADD_NOTE ADD_QUESTS ADD_REWARD ADOPT_PAIRED_KID APPLY_OVERRIDE
APPROVE_SUBMISSION ATTACH_SYNCED_PHOTOS BUY_SKIN CANCEL_PAIRING
CLAIM_LOGIN_BONUS CLAIM_SKIN_WITH_TICKET CLEAR_LEVEL_UP COMPLETE_ONBOARDING
DELETE_QUEST DELETE_REWARD DRAIN_NOTICE_QUEUE DRAIN_SYNC_QUEUE EXPIRE_LOCKOUTS
FINISH_MINIGAME FULFIL_REDEMPTION GRANT_FLASH_TICKETS HYDRATE INVITE_MATE
JOIN_FAMILY LEAVE_DEMO LIFT_OVERRIDE LOCK_PARENT MARK_NOTES_READ
MERGE_ALLOWANCE MERGE_SNAPSHOT PAIRING_CLAIMED POST_GUILD_MESSAGE
RECORD_MONEY REDEEM_REWARD REJECT_SUBMISSION REMOVE_KID REMOVE_MATE RESET
RETURN_RECURRING SET_FAMILY_GOAL SET_KID_COSMETIC SET_KID_THEME
SET_PARENT_THEME SET_ROLE SET_TIER SIGN_OUT START_DEMO START_PAIRING
SUBMIT_QUEST TOGGLE_REMINDER UNLINK_KID_DEVICE UNLOCK_PARENT UPDATE_FAMILY
UPDATE_GUILD UPDATE_KID UPDATE_QUEST UPDATE_SETTINGS USE_STREAK_FREEZE
WEAR_SKIN
```

Shape, roughly:

```js
{
  family:   { name, parentName, pin, tier, currency, timezone, goal },
  kids:     [{ id, name, themeId, xp, coins, pence, streak, bestScores,
               playTokens, gameCoinsToday, gameDay, badges, skins,
               profileFrame, dropSelector, ... }],
  quests:   [{ id, kidId, title, difficulty, xp, pence, photo, timer,
               recurrence, doubleXp, supports, status }],
  submissions: [{ id, questId, kidId, status, photoId, verdict, note }],
  rewards:  [...], redemptions: [...], notes: [...],
  session:  { role, kidId, parentUnlocked },
  device:   { role, id },
  settings: { ... },
  syncQueue: [], noticeQueue: [],
  demo: false, demoVersion: 3,
}
```

**Persistence:** `src/lib/storage.js`, debounced, key `rankup.state.v1`.
A saved demo is rebuilt only when `demoVersion` is stale — rebuilding on every
load threw away everything a visitor did in it, which is the worse bug because
it is the one they can see.

---

## 6. Database

17 SQL files in `supabase/`, applied in the order `docs/BACKEND.md` gives.

**40 tables:** `families · parents · kids · quests · submissions · rewards ·
redemptions · notes · events · overrides · allowance_entries · family_goals ·
guilds · guild_members · guild_messages · alliances · alliance_members ·
alliance_results · pairing_codes · pairing_claim_attempts · parent_invites ·
adult_invite_attempts · parental_consents · consent_notices · push_subscriptions ·
reminder_schedules · digest_sends · billing_events · referrals · crash_reports ·
deletions · job_runs · schools · school_staff · school_members ·
school_rivalries · school_month_scores · school_awards · school_rivalry_results ·
school_top_students`

**143 SECURITY DEFINER functions.** The important ones:

| Function | Guards |
|---|---|
| `approve_submission` | the only route to XP; idempotent |
| `award_for_submission` | one request could once mint any amount of XP — fixed, tested |
| `play_minigame` | allow-list of the 24 shipped game ids; rejects anything else |
| `enforce_kid_limit` | trigger; Starter is capped at one child in the database, not the screen |
| `apply_subscription_change` | **tier is written by Stripe's webhook and by nothing else** |
| `claim_pairing_code` / `record_pairing_attempt` | rate-limited, attempts exhausted after N |
| `may_act_for_kid` / `is_parent` / `current_family_id` | the authorisation spine |
| `delete_family_account` / `export_family_data` | GDPR rights, really implemented |
| `run_retention` / `purge_stale_photos` | scheduled cleanup |

**36 RLS policies.** Every table is deny-by-default; one family can never read
another's rows. There are tests that attempt exactly that and assert failure.

---

## 7. Every screen

### Child (`src/screens/kid/`, 6 tabs)

| Route | File | What it does |
|---|---|---|
| `/kid` | `KidHome.jsx` | Avatar, level, streak, current quest, today's list, login bonus |
| `/kid/quests` | `KidQuests.jsx` | Everything assigned, by state |
| `/kid/quest/:id` | `QuestDetail.jsx` | Rewards itemised, camera, timer, submit |
| `/kid/guild` | `KidGuild.jsx` | 5- or 10-player guild, roster, messages (Standard+) |
| `/kid/arcade` | `KidArcade.jsx` | 24 games, daily featured, shelves, tokens |
| `/kid/shop` | `KidShop.jsx` | Rewards catalogue, redemption |
| `/kid/market` | `KidMarket.jsx` | Sunday Market — cosmetic skins, flash tickets |
| `/kid/school` | `KidSchool.jsx` | The child's school: place in the district, rivals, and whether they are a School Star |
| `/kid/profile` | `KidProfile.jsx` | Forms, badges, **the theme's storyline**, customisation |
| — | `KidPairing.jsx`, `KidDeviceSetup.jsx`, `LockoutScreen.jsx` | Pairing and the Elite lockout |

### Parent (`src/screens/parent/`, 5 tabs + 6 deeper)

| Route | File | What it does |
|---|---|---|
| `/parent` | `ParentDashboard.jsx` | Per-child state, pending count, goal |
| `/parent/approvals` | `ParentApprovals.jsx` | **The screen the product lives or dies on.** Photo, verdict, approve or send back with a note |
| `/parent/assign` | `ParentAssign.jsx` | Custom quests, three bulk packs, price, timer, recurrence |
| `/parent/kids` | `ParentKids.jsx` | Add, edit, remove, pair devices |
| `/parent/settings` | `ParentSettings.jsx` | Indexed settings, themes, data rights |
| `/parent/plan` | `ParentPlan.jsx` | Tiers, comparison table, checkout |
| `/parent/blueprint` | `ParentBlueprint.jsx` | Elite: weekly behaviour charts from real history |
| `/parent/override` | `ParentOverride.jsx` | Elite: Consequence Engine — currency tax, lockout, lockdown |
| `/parent/alliance` | `ParentAlliance.jsx` | Elite: ten-family monthly contest, 20% off for the winner |
| `/parent/school` | `ParentSchool.jsx` | School League: join a child's school with its code, choose whether their first name may show, see the league |
| `/parent/guilds` | `ParentGuilds.jsx` | Approve guild joins, moderate reported messages |
| `/parent/pair` | `ParentPairKid.jsx` | Type the child's six-digit code |

### Schools (`src/screens/SchoolPortal.jsx`, no family needed)

| Route | File | What it does |
|---|---|---|
| `/school` | `SchoolPortal.jsx` | What it is and the price by size; a teacher or principal signs the school up, then manages codes, rivals and School Stars |

The School League lives in `supabase/schools.sql` and `src/lib/schools.js`.
Schools pay by size ($29 up to 300 students, $59 up to 800, $99 up to 1,500,
$149 above; a year is ten months; 30 days free). A school's score is approved
chores per student, at most eight a day each, averaged, so size does not win.
`settle_school_month` closes a month: District Champion (needs two ranked
schools), rivalry results and each school's top ten. A school sees no child's
name until the operator has run `verify_school`, and then only first names a
parent agreed to.

Schools pay through `api/school-checkout.js` (price picked from the school's
size, never from the request); the existing Stripe webhook switches a school
on and off by the `school_id` on its subscription. `api/settle-schools.js` runs
monthly: it closes the month and gives each Champion its free month (a coupon
if it pays, thirty more trial days if not). Setup is in
[docs/PAYMENTS.md](docs/PAYMENTS.md#the-school-league).

---

## 8. The economy

### XP

```js
DIFFICULTY = { easy: 15, medium: 30, hard: 55, boss: 100 }   // XP per quest
xpToNext(level) = min(400, 80 + 12 * (level - 1))
```

Gentle at the start so a child sees a level-up on day one; flat at 400 so Block
Craft's level-399 evolution stays reachable rather than theoretical.
Elite multiplies all XP by **1.5**.

### Currency and caps

- Coins are themed per world — Pink Crystals, V-Coins, Berberries, Star Shards…
- **Arcade: `MAX_TOKENS = 5`, `DAILY_COIN_CAP = 15`.** A token comes from an
  approved chore and from nothing else; the daily cap stops the arcade becoming
  a coin faucet.
- Demo mode gets unlimited tokens, in exactly one place.

### Real money

`src/lib/money.js` + `supabase/allowance.sql`. A quest can carry a price in
pence. The ledger supports `record_payment`, `record_payout`, `record_gift`
and `allowance_summary`. Multi-currency with zero-decimal handling (so ¥ is not
divided by 100). A database constraint refuses to price a chore at £9999 —
there is a test for the slipped finger.

---

## 9. Themes, worlds and storylines

**15 child themes**, each with its own palette, currency, avatar motif, animated
SVG scene, **four unlockable worlds** and **a storyline**.

MatrixBlocks · Block Craft · Tactical Override · Apex Royale · Aura Awakening ·
Coquette Circuit · Pop Arena · Pegasus Horizon · Sugar Rush · Glam Protocol ·
Campfire Cozy · Cyber Grid · Plumber Kingdom · Neon Pulse · Monster Tamer

**10 parent themes** (cosmetic by design): Executive Focus · Cozy Café · Zen
Minimalist · Midnight Admin · Botanical Core · Velocity Carbon · Solstice Clean ·
Oceania Slate · Architect Blueprint · Sovereign Estate

### How a world progression works

Each theme has a **premise** and four **worlds** arriving on the four form
levels (10 / 25 / 50 / 100), so the place changes at the same moment the avatar
does. Example — Apex Royale, premise *“A hundred drop in. You plan on walking
out.”*

| Level | World | Story |
|---|---|---|
| 10 | Storm Front | The wall is moving. Everything you need is inside the next circle. |
| 25 | Final Ring | Twelve left, and the ring is the size of a rooftop. |
| 50 | Last Stand | Squad down. It is you and whatever you are still carrying. |
| 100 | Champion | The ring closed on you standing up. The crown is yours. |

**The worlds keep their theme's own scene.** A theme *is* its shape language,
and Coquette rebuilt out of Cyber Grid wireframes stops being Coquette. What
travels is the light: the palette, plus a shared `Sky` layer that hangs a sun,
a crescent, stars, an eclipse, a ringed planet, a comet or a storm over
whichever scene is underneath.

**Block Craft is the exception** — nine forms rather than five, and worlds that
really are different drawings, because there the worlds *are* the story:
Overworld → The Nether Portal (125) → Nether Rise (175) → The End (250) →
The Dragon (399).

### The Block Craft story, battles and the dragon fight

Block Craft is told as a story: *raiders hit your village every night, you
are sick and tired of it, and you fight back.* Each chapter is a short
animated battle drawn on a canvas, no React in the loop. The fight is in
`src/lib/battleEngine.js`; the look is in `src/lib/battleArt.js`: smooth,
lit, cartoon-style block characters drawn at the screen's real pixels, so
it is sharp on any phone (it was pixel art until the owner asked for
something less pixelated):

| Chapter | Opens at | Scene |
|---|---|---|
| Raid Night | level 1 | raiders at the village gate |
| The Nether Portal | 125 | through the portal — **glitch** arrival |
| Nether Rise | 175 | the raiders' fortress |
| The End | 250 | shadow walkers — **glitch** arrival |
| The Dragon | 399 | the boss fight, powered by chores |
| Hero's Return | **when the dragon is beaten** | the village cheers you home |

- **Secret until reached.** No screen names a world before the child gets
  there: the chip says only "Secret world at level N" or "Beat the dragon to
  find out what comes next". `/kid/story/<chapter>` for a chapter not
  reached shows the home screen. `storyChapters()` in `kidThemes.js` only
  ever returns chapters reached.
- **Watching.** A "New chapter" card on the kid home screen opens
  `/kid/story/<chapter>`; the level-up overlay has "Watch the battle". The
  arrival glitch keeps tearing the background until that chapter is watched.
  Watched chapters are `kid.storySeen` — local to the device, never synced.
- **The dragon fight** (`src/lib/dragonFight.js`, `/kid/dragon`). Dragon
  1,000 health, child 100. An approved chore is a hit: easy 40, medium 80,
  hard 150, boss 300. A chore sent back: the dragon hits for 15. 48 hours
  with no approval: 25. About one day in four, a special attack (Wing Storm
  10, Void Breath 20, Tail Quake 15). At zero health the child rests in the
  village: health back to 100, the dragon heals 100, **nothing earned is
  lost.**
- **Nothing about the fight is stored.** It is worked out from the synced
  chores plus the clock, so every device agrees and there is no database
  change. Specials use a hash of the child's id and the date, not
  `Math.random`, for the same reason. The dragon screen replays what
  happened since the child last looked and ends on the real numbers.
- Tests: `tests/dragon.mjs` (the arithmetic) and `tests/battles.mjs` (every
  scene plays and is won, the replay lands on the fight's numbers, chapters
  stay secret). Both run in `npm run test:awards`.

All **75 palettes** (15 themes × base + 4 worlds) pass contrast floors, checked
in `tests/themes.mjs`. Light themes stay light at every stage — an earlier
"Pale Cream" world put dark night artwork behind dark-on-light text.

### Where the code is

| Thing | File |
|---|---|
| Theme data, worlds, stories | `src/data/kidThemes.js` |
| Battle scenes / dragon fight | `src/lib/battleEngine.js`, `src/lib/dragonFight.js` |
| Story and dragon screens | `src/screens/kid/KidStory.jsx`, `src/screens/kid/KidDragon.jsx` |
| Scenes + the shared Sky | `src/components/ThemeBackground.jsx` (19 scenes) |
| Aurora, dust, vignette | `src/components/Atmosphere.jsx` |
| Avatar and its forms | `src/components/Avatar.jsx`, `src/lib/avatarTiers.js` |
| CSS variable application | `src/lib/applyTheme.js` |

---

## 10. The arcade: 24 games

Tokens come from approved chores and nothing else — that is the whole line
between "a game you earn" and "a game instead of doing anything", and the empty
state points straight back at the quest list.

| Category | Games |
|---|---|
| **Arcade** | Snake · Brick Breaker · Sky Hop · Star Catcher · Stacker · Trackstar |
| **Puzzle** | Block Drop · Sweet Swap · 2048 · Slide Puzzle · Lights Out |
| **Brain** | Memory Match · Colour Chain · Minesweeper · Find the Impostor |
| **Sports** | SportsMania · Tennis Tour · Turbo Ball |
| **Versus** | Four in a Row |
| **Cards** | Royal Draw · Wildfire · **Texas Hold'em** · **Blackjack** · **Go Fish** |

**SportsMania** contains tennis, soccer, football, basketball, ping pong, golf,
hockey, F1, cricket, baseball and volleyball in one game.

### The card games, and why they are built the way they are

The gambling is removed and the game is left in.

- **Blackjack** — six hands, nothing staked. The dealer plays a printed rule
  (hits below 17, stands on 17, soft or hard), so the child decides against
  something knowable.
- **Texas Hold'em** — heads-up, no chips. Scoring makes folding a real choice:
  win a showdown 2, fold 1, lose 0. Fold everything and you finish on fifty;
  judgement beats that and beats playing everything.
- **Go Fish** — enforces the rule that stops it being a guessing game: you may
  only ask for a rank you already hold, so every question tells the opponent
  something. The buttons only ever offer the ranks you have.

Rules that are right-or-wrong live outside the screens, in
`src/components/games/pokerHands.js` and `cardRules.js`, and are tested in
`tests/cards.mjs` — including the multi-ace total (A-A-9 is 21, four aces is
14), soft vs hard seventeen, and a bust player losing to a bust dealer. Both of
the dangerous ones were **mutation-checked**: stepping only the first ace down,
and testing the dealer's bust first, each make the suite fail.

### Adding a game — the checklist that stops a silent failure

1. Build the component in `src/components/games/`, calling `onDone(score 0–100)`
2. Add an entry to `src/data/minigames.js`
3. Add it to `COMPONENTS` in `src/screens/kid/KidArcade.jsx`
4. **Add its id to the `play_minigame()` allow-list in `supabase/sync.sql`**
5. `node tests/gameids.mjs` proves 1–4 agree

> Step 4 is the one that gets missed. It once rejected **ten of thirteen games**
> and was invisible from the browser, because a refused game also never spends
> the token — so reloading restored all five tokens and everything looked fine.

---

## 11. The AI photo check

`src/lib/aiVerify.js` + `api/verify-photo.js`. Full write-up in `docs/AI-CHECK.md`.

**It is advisory. It never approves or rejects anything.** Deliberate product
rule, not a limitation.

**Layer 1 — on device.** Always runs. No key, no upload, no cost. Catches the
mechanical cheats: a screenshot, a photo of a screen, a re-used photo from an
earlier submission, a photo taken long before the quest was opened, a thumb over
the lens. Built on a Laplacian-variance sharpness measure and a dHash for
duplicate detection (`src/lib/imaging.js`).

**Layer 2 — Claude vision.** Only if `VITE_AI_VERIFY_URL` is set and
`api/verify-photo.js` is deployed with `ANTHROPIC_API_KEY`. This is the layer
that answers "does this actually show a made bed?" Defaults to Haiku for cost;
`AI_VERIFY_MODEL` can raise it.

Three verdicts: `looks_good` ✅ · `needs_review` 👀 · `suspicious` ⚠️

Cost control: checks are rationed per family, require a signed-in caller, and
`refund_photo_check` returns the quota when a call fails. One commit cut the
running cost by about three quarters; `docs/AI-CHECK.md` records what a check
costs so nobody optimises the wrong thing.

`tests/photocheck.mjs` is named *“Does the photo check accuse honest children?”*

---

## 12. Plans, billing and Charity Week

| | Starter | Standard | Elite Pass |
|---|---|---|---|
| Price | **Free** | 9.99/mo · 99.90/yr | 15.99/mo · 159.90/yr |
| Children | 1 | Unlimited | Unlimited |
| Quests & rewards | Unlimited | Unlimited | Unlimited |
| AI photo check | — | ✅ | ✅ |
| Guilds | — | 5-player | 10-player |
| XP rate | Normal | Normal | **1.5×** |
| All 15 kid + 10 parent themes | ✅ | ✅ | ✅ |
| Overdrive visuals | — | — | ✅ |
| Profile frames / rare drops | — | — | ✅ |
| Consequence Engine | — | — | ✅ |
| Behaviour Blueprints | — | — | ✅ |
| 20% Discount Tournament | — | — | ✅ |

Starter was $4.99 and is now free, which is the whole growth strategy in one
number: a family app lives or dies on the first week and you cannot have a first
week behind a paywall. Starter runs the **entire** loop, so what someone loses
is a smaller app, not a locked one.

The comparison table on the plan screen computes its rows from live data
(`PLAN_COMPARISON` in `src/state/initialState.js`), so it cannot drift from what
the app enforces. It once claimed "All 25 themes" while shipping 15 for children
and 10 for parents — the total was right and the sentence was not.

**Charity Week — 22–28 June, every year.** *Every penny RankUp takes this week
goes to charity.* Implemented in `src/lib/charity.js` and `supabase/charity.sql`
(`in_charity_week`, `charity_week_total`), tested in `tests/charity.mjs` both in
the app and in the database.

---

## 13. Security model

Hardened over several explicit adversarial passes — see commits
`0459b02`, `7e46ef8`, `ab57a08`.

1. **No client writes a table.** All writes go through SECURITY DEFINER
   functions. A client that can write `kids` can grant itself XP.
2. **Tier is written by Stripe's webhook and nothing else.** If a device could
   set its own `tier`, every Elite feature would be one devtools edit away.
   Enforced with column-level grants plus a `lock_billing_columns` trigger.
3. **The kid limit is a database trigger**, not a screen check.
4. **Pairing and invites are rate-limited** with attempt tables, and codes are
   revocable.
5. **Photos are destroyed on review.** Plus `purge_stale_photos` and
   `run_retention` for anything that slips through.
6. **Parental consent is real** (`supabase/consent.sql`), as are data export and
   account deletion.
7. **No secret may carry a `VITE_` prefix.** Anything `VITE_` is compiled into
   every phone's JavaScript; the app shouts in the console at start-up if it
   finds one, and `tests/config.mjs` asserts every setting the code reads
   appears in `.env.example`.

### One known gap

The **owner-only MTRX console** is behind a client-side password. That is not
security — anyone can read it in the bundle. It has been flagged twice and still
needs real auth before it guards anything that matters.

---

## 14. Testing

**44 test files, 24 SQL test files.** Three groups:

```bash
npm run test:awards   # pure node, no browser, fast
npm run test:smoke    # Playwright, needs the dev server
npm run test:db       # real postgres, via ./supabase/test/up.sh
npm run test:sync     # multi-device sync
npm run test:api      # the endpoints through the real runtime
```

Suites, each named for the failure it prevents:

| Suite | Prevents |
|---|---|
| `integrity` | a kid getting XP they did not earn |
| `awards` | the app and the database disagreeing on what a chore is worth |
| `gameids` | the app shipping a game the server will refuse |
| `cards` | a full house losing to two pair |
| `cardgames` | a card game that never ends |
| `photocheck` | the photo check accusing honest children |
| `outbox` | a bad afternoon on the server deleting a child's work |
| `cursor` | a change that commits a moment too late being stepped over |
| `erase` | "erase this device" erasing the family |
| `trialbanner` | the banner that asks for money lying |
| `themes` | any theme, at any world, being unreadable |
| `crash` | one broken screen taking the app down |
| `perf` | the app not being smooth on a phone that is not this machine |
| `motion` | animation not stopping for `prefers-reduced-motion` |
| `config` | a setting existing in code but not in `.env.example` |
| `merge`, `sweets` | board logic, as maths rather than through a browser |
| `coparents`, `guilds`, `pairing`, `sync` | multi-device flows, driven as real devices |

### The testing standard used here

**A passing test proves nothing until it fails on a broken version.** Several
suites were mutation-checked — `tests/merge.mjs` passed against a deliberately
broken 2048 merge on its first draft, and `[2,2,4]` turned out to be the row
that separates the rules.

Two bugs this standard caught, which a build could not:

- `tests/themes.mjs` proved a theme was applied by looking for its currency name
  on the home screen. A redesign moved that text, so the check failed for all 15
  themes at once without one of them being broken. It now reads the `--accent`
  variable that every themed pixel is drawn from.
- `tests/cardgames.mjs` passed a **counter** to `finish()`, which reads
  `fails.length`. A number has no `.length`, so every run exited 0 no matter how
  much was broken.

---

## 15. Deployment

Two targets, both configured: **Cloudflare Pages** (`wrangler.toml`,
`functions/api/[[route]].js`) and **Vercel** (`vercel.json`).

```bash
npm run build                 # → dist/
./supabase/test/up.sh --cf    # serve the real build through workerd locally
```

Full steps in `docs/DEPLOY.md`. Database order in `docs/BACKEND.md`.
Payments in `docs/PAYMENTS.md`. Push in `docs/NOTIFICATIONS.md`.

**Caveat:** the in-app camera uses `getUserMedia` and **requires https**. It
will not work from a plain-http host.

---

## 16. What is real and what is not

`docs/STATUS.md` is the live version of this and is kept honest deliberately —
a mockup that looks finished turns into a promise you did not mean to make.

**✅ Real:** the whole core loop · photo proof and on-device checks · Claude
vision check (if configured) · XP, levels, currency, streaks, streak freeze ·
15 themes with worlds and stories · avatar forms · timers · test-score quests ·
2× surprise quests · recurring quests · rewards and redemption · the 24-game
arcade · device pairing · cross-device sync · guilds · alliances · notifications ·
Stripe subscriptions · parental consent, export and deletion · allowance ledger ·
Charity Week · crash reporting

**⚠️ Needs real auth:** the owner-only MTRX console

> `docs/STATUS.md` had a stale row listing the Block Craft evolutions as
> "51 Volcanic, 101 Pale Cream, 200 Nether, 300 End Void". Corrected while
> writing this handoff — the real ladder is **125 / 175 / 250 / 399** and the
> Pale Cream world was deleted. Worth knowing that any older note or
> screenshot quoting those numbers is out of date.

---

## 17. Known gaps and what to do next

In the order they are worth doing.

### Carried over, not yet done

1. **Use it yourself for a week.** `docs/ROADMAP.md` puts this first and it
   still is. Cost nothing, worth more than anything below. It tests the
   product's weakest assumption: that a parent will open the app to approve.
2. **Owner-only MTRX console behind real auth.** Currently a client-side
   password, which is not security.
3. **Rewards tab: the two-column split.** Catalogue and redemptions side by
   side, with the live "1d 4h 23m" countdown. Designed, not built.
4. **Profile customisation and rare-drop chip rows.** Same.
5. **Per-level avatar art for the other 14 themes.** Block Craft has nine
   hand-made forms (`avatar-blockcraft-1` … `-399`). The others fall back to a
   generated motif. Slots are `avatar-<theme>-1/-10/-25/-50/-100` and
   `src/data/art.js` picks them up with no code change.
6. **Four arcade tiles still have no art:** Tennis Tour, Memory Match, Colour
   Chain, Stacker. Slot names are `game-<id>`.
7. **Grandparents chipping in** — partially built (`supporter_gift`,
   `supporter_view`, `supporter_family_id` exist in SQL). Task #4, in progress.
8. **"Something worth screenshotting"** — task #5, never started. The idea is a
   shareable moment at a level-up or a world unlock.

### Dropped deliberately

- My two vector MTRX marks were deleted — the owner had GPT finish the logo.
  `src/assets/brand/` now holds the supplied `mtrx-logo.webp` plus squared
  512/192/64 PNGs and a tight `mtrx-mark-512.png` used in the Horizon page.

### Open question with a measured answer

The owner wants the logo printed on a custom hardcover notebook. The current
cover design is **1009 × 1559**, which is **61% of the pixels** needed for a
5.5″ × 8.5″ cover at 300 DPI (needs 1650 × 2550). Its aspect ratio is exactly
right; its resolution is not. The finest glow lines and the smallest text
strokes land at **0.39 pt**, below what a press can hold reversed out on black.
Needs regenerating at 1650 × 2550 with a 2 pt minimum stroke and ⅛″ bleed.

---

## 18. House rules learned the hard way

Read this section before changing anything visual. Every line is a mistake that
was actually made in this repo.

1. **Change structure, not styling.** Asked repeatedly to match a design, the
   repeated failure was restyling buttons instead of rebuilding layout. "You are
   just changing the style of the buttons" is the feedback to avoid earning.
2. **Never cover hand-made art with generated art.** Done twice. Both times it
   was worse than what it replaced.
3. **A `position: fixed` element at `z-index: 0` paints above unpositioned
   content.** Backdrops need `-z-10`. This washed out every heading once.
4. **Sample colours away from a glow.** A patch colour averaged from a ring
   around a mark picks up that mark's own glow and comes out too pale — it
   painted a visible rectangle over a card and ate a line of body text.
5. **Reproduce before fixing, measure before claiming.** The stale-demo bug was
   reproduced by planting an old saved state first.
6. **Screenshot every visual change.** Do not assert that it looks right.
7. **Function-wrapping fails for IIFE, `const` and ES-module games.** Nothing
   lands on `window`. The four embedded HTML games needed DOM-based
   `MutationObserver` bridges instead.
8. **`.btn` carries no surface without a variant.** `btn` alone renders as bare
   text; use `btn-primary`, `btn-soft`, `btn-ghost`, `btn-danger`.
9. **An opponent that can see undealt cards is not difficult, it is broken.**
10. **Don't print the game's title inside the game** — the arcade header already
    shows it. The big type belongs to the score.
11. **Write for a non-coder.** Plain language, short answers, no code dumps
    unless asked.

---

## 19. File map

```
RankUp/
├── HANDOFF.md                  ← this file
├── README.md
├── docs/                       AI-CHECK BACKEND DECISIONS DEPLOY GAME-DESIGN
│                               LAUNCH LEGAL NOTIFICATIONS PAYMENTS ROADMAP
│                               STATUS SYNC
├── src/
│   ├── App.jsx                 router + nav definitions
│   ├── state/                  reducer.js · initialState.js · AppContext.jsx
│   ├── data/                   kidThemes · parentThemes · minigames · badges
│   │                           marketSkins · stickers · questTemplates
│   │                           legalText · art (the artwork slot registry)
│   ├── lib/                    xp · money · allowance · charity · aiVerify
│   │                           imaging · recurrence · billing · guilds
│   │                           alliances · coparents · pairing · referrals
│   │                           notifications · storage · router · dates
│   │                           demoFamily · avatarTiers · applyTheme · sync/
│   ├── screens/kid/            11 screens
│   ├── screens/parent/         11 screens
│   ├── components/             79 files
│   │   └── games/              24 games + pokerHands · cardRules · mergeBoard
│   │                           crewPuzzle · PlayingCard · ExternalGame
│   │                           external/ (supplied HTML games) · sports/
│   ├── assets/
│   │   ├── art/                slot-named artwork; README lists every slot
│   │   └── brand/              mtrx-logo.webp + squared PNGs
│   └── styles/index.css        606 lines; glass cards, pills, keyframes
├── supabase/                   16 .sql + test/ (24 .sql + up.sh + run.sh
│                               + mock-server.mjs)
├── api/                        10 serverless endpoints + _shared/
├── functions/api/[[route]].js  Cloudflare Pages adapter
├── horizon/                    the MTRX Horizon page, in git
├── tests/                      44 suites + helpers.mjs + screenshots/
├── scripts/slice-sheet.py      cuts a design sheet into per-tab images
└── marketing/ · public/
```

---

## 20. Starting a new Claude session on this

Paste this as the first message:

> I'm working on **RankUp**, a gamified chore app for kids. The repo is
> `github.com/rayan-baig/RankUp`, branch `claude/rankup-chore-app-8ofgut`.
>
> **Read `HANDOFF.md` in the repo root first** — it is a complete map of the
> project, written for exactly this handoff.
>
> Things to know about me and how I work:
> - I have no coding background. Plain language, short answers, no code dumps
>   unless I ask.
> - Run `npm install && npm run dev` and click "Have a look around" to see it.
> - Browser tests need `CHROMIUM_PATH` set.
> - Don't open pull requests unless I ask.
> - Before changing anything visual, read §18 of HANDOFF.md — it is a list of
>   mistakes already made here, and I don't want them repeated.
>
> [then say what you want done]

### Things a new session will get wrong without being told

- **It is not TypeScript, and that is on purpose.** Don't offer to convert it.
- **`play_minigame()`'s allow-list** must be updated for every new game, or the
  game silently never pays out and the browser shows nothing wrong.
- **The AI photo check must stay advisory.** Never make it auto-reject.
- **The demo rebuilds only on a `demoVersion` bump.** Rebuilding every load
  destroys whatever the visitor just did.
- **Light themes must stay light at every world.** A dark world behind
  dark-on-light text is a bug that already shipped once.
- **Artifacts published on the old account are private to it.** The repo is the
  portable thing; the preview links will not open.
