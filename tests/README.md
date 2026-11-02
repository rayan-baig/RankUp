# Smoke tests

These drive the real app in a real browser and check the things that would be
expensive to get wrong. They are not unit tests — they click through the app the
way a person would and then assert on what actually ended up in storage.

**`integrity.mjs`** guards the rules that keep the game honest:

- a chore pays out XP exactly once, even if a kid reopens a submitted quest and
  tries to send a second photo
- a Dimension Lockout really ends when its timer runs out, and the history says
  "Expired" rather than claiming a parent lifted it
- a session pointing at a deleted kid does not render a blank screen
- removing a kid removes their stored photos

**`flows.mjs`** walks the everyday paths: send back → redo → approve, and
completing a quest that needs no photo.

**`pairing.mjs`** runs two devices side by side — a parent tab and a kid tab on
`?device=kid`, which has its own separate storage — and checks the whole linking
flow: a wrong code is refused, five wrong guesses kill the code, a claimed code
cannot be reused, the kid device ends up in the right family, and a kid's device
has no Parent Mode and no openable theme lock.

**`sync.mjs`** is the important one: it runs a parent device and a kid device
against a real Postgres and checks that a quest assigned on one appears on the
other, that photo proof comes back, and that approved XP lands on the kid's
phone. It needs the local backend running — see
[../supabase/test/README.md](../supabase/test/README.md).

**`guilds.mjs`** runs two unrelated families side by side and proves the rule
that makes guilds safe to ship: a child does not join until a parent on each
side has agreed. One parent approving alone is not enough. It also checks the
contact-detail guard and that a normal message crosses families.

**`builtgames.mjs`** is the one suite that runs against a production build
rather than the dev server. The arcade's four standalone HTML games run in
sandboxed srcdoc frames, which live under the built page's
Content-Security-Policy — and the dev server has no policy, so a game the
policy refuses looks fine everywhere else. It builds the app into a scratch
folder, serves it with `vite preview`, plays each game in the look-around
family (no backend needed) and checks that it reports in, sends its score
back, stays sandboxed, trips no policy, and still opens once the server is
gone. `npm run test:built`; `BUILT_DIR=dist` serves an existing build instead.

## Running them

Playwright is deliberately **not** a dependency of this project — it downloads a
whole browser, and someone who just wants to run the app should not pay that
cost. Install it only when you want to run the tests:

```bash
npm install -D playwright
npx playwright install chromium
```

Then, with the app running in another terminal:

```bash
npm run dev          # terminal 1
npm run test:smoke   # terminal 2
```

The database rules have their own suite, which needs no browser at all:

```bash
npm run test:db
```

And the cross-device loop, once the local backend is up:

```bash
npm run test:sync
```

Screenshots land in `tests/screenshots/`. Set `BASE_URL` to test a deployed
site instead of localhost.
