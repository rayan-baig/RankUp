# The test suites

Every suite is listed, file by file, in **`tests/run-suite.mjs`**, which runs it:

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| static | `npm run test:static` | nothing | Every setting the code reads is in `.env.example`; the Cloudflare route table matches `api/`; the scheduled jobs in `vercel.json`, `/api/health` and the jobs agree; the SQL files are in one order everywhere (`config.mjs`, `wiring.mjs`); RankUp shares nothing with the sites beside it on its parent domain: no cookie, no CORS, no wildcard in the policy, a service worker and a way back from Stripe that never lead to a sibling (`isolation.mjs`); the version has a CHANGELOG entry and is built in, never typed (`release.mjs`); every icon exists, the link preview's picture is a whole address or left out, robots.txt and the sitemap show only the front door (`sharecard.mjs`); every arcade game and sport has a short how-to line (`howtoplay.mjs`); the parent help page covers what parents ask, with the plan list's prices (`help.mjs`); the readable copy of a family's data escapes everything typed and reads both export shapes (`dataexport.mjs`); no price or trial length is typed by hand anywhere in `src/` (`prices.mjs`); what the plan screen says each plan gives is what the app enforces, and the yearly saving is the real difference (`planwords.mjs`); every notification's words fit a lock screen with the longest values, never shame, say what happened, and every link in a notice, the weekly digest, an email or Stripe's way back is a real screen that survives the Parent Mode PIN (`noticewords.mjs`); every email RankUp's own code sends (the trial reminders, a school's month, the error report), in every variant, has a plain-text part, no blank left unfilled, the MTRX Horizyn footer once, nothing wider than 600px, and the same words and links in both parts (`emails.mjs`) |
| smoke | `npm run test:smoke` | the dev server and the stand-in API | The app in a real browser, screen by screen |
| sync | `npm run test:sync` | the same | Two and three phones against a real Postgres |
| awards | `npm run test:awards` | Postgres | The rules, in Node, against the app's own code and the database |
| built | `npm run test:built` | a browser | The production build: no secrets in it, the security policy, the arcade's framed games |
| api | `npm run test:api` | `up.sh --cf` | Every function in `api/`, under the runtime Cloudflare uses, against stand-ins for Stripe and the email provider; a family's and a school's whole plan, start to finish (`billingwalk.mjs`) |
| SQL | `npm run test:db` | Postgres | About a thousand checks on the database rules (`supabase/test/`) |
| refusals | `npm run test:refusals` | Postgres | Every `{ ok: false, reason }` in the SQL is actually given while the SQL suite runs |

Each suite runs every file even after one fails, and ends with one line naming
the suite and the files that failed, e.g.
`SUITE FAILED: smoke (shard 2/3) — tests/arcade3.mjs`. Anything a file started
and left running (a preview server, a second dev server) is stopped when the
file ends. Useful options:

```bash
node tests/run-suite.mjs --list                    # every suite and its files
node tests/run-suite.mjs smoke arcade2 layout      # only these files
node tests/run-suite.mjs smoke --shard 2/3         # a third of it, as CI runs it
node tests/run-suite.mjs smoke --shard 2/3 --dry   # which files, without running them
```

A new test file has to be added to a suite there, or every suite refuses to run.

## What some of them check

They are not unit tests: most click through the app the way a person would and
then check what actually ended up in storage or in the database.

**`integrity.mjs`** guards the rules that keep the game honest:

- a chore pays out XP exactly once, even if a child reopens a submitted chore
  and tries to send it again
- a Dimension Lockout really ends when its timer runs out, and the history says
  "Expired" rather than claiming a parent lifted it
- a session pointing at a deleted child does not render a blank screen
- nothing is kept in the photo store an older version used

**`flows.mjs`** walks the everyday paths: send back → redo → accept.

**`firstten.mjs`** is a new family's first ten minutes on a fresh 390x844
window: front door to the first accepted chore on one phone, counting every
tap and typed box (at most 24), then "How RankUp works" shown once and
remembered, the first-week checklist ticking from real state and going once a
second browser pairs as the child's phone, and the child's home putting the
next quest above the fold.

**`packs.mjs`** holds the starter chore packs to their rules: Boss only for
teenagers, nothing Hard every day for under-12s, a day's chores near the
~150 XP the level curve expects, no race-the-clock on reading, nothing indoors
filed as Outdoor, and "done" never asking for a photo.

**`pairing.mjs`** runs two devices side by side — a parent tab and a kid tab on
`?device=kid`, which has its own separate storage — and checks the whole linking
flow: a wrong code is refused, five wrong guesses kill the code, a claimed code
cannot be reused, the kid device ends up in the right family, and a kid's device
has no Parent Mode and no openable theme lock.

**`sync.mjs`** is the important one: it runs a parent's phone and a child's
phone against a real Postgres and checks that a chore assigned on one appears on
the other, that "I did it!" reaches the parent with no picture attached, that
the accepted XP lands on the child's phone, and that the family goal is the same
on both. It needs the local backend running — see
[../supabase/test/README.md](../supabase/test/README.md).

**`guilds.mjs`** runs two unrelated families side by side and proves the rule
that makes guilds safe to ship: a child does not join until a parent on each
side has agreed. One parent approving alone is not enough. It also checks
that chat is tap-to-send only (no text box, nothing typed stored) and that a
quick message crosses families in words.

**`referrals.mjs`** is "Invite a family, get a free month" in the app: the
card in Settings with the family's code; once families have joined and one
pays, the card counts them and the free month, with no other family's name or
email anywhere; "You earned a free month" once on the dashboard, gone after OK
and a reload; the plan screen's copy; a Starter family's month shown as
banked; and no child's screen mentioning any of it. The Stripe side is the
"Bring a friend" part of `billingwalk.mjs`, the rules
`supabase/test/54-referral-rewards.sql`.

**`leaderboards.mjs`** is Adventure and Arena in the app: a new child is in
Adventure with no public board offered; a parent reads what Arena shows,
picks the country and switches it on; the child sees "Enter the Arena" once,
then the worldwide board's podium, their own place, the country board and
the highest-level board, with no real name anywhere; the nickname builder
has no text box and works once a week; back to Adventure from the child's
own phone takes them off at once. `leaderboardwords.mjs` and `quickchat.mjs`
(static) hold the word lists, countries, boards and quick chat library to
the database's copies and the rude-word filter.

**`rewardraces.mjs`** runs the app's own reducer as two phones against a real
Postgres, over two connections at once: the same reward bought on both while
offline (one charge, never below zero), one purchase retried while the first
try is still running, a purchase racing a tax, a reward deleted while a child
buys it offline, and "Mark given" tapped on two parents' phones together.
The one-call-at-a-time versions are `supabase/test/29-money-floor.sql`.

**`billingwalk.mjs`** walks one family, then one school, through a plan's
whole life in Stripe's test mode as the code sees it: subscribe monthly, renew,
a payment fails, a refund, cancel, subscribe again for a year. Checkout and the
billing portal ask a stand-in Stripe; every event is signed and posted to the
real webhook under workerd, some twice and some late. After each step: the
plan the database holds, the words on the plan screen and the dashboard, and
what the child can use (the plan their own phone works out, the XP a chore
pays, whether a second child can be added); for a school, whether its students
are in the league and what its admin is told.

**`rewardlimits.mjs`** runs the app's reducer as a child's phone and a
parent's, both offline, buying a reward with a weekly limit: the phone refuses
a tap past the limit, and when both sync at once the server lets only the
limit through, the other phone gets its coins back and is told why.

**`bundle.mjs`** builds the app with every server-only setting in
`.env.example` given a fake value (the service role key as a real-looking
token) and reads every file a phone would download: none of those values, no
service-role token, no server-only setting read by the code; and the
Content-Security-Policy is exactly the list in the test (the game scripts by
hash, the one Three.js file, the fonts, the database), so widening it fails
until the test is changed too. It also checks the host headers forbid the
camera, which RankUp does not use. Runs first in `npm run test:built`.

**`builtgames.mjs`** is the one suite that runs against a production build
rather than the dev server. The arcade's four standalone HTML games run in
sandboxed srcdoc frames, which live under the built page's
Content-Security-Policy — and the dev server has no policy, so a game the
policy refuses looks fine everywhere else. It builds the app into a scratch
folder, serves it with `vite preview`, plays each game in the look-around
family (no backend needed) and checks that it reports in, sends its score
back, stays sandboxed, trips no policy, and still opens once the server is
gone. `npm run test:built`; `BUILT_DIR=dist` serves an existing build instead.

**`guarantees.mjs`** (database) and **`offline.mjs`** (the phone, run under a
time zone with clock changes) check the promises about XP, sync and accounts:
levels 1-100 have one curve, two parents accepting at once pay double XP once,
a streak freeze covers the right day wherever the family is, a daily chore
comes back once a day across both clock changes, weekly chores come back on
the family's chosen day, "send back" leaves a chore as it was, two parents'
edits are last-write-wins with the replaced one kept on record, the cursor
cannot skip rows written together, thirty days offline loses nothing, a page
killed mid-send loses nothing, an expired sign-in renews on waking, removing a
co-parent or deleting a child cuts them off at once, and deleting the account
or withdrawing consent leaves nothing the privacy policy lists. It also times
the first sync for a family with a year of history.

**`devicewipe.mjs`** drives two browsers: a full phone says so and keeps
working, and an unlinked child's phone erases itself.

**`layout.mjs`** walks every parent and kid screen, every folded section
opened, at 390x844 and 360x740, for a family that has just finished setup and
for the busy look-around family. It fails on a page wider than the screen,
anything running off an edge, two controls (or words and a control) on top of
each other, words cut off without "…", and a code ("not_on_this_plan",
"undefined", "elite") where words belong; and checks a new family's empty
screens say something that makes sense for a family with nothing yet.

**`pinreset.mjs`** resets a forgotten PIN on a parent's phone: a wrong
password changes nothing, five wrong ones wait fifteen minutes, the right one
leads to a new PIN that then opens Parent Mode while the old one does not, and
a signed-out phone or a child's own phone offers no reset. The stand-in API
checks passwords for accounts signed up through it.

**`download.mjs`** downloads a family's data from the real app: two files,
the JSON and a readable summary, with this family's child, chores, history
and rewards, and nothing of a second family set up beside it.

**`plainsetup.mjs`** starts the app on its own ports with guilds and payments
switched off, and again with no backend at all, and finishes setup on each.

**`secretworlds.mjs`** takes a Block Craft child past each world's level and
checks no screen, label or picture description names a world before it is
reached, Hero's Return included until the dragon falls.

**`oldphone.mjs`** opens a phone that ran a version that took photos: the old
photo bucket and the photo-check fields are deleted, the chores kept.

**`arcadecap.mjs`** (database) plays the arcade on two phones at once and
proves the day's cap holds on the server, and that each game's score is held
to what that game allows in the time played. **`crashreport.mjs`** checks a
crash report carries no name, email, code, token or typed text.

**`battleperf.mjs`** is a measurement rather than a gate: every battle scene
with the CPU slowed four times, frame by frame. Run it before and after
changing how a scene is drawn. (`battles.mjs` checks, without a browser, that
a scene that cannot keep up draws fewer pixels.)

## Running them

Once, after `npm install`, download the browser the suites drive:

```bash
npx playwright install chromium
```

(or point `CHROMIUM_PATH` at a Chromium you already have). Then start the local
stack — Postgres, every SQL file, the stand-in for Supabase's API and the dev
server — and run a suite:

```bash
bash supabase/test/up.sh       # once per session; safe to run again
npm run test:smoke             # or any suite in the table above
```

`bash supabase/test/up.sh --cf` builds the app and serves it with the server
functions under workerd on :8788, for `npm run test:api`.

Screenshots land in `tests/screenshots/`. Set `BASE_URL` to test a deployed
site instead of localhost.

CI (`.github/workflows/ci.yml`) runs all of them on every push, in parallel:
one job for lint, build, static, SQL, refusals and the built app; the smoke
suite split three ways; sync with awards; and the API.
