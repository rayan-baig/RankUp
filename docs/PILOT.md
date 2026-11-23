# Pilot in RankUp

Pilot is the MTRX Horizyn AI helper. It runs on the parent's own AI key, from
their browser: RankUp's server never sees the key or the conversation. **How
Pilot works, the shared core and its files are described in the MTRX Horizyn
site's `docs/PILOT.md`** (repository rayan-baig/MTRX-Horizon). This page is
only what is different in RankUp.

## Where it is

- In **Parent Mode**, after the PIN, on every parent screen; on a phone the
  robot sits in the tab bar's own slot at its right end (`.tabbar-dock`), on
  no tab and on nothing on the screen; on a tablet, beside the column; on a
  computer (1100px and up), in the same slot at the foot of the sidebar the
  tab bar becomes there (0.29.0).
- On a signed-out phone **only after "I'm a parent"**: the sign-up and the
  family's set-up (`useParentHere()` in Onboarding). **Never on the front
  door** or anything shown before someone says whose phone it is (0.26.0),
  and **not on sign-up's step 2** ("Your kid picks a world"), where the child
  may be holding the phone (0.27.0); back on step 1 it returns.
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

The core (1.1.1 and later) keeps the robot clear of the page's own words and buttons
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

Off the slot (the parent's set-up, the gift and School League pages, a
tablet) the core places the robot. Since core 1.4.0 a phone tries the bottom
corners first, counts a bar that stays put as busy, and takes a top corner
only where it covers no link or button; core 1.3.0 tucked it into the top
right of the gift page, over the page's own button. In the slot nothing
changed: `dockedPlace` answers first, and the core's new "tucked until the
first scroll" on a small screen never applies there. RankUp had no
placement workaround of its own for 1.4.0 to replace: `dockedPlace` stays
(the core can't know the slot is the robot's own place, and 1.4.0 would
count the fixed tab bar as busy), and so does the avoid list, which marks
the buttons a parent taps most rather than working round a corner.

Core 1.4.1 (RankUp 0.32.0) hides the robot rather than cover a link, a
button or a bar that stays put on a phone, and keeps it in one bottom corner
while a page is scrolled. In the tab bar's slot nothing changes:
`dockedPlace` still answers first. Off the slot (the parent's set-up, the gift
and School League pages) the core's new rules apply as they are.

Core 1.4.2 (RankUp 0.33.0) hides the robot on a computer too rather than
touch a link, and then shows a **handle** at the screen's edge (a slice of
the robot, a 44px button that opens Pilot) once the page is still. In
Parent Mode neither happens: `dockedPlace` answers first and never says
"hide", so the robot is always in its slot; the handle can show only off
the slot (the set-up, gift and School League pages). RankUp leaves
`handle` on. It moves nothing by `--pilot-keep-d`, so 1.4.2's
`--pilot-keep-dy` needs nothing from it.

On a computer (1100px and up, 0.29.0) Parent Mode's tab bar is a sidebar down
the left edge, and the slot is at its foot: `dockedPlace` answers "bottom
left" when the slot is on the left half of the window, so the robot sits in
the sidebar (`src/styles/index.css` puts it 8px in). Since 0.33.0 the chat
window is **docked down the right edge** there, the whole height
(`--rk-dock`, 372 to 420px wide), and while it is open the screen moves over
by its width (`padding-right` on the page, from `data-pilot-open="on"` on
the root, which `pilotRankUp.js` sets from the core's own `pilot-open` class),
so it is never over a card. Below 1400px the dashboard drops to one column
and the plans to one card a row while it is open (`useRootFlag('pilotOpen')`
in `ParentDashboard.jsx`, `.plan-cards`). Before, it opened beside the
sidebar, over the left of the screen (the Free plan's card). This needs no
core option: it is RankUp's own style on the core's window.

Core 1.2's options, as RankUp sets them (0.28.0; the first look back on in 0.28.1):

- `keepInViewport: true`: where the robot tucks away (a wide screen, the
  parent's set-up, the gift and School League pages) it shrinks into its
  corner instead of hanging off the edge. In the tab bar's slot it is never
  tucked, so this changes nothing there.
- `modals: ['[data-pilot-modal]']`: the robot steps back while a pop-up is
  open. RankUp's pop-ups are dialogs (the `Modal` in `components/ui.jsx`, the
  Season and Arena moments), which the core already knows; the one that isn't,
  the "sign in again" sheet in `components/SyncBadge.jsx`, carries
  `data-pilot-modal`. The pop-up check comes before `placeNow`, so it works in
  the slot too.
- **The first look is on** (no `revealMs`, so the core's 4 seconds): on a
  visit's first page the robot shows whole, with a glow, so a parent notices
  it. In the tab bar's slot it is never tucked away anyway, so there the first
  look adds only the glow. 0.28.0 set `revealMs: 0`, because core 1.2.0 put
  the class `pilot-hello` on Pilot's root for those seconds, the same class as
  the window's greeting bubble: a parent who tapped the robot then got the
  bubble's style on the whole of Pilot (`position: relative` took the robot
  out of the slot and below the screen). Core 1.2.1 (0.28.1) names it
  `pilot-revealing`, so the override is gone; `tests/fixes28.mjs` checks the
  root's class is one the window never styles, and `tests/fixes28ui.mjs`
  opens Pilot during the first look at 375px and 1440px.

## Pilot's welcome (0.28.0)

Since core 1.2.0 a website can make the welcome its own, and RankUp does
(`src/pilot/pilotRankUp.js`):

- **Tagline:** "Your family's chore helper" (one line, even at 320px).
- **Five pills** (`welcomePills`): **What's waiting for me?**, **Add a chore
  for…**, **How is my kid doing?**, **Explain this screen** and **Add my AI
  key** (key settings). Since 0.31.0 (core 1.4.0) the first four need no key
  at all: see **Useful before a key** below. With no key, a question the
  parent types (or an AI suggestion) stays in the box, key settings open
  ("Your message is waiting in the box…") and it is sent the moment a key is
  saved.
- **This screen's suggestions** (`chips`): the core now shows them on the
  welcome too, under the pills. There RankUp leaves out what a pill already
  does, and any suggestion that ends on a gap for the parent to finish (only a
  pill can leave words in the box): on Home all three are pills, so none show;
  on Review "Which chore is oldest?" does. Once a chat has started, with a
  key, the suggestions are the whole list again ("What's waiting for me?" and
  "Add a chore for…" first, then one for the screen); with no key (0.33.0)
  what a pill does stays out, since core 1.4.2 offers the pills again under
  every answer of RankUp's own, and two items with the same answer would
  leave a typed question tied between them. A suggestion carries the `id`
  of the pill that does the same (`welcomeChips`).
- **Chat keys only** (`hideKeySections: ['image', 'video']`): RankUp has no
  use for pictures or videos made by an AI.
- **The key, asked for once** (core 1.3.0, RankUp 0.29.0): because RankUp's
  pills include the core's key-settings pill, the core shows no "AI key" card
  under them as well, and calls it an "AI key" (a website's words, not the
  design's "Bring Your Own API Key"). Above the message box the welcome shows
  `keyNoteShort`, one line ("AI keys are for grown-ups (18+)."); the whole
  `keyNote` stays in the key settings, in help and on that line's tooltip.
  Since core 1.4.1 the one line stays for the whole chat, with **More** to open
  the whole note, and the welcome's pills come back in a small row under an
  answer of RankUp's own.

## Useful before a key (core 1.4.0, RankUp 0.31.0)

Core 1.4.0 lets a pill or a suggestion be an `answer` (shown at once as
Pilot's message, through the core's safe renderer, with no key and no network
call) or a `link` (a page of this site: Pilot closes and goes there).
RankUp's answers are built in the parent's browser, when asked, from the
family's own data (`src/pilot/pilotAnswers.js`, pure functions of the state):

| Pill or suggestion | What it does with no key |
|---|---|
| **What's waiting for me?** | How many chores are waiting for review, and each chore's name with how many of it (oldest first, eight at most, then "and N more"), with **Open Review**. |
| **Add a chore for…** | Opens Assign (`#/parent/assign`), where the child is picked. |
| **How is my kid doing?** (and the suggestion **How are the kids doing?**) | The dashboard's **This week** numbers (`lib/thisWeek.js`): chores done, XP earned and days in a row, each beside last week in words, for the whole family, with links to Kids and Review. |
| **Explain this screen** (and **What can I do here?** on a screen with no suggestion of its own) | That screen in a few plain sentences (one for every screen Pilot is on), with what is on it now as counts: children, chores to do, waiting for review. With a key it adds "Ask me anything about it in the box below." |
| **What does Elite Pass add?** (the plan screen) | Elite's extras by name, from the plan list, with a link to the plan screen. |
| **How does RankUp work?**, **Is it safe for my kids?**, **What do the plans cost?** (the parent's set-up) | The loop, the privacy promises, and the prices from `TIERS` with the trial. |

**Every suggestion with no key (0.32.0).** The prompts that take the AI
("Accept the oldest one" on Review, "Add 3 starter chores" on Assign, "Add a
reward" on Settings and Rewards) are AI prompts only once there is a key
(`keyOr` in `pilotRankUp.js` asks `Pilot.ready()`); before then each is
answered, and since 0.33.0 the two that would promise what only the AI can
do ask what RankUp answers instead: **Which chore is oldest?** (the chore
by name, how long it has waited, and an **Open it** link to Review, where it
is at the top) and **Where are the quest packs?**. Pocket money, pauses and
linking a phone, and the gift and School League pages' questions, are
answered at once with or without a key.

**"Summarise this" (core 1.4.2, RankUp 0.33.0).** The core shows its own
"Summarise this" (which asks the AI) only once a key is set, and takes an
app's own in its place: `config.screenChip`. RankUp's is a getter: with no
key `{ label: 'Summarise this', answer }` (`summaryAnswer`: the screen's
numbers as short points, then one **Next:** step for that screen, never a
repeat of "Explain this screen"); with a key nothing, so the core's own asks
the AI. 0.32.0 caught the tap on the core's chip with a listener and wrote
into the chat itself; that is gone.

**A typed question with no key (core 1.4.2).** The core compares what is
typed with RankUp's own answers and links and, when one clearly fits, shows
it at once under "Here's what I can tell you without an AI key:" (nothing is
sent). Each pill and suggestion carries `match` words for this ("pending",
"review" and "approve" for what's waiting; "oldest" and "first" for the
oldest chore; and so on, in `pilotRankUp.js`); anything else still waits in
the box for a key. `tests/fixes33.mjs` runs a list of questions through the
core's own `matchTyped`.

**Each screen explained (0.32.0).** Every parent screen has its own words and
its own "Right now" counts (`SCREEN_HELP` in `pilotAnswers.js`): Review the
chores waiting and the oldest; Rewards (`#/parent/rewards`, Settings opened
at the rewards) the rewards and what they cost; Plans the plan in words that
can all be true (0.33.0: "you're trying Elite Pass free — 14 days left",
"you pay for Standard", "you're on Starter, the free plan", or in the demo
"you're on Elite Pass in the demo (nothing is charged)") and the room for
children; Kids the levels and linked
phones; and so on. A page that is not one of RankUp's says so, with a link
Home. While Pilot is open and the screen changes (it stays open beside the
page on a computer), the suggestions are redrawn for the new screen
(`Pilot.changed()`).

Under an answer, while there is no key, the core shows **"Want more? Add your
AI key to ask anything."** (`answerMore`) with Key settings, once per chat
since core 1.4.1. Links in an answer are RankUp's own screens
(`/#/parent/…`), and open in the same tab.

**No names in an answer.** An answer stays on the phone when it is shown;
since core 1.4.1 it never goes to the parent's AI company either, not even
once a key is added (the core sends a stand-in, "(Pilot showed a built-in
answer)", in its place). As a second guard the answers still use counts and
chore titles only, never a child's, the family's or a grown-up's name; every
chore title loses any markdown of its own and goes
through `withoutNames` (a title like "Help Noah with his bike" is shown as
"Help [name] with his bike"). On a page with no family yet (the parent's
set-up), the family answers say what they will show once the family is set
up.

0.27.0 did the suggestions and the hidden key sections from RankUp's own files
(a row put into the welcome by a MutationObserver, and a style rule); both are
gone, and `tests/fixes28.mjs` checks they stay gone.

## The moving robot

The moving robot (core 1.1.0 and later) is inside Pilot's own element, so it is only ever
where Pilot is: never on a child's screen or phone. When Pilot is put away it
is sent home and kept still first. It keeps still, and its files are never
fetched, under the browser's "reduce motion" (the core's rule) or RankUp's own
Settings → Reduce motion (`src/pilot/pilotRankUp.js` leaves the moving robot's
files off the core's tag, and sets the robot to Calm if the setting is turned
on later; `src/styles/index.css` stops the resting robot's float).

## The files

| File | What it is |
|---|---|
| `public/pilot/` | The shared core, **Pilot core 1.4.2** (MTRX Horizyn commit a1c9253), copied unchanged with its robot pictures and layers (and since 1.4.1 the same in the sizes a phone draws them, named on the script tag as `robotSet` and `rest*Set`), and the 18 pictures in `poses/`. |
| `src/lib/pilotGate.js`, `src/components/PilotGate.jsx` | The only part in the first load: where Pilot may be, and fetching the rest once the page has loaded. |
| `src/pilot/pilotRankUp.js` | The config: the core's script tag, the welcome (tagline and pills), the screens, suggestions, `kidView`, hiding and showing, forgetting a family's chat. |
| `src/pilot/pilotAnswers.js` | The answers Pilot gives with no key (core 1.4.0): what's waiting, This week, each screen explained with its own counts, its summary, each screen's own suggestion, Elite, the plans. |
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
MTRX-only tests, check the pose list in `src/pilot/pilotRankUp.js`, and
update the files' fingerprints in `tests/fixes28.mjs`. `tests/pilot.mjs` fails
if the core's files disagree on their version.

## Tests

`tests/pilot.mjs`, `tests/fixes28.mjs` and `tests/fixes31.mjs` (static),
`tests/pilottools.mjs` (awards), `tests/pilotui.mjs`, `tests/fixes28ui.mjs`
and `tests/fixes31ui.mjs` (smoke), and the Pilot checks in `tests/bundle.mjs`
and `tests/isolation.mjs`.
