# If something breaks

For the owner, not a programmer. Each signal below says what it means and the
**first** thing to do. Most problems are a setting or a schedule, not the code.

You need three logins to hand: your **host** (Cloudflare or Vercel),
**Supabase**, and **Stripe**.

---

## The two checks to set up once

**1. A free uptime monitor** (UptimeRobot, Better Stack, or similar) pointed at

```
https://rankup.<your domain>/api/health
```

It answers `{"ok":true,"version":"…"}` when the site is up and can reach the
database, and an error (503) when it cannot. The version is the one in
`package.json` and `CHANGELOG.md`, so it also tells you which build is live. It
is safe to leave public; it says nothing else.

**2. The detailed check**, which needs your `CRON_SECRET`. Open a terminal and
run (or give your monitor the same header):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://rankup.<your domain>/api/health
```

It answers 200 when all is well and 503 when anything below needs you, with the
reason in the answer. A job's last error is in its `last_error`; the server's
own error messages go to the host's function logs, never into an answer.

---

## What each signal means

| You see | It means | First thing to do |
|---|---|---|
| The uptime monitor says the site is **down** | The site, or the database behind it, is not answering | Open the site yourself. Then the Supabase dashboard: a free project is **paused** after a week with no use; press Restore. Then your host's status page. |
| Detailed check: a job is **`stale`** | A scheduled job has not succeeded for longer than it should (reminders 2 hours, retention 3 days, digests 9 days, the monthly ones 45 days) | Check the schedule still exists (Vercel: Settings → Cron Jobs; Cloudflare: your scheduling Worker or outside scheduler). Then run that job once by hand: `curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://rankup.<your domain>/api/send-reminders` (or the job's name). |
| Detailed check: a job is **`never_run`** | That job has never once succeeded | Before launch, normal. After launch, its schedule was never set up: [LAUNCH.md](LAUNCH.md) section 2b. |
| A job shows a **`last_error`** and a growing **`fail_count`** | It is being called, and failing | `not_configured`: a setting is missing (see the next row). `lookup_failed`: it could not reach the database; check Supabase is up. A `401` when you run it by hand: the scheduler's secret and the site's `CRON_SECRET` differ. |
| Detailed check: **`configured`** has a `false` | A setting is missing on the host: `database`, `payments`, `push`, `scheduled_jobs` or `site_url` | Add it on the host ([LAUNCH.md](LAUNCH.md) section 4) and deploy again; settings are read when the site starts. |
| **`billing_cancellations_overdue`** above 0 | A family deleted their account more than a day ago and Stripe has not confirmed their subscription is cancelled. **They may be charged again.** | In Stripe, find the customer and cancel the subscription by hand. Then check `STRIPE_SECRET_KEY` is set. The count clears on the next daily run. |
| **`crashes_24h`** above 0 | A screen crashed on somebody's phone. The rest of the app kept working. | In Supabase → Table Editor → `crash_reports`: each row has the screen's address and the error, never a name. One crash is noise; the same screen many times is a bug to report. |
| Stripe → Developers → Webhooks shows **failed deliveries** | Payments are happening but the app is not hearing about them, so plans do not change | Check the site is up, and that `STRIPE_WEBHOOK_SECRET` on the host is that webhook's signing secret. Stripe retries for three days, so fixing it in time loses nothing. |
| The **GitHub test run is red** (a red cross on the latest change) | The newest change broke something | Do not deploy it. Open the run: the failed job's name says which part, and its last line says which test file. |

---

## What parents may tell you

| A parent says | It means | What to tell them |
|---|---|---|
| "Stripe, who look after billing, is not answering right now" | Stripe is having trouble | Nothing about their plan has changed. Try again in a few minutes. (status.stripe.com) |
| "A payment failed" on the dashboard | Their card was declined at renewal; the plan has stopped until it is paid | Tap "Manage billing" and update the card. |
| "Your payment was refunded" | A refund was given in full, so the plan stopped | Expected after a refund. Remember to cancel the subscription in Stripe too, or it renews. |
| "This phone was unlinked from its family, so everything RankUp kept on it has been erased" | A parent unlinked that phone, or deleted that child | Link it again: a new code on the child's phone, typed into a parent's. The child's XP and coins were never on the phone; they are still in the family. |
| "This account is no longer part of a family on RankUp…" | That parent was removed from the family, or the account was deleted | The other parent can invite them again from Settings. |
| "Your sign-in has expired" | The phone was offline or unused long enough for the sign-in to lapse | Sign in again. Nothing waiting to be sent has been lost. |
| "This phone's storage is full" | The phone itself is out of space | RankUp keeps working and keeps sending; free some space on the phone. |
| "That submission had already been decided on another device" | Two parents accepted (or sent back) the same chore | Nothing to do: it was paid once. |
| Coins came back, with a sentence saying why | A purchase was refused by the server (not enough coins by the time it arrived, or the reward was taken off the list) | Nothing was spent. Working as intended. |
| "I'm not getting notifications" | Notifications are per phone, and only a parent's phone can turn them on | Parent Mode → Settings → Notifications → on, then "Send me a test notification". On an iPhone, RankUp must be added to the home screen first. A child's phone cannot receive them yet. |

---

## Still stuck

- Supabase → **Logs** shows every database error with its time.
- Your host's **function logs** (Cloudflare: the Pages project → Functions →
  real-time logs; Vercel: the project → Logs) show what each `/api/...` call did.
- [BACKUPS.md](BACKUPS.md) if data is lost, and before you restore anything.
- [LAUNCH.md](LAUNCH.md) for every setting and schedule, in one place.
