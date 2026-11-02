# Linking a kid's device

A kid's phone shows a **six-digit code**. The parent types it into their own
phone. That is the whole pairing flow, and it is built and working, as is the
sync that follows it (with Supabase configured).

---

## How it works from the outside

**On the kid's phone**

1. They open RankUp and choose **"I'm a kid"**.
2. They type their first name and pick a theme.
3. They get a six-digit code and a "waiting for your grown-up" screen.

**On the parent's phone**

4. Settings → **Link a kid's device**.
5. Type in the six digits.
6. Done — the kid joins the family, and their phone switches to their own home
   screen in the theme they chose.

A kid's phone **never creates an account**. No email, no password. The parent's
account is the account; the kid's device joins it. That is deliberate — see the
consent section below.

---

## Why a six-digit code is safe enough

Six digits is only a million combinations, which sounds weak. The code alone is
not the security; four rules around it are:

| Rule | Why |
|---|---|
| Expires after **10 minutes** | The window to attack is tiny |
| Dies after **5 wrong guesses** | Five tries out of a million, not unlimited |
| Works **exactly once** | A code seen over someone's shoulder is useless afterwards |
| Generated with `crypto.getRandomValues` | Not `Math.random`, so seeing old codes tells you nothing about the next one |

Together: an attacker gets five guesses out of a million, inside a ten-minute
window, against a specific kid's phone that has to be sitting on the pairing
screen at that exact moment. That is not a practical attack.

The code is also drawn with **rejection sampling** rather than `random % 1000000`,
because the modulo version makes low codes very slightly more likely — exactly
the sort of bias that makes a short code easier to attack.

**All four rules are enforced in the database, not in the browser.** Claiming a
code is a single Postgres function call (`claim_pairing_code`), so a tampered
app cannot skip the attempt counter, and two parents cannot claim the same code
in the same instant.

---

## Why the kid generates the code, and what that would otherwise break

You asked for kid-generates, parent-enters, and that is what is built. It is the
right way round for setup: the kid's phone is the one physically in front of you,
and reading six digits aloud is easier than typing them onto a child's device.

But it has an obvious hazard worth naming: it means a child could go through
setup on their own, with no parent involved. For a children's app that inverts
the legal requirement — under COPPA, verifiable parental consent must come
*before* you collect anything about a child.

**So the kid's device stores nothing until a parent claims it.** During the
waiting screen the app holds the child's first name and a theme id, and that is
all. No quests, no photos, no XP, no account, nothing sent anywhere. The moment
a parent enters the code is the moment consent exists, and only then does the
app begin holding anything.

That is what makes the flow you asked for safe rather than a compliance problem.
Keep the rule if you change this screen. → [LEGAL.md](LEGAL.md)

---

## What is actually working right now

**Working and tested:** the whole flow above. Code generation, expiry, the
five-attempt limit, one-time use, "New code", the parent's entry screen and its
error messages, the link itself, and the fact that a kid's device has no Parent
Mode. `tests/pairing.mjs` drives it as two separate devices and checks all of it.

**Also working, with Supabase:** the sync *after* pairing. Quests, submissions,
approvals, XP, rewards and the family goal travel between the parent's and the child's phones,
offline-first through an outbox; `tests/sync.mjs` drives it end to end.

**Coins and rewards on more than one phone.** A purchase takes the coins on
screen at once and is settled by the server, which takes turns per child: two
phones buying with the same coins while offline are charged for what the
balance covers, and the other purchase is refused with the coins handed back
on that phone and a sentence saying why. A reward a parent deleted meanwhile
is refused the same way. While a purchase (or a tax, a game, a bonus) is still
on its way, a pull leaves the child's balance alone, so the coins cannot
reappear and be spent twice. `tests/rewardraces.mjs` checks all of it.

**A second phone for the same child.** A profile that already has a phone keeps
it: pairing another phone under the same name makes a new profile, and the
parent's confirmation says so. To move a child to a new phone (including the
same phone after "Add to Home Screen", which starts with empty storage),
unlink the old phone first, then link the new one.

There are two backends behind the same interface:

| | When it is used | What it can do |
|---|---|---|
| `localAdapter` | No Supabase credentials set (**now**) | Pairs two tabs of the same browser. Cannot reach another phone. |
| `supabaseAdapter` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | Pairs real devices. **Written but never run against a live project** — there isn't one yet. |

The app picks one automatically and says which is active, on both the kid's
screen and the parent's.

### Testing it on one computer

Two tabs on one machine normally share storage, which would make pairing a
pantomime. So add `?device=kid` to the address:

```
http://localhost:5173/            ← the parent's device
http://localhost:5173/?device=kid ← the kid's device, separate storage
```

That parameter exists only for development. Two real phones already have
separate storage.

---

## Turning on real cross-device pairing

1. Create a Supabase project. → [BACKEND.md](BACKEND.md)
2. Run **all** of `supabase/schema.sql` in its SQL editor. The pairing part is at
   the bottom: the `pairing_codes` table and the `create_pairing_code`,
   `read_pairing_code`, `revoke_pairing_code` and `claim_pairing_code` functions.
3. Put the project URL and anon key in `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Restart. The app switches adapters on its own and the "not connected to a
   real server" warnings disappear.

Then test it properly on two real phones before trusting it, because
`supabaseAdapter.js` has never run against a live project. Specifically check:
a wrong code is refused, the fifth wrong guess kills the code, and an expired
code cannot be claimed. Those are the three that matter.

### One deliberate design note

`pairing_codes` has row level security enabled and **no read policy at all**.
Nothing reads that table straight from a browser; every interaction goes through
one of the four functions. A readable pairing table would hand out every live
code at once.

---

## Unlinking

Settings → Link a kid's device → **Unlink** next to the device.

The device loses access. The child's profile, XP and currency stay with the
family — unlinking a phone is not the same as deleting a child, and the app
never conflates the two.

**The unlinked phone erases itself.** Its next syncs are answered with "you are
in no family"; after two in a row, while signed in, it wipes everything RankUp
kept on it (the child's name, chores, notes, the sign-in, the outbox) and opens
at the front door with one sentence saying why. The same happens to a child's
phone when the child is deleted or consent is withdrawn, and to a parent's
phone when they are removed from the family or the account is deleted. An
expired sign-in never triggers it: the server answers that with a 401. It also
stops receiving the family's notifications at once.

---

## When the phone is offline, full, or disagrees

- **Offline for weeks.** Changes wait in the outbox in order. Having no
  connection never counts against them; a change is only given up after a day
  of the server itself refusing to answer, tried at least 30 times. A phone
  offline for thirty days delivers everything when it is back.
- **Killed mid-send.** The outbox is in storage; a change that may already have
  arrived is sent again and recognised (every call is safe to repeat).
- **Storage full.** The app says so at the top of the screen and keeps working
  from memory, still sending what it can; the warning goes once a save works.
- **Two parents edit one chore.** Each phone sends only the fields it changed,
  so different fields both survive. For the same field, the edit that reaches
  the server last wins, and every edit is written to the family's history with
  what it replaced and who wrote that, so nothing vanishes without a trace
  (Settings → Download my data, under activity).

`tests/offline.mjs`, `tests/guarantees.mjs` and `tests/devicewipe.mjs` check all
of this.
