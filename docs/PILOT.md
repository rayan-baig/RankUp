# Pilot in RankUp

Pilot is the MTRX Horizyn AI helper. It runs on the parent's own AI key, from
their browser: RankUp's server never sees the key or the conversation. **How
Pilot works, the shared core and its files are described in the MTRX Horizyn
site's `docs/PILOT.md`** (repository rayan-baig/MTRX-Horizon). This page is
only what is different in RankUp.

## Where it is

- In **Parent Mode**, after the PIN, on every parent screen; on a phone the
  robot sits in the tab bar's own slot at its right end (`.tabbar-dock`), on
  no tab and on nothing on the screen; on a wider screen, beside the column.
- On a signed-out phone **only after "I'm a parent"**: the sign-up and the
  family's set-up (`useParentHere()` in Onboarding). **Never on the front
  door** or anything shown before someone says whose phone it is (0.26.0).
- On the gift and School League pages (`#/gift`, `#/gift/card`, `#/school`,
  `#/school/help`, `#/school/report`, `#/district`).
- **Never** on a child's screen (anything under `#/kid`, the PIN screen, the
  demo's Ava and Noah views), and never on a child's phone: set up, being set
  up (showing its code, or the "I'm a kid" screens), or unlinked from being one.

Two locks, both in `src/lib/pilotGate.js`: `pilotRoute` (the screen is one of
Pilot's) and `childMayHaveIt` (the app's state says a child could be holding
the phone: a child's phone, a child's profile chosen, or Parent Mode locked).
`useKidHere()` (`src/components/PilotGate.jsx`) covers the child's set-up
screens, before anything is in the state. Pilot's config passes the same
answer to the core as `kidView`, so `Pilot.mount` refuses and the engine
offers no tools. When Pilot stops being allowed (leaving Parent Mode, "Hand to
a kid"), its robot is taken out of the page before the next screen is drawn,
and an `html[data-pilot='off']` rule hides it even if it arrives late.

## Staying out of the way

Core 1.1.1 keeps the robot clear of the page's own words and buttons
wherever it is scrolled, of a box being typed in, and of everything in the
config's `avoid`: `[data-pilot-avoid]` (the tab bar, the set-up's sticky
buttons), `[data-pilot-primary]` (the dashboard's "chore waiting" card, the
plan buttons, every Settings row, Review's Accept and Send back, "Hand to a
kid") and `.demo-bar` (the demo's banner). In Parent Mode on a phone the
robot's place is the tab bar's own slot: `src/pilot/pilotRankUp.js` wraps the
core's `PilotMascot.placeNow` (without changing its files) to answer "bottom
right, not tucked away" while the slot is showing, because what scrolls
behind the bar is hidden by it. `gutter: false`: RankUp's screens keep their
own side padding.

## The moving robot

Core 1.1.0's moving robot is inside Pilot's own element, so it is only ever
where Pilot is: never on a child's screen or phone. When Pilot is put away it
is sent home and kept still first. It keeps still, and its files are never
fetched, under the browser's "reduce motion" (the core's rule) or RankUp's own
Settings → Reduce motion (`src/pilot/pilotRankUp.js` leaves the moving robot's
files off the core's tag, and sets the robot to Calm if the setting is turned
on later; `src/styles/index.css` stops the resting robot's float).

## The files

| File | What it is |
|---|---|
| `public/pilot/` | The shared core, **Pilot core 1.1.1** (MTRX Horizyn commit 8b0ecd7), copied unchanged with its robot pictures, layers and the 18 pictures in `poses/`. |
| `src/lib/pilotGate.js`, `src/components/PilotGate.jsx` | The only part in the first load: where Pilot may be, and fetching the rest once the page has loaded. |
| `src/pilot/pilotRankUp.js` | The config: the core's script tag, the screens, suggestions, `kidView`, hiding and showing, forgetting a family's chat. |
| `src/pilot/pilotKnowledge.js` | The knowledge pack and the "why RankUp" list, every number read from the app's own code. |
| `src/pilot/pilotTools.js` | The tools. |
| `public/pilot-rankup.js`, `public/pilot-rankup-pack.js` | The core's "app config" and "pack" files: they hand over to the two above. |
| `src/lib/pilotHosts.js` | The AI providers' hosts, for the security policy and the config. |

`src/pilot/` is one lazy piece of the build (`assets/pilot…`), which the
service worker never fetches ahead of time.

## Tools

Read: `whats_waiting_for_review`, `how_is_child_doing`, `rewards_set_up`,
`explain_this_screen`, `what_elite_adds`. With a confirm card first:
`add_chore`, `accept_chore`, `send_chore_back`, `add_reward`,
`add_starter_chores`. Each change is the same reducer action the parent's own
button dispatches (`ADD_QUESTS`, `APPROVE_SUBMISSION`, `REJECT_SUBMISSION`,
`ADD_REWARD`), checked against the reducer first; `pilotDispatch` refuses any
other action. Never: the plan or buying anything (Flash Tickets included),
Pause and limits, taking coins, deleting, removing a child, linking or
unlinking phones, messaging anyone.

## What is sent to the AI

Only when the parent sends a message, only to the provider they chose: their
message, the guide, the screen's name and a few counts (plan, number of
children, chores waiting). Children: only first names and chore titles, and
only when the parent typed them or a tool they asked for returned them. Never
an id, an age, a photo, a phone, accessibility notes or anything a child
typed. Children's names on the parent screens carry `data-pilot-private`, so
"Explain this screen" skips them, and every family name left on the screen is
replaced with `[name]` as well.

## Keys and signing out

Keys and chat use the core's storage under the prefix `rankup-pilot`. When the
family in a tab changes (signing out, deleting the account, leaving the demo)
Pilot forgets the chat, its memory notes and any key kept for that visit; a
key the parent chose to remember on the device stays until "Remove my keys".
On a child's phone everything under `rankup-pilot` is deleted.

## Updating the core

Copy every file of the newer core from the MTRX Horizyn site's `static/pilot/`
into `public/pilot/` unchanged, copy its `tests/js/pilot.test.js` without the
MTRX-only tests, and check the pose list in `src/pilot/pilotRankUp.js`.
`tests/pilot.mjs` fails if the core's files disagree on their version.

## Tests

`tests/pilot.mjs` (static), `tests/pilottools.mjs` (awards), `tests/pilotui.mjs`
(smoke), and the Pilot checks in `tests/bundle.mjs` and `tests/isolation.mjs`.
