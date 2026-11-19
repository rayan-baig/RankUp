# Running RankUp

For the owner, not a programmer. How to know RankUp is up without watching
it, and what to do when it is not. The full list of signals, and what parents
may tell you, is in [IF-SOMETHING-BREAKS.md](IF-SOMETHING-BREAKS.md).

---

## The three health addresses

| Address | Asks | 200 means | 503 means |
|---|---|---|---|
| `https://rankup.mtrxhorizyn.com/api/healthz` | Nothing. Free to ask every minute. | The host (Cloudflare or Vercel) is up and running RankUp's server code | (It never says 503. No answer at all means the host is down.) |
| `https://rankup.mtrxhorizyn.com/api/health` | The database, once | The site is up **and** can reach Supabase | Supabase is down, paused or too slow (over 5 seconds) |
| `https://rankup.mtrxhorizyn.com/api/ready` | The database, the settings, the jobs | Everything RankUp needs is in place | Something needs you: a scheduled job has gone quiet, a required setting is missing, or a deleted family is still waiting for Stripe to cancel |

To anybody, each one answers only `{"ok":true,"version":"…"}` (or
`"ok":false`). The version tells you which build is live. Nothing else is
shown, so they are safe to leave public.

They are cheap. `/api/healthz` touches nothing. `/api/health` and `/api/ready`
remember their answer for 15 seconds, so a monitor asking every minute costs
the database one tiny query a minute.

---

## If the app is down

### Set this up once, before launch (about ten minutes)

1. Make a free account at **UptimeRobot** (uptimerobot.com) or **Better Stack**
   (betterstack.com). Both free plans check every few minutes and email you.
2. Add a monitor: type **HTTP(s)**, address
   `https://rankup.mtrxhorizyn.com/api/health`, every 5 minutes (or the
   shortest the free plan allows). Alert when it is **not 200**. Name it
   **"RankUp up"**.
3. After launch, once the seven jobs are scheduled ([LAUNCH.md](LAUNCH.md)
   section 2b) and have each run once, add a second monitor the same way for
   `https://rankup.mtrxhorizyn.com/api/ready`, every 15 minutes. Name it
   **"RankUp ready"**. Before the jobs run it is red on purpose: a job that has
   never run is not ready.
4. Put your phone number or the app of the monitor on the alerts, not only
   email, for "RankUp up".

Cloudflare's own Health Checks (on a paid plan) work the same way: point them at
the same two addresses and expect 200.

### What each alert means, and what to do

**"RankUp up" is down.** Families cannot use the site.

1. Open `https://rankup.mtrxhorizyn.com/api/healthz` in your browser.
   - **No answer, or an error page from Cloudflare or Vercel:** the host is the
     problem. Check status.cloudflare.com (or vercel-status.com). If your last
     deploy was just now, roll back to the deployment before it in the
     host's dashboard (Cloudflare: the Pages project → Deployments; Vercel:
     the project → Deployments).
   - **`{"ok":true,...}`:** the host is fine, so it is the database. Go on.
2. Open the Supabase dashboard. A free project is **paused** after a week
   with no use: press **Restore**. Otherwise check status.supabase.com.
3. Families who already had RankUp open keep going: their phones save
   everything and send it when the site is back. Nothing is lost.

**"RankUp ready" is down, but "RankUp up" is fine.** The site works, but
something behind it needs you. Ask for the reason with your `CRON_SECRET`:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://rankup.mtrxhorizyn.com/api/ready
```

| In the answer | It means | First thing to do |
|---|---|---|
| A job's `state` is `stale` | That job has stopped running on time | Check the schedule still exists, then run the job once by hand. [IF-SOMETHING-BREAKS.md](IF-SOMETHING-BREAKS.md) has the steps |
| A job's `state` is `never_run` | That job has never run once | Its schedule was never set up ([LAUNCH.md](LAUNCH.md) section 2b) |
| `missing_settings` lists a name | A setting the site needs is not set on the host | `database`: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `public_key`: `VITE_SUPABASE_ANON_KEY`. `scheduled_jobs`: `CRON_SECRET`. `site_url`: `PUBLIC_SITE_URL`. `payments` (only once billing is on): `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Add it ([LAUNCH.md](LAUNCH.md) section 4) and deploy again |
| `billing_cancellations_overdue` above 0 | A deleted family may be charged again | Cancel their subscription in Stripe by hand |
| `reason: database_unreachable` | The same as "RankUp up" being down | See above |

### When an outside service is slow

RankUp gives up waiting instead of hanging, and says so in plain words:

- **Stripe**: 10 seconds and one retry. A parent sees "Stripe is not answering
  right now"; nothing about their plan changes.
- **The database** (from the server): 10 seconds when a person is waiting, 25
  for a scheduled job, 5 for the health check. The job's failure shows in
  `/api/ready`.
- **Email**: 20 seconds. **Push notifications**: 10 seconds each.
- **A phone's sync**: 30 seconds. After that it tries again later, like a
  dropped signal, and nothing waiting is lost.

---

## Logs

- Your host's **function logs** (Cloudflare: the Pages project → Functions →
  real-time logs; Vercel: the project → Logs) show each `/api/...` call. Errors
  are written there with names, emails and ids taken out.
- Supabase → **Table Editor → `server_errors`** and **`crash_reports`** keep
  the same errors for a while; set `ERRORS_EMAIL` and they come to you once an
  hour.
- Nothing in any log names a child.
