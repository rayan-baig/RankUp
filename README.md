# RankUp

Chores turned into a game, so parents stop nagging and kids stop dreading them.

RankUp is a product of **MTRX Horizon**. It lives at `rankup.<your domain>`, a
subdomain of the company's domain, so it is a site of its own beside the
company's others.

A parent assigns a quest. The kid does it and taps **I did it!** If the parent wants
proof, the kid sends a photo from their own camera app, by message — RankUp itself
never takes or keeps photos. The parent taps **Accept** or sends it back. Accepting
awards XP and a currency that matches the world the kid chose.

RankUp is a **mobile-friendly web app**, not a native iOS/Android app. It runs in a
phone browser and can be added to the home screen. That choice is deliberate — see
[docs/DECISIONS.md](docs/DECISIONS.md).

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer and git. Then, in a terminal:

```bash
git clone <this repository's address> rankup
cd rankup
npm install     # once: downloads the libraries
npm run dev     # starts the app
```

Open the address it prints (`http://localhost:5173`) and tap **Have a look
around** for a ready-made family, or set one up yourself. Nothing else is
needed: with no settings, the whole app runs on this one device and keeps its
data in the browser.

To try it on your phone, start it with `npm run dev -- --host` and open the
"Network" address it prints; the phone must be on the same wifi.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app locally, reloading as you edit |
| `npm run build` | Makes the optimised version in `dist/` that gets deployed |
| `npm run preview` | Serves that built version, to check it before deploying |
| `npm run lint` | Checks the code for obvious mistakes |
| `npm run test:static` | Quick checks that need nothing running: every setting is documented, the routes and scheduled jobs line up |

The full test suites (a real Postgres, a browser, the server functions) need a
little more set up first; [tests/README.md](tests/README.md) says how, and
[docs/LAUNCH.md](docs/LAUNCH.md#running-the-tests) lists every command.

---

## Launching

Everything in the code is done. What remains needs your accounts and one
conversation with a lawyer: **[docs/LAUNCH.md](docs/LAUNCH.md)**.

## Read this before you show it to anyone

This build has a **complete, working core loop** and **several screens that are
deliberately fake**. Which is which is written down in
**[docs/STATUS.md](docs/STATUS.md)** — read that file before demoing, so you never
accidentally promise something that does not exist.

What is real now: accounts, syncing between phones, payments through Stripe,
push notifications and reminders, the School League, and deleting an account
(which cancels its subscription). What still needs a person rather than code
before real families use it (your legal details, a lawyer or Safe Harbor on
children's data, a real-phone test of notifications) is in
**[docs/LAUNCH.md](docs/LAUNCH.md)**, the checklist to follow to go live. If
something goes wrong after that: **[docs/IF-SOMETHING-BREAKS.md](docs/IF-SOMETHING-BREAKS.md)**.

---

## What is in this repository

```
src/
  data/            the 15 kid themes, 10 parent themes, quest packs
  lib/             game rules (XP, levels), storage, routing
  lib/sync/        device pairing — the local and Supabase backends
  state/           the single store: what the app knows and how it changes
  components/      reusable pieces (buttons, cards, avatar, charts)
  screens/         one file per screen, split into kid/ and parent/
api/               the server functions: payments, push, the scheduled jobs, health
functions/         how Cloudflare Pages serves api/ (Vercel serves it directly)
supabase/          the database, one .sql file per feature, run in the order in docs/LAUNCH.md
supabase/test/     the SQL test suite and the local stand-in for Supabase
tests/             the browser and Node test suites (tests/run-suite.mjs lists them)
docs/              plain-language explanations of every decision
```

The single most useful thing to know: **every change goes through the reducer in
`src/state/reducer.js`**, is saved on the phone (`src/lib/storage.js`), and, with a
backend, reaches the server through the outbox in `src/lib/sync/`
([docs/SYNC.md](docs/SYNC.md)).

---

## Deploying it

To go live for real families, follow **[docs/LAUNCH.md](docs/LAUNCH.md)** from the
top: accounts, the address, database, settings, scheduled jobs, legal. Cloudflare
Pages is the recommended host there. [docs/DEPLOY.md](docs/DEPLOY.md) covers a quick
preview deploy only.

**The address** is `https://rankup.<your domain>`: a `CNAME` named `rankup` at the
company domain's DNS, pointed at the host, then the host's custom-domain step, which
also issues the https certificate. A subdomain rather than a path, so RankUp's
storage, sign-in and service worker are its own; RankUp sets no cookie and trusts no
sibling site (`tests/isolation.mjs`). Everything that names the address
(`PUBLIC_SITE_URL`, Supabase's Site URL and redirect URLs, the Stripe webhook, the
MTRX Horizon console's `RANKUP_URL` and `RANKUP_STATS_URL`, and email sent from
`no-reply@rankup.<your domain>` with SPF, DKIM and DMARC set once on the parent
domain) is listed in [LAUNCH.md, section 1a](docs/LAUNCH.md#1a-the-address-rankupyour-domain-half-an-hour-most-of-it-waiting).

---

## Documentation

| File | Answers |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | What actually works and what is a mockup |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why web app, why Vite, why localStorage first |
| [docs/SYNC.md](docs/SYNC.md) | Linking devices, and how data travels between them |
| [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) | What RankUp tells people, when, in what words, and the limits |
| [docs/BACKEND.md](docs/BACKEND.md) | How to add accounts and sync with Supabase |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Getting it online |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Plans, Stripe, refunds, and what happens to billing when a family leaves |
| [docs/LEGAL.md](docs/LEGAL.md) | COPPA, Kids Category, Play Families |
| **[docs/LAUNCH.md](docs/LAUNCH.md)** | **The checklist to get live — start here** |
| [docs/IF-SOMETHING-BREAKS.md](docs/IF-SOMETHING-BREAKS.md) | What each health signal means, and the first thing to do |
| [docs/BACKUPS.md](docs/BACKUPS.md) | Backups, and how to practise a restore |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is left, in order |
| [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md) | XP curve, themes, tiers, guilds |
| [tests/README.md](tests/README.md) | What each test suite covers and how to run it |
