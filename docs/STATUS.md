# What is real and what is not

Keep this file honest. A screen that looks finished but is not turns into a
promise you did not mean to make. Read it before showing RankUp to anyone.

Legend: ✅ works · 🟡 works, with a limit stated · ❌ not built

"Needs a backend" means Supabase is connected; without it everything runs on
one phone, with no account (see "On one phone only" below).

---

## The core loop

| Thing | Status | Notes |
|---|---|---|
| Parent assigns a chore | ✅ | Custom chores and three ready-made packs (ages 6–11, 12+, and adaptive), held to sensible sizes by `tests/packs.mjs` |
| Repeating chores | ✅ | Daily, school days, or weekly on the family's chosen day; they come back once a day on the family's own clock, across clock changes |
| Adaptive chores | ✅ | Their own difficulty and their own meaning of "done", per child |
| Child opens a chore and sees what it pays | ✅ | Every bonus itemised before they start, the test-score bonus included |
| Child taps **I did it!** | ✅ | No photo in the app. A parent who wants proof gets one from the child's own camera app, by message |
| Parent accepts or sends back | ✅ | Sending back puts it straight back on the child's list with the note. Two parents accepting at once pay once ("already decided on another device") |
| XP, levels, coins | ✅ | Paid only when a parent accepts, and decided by the server, not the phone |
| Streaks and streak freezes | ✅ | Counted on the family's own day. A lapsed streak no longer shows or pays |
| Level-up celebration | ✅ | On the child's own phone too, when the accept arrives by sync |
| Timer ("race the clock") chores | ✅ | Best times kept per chore |
| Test-score chores | ✅ | 80% or more earns a bonus; scores held to 0–100 |
| Surprise 2× XP chores | ✅ | Flagged at random when adding a pack, or by hand |
| Rewards shop | ✅ | Bought with coins. Rewards waiting to be given show on the parent's dashboard; "Mark given" counts once even from two phones |
| Family goal | ✅ | Shared XP towards one reward, counted from when it was set. The same goal and bar on both parents' and every child's phone ([SYNC.md](SYNC.md#the-family-goal)) |
| Daily login bonus | ✅ | Once a day, on the family's day |
| Pocket money | ✅ | A chore can carry a real price; a ledger of what is owed, payouts and gifts. RankUp never holds money: the parent pays and records it |
| System Override Protocol | ✅ | Currency Tax, Dimension Lockout, Red Security Lockdown. Never takes away XP, levels or streaks |
| Behaviour Blueprints | ✅ | Charts from this family's real, synced chores |
| A child's phone has no Parent Mode | ✅ | Not behind a PIN: not there at all |

## The child's game

| Thing | Status | Notes |
|---|---|---|
| 15 child themes | ✅ | Background, currency and avatar all change |
| Avatar with five forms | ✅ | Tap it and it reacts |
| Worlds that change with level | ✅ | Four per theme at levels 10/25/50/100, each with its own colours, sky and line of story |
| Block Craft's nine forms, story and battles | ✅ | Overworld to The Dragon (399). A battle scene per chapter; worlds stay secret until reached |
| Dragon boss fight | ✅ | Accepted chores hit the dragon; chores sent back, 48 idle hours and specials hit back. Worked out from synced chores and held by the server |
| Arcade | ✅ | 24 games. Tokens come only from finished chores (at most 5 held); at most 15 coins a day from games, counted on the family's day. The look-around family has unlimited tokens |
| Sunday Market and Flash Tickets | ✅ | Cosmetic skins on Sundays only, no countdown, every skin comes back. Flash Tickets are bought by a parent; prices fixed on the server |
| Elite cosmetics (frames, drop selectors) | ✅ | |
| 10 parent dashboard themes | ✅ | Colours only, by design |

## Family, accounts and money

| Thing | Status | Notes |
|---|---|---|
| Accounts | ✅ needs a backend | Parents sign in with email and password; a child's phone signs in anonymously and never has an account |
| Linking a child's phone | ✅ needs a backend | Six-digit code: 10 minutes, 5 wrong guesses, once only ([SYNC.md](SYNC.md)). Without a backend, two tabs of one browser |
| Sync between phones | ✅ needs a backend | Everything travels, offline first, through an outbox ([SYNC.md](SYNC.md)). Tested against real Postgres through a stand-in for Supabase's API; not yet against a live project |
| Unlinking a phone | ✅ | The unlinked phone erases what RankUp kept on it |
| Co-parents and supporters | ✅ needs a backend | Up to 6 adults. A second parent has the same rights; a supporter (a grandparent) sees how the children are doing and can give pocket money, nothing else |
| Parental consent | ✅ | Required before any child exists, enforced by the database. Notice version 2026-11 (no photos, no AI check); consents to older versions stand ([LEGAL.md](LEGAL.md)) |
| Download my data | ✅ | Everything the privacy policy lists, including the chore-edit history |
| Withdraw consent, delete a child | ✅ | Gone from the database at once; their phone erases itself |
| Delete my account | ✅ | Deletes the family and **cancels its Stripe subscription at once**; if Stripe is down, the daily job finishes it ([PAYMENTS.md](PAYMENTS.md#when-a-family-deletes-its-account)) |
| Plans: Starter, Standard, Elite | ✅ with Stripe | Monthly and yearly. Checkout, the webhook, the customer portal. The plan is written by Stripe's webhook and nothing else |
| Failed renewals and refunds | ✅ with Stripe | A failed renewal or a full refund drops the family to Starter and the dashboard says why ([PAYMENTS.md](PAYMENTS.md#refunds-and-failed-payments)) |
| Free trial | ✅ | 14 days of Elite for a new family, no card. Ends as Starter, which still runs the whole loop |
| Referrals | ✅ needs a backend | 30 days of Standard for both families, given when the invited family's first chore is accepted, not at sign-up |
| Charity Week | 🟡 | The week's total is worked out from real payments. Handing it to a charity is a bank transfer you make |
| Elite 1.5× XP | ✅ | In the reward calculation, on the server |
| Look-around family (the demo) | ✅ | Opens without an account and cannot reach a real one. Opens on "Start here": accept a chore, see the child's world, the arcade |
| The front door | ✅ | What RankUp is, the three prices and the 14-day trial on one phone screen, read from the same numbers as the plan screen |
| A new family's first ten minutes | ✅ | Two setup screens; "How RankUp works" once; a first-week checklist (a child, a phone, three chores, one accepted) that ticks itself and goes when done; one tap hands a shared phone to the child. Sign-up to first accepted chore is 24 taps, held by `tests/firstten.mjs` |

## Together with other families

| Thing | Status | Notes |
|---|---|---|
| Guilds | ✅ built, **off by default** | Invite codes, rosters, chat with a contact-detail guard and reporting. **A child joins only once a parent on each side approves.** On only if `VITE_GUILDS_ENABLED=true` |
| Parent Alliance and the 20% Discount Tournament | ✅ with Stripe | Real families, scores counted on the server. `api/settle-alliances.js` gives the winner a real Stripe credit monthly; **you have to schedule it** |
| The School League | ✅ built, charging once Stripe is connected | See below |

### The School League

| Thing | Status | Notes |
|---|---|---|
| School sign-up, priced by size | ✅ | `/school`. Starts on a 30-day trial |
| Join codes for parents and staff | ✅ | Only a parent can put a child in a school |
| District league | ✅ | Average per student, at most 8 chores a day each, accepted chores only |
| Rival schools | ✅ | At most three at a time; monthly results kept |
| School Stars (top ten) | ✅ | The admin checks the list before families see it; first names only with a parent's yes |
| Checking a school is real | ✅ | `/#/operator` with your `OPERATOR_SECRET`. Until verified, a school is in no league and sees no names |
| Charging schools | ✅ with Stripe | `api/school-checkout.js`, priced by the school's size; needs the eight `STRIPE_PRICE_SCHOOL_*` prices |
| Closing each month, the Champion's free month | ✅ | `api/settle-schools.js`, monthly. **You have to schedule it.** Safe to run twice |

Known limits, decided rather than missed:

- **Membership is counted when the month is closed**, not on its last day.
- **Five students can be one family.** The minimum counts children, not
  households.
- **The 8-a-day cap is by approval day.** A parent accepting a week's chores at
  once counts at most 8 that day.

## Notifications

| Thing | Status | Notes |
|---|---|---|
| On this phone, while RankUp is open | ✅ | Parent Settings → Notifications |
| Push to the family's other phones | ✅ needs VAPID keys | A chore done (to the parents), accepted or sent back (to the child), a guild request (to the parents on both sides), reminders and the weekly digest (to the parents). Exact words, limits and hold times: [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| Daily reminders with the app closed | ✅ | `api/send-reminders.js`, on each family's own clock. **You have to schedule it** |
| Weekly digest | ✅ | `api/send-digests.js`, Sunday evening in each family's time zone. **You have to schedule it** |
| A real phone receiving a push | 🟡 | Proven end to end against a stand-in push service (`tests/push.mjs`); not yet on a real phone |
| Notifications on a child's phone | ❌ | Only a parent's phone has the switch, so "Accepted!" and "Back on your list" reach no phone yet ([ROADMAP.md](ROADMAP.md)) |
| Guild request notice | ✅ needs VAPID keys | When a child asks to join a guild, the parents whose yes is still missing are told, in the child's family and in the guild's. Once per request; counted against each family's hourly ceiling |

## Not built

| Thing | What happens instead |
|---|---|
| Forgot password | You send a reset link from the Supabase dashboard |
| A scheduler on Cloudflare Pages | Pages cannot run jobs on a timer: use an outside scheduler or a small Worker ([LAUNCH.md](LAUNCH.md) section 2b). Vercel's schedule ships in `vercel.json` |
| Notifications on a child's phone, quiet hours | See above |

## No photos

RankUp never takes, sends or keeps a photo. It asks for no camera permission,
the host headers forbid the camera, and there is no picture on any phone or
server. Phones that ran an older version have the photos it kept there
removed the first time this version starts.

---

## On one phone only

With no Supabase configured, everything is saved in the browser's own storage.
It survives a refresh and a restart, but not clearing browser data, and no other
phone can see it: a parent's phone and a child's phone are two separate copies
of the app. That is fine for a one-phone demo. With Supabase, everything travels
between phones ([SYNC.md](SYNC.md)).

---

## Knowing it is working, without watching it

| Thing | Where |
|---|---|
| A broken change is caught before it ships | `.github/workflows/ci.yml`: lint, build, the SQL suite against a real Postgres (every refusal reason given, every file safe to run twice), the production build, the browser suites in three parallel shards, two-phone sync, the server functions under Cloudflare's runtime. About ten minutes |
| One screen crashing does not take the app down | `src/components/ScreenBoundary.jsx` |
| You hear about crashes on other people's phones | `supabase/crashes.sql`: the screen and the error, never a name |
| A scheduled job that stops being called | `/api/health` with the `CRON_SECRET`: each of the five jobs `ok`, `stale` or `never_run` |
| A deleted family's subscription still not cancelled | The same check: `billing_cancellations_overdue` |
| One address to point a monitor at | `GET /api/health` → `{"ok":true,"version":"…"}`, or 503 |
| What to do when one of them is red | [IF-SOMETHING-BREAKS.md](IF-SOMETHING-BREAKS.md) |

None of this fixes a bug for you. It means you hear about it from a dashboard
rather than from a parent.

---

## Deliberate rules, not gaps

- **Only a parent accepts.** There is no automatic checker and no auto-accept.
  A parent looks (at the chore, or a photo sent by message) and decides.
- **Adaptive chores are judged leniently.** They are written around one child's
  limits.
- **Overrides never remove XP, levels or streaks.** A parent can tax coins and
  lock the app; progress a child earned stays earned.
- **Parent themes change nothing but colours.** That is the promise in the
  pricing.
- **Real money is paid exactly as set.** No streak bonus, Elite multiplier or
  surprise double on pocket money.
