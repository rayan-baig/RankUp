# RankUp

Chores turned into a game, so parents stop nagging and kids stop dreading them.

A parent assigns a quest. The kid does it and taps **I did it!** If the parent wants
proof, the kid sends a photo from their own camera app, by message — RankUp itself
never takes or keeps photos. The parent taps **Accept** or sends it back. Accepting
awards XP and a currency that matches the world the kid chose.

RankUp is a **mobile-friendly web app**, not a native iOS/Android app. It runs in a
phone browser and can be added to the home screen. That choice is deliberate — see
[docs/DECISIONS.md](docs/DECISIONS.md).

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer. Then, in a terminal:

```bash
npm install     # once, downloads the libraries
npm run dev     # starts the app
```

Open the address it prints (usually `http://localhost:5173`).

To test on your actual phone, use the "Network" address it prints — your phone must be
on the same wifi.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app locally with instant reload while you edit |
| `npm run build` | Makes the optimised version in `dist/` that gets deployed |
| `npm run preview` | Serves the built version, to check it before deploying |
| `npm run lint` | Checks the code for obvious mistakes |
| `npm run test:smoke` | Drives the app in a real browser and checks the rules that keep the game honest — see [tests/README.md](tests/README.md) |

---

## Launching

Everything in the code is done. What remains needs your accounts and one
conversation with a lawyer: **[docs/LAUNCH.md](docs/LAUNCH.md)**.

## Read this before you show it to anyone

This build has a **complete, working core loop** and **several screens that are
deliberately fake**. Which is which is written down in
**[docs/STATUS.md](docs/STATUS.md)** — read that file before demoing, so you never
accidentally promise something that does not exist.

What is real now: accounts, two-device sync, payments through Stripe, the School
League, push notifications. What still needs a person rather than code before real
families use it (the operator's legal details, a lawyer on children's data, a real-phone
test of notifications) is listed in **[docs/LAUNCH.md](docs/LAUNCH.md)**, which is the
checklist to follow to go live.

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
api/
supabase/
  schema.sql       the database design, ready for when you wire up a backend
tests/
  integrity.mjs    browser tests for the rules that must never break
docs/              plain-language explanations of every decision
```

The single most useful thing to know: **all saving and loading goes through
`src/lib/storage.js`**. Moving to a real database means rewriting that one file, not
the rest of the app.

---

## Deploying it

To go live for real families, follow **[docs/LAUNCH.md](docs/LAUNCH.md)** from the
top: accounts, database, settings, scheduled jobs, legal. Cloudflare Pages is the
recommended host there. [docs/DEPLOY.md](docs/DEPLOY.md) covers a quick preview deploy
only.

---

## Documentation

| File | Answers |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | What actually works and what is a mockup |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why web app, why Vite, why localStorage first |
| [docs/SYNC.md](docs/SYNC.md) | Linking devices, and how data travels between them |
| [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) | Telling people when something happened |
| [docs/BACKEND.md](docs/BACKEND.md) | How to add accounts and sync with Supabase |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Getting it online |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | What subscriptions would actually take |
| [docs/LEGAL.md](docs/LEGAL.md) | COPPA, Kids Category, Play Families |
| **[docs/LAUNCH.md](docs/LAUNCH.md)** | **The checklist to get live — start here** |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Suggested build order from here |
| [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md) | XP curve, themes, tiers, guilds |
| [tests/README.md](tests/README.md) | What the smoke tests cover and how to run them |
