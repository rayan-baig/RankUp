# What to do next

In order. Each item is finishable on its own. Accounts, sync between phones,
payments, notifications, reminders and the digest, guilds, alliances, the
School League and account deletion are built (see [STATUS.md](STATUS.md)), so
none of them is here.

---

### 1. Use it with one real family for a week ← first

Real chores, a real child, two real phones, seven days. It is the only way to
find out whether a parent will open the app to accept a chore, which is what
the whole product rests on. Cost: nothing. Value: more than anything below.

### 2. The checks only a real phone and a live project can do

Everything here has been tested against a real Postgres and stand-ins for
Supabase's API, Stripe and a push service. Before families, on the live
project:

- **One real push**, to an Android phone and to an iPhone added to the home
  screen.
- **Two real phones linked** with a code: a wrong code refused, the fifth wrong
  guess killing it, an expired code refused, a chore travelling both ways.
- **A password-reset link is dead** after the password has been changed.
- **Stripe test mode, end to end**: subscribe, a failed renewal, a refund,
  deleting the account (LAUNCH.md section 6).

### 3. Notifications on a child's phone

Only Parent Settings has the notifications switch, and a child's phone has no
Parent Mode, so a child's phone never registers for push. "Approved!" and
"Sent back" are sent to the child's phones and reach none. The server side is
written: a child's phone registers as the child's (checked in
`06-notifications.sql`), and the reminder job sends a child's reminders to that
child's phones. What is missing:

- a switch on the child's phone, and a parent's say on whether that phone may
  buzz at all;
- **quiet hours**, decided before the first notice can reach a child late at
  night;
- a child's own reminder times, saved as the child's (the server takes them;
  the app only ever saves the parents').

### 4. Forgot password

There is no "forgot password" screen. A parent who forgets theirs needs you to
send a reset link from the Supabase dashboard. A screen that asks Supabase to
send it, and a page to set the new password, would take that off you.

### 5. A ready-made scheduler for Cloudflare

Cloudflare Pages cannot run the five scheduled jobs on a timer. LAUNCH.md gives
a starting point for a small Worker with Cron Triggers; putting that Worker in
this repository, with its own test, would make the recommended host work
without an outside scheduler.

### 6. Before switching guilds on

Human moderation of guild chat beyond the contact-detail guard, reporting and
the owner's parent removing a child. Who reads reports, how fast, and what
happens to a child who is reported repeatedly. A lawyer's view on child-to-child
contact across families (LAUNCH.md section 8).

### 7. School League limits, if schools ask

Decided rather than missed (STATUS.md): membership is counted when the month is
closed, five students can be one family, and the 8-a-day cap is by approval
day. Change any of them only if a real school runs into it.

### 8. Housekeeping

- **HANDOFF.md and ESSAY.md** are a snapshot from 25 October 2026 and still
  describe the photo check, which has since been removed. The files under
  `docs/` are current.

---

## Things worth *not* building

- **A native app**, until the web version has families using it every week. It
  costs an Apple Developer account, review cycles, and 15–30% of every
  subscription.
- **More themes.** There are 25. That is not the constraint.
- **Ads.** Advertising to under-13s is heavily restricted, the money at this
  scale is negligible, and the Elite tier promises none.
- **Anything that accepts a chore automatically**, or checks a photo. A parent
  looks and decides; that is the product's promise. RankUp takes no photos.
