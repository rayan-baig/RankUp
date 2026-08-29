# Notifications

A chore app nobody remembers to open is a chore app nobody pays for. This is
the piece that closes the loop: a parent finds out their kid finished
something, and a kid finds out they were approved.

There are **two mechanisms**, and the difference matters:

| | Works when | Needs |
|---|---|---|
| **Local** | Only while RankUp is open | Nothing. No keys, no server, no cost. |
| **Push** | Even with the app closed | VAPID keys, a deployed send endpoint, and Supabase |

The app uses local wherever it can and push where it is configured, and the
settings screen says which one is in force. It never claims background delivery
it cannot do — a parent who thinks they will be told and is not is worse off
than one who knows to check.

---

## What actually triggers one

| Event | Who is told | Wording |
|---|---|---|
| A kid submits photo proof | The parents' devices | "Ava finished a quest — *Make your bed* is waiting for you to review." |
| A parent approves | That kid's device | "Approved! 🎉 *Make your bed* earned you 45 XP." |
| A parent sends work back | That kid's device | "Sent back to redo. Tap to see why." |
| A daily reminder falls due | This device | Whatever the reminder is called |

The device that *caused* the event is never notified about it — a parent
approving does not get buzzed by their own tap.

Notifications are tagged, so five approvals replace one another rather than
stacking into five separate buzzes.

---

## Turning it on

### Local only — nothing to configure

Parent Mode → Settings → Notifications → toggle on. The browser asks for
permission and that is the whole setup. There is a **Send me a test
notification** button so you can confirm it works.

### Background push

**1. Generate VAPID keys.** These identify your server to the push services.
Once, ever — keep them:

```bash
npx web-push generate-vapid-keys
```

**2. Set the environment variables.**

```bash
# .env — the public key is safe in the browser
VITE_VAPID_PUBLIC_KEY=BN...

# SERVER ONLY. No VITE_ prefix, or it ships to every phone.
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

The **service role key bypasses every row level security rule in the database**.
It is the most dangerous value in the project. It belongs only in your host's
environment variables, never in a `VITE_` name, never in the repository.

**3. Run `supabase/notifications.sql`** in the Supabase SQL editor.

**4. Deploy.** `api/send-push.js` becomes a serverless function on Vercel
automatically — see [DEPLOY.md](DEPLOY.md).

---

## How the pieces fit

```
kid's phone                    your server                  parent's phone
─────────────                  ───────────                  ──────────────
submits proof
   │
   ├── local notification (if the parent's app is open)
   │
   └── POST /api/send-push ──► checks the caller really
                               belongs to that family
                                     │
                               reads endpoints with the
                               service role key
                                     │
                               web-push, signed with VAPID ──► buzz
```

Two rules are worth spelling out, because getting either wrong is how this kind
of endpoint becomes an abuse vector:

**Anyone triggering a notification must prove they belong to the family.** The
send endpoint takes the caller's own access token and asks the database, as that
user, whether they can see that family. Without this check anybody on the
internet could buzz any family's phone by guessing a uuid.

**Subscription endpoints are never readable from a browser.** A push endpoint is
a capability — whoever holds it can make that phone buzz. `push_subscriptions`
has no read policy at all, and the lookup function is revoked from `PUBLIC`.
(That last detail matters: Postgres grants EXECUTE on a new function to `PUBLIC`
automatically, so revoking from `anon` and `authenticated` alone does nothing.
That exact mistake was caught by `supabase/test/06-notifications.sql`.)

---

## iPhones

iOS only allows web notifications for apps **added to the home screen**. In
plain Safari the permission prompt does nothing at all.

The app detects this and says so rather than showing a button that silently
fails. The instruction to give a parent is: Share → Add to Home Screen → open
it from the icon → then turn notifications on.

---

## What is verified and what is not

**Verified in a browser** (`tests/notifications.mjs`): the service worker
registers, permission is requested and granted, a notification is genuinely
produced with a working tap destination, the settings screen correctly reports
local-only mode, and turning it off sticks.

**Verified in Postgres** (`supabase/test/06-notifications.sql`): a device can
register and unregister only itself, nobody can list subscriptions from a
browser, and the endpoint-lookup function is not callable by a browser at all.

**Not verified**: actual delivery over Web Push. That needs a real push service
(Google's or Mozilla's) reachable from the browser, which the development
sandbox has no route to. `api/send-push.js` is written and its logic is sound,
but it has never delivered a real message. Test it on two real phones before
relying on it.

---

## Reminders

The daily reminders in Settings are now real, with one honest limit: they check
the clock once a minute **while the app is open**, and fire at most once a day
each. They will not wake a closed app.

Reminders that arrive with the app closed need a scheduled server-side job —
Supabase's `pg_cron` calling the send endpoint, or any external scheduler. That
is the next piece of work here, and it is the one that would make reminders
genuinely useful.

A reminder more than 90 minutes stale is skipped rather than replayed: opening
the app at 9pm should not fire the morning reminder.

---

## Before real users

Notifications to children are a design responsibility, not just a technical one.
Worth deciding deliberately:

- **Quiet hours.** Nothing should buzz a child's phone at 2am. There is no such
  restriction yet.
- **How much is too much.** A kid with eight daily chores could receive eight
  approvals. Batching is not implemented.
- **The UK's Age Appropriate Design Code** asks you to justify engagement
  mechanics aimed at children — streaks, daily bonuses and notifications all
  count. See [LEGAL.md](LEGAL.md).
