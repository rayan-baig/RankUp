# Notifications

A chore app nobody remembers to open is a chore app nobody pays for. This page
says exactly what RankUp tells people, when, in what words, and what stops it
from telling them too much.

There are **two ways** a notice reaches a phone:

| | Reaches | Needs |
|---|---|---|
| **On this phone** | The phone where the thing happened, while RankUp is open, if the person it is for uses that phone (a shared family tablet) | Notifications turned on on that phone. No server. |
| **Push** | The family's other phones, even with RankUp closed | VAPID keys, the server functions deployed, Supabase, and notifications turned on on the receiving phone |

The settings screen says which one is working. It never claims background
delivery it cannot do.

**Only a parent's phone can turn notifications on** (Parent Mode → Settings →
Notifications). A child's phone has no Parent Mode and no switch, so today it
never registers for push. See "What does not happen yet" below.

---

## What triggers one, and the exact words

The words are fixed in one file, `src/data/noticeWords.js`, which the server
functions (`api/send-push.js`, `api/send-reminders.js`, `api/send-digests.js`)
and the app (`src/lib/notifications.js`, for the on-this-phone copy) all
import, so a notice reads the same however it arrives. A phone asking for a
push names the kind of notice and at most two values (a name, a chore); it
cannot supply its own sentence.

| When | Who is told | Title | Body | Tapping opens |
|---|---|---|---|---|
| A child taps **I did it!** | Every parent's phone in the family | `Ava finished a chore` | `"Make your bed" is ready for you to check.` | Review |
| A parent taps **Accept** | That child's phones | `Accepted! 🎉` | `"Make your bed" earned you 45 XP.` (`was accepted.` if it paid no XP) | The child's home |
| A parent sends it back | That child's phones | `Back on your list` | `"Make your bed" needs another go. You've got this.` | The child's quests |
| A daily reminder is due (server job) | The phones the reminder is for | The reminder's name, e.g. `Morning quests` | A parent: `Time to check in on today's chores.` A child: `Time for your quests.` | A parent: Review. A child: their quests |
| A daily reminder is due (RankUp open) | This phone | The reminder's name | The same as the server's, for whoever uses this phone | The same |
| A child asks to join a guild | The parents whose yes is still missing: in the child's family, and in the family whose guild it is. Not supporters | `A guild request needs you` | `Juno wants to join Sock Hunters. Nobody joins without you.` | Guilds |
| The weekly digest (server job) | Every parent's phone | `Your week in RankUp` | e.g. `9 chores done, up from 5 last week. Ava led with 6. Quietest day: Wednesday. 2 chores are waiting for you to check.` | Review if chores are waiting, otherwise Behaviour Blueprint |
| **Send me a test notification** (Settings) | This phone | `Notifications are on` | `This is how RankUp tells you a chore is ready for you to check.` | Review |

The rules for the words, which `tests/noticewords.mjs` holds every notice to
with the longest name and chore title it can carry:

- **Short.** A title is at most 60 characters and a body 130 (the digest 200),
  so neither is cut off by the phone; anything longer is cut at a word with
  "…".
- **Friendly, never shaming.** A chore sent back is "another go", never
  "rejected" or "failed"; no word that blames, no shouting, at most one emoji.
- **True to what happened.** The parent taps Accept, so the child is told it
  was accepted. A chore sent back does not say "Tap to see why": the note is
  optional, and there may be no why. The test notification says it is a test.
- **Every tap goes somewhere real.** Each link is a screen the app has (read
  from `renderRoute` in `src/App.jsx`), and survives the Parent Mode PIN: a
  link into the parent side meets the PIN first, and the PIN used to open the
  dashboard afterwards, so "2 chores are waiting" led nowhere in particular.
  It now opens where the link was going. The trial email's link and Stripe's
  ways back are checked the same way.

The digest's sentence is built from the week: "A quiet week, with no chores
finished. 3 were done the week before." when nothing was done, "up from" /
"down from" / "the same as" last week otherwise, the child who did most when
there is more than one (and nobody named for doing least), and the number of
chores waiting only when there are some.

Names and chore titles put into a notice are cut to 40 characters, put on one
line, and have links and phone numbers removed, so a notice cannot be made to
look like a message from somebody else.

A guild request reaches a family the asking phone is not in, so that phone
names only the guild and the child. The server asks the database
(`claim_guild_request_notice`, `supabase/guilds.sql`) whether that child's
request is really waiting, whose yes is still missing, and what the child and
the guild are called; the names the phone sent are not used. The request is
marked as told there, so asking for the notice again buzzes nobody, and
cancelling and asking again is told at most once a day.

**Not sent:**

- To the phone that did it, about itself. A parent's own Accept does not buzz
  that parent's phone.
- About something the server turned down. If the chore never arrived, or two
  parents accepted the same chore and this phone's Accept came second, the
  notice is dropped with it.
- To a phone whose account has left the family. A removed co-parent or an
  unlinked child's phone stops receiving the family's notices at once, even
  though its subscription is still stored.
- A digest to a family with nothing to report: if nothing was finished this
  week or the week before, they get nothing.

---

## How often, and how long a notice waits

| Limit | Value | Where |
|---|---|---|
| Notices per family per hour | **60.** Counted per request, and a request goes to all of that role's phones at once, so four parent phones receiving one notice count as one. The 61st in an hour is refused (`too_many_notices`) and not retried. | `claim_push_send`, `supabase/notifications.sql` |
| ... a guild request | Counted against the asking family, and refused over its 60. Counted against the guild's family too, which is skipped (the asking family's parents are still told) once that family is over its own 60, so no family's phones get more than 60 an hour | `api/send-push.js` |
| A reminder | **Once a day** each, on the family's own date, however often the job runs | `claim_due_reminders`, `supabase/reminders.sql` |
| Reminders in a list | 24, each name up to 40 characters | `save_reminder_schedule` |
| The digest | **Once a week** per family, in that family's own time zone | `claim_due_digests`, `supabase/digests.sql` |
| How long the push service holds a notice for a phone that is off | **28 days** for chores, decisions and the digest | `NOTICE_TTL_SECONDS`, `api/_shared/push.js` |
| ... for a reminder | Only as long as it would still be on time: the grace window, **2 hours** by default (`REMINDER_GRACE_MINUTES`) | `api/send-reminders.js` |
| A reminder the job was late for | Sent up to the grace window late, then skipped for that day | `due_reminders` |
| An in-app reminder | At its time, or up to 90 minutes late if RankUp was opened late; once a day per phone | `remindersToFire`, `src/lib/notifications.js` |
| A phone the push service says is gone (404 or 410) | Deleted at once | `record_push_failure` |
| A phone the push service refuses for another reason | Deleted after 5 refusals. "Slow down" (429), the push service's own trouble (5xx) and no network are not counted against the phone. | `failureFor`, `api/_shared/push.js` |

Notices share a **tag** per kind (`submission`, `decision`, `guild`,
`reminder`, `digest`), so a newer one replaces the older one on the phone instead of
stacking up.

### Ten thousand at once

The reminder and digest jobs run as Cloudflare Pages Functions, and one run
has limits: about a thousand requests to other servers on Workers Paid (each
push is one, each database call is one), and a budget of processor time. The
jobs used to ask for everything due, then make two database calls and a push
per notice, marking each sent after its push. With 10,000 due that is 30,000
requests from one run: it would fail a few hundred in, the notices pushed but
not yet marked went again on the next run, and the rest crept out a few
hundred every 15 minutes until the grace window closed on them.

Now (`api/_shared/pushBatch.js`):

- **One call claims a batch** (`claim_due_reminders`, `claim_due_digests`):
  up to 100 phones' worth, most overdue first, each notice with its phones.
  A claimed notice is nobody else's for five minutes, so two runs at once
  never send the same one.
- **Its pushes go six at a time** (Workers keep six connections open), each
  read to the end so the next can use the connection, each given up after
  10 seconds. The VAPID signature is made once per push service per hour
  rather than once per push: 0.2 ms of processor time a push instead of 0.7.
- **One call records the phones that failed, one marks the batch sent**
  (`record_push_failures`, `finish_reminders`, `finish_digests`).
- **A run starts no batch it might not finish**: none after 20 seconds
  (`PUSH_RUN_SECONDS`), and none that could take it past its requests
  (`JOB_SUBREQUEST_LIMIT`, 1,000). It answers `"more": true` and the next run
  carries on with what is still due and unclaimed.
- **A run stopped part-way anyway** (the platform ends it) leaves the batch in
  hand claimed. Five minutes later the next run sends it again. That is the
  only way a notice can go twice, and the repeat carries the same `Topic`, so
  the push service replaces a copy the phone has not fetched yet, and the
  same tag, so the phone replaces one it already shows. Nothing claimed is
  ever left unsent.

Measured with `tools/pushload.mjs` (10,000 families, a reminder each, due at
the same minute, one phone each; the production build under workerd; a
stand-in push service):

| | Runs | Each run | Requests a run | All 10,000 |
|---|---:|---:|---:|---:|
| Before, push service answering at once | 1 | 88.7 s | 30,000 | 88.7 s |
| Before, push service taking 40 ms | 1 | about 8.5 min (2,000 took 102 s) | 30,000 | — |
| After, push service answering at once | 11 | 2.7 s | at most 988 | 29.7 s |
| After, push service taking 40 ms | 11 | 8.4 s | at most 988 | 92.8 s |

Every phone received its reminder exactly once, and every reminder was marked
sent. Before, the run worked only because nothing locally limits a run's
requests; on Cloudflare it would have stopped at the thousandth.

**What this asks of the scheduler.** Eleven runs at one every 15 minutes is
two and a half hours, past the two-hour grace window, so at that size the
scheduler has to call again when a run answers `"more": true` (the Worker in
[LAUNCH.md](LAUNCH.md) section 2b does), or run the job every 5 minutes, or
the plan has to allow more requests (`JOB_SUBREQUEST_LIMIT`). Up to about
7,000 reminders due at the same moment, eight runs inside the grace window, a
plain 15-minute schedule is enough.

### When a phone is offline

- **The phone it is for** gets it when it comes back, within the hold times
  above.
- **The phone it is from** keeps the request in its outbox, behind the change
  it is about, and sends it once that change has reached the server. A child
  who taps "I did it!" with no signal tells their parent once back in signal,
  and the parent is never told about a chore that has not arrived. A push the
  server answers (sent, refused, over the cap) is finished; only "could not
  reach the server" is tried again.

---

## Turning it on

### On one phone — nothing to configure

Parent Mode → Settings → Notifications → switch on. The browser asks for
permission. **Send me a test notification** checks it works.

### Push to the family's other phones

1. **VAPID keys**, once, ever. Keep them; changing them stops every phone's
   push until it turns notifications on again.
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Settings** on the host (see [LAUNCH.md](LAUNCH.md) section 4):
   `VITE_VAPID_PUBLIC_KEY` and `VAPID_PUBLIC_KEY` (the same public key),
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` a company address, e.g. `mailto:no-reply@rankup.<your domain>`),
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service role key and the
   private key never go in a `VITE_` name.
3. **The database:** `supabase/notifications.sql`, with the rest of the files
   in the order LAUNCH.md gives.
4. **Deploy.** `api/send-push.js` is served at `/api/send-push` on Cloudflare
   Pages or Vercel.
5. **Schedule the two jobs** (LAUNCH.md section 2b): `/api/send-reminders`
   every 15 minutes and `/api/send-digests` hourly, each with
   `Authorization: Bearer <CRON_SECRET>`. The digest goes out at
   `DIGEST_HOUR` on `DIGEST_WEEKDAY` (default Sunday at 18:00) in each
   family's own time zone, which is why the job runs hourly.

### iPhones

iOS only allows web notifications for apps **added to the home screen**. In
Safari the permission prompt does nothing. The app says so instead of showing
a button that silently fails. Tell a parent: Share → Add to Home Screen → open
it from the icon → turn notifications on.

---

## Who may send one

**The caller must be in the family.** `/api/send-push` takes the caller's own
sign-in and asks the database, as that person, which family they are in.
Without this anyone could buzz any family's phones by guessing an id.

**"Accepted!" and "Back on your list" are a parent's to send.** The database is asked
whether the caller is a parent; a child's phone cannot send a sibling
"Accepted!".

**A guild request is the child's, or their parent's, to send.** The database
is asked whether the caller may act for that child (`may_act_for_kid`), and
whether that child's request to that guild is waiting. Another family, or a
supporter, cannot send one.

**Push addresses are never readable from a browser.** Whoever holds one can
make that phone buzz. `push_subscriptions` has no read policy, and the
functions that list them are revoked from `PUBLIC`, `anon` and `authenticated`
together. Postgres grants new functions to `PUBLIC`, and Supabase also grants
everything created in `public` to `anon` and `authenticated` by name, so
revoking from only one side leaves them callable with the anon key
(`supabase/test/00-shim.sql` sets up the same grants as Supabase, and
`supabase/test/06-notifications.sql` checks).

---

## What is checked, and what is not

- **In a browser** (`tests/notifications.mjs`): the service worker registers,
  permission is asked for, a notice is really shown with a working tap, the
  settings screen says "this phone only" when push is not set up, and
  switching off sticks.
- **End to end against a stand-in push service** (`tests/push.mjs`): the
  production build under workerd sends a notice, the VAPID signature checks
  out, and the body decrypts with the phone's keys to the right words. A 410
  drops the phone; no answer at all does not count against it. Four phones in
  one family sending at once get sixty notices an hour between them, no more.
  A child's guild request reaches a parent in each family, not a supporter,
  in the database's words, once, and within both families' ceilings.
- **The batches** (`tests/pushbatch.mjs`, in Node, every request counted): no
  run makes more requests than it may, a run out of time starts no batch,
  2,500 notices over several runs are each sent once, a family with more
  phones than a batch still gets its notice, failed phones are recorded in
  one call, and the signature is reused per push service. Under workerd
  (`tests/push.mjs`): 150 reminders at once, with a batch claimed by a run
  that died, each reach their phone exactly once.
- **In Postgres** (`06-notifications.sql`, `11-reminders.sql`,
  `17-digests.sql`, `34-scheduled-jobs.sql`, `39-guild-request-notice.sql`,
  `46-push-batches.sql`):
  a phone can register and remove only itself, nobody can list subscriptions,
  the hourly cap counts per family, reminders fire once a day on the family's
  own clock, the digest goes once a week in each family's own evening, and a
  guild request is told once, to the parents whose yes is missing.
- **Not checked: a real phone.** No real push service (Google's, Apple's,
  Mozilla's) is reachable from where this was built. Send one real push to an
  Android phone and to an iPhone on the home screen before relying on it.

---

## What does not happen yet

- **A child's phone never gets a push.** Only Parent Settings has the
  notifications switch, and a child's phone has no Parent Mode, so it never
  registers. "Accepted!" and "Back on your list" are sent to the child's phones and,
  in practice, reach none; the child sees the result next time they open
  RankUp. Reminders are only ever saved for parents. Fixing this needs a
  switch on the child's phone (and a parent's say on whether a child's phone
  may buzz at all) — see [ROADMAP.md](ROADMAP.md).
- **No quiet hours.** A reminder goes at the time the family chose. Once a
  child's phone can receive pushes, decide whether anything may buzz it late
  at night.
- **The UK's Age Appropriate Design Code** asks you to justify engagement
  features aimed at children: streaks, daily bonuses and notifications all
  count. See [LEGAL.md](LEGAL.md).
