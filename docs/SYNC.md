# Linking phones, and how a family's data travels between them

A child's phone shows a **six-digit code**. A parent types it into their own
phone. After that, everything the family does travels between their phones
through the server, and keeps working with no signal.

All of this needs Supabase (see [BACKEND.md](BACKEND.md)). Without it, each
phone is a separate copy of the app and "pairing" links two tabs of one
browser, for trying it out.

---

## Linking a child's phone

**On the child's phone**

1. Open RankUp and choose **"I'm a kid"**.
2. Type a first name and pick a theme.
3. A six-digit code appears, with a "waiting for your grown-up" screen.

**On the parent's phone**

4. Settings → **Link a kid's device**.
5. Type the six digits.
6. Done: the child joins the family and their phone opens on their own home
   screen, in the theme they chose.

A child's phone **never creates an account**: no email, no password. It signs
in anonymously, and the parent's family is the account.

### Why six digits is safe enough

| Rule | Why |
|---|---|
| Expires after **10 minutes** | The window to try codes is short. (The server refuses anything outside 1 to 30 minutes.) |
| Dead after **5 wrong guesses** | Five tries out of a million |
| Works **once** | A code seen over someone's shoulder is useless afterwards |
| A parent's phone may try **10 codes in 10 minutes** | Guessing across many codes is slow too |
| Drawn with `crypto.getRandomValues`, by rejection sampling | Old codes say nothing about the next one, and no code is likelier than another |

Every rule is enforced in the database (`claim_pairing_code`), so a changed app
cannot skip them, and two parents cannot claim one code at the same moment.
`pairing_codes` has no read policy at all: a readable table would hand out
every live code.

### Nothing is kept before a parent says yes

During the waiting screen the child's phone holds a first name and a theme,
nothing else: no chores, no XP, nothing sent anywhere. The moment a parent
enters the code is the moment consent exists ([LEGAL.md](LEGAL.md)). Keep this
rule if you change the screen.

### A second phone for the same child

A profile that already has a phone keeps it. Pairing another phone under the
same name makes a **new** profile, and the parent's confirmation says so.
Whether a child has a phone is read from the server (`kids.user_id`), so every
parent's phone agrees, the co-parent's included.

### What a parent is told when a code does not work

One sentence per refusal `claim_pairing_code` gives, each saying what to do
next (`CLAIM_ERRORS` in `src/lib/pairing.js`; `tests/pairing.mjs` fails if a
reason has no words of its own):

| Reason | Told |
|---|---|
| `not_found` | The numbers match no phone waiting; check them against the child's screen |
| `expired` | Codes last 10 minutes; tap "New code" on the child's phone (which says the same) |
| `blocked` | Typed wrong 5 times; tap "New code" |
| `already_linked` | That phone is already in **your** family; nothing more to do |
| `claimed` | That phone is linked to another family, which is never named; it has to unlink it first |
| `revoked`, `too_many` | The code was cancelled; too many wrong codes from this phone, wait ten minutes | To
move a child to a new phone (including the same phone after "Add to Home
Screen", which starts with empty storage): unlink the old phone first, then
link the new one.

---

## What travels, and how

Chores, submissions, accepts and send-backs, XP and coins, rewards and
redemptions, notes, overrides (taxes and lockouts), the family's plan, the
**family goal** and the children's **own themes** all travel between every
phone in the family.

**Every change is saved on the phone first** and put in the phone's
**outbox**, then sent in order. Each phone asks the server for "everything
since I last looked" every 8 seconds while things are happening, slowing to
every 20 seconds when nothing is, and once a minute with the app in the
background. Touching the screen, coming back online or switching back to the
tab asks at once.

Some things are only ever decided by the server, never by a phone: XP, coins,
streaks, arcade tokens and skins, whether a chore is accepted, and what it
paid. A phone asks (submit, accept, buy, play) and the server answers. A
phone cannot write those numbers directly, so editing them in a browser
changes nothing.

### The outbox rules

- **In order.** Nothing overtakes a change that is waiting to be retried: a
  submission and the accept that answers it arrive in that order.
- **No signal never counts.** A phone with no connection simply waits. A phone
  offline for thirty days delivers everything when it is back.
- **The server having trouble** (no answer, 5xx, an expired sign-in) means
  "wait and try again": after 4 seconds, then twice as long each time, up to 5
  minutes between tries. A change is given up only after **a full day of the
  server failing and at least 30 tries**. Waiting for somebody to sign in again
  does not count towards that day. When one is given up, the phone fetches the
  family afresh so it shows what the server really has.
- **The server down for a long time** (an hour, say). The phone asks less
  often, twice as long between rounds up to one a minute, and the sync line
  says "Server down since 3:40 PM · 5 saved on this phone"
  once it has been failing for a minute. The first round that gets an answer
  sends everything waiting at once, without each change sitting out the rest
  of its wait, and the line says "Back online · everything sent". So it is
  back within a minute of the server, by itself. An accept or a send-back
  whose answer was lost and is sent again by the same parent is answered as
  done, not as "decided on another device". `tests/outage.mjs` plays the hour.
- **The server saying no** (the change is not allowed) drops that change at
  once, says so on the phone where it matters (coins handed back, "already
  decided on another device"), and the phone fetches the family afresh.
- **Edits fold together.** Ten quick edits to one chore send one change, and
  only the fields that changed. A change already on its way is never folded
  into, so a slow connection cannot lose the second edit.
- **Every call is safe to send twice.** A phone killed mid-send sends again on
  restart; purchases, games, taxes and payouts carry an id the server
  recognises, so nothing is charged or paid twice. A chore sent twice is one
  chore, and an accept or send-back sent twice by the same parent is one.
- **Old history is let go of on the phone, never on the server.** Chores
  accepted or sent back more than 60 days ago, one-off chores done that long
  ago and notes read that long ago leave the phone once the server has them,
  so a year of chores does not fill it (`src/lib/prune.js`). Nothing waiting
  to be sent, nothing it names, and nothing the badges or the dragon fight are
  counted from. `tests/storagegrowth.mjs` plays a busy year.
- **Storage full.** The app says so at the top of the screen and keeps working
  from memory, still sending what it can; the warning goes once a save works.
- **A pull never undoes a change still waiting to go.** If the server's copy of
  a row arrives while this phone has a change to that row in its outbox (or
  just tapped, and it is not in the outbox yet), the phone keeps its own copy;
  the server's comes back with the next pull, after the change has landed.
  This is what stops a child's coins jumping back up for a moment after a
  purchase, and a lifted lockdown coming straight back.

### Coins and rewards on more than one phone

A purchase takes the coins on screen at once and is settled by the server,
one at a time per child. Two phones buying with the same coins while offline
are charged for what the balance covers; the other purchase is refused, the
coins come back on that phone, and it says why ("by the time it reached the
server there were not enough coins left", or "taken off the rewards list
before your purchase arrived"). The balance can never go below zero, on the
server or on screen. "Mark given" tapped on two parents' phones gives the
reward once. `tests/rewardraces.mjs` and `supabase/test/29-money-floor.sql`
check all of it.

### The family goal

One goal per family, shared by both parents and every child's phone, with the
same bar on each.

- **Set, changed or cleared by a parent** on any phone; the others follow on
  their next pull. A child's phone shows it and cannot change it.
- **The bar counts from when the goal was set.** The server records where
  everybody's XP stood at that moment and counts from there, using its own
  numbers rather than a phone that may not have synced for a day.
- **Changing the target keeps progress**; a goal with a new name starts again
  from now.
- **Removing a child** takes their XP out of where the goal started too, so the
  bar does not collapse; what they earned towards it stays counted.
- **A goal set before goals were shared** (one parent's phone only) is sent up
  once, and kept only if the family has no goal yet: one set on another phone
  since stands.

`supabase/test/28-family-goal.sql` and `tests/familygoal.mjs` check these.

### A child's own themes (Theme Genesis)

A theme a child makes is a row of its own (`kid_themes`, in sync.sql), synced
like the others: saved on the phone first, sent through the outbox, pulled by
`family_snapshot`, deleted with a tombstone. A child's phone may write it
directly (it is the second table a child writes, after notes); row level
security holds them to their own themes, and a guard trigger to the look and
the names. The rest is the server's:

- **Seen only by the family.** A parent reads and writes every theme in the
  family, a child only their own, nobody else any. Never in a guild, a school
  or a league.
- **Five a child**, and every name checked against the rude-word list, by the
  phone and again by the database. A refused write is dropped and the family
  fetched afresh, like any refusal.
- **Wearing one** is an ordinary theme change (`set_kid_look` or the kids
  row): `custom-<id>` in `theme_id`. Switching is as quick as any and keeps
  all progress. Removing the theme a child wears puts them, on every phone, on
  the built-in theme it was made from.
- **Sending one to RankUp** is `submit_kid_theme`, a parent only, from the
  outbox like any call. It builds what is sent from the theme row (the theme
  alone) and holds a child to one a month. The family hears that it was sent,
  and later that it was picked, through their own theme row.
- **Seasons** are not family data: `live_seasons` gives every signed-in phone
  the Seasons that have started, asked when the app opens and once an hour,
  and kept on the phone for offline. A Season is invisible to everyone until
  its first day (UTC).

`supabase/test/50-theme-genesis.sql`, `tests/genesissync.mjs` (a parent's
phone, a child's phone and another family) and `tests/themeswitch.mjs` check
these.

### Two parents editing one chore: the edit history

Each phone sends only the fields it changed, so two parents changing different
fields both keep their change. If they change the **same** field, the edit
that reaches the server last wins.

The one it replaced is not lost: every edit a parent's phone makes to a chore
is written into the family's activity history, with each changed field's old
and new value, who made the edit, and whose edit it wrote over (when it was
somebody else's). It is in **Settings → Download my data**, under activity.
Accepting, sending back and a chore coming back on its day are not edits and
are not recorded. Like all activity, the history is deleted after 90 days by
the retention job (`RETENTION_EVENT_DAYS`).

---

## Unlinking, and the phone erasing itself

Settings → Link a kid's device → **Unlink** next to the device.

The phone loses access. The child's profile, XP and coins stay with the family:
unlinking a phone is not deleting a child.

**The unlinked phone erases itself.** Its next pulls are answered "you are in
no family"; after **two in a row**, while signed in, it erases everything
RankUp kept on it (the child's name, chores, notes, the outbox, the sign-in),
turns its notifications off, and opens at the front door with one sentence
saying why, naming nobody.

The same happens to:

- a child's phone when the child is deleted, or consent is withdrawn;
- a parent's phone when that parent is removed from the family, or the account
  is deleted.

It does **not** happen to an expired sign-in (the server answers that
differently, and the app asks the person to sign in again), or to a phone that
never had a family (one still being set up). A phone that has left stops
receiving the family's notifications at once. `tests/devicewipe.mjs` checks
both kinds of phone.

---

## Trying it on one computer

Two tabs normally share storage. Add `?device=kid` to give one its own:

```
http://localhost:5173/            ← the parent's phone
http://localhost:5173/?device=kid ← the child's phone, separate storage
```

`supabase/test/up.sh` starts a local Postgres and a stand-in for Supabase's
API, so this works against a real database ([supabase/test/README.md](../supabase/test/README.md)).

## What is checked, and what is not

- `tests/pairing.mjs`: the whole linking flow as two devices — a wrong code, an
  expired one (said on both phones), the fifth wrong guess, a used code, the
  child's phone having no Parent Mode.
- `tests/sync.mjs`, `tests/coparents.mjs`, `tests/devicewipe.mjs`: two and three
  browsers against Postgres.
- `tests/offline.mjs`, `tests/guarantees.mjs`, `tests/outbox.mjs`,
  `tests/syncfixes.mjs`: thirty days offline, a page killed mid-send, two parents'
  edits, the outbox rules above.
- **Not yet against a live Supabase project.** Everything runs against real
  Postgres through a local stand-in for Supabase's API. Before real families,
  link two real phones on the live project and check: a wrong code is refused,
  the fifth wrong guess kills the code, an expired code cannot be claimed, and a
  chore travels both ways.
