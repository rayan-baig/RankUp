# RankUp

Chores turned into a game, so parents stop nagging and kids stop dreading them.

A parent assigns a quest. The kid does it and photographs the result inside the app.
An AI check flags anything that looks faked — as **advice**, never as a decision. The
parent approves or sends it back. Approval awards XP and a currency that matches the
world the kid chose.

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
on the same wifi. **The camera will not work over that plain `http://` address**; browsers
only allow camera access on `https://` or on `localhost`. Deploy it (below) to test the
camera on a real phone.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app locally with instant reload while you edit |
| `npm run build` | Makes the optimised version in `dist/` that gets deployed |
| `npm run preview` | Serves the built version, to check it before deploying |
| `npm run lint` | Checks the code for obvious mistakes |
| `npm run test:smoke` | Drives the app in a real browser and checks the rules that keep the game honest — see [tests/README.md](tests/README.md) |

---

## Read this before you show it to anyone

This build has a **complete, working core loop** and **several screens that are
deliberately fake**. Which is which is written down in
**[docs/STATUS.md](docs/STATUS.md)** — read that file before demoing, so you never
accidentally promise something that does not exist.

The three biggest gaps, in one line each:

1. **No accounts and no sync.** Everything is stored in one browser on one device. A
   parent's phone and a kid's phone see completely separate data. → [docs/BACKEND.md](docs/BACKEND.md)
2. **No real payments.** Switching between Standard and Elite flips feature flags. No
   card, no charge. → [docs/PAYMENTS.md](docs/PAYMENTS.md)
3. **Guilds, friends and the Parent Alliance are sample data.** Labelled as such
   everywhere they appear.

And one thing you must not skip: this is a kids' app, so **COPPA and the app-store
family policies apply before you collect one real child's data or take one real
payment**. → [docs/LEGAL.md](docs/LEGAL.md)

---

## What is in this repository

```
src/
  data/            the 15 kid themes, 10 parent themes, quest packs
  lib/             game rules (XP, levels), the photo checks, storage, routing
  state/           the single store: what the app knows and how it changes
  components/      reusable pieces (buttons, cards, avatar, camera, charts)
  screens/         one file per screen, split into kid/ and parent/
api/
  verify-photo.js  the server-side Claude vision call (see docs/AI-CHECK.md)
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

Push this repository to GitHub, then connect it to [Vercel](https://vercel.com) or
[Netlify](https://netlify.com). Both detect Vite automatically and deploy on every
push. Step-by-step: [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Documentation

| File | Answers |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | What actually works and what is a mockup |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why web app, why Vite, why localStorage first |
| [docs/BACKEND.md](docs/BACKEND.md) | How to add accounts and sync with Supabase |
| [docs/AI-CHECK.md](docs/AI-CHECK.md) | How photo verification works and how to turn on the Claude layer |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Getting it online |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | What subscriptions would actually take |
| [docs/LEGAL.md](docs/LEGAL.md) | COPPA, Kids Category, Play Families |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Suggested build order from here |
| [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md) | XP curve, themes, tiers, guilds |
| [tests/README.md](tests/README.md) | What the smoke tests cover and how to run them |
