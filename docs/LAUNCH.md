# Launch checklist

What is left before real families use RankUp is the part only you can do: it
needs your accounts, your bank details, and a decision about the legal side
(section 7). Work down the list in order; nothing here is optional.

When something goes wrong after launch, see
[IF-SOMETHING-BREAKS.md](IF-SOMETHING-BREAKS.md).

---

## 1. Create the accounts (about an hour)

- [ ] **Supabase** — [supabase.com](https://supabase.com), new project, a
      region near your families. The free tier is fine while you build and
      test. **Before real families, move to the paid plan** (about $25/month):
      the free plan keeps no backups you can count on, and losing the
      database loses every family. See [BACKUPS.md](BACKUPS.md).
- [ ] **A host.** Both are set up and run the same `/api` code:
      - **Cloudflare Pages** (recommended): free, and the free tier allows
        commercial use. Settings in `wrangler.toml`; the functions are served
        through `functions/api/[[route]].js`. About $240 a year cheaper.
      - **Vercel**: settings in `vercel.json`. The free tier does not allow
        commercial use, so taking payments means Pro, about $20/month.

      Deploy the other one too, as a fallback, before you need it: moving
      hosts in a hurry with a live Stripe webhook is the worst time to find
      out something does not move.

      Push notifications are sent with `fetch`, which both hosts have, and
      `tests/push.mjs` proves one end to end under Cloudflare's runtime
      against a stand-in push service. A real phone is the one step not tried
      yet (section 6).
- [ ] **Stripe** — [stripe.com](https://stripe.com). It needs business details
      and a bank account, so start early: checking them can take days.

## 1a. The address: `rankup.<your domain>` (half an hour, most of it waiting)

RankUp is a product of **MTRX Horizyn**. The company has the one domain, and
RankUp lives on a subdomain of it: `rankup.<your domain>` (`<your domain>` is
whatever the company's domain turns out to be). The company's console and its
other products sit beside it as siblings.

A **subdomain, not a path** (`<your domain>/rankup`). A browser keeps cookies,
`localStorage`, IndexedDB and the service worker per origin, and a subdomain is
an origin of its own: nothing on a sibling can read a RankUp phone's family
data, its session or its offline copy. Under a path, every app on the domain
would share all of it. RankUp keeps it that way from its side: it sets no
cookie (so none with `Domain=<your domain>`), its functions send no CORS
header, its Content-Security-Policy names no other site of the company, its
service worker answers only its own origin, and a payment always comes back to
`PUBLIC_SITE_URL`, whatever a request claims. `tests/isolation.mjs` and
`tests/api.mjs` check each of these.

- [ ] **Point the subdomain at the host.** At the DNS provider for
      `<your domain>`, add one record:

      | Type | Name | Target |
      |---|---|---|
      | `CNAME` | `rankup` | Cloudflare Pages: `<your project>.pages.dev`. Vercel: the target Vercel shows you, `cname.vercel-dns.com` at the time of writing |

      Only this one name. No wildcard (`*.<your domain>`), and nothing at the
      bare domain for RankUp: those belong to the company.
- [ ] **Tell the host the name.** Cloudflare: Workers & Pages → the project →
      **Custom domains** → **Set up a custom domain** → `rankup.<your domain>`.
      If the domain's DNS is on Cloudflare it adds the CNAME itself; if not, it
      shows the record to add. Vercel: Project → Settings → **Domains** → add
      `rankup.<your domain>`.
- [ ] **HTTPS.** Both hosts issue and renew the certificate themselves once
      the CNAME resolves. Wait until the domain shows as **Active** (Cloudflare)
      or **Valid Configuration** (Vercel), then open
      `https://rankup.<your domain>`. Phones only install the app, and only
      allow notifications, over https.
- [ ] **`PUBLIC_SITE_URL=https://rankup.<your domain>`** on the host (section
      4), no trailing slash. Every way back from Stripe is built from it.
- [ ] **Supabase → Authentication → URL Configuration.** Site URL:
      `https://rankup.<your domain>`. Redirect URLs: `https://rankup.<your domain>/**`
      only. Not `https://*.<your domain>/**`: a sign-up confirmation or a
      password reset link must never be able to land on a sibling. (A local
      address such as `http://localhost:5173/**` belongs on a test project,
      not the live one.)
- [ ] **Stripe.** Nothing to type for the way back: checkout returns to
      `https://rankup.<your domain>/#/parent/plan?checkout=success` (or
      `=cancelled`), Flash Tickets to `/#/parent/settings?tickets=…`, a
      school to `/#/school?checkout=…`, all built from `PUBLIC_SITE_URL`. What
      you do set, in section 3: the webhook endpoint
      `https://rankup.<your domain>/api/stripe-webhook`, and the customer
      portal's default return link `https://rankup.<your domain>/#/parent/plan`.
      Under Settings → **Business → Public details**, the business name is
      **MTRX Horizyn**: it is what checkout pages and card statements show.
- [ ] **The MTRX Horizyn console.** In the console's settings:
      `RANKUP_URL=https://rankup.<your domain>` (its **Open app** button) and
      `RANKUP_STATS_URL=https://rankup.<your domain>/api/stats`, with the
      console's `MTRX_STATS_KEY` the same value as RankUp's `STATS_KEY`. The
      console asks from its server, not from a browser, so RankUp needs no
      CORS for it and has none.

### Email from the shared domain

RankUp's email comes from three places, listed with their words in
[EMAILS.md](EMAILS.md): Supabase (the sign-up confirmation, if **Confirm
email** is on, and the password reset links you send from the dashboard),
Stripe (receipts, and a failed payment or a cancelled plan, if you switch
those on), and RankUp's own code (the free trial's two reminders, sent by
`/api/send-trial-emails` through the provider's API with `EMAIL_API_KEY` and
`EMAIL_FROM`). Supabase's built-in sender is for testing (a handful an hour,
and only to your own team), so a live project needs its own:

- [ ] An email-sending provider, with the company's domain verified **once**.
      Each product sends from its own address on its own subdomain; RankUp's
      is **`no-reply@rankup.<your domain>`**, sender name **RankUp**.
- [ ] Supabase → Authentication → **Emails → SMTP Settings**: the provider's
      SMTP host, port, user and password; sender email
      `no-reply@rankup.<your domain>`; sender name `RankUp`.
- [ ] Supabase → Authentication → **Emails → Templates**: paste the words in
      [EMAILS.md](EMAILS.md) (Confirm sign up, Reset password). Each ends with
      the line `RankUp is a product of MTRX Horizyn.`, the same words as the
      privacy policy and terms. The company's name only: no person's name or
      address goes in an email.
- [ ] The same provider's **API key** for RankUp's own email: `EMAIL_API_KEY`,
      with `EMAIL_FROM=RankUp <no-reply@rankup.<your domain>>` and, if you
      like, `EMAIL_REPLY_TO` the company's support address (section 4).
- [ ] Stripe → Settings → **Customer emails** and **Billing → Subscriptions
      and emails**: the ones to switch on, and the words, are in
      [EMAILS.md](EMAILS.md).
- [ ] **SPF, DKIM and DMARC, set once on the parent domain**, not per product:
      - **DKIM**: the record(s) the provider gives you, at
        `<selector>._domainkey.<your domain>`. Mail it signs for
        `<your domain>` passes DMARC for `rankup.<your domain>` too, because
        DMARC's default (relaxed) alignment accepts any subdomain of the
        signing domain.
      - **SPF**: one TXT record at `<your domain>`,
        `v=spf1 include:<the provider's> ~all` (or the `include:` added to the
        one already there: a name may have only one SPF record). SPF is
        checked against the bounce address, which the provider sets; if it
        asks for a custom bounce domain under
        `rankup.<your domain>`, add that one record it names.
      - **DMARC**: one TXT record at `_dmarc.<your domain>`, starting with
        `v=DMARC1; p=none; rua=mailto:<a company address for reports>` and
        moving to `p=quarantine` once the reports show only your own mail.
        Subdomains, `rankup.<your domain>` included, follow it unless an
        `sp=` tag says otherwise, so no product needs a DMARC record of its
        own.
- [ ] Send yourself a reset link (Users → Send password recovery) and check,
      in the received message's headers, `spf=pass`, `dkim=pass` and
      `dmarc=pass`, and that the link opens on `https://rankup.<your domain>`.

## 2. Set up the database (about fifteen minutes)

In the Supabase SQL editor, run these files **in this order**. It is the order
the tests use (`supabase/test/run.sh`), and `tests/wiring.mjs` fails if this
list and that one ever differ. Leaving one out breaks that feature for every
family.

- [ ] `supabase/schema.sql`
- [ ] `supabase/sync.sql`
- [ ] `supabase/coparents.sql`
- [ ] `supabase/allowance.sql`
- [ ] `supabase/guilds.sql`
- [ ] `supabase/notifications.sql`
- [ ] `supabase/consent.sql`
- [ ] `supabase/billing.sql`
- [ ] `supabase/charity.sql`
- [ ] `supabase/alliances.sql`
- [ ] `supabase/schools.sql`
- [ ] `supabase/reminders.sql`
- [ ] `supabase/digests.sql`
- [ ] `supabase/referrals.sql`
- [ ] `supabase/retention.sql`
- [ ] `supabase/crashes.sql`
- [ ] `supabase/health.sql`

No storage bucket is needed: RankUp keeps no photos.

**Then check the server-only functions are shut to browsers.** The scheduled
jobs and the Stripe webhook use database functions that only the server may
call, and one of them lists parents' email addresses for the trial emails.
Supabase grants every new function to the browser's two roles by name, so
each of these is revoked from `public, anon, authenticated` (all three; 0.7.1
fixed the ones that named only `public`). Re-running the files applies it.
Check in the SQL editor; both answers must be `false`:

```sql
select has_function_privilege('anon', 'public.due_trial_reminders()', 'execute') as anon,
       has_function_privilege('authenticated', 'public.due_trial_reminders()', 'execute') as signed_in;
```

`supabase/test/32-definer-functions.sql` checks every such function on every
push.

**Upgrading later: run all the files again, in the same order, before the new
app goes live.** Every file, every time, not only the ones that changed: they
are written to be safe to run over a live database, and that is the whole
upgrade procedure. A newer app calling a function the older
database does not have yet is refused (a game, a gift or a purchase would show
as not accepted). The test suite applies every file twice and checks that every
table, row, function, trigger, policy and permission came through the second
time unchanged (`supabase/test/18-upgrade.sql`).

## 2a. Sign-in protection (five minutes, in the Supabase dashboard)

Parent sign-in, sign-up and password resets are Supabase's, not code in this
repository, so their limits are set in the dashboard.

- [ ] **Authentication → Rate Limits.** Supabase limits per IP address (sign-ins
      and sign-ups, token refreshes, verifications, emails, anonymous
      sign-ins). A child's phone signs in anonymously, so do not set that one
      below a few an hour. There is no per-account lockout: a slow guesser
      across many addresses is held back only by password strength.
- [ ] **Authentication → Providers → Email:** minimum password length 10, and
      leaked-password protection if your plan has it.
- [ ] **Do not turn on CAPTCHA.** The app sends no CAPTCHA token, so every
      sign-in would be refused.
- [ ] **Password resets.** The app has no "forgot password" screen. A parent
      who forgets theirs needs a reset link sent from the dashboard (Users →
      Send password recovery). A forgotten **Parent Mode PIN** needs nothing
      from you: "Forgot your PIN?" on the profile screen asks for the
      account's password, then a new PIN (5 wrong passwords and it waits
      before asking again; never on a child's phone). Set **Email OTP expiration** to 15 minutes. Once,
      on the live project, check a link is dead after the password has been
      changed: send one, change the password, then open the link. This cannot
      be tested locally.

## 2b. Schedule the jobs — none of them are optional

Set `CRON_SECRET` (section 4) to a long random string. Each job is one HTTP
request with the header `Authorization: Bearer <CRON_SECRET>`. They accept GET
or POST, because schedulers differ on which they send.

Six jobs:

| Job | How often | What breaks without it |
|---|---|---|
| `/api/send-reminders` | every 15 minutes | Daily reminders never arrive |
| `/api/send-digests` | hourly | The weekly digest never goes out |
| `/api/send-trial-emails` | hourly | No email three days before a free trial ends, or on the day. Needs `EMAIL_API_KEY` and `EMAIL_FROM` ([EMAILS.md](EMAILS.md)) |
| `/api/run-retention` | daily | Old activity piles up, and a deleted family's Stripe cancellation that failed is never retried |
| `/api/settle-alliances` | monthly (the 2nd) | Nobody is ever given their 20% discount |
| `/api/settle-schools` | monthly (the 2nd) | No District Champion, no School Stars, no free month |

The hourly digest is not wasteful: the database decides whose Sunday evening it
is, so an hourly run is what makes a digest arrive at six in the evening in every
time zone.

**On Vercel** the schedule is already in `vercel.json` (`crons`), and Vercel sends
the header itself once `CRON_SECRET` is set in the project. Nothing else to do.

**On Cloudflare Pages there is no scheduler.** Pages Functions cannot be run on a
timer, so these will never fire by themselves. Either point any outside scheduler
(a cron service, GitHub Actions on a schedule) at the six addresses with the
header, or deploy a small separate Worker with Cron Triggers that calls them. A
starting point for that Worker (not part of this repository, and not tested
here):

```js
// A separate Worker. Its wrangler.toml needs:
//   [triggers]
//   crons = ["*/15 * * * *", "5 * * * *", "35 * * * *", "20 3 * * *", "40 4 2 * *"]
// and two settings: SITE (https://rankup.<your domain>) and CRON_SECRET (the same value).
const JOBS = {
  '*/15 * * * *': ['send-reminders'],
  '5 * * * *': ['send-digests'],
  '35 * * * *': ['send-trial-emails'],
  '20 3 * * *': ['run-retention'],
  '40 4 2 * *': ['settle-alliances', 'settle-schools'],
}
// A job that stopped with more still due (it may make only so many requests
// in one run) answers { more: true }; calling it again starts a fresh run.
async function run(env, job) {
  for (let i = 0; i < 20; i += 1) {
    const res = await fetch(`${env.SITE}/api/${job}`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.more) return
  }
}
export default {
  async scheduled(event, env, ctx) {
    for (const job of JOBS[event.cron] || []) ctx.waitUntil(run(env, job))
  },
}
```

**The reminder and digest jobs pace themselves.** One run of a Pages Function
may make about a thousand requests on Workers Paid (each push is one) and has
a limit on processor time, so a run sends what fits, in batches it claims
first, and answers `"more": true` when it stopped with more still due. The
next run, or the scheduler calling again as above, carries on; nothing is
sent twice for it and nothing is dropped. 10,000 reminders due at the same
minute take eleven runs of about three to eight seconds each. A scheduler
that cannot call again (a plain cron service) sends about a thousand every 15
minutes, which is fine for a few thousand families; past that, call again on
`"more": true`, or schedule `/api/send-reminders` every 5 minutes, or set
`JOB_SUBREQUEST_LIMIT` if the plan allows more. See
[NOTIFICATIONS.md](NOTIFICATIONS.md).

### Knowing they are still running

Every job records each run, and `/api/health` reports how long each has been
quiet. Silence is how these fail: no error, just reminders that stop arriving.

```
GET https://rankup.<your domain>/api/health                                        -> {"ok":true,"version":"…"}, or 503
GET https://rankup.<your domain>/api/health  (Authorization: Bearer CRON_SECRET)   -> the detail, 503 if anything is wrong
```

Point a free uptime monitor at the first. It is public on purpose and says
nothing useful to a stranger. The second lists each job (`ok`, `stale`, or
`never_run`), crashes in the last 24 hours, deleted families whose Stripe
cancellation is more than a day overdue, and which settings are present (as
yes/no, never the values). What each one means and what to do:
[IF-SOMETHING-BREAKS.md](IF-SOMETHING-BREAKS.md).

A job that has **never** run says `never_run`, and counts as not healthy. Before
launch that is every job, and the deep check is red; that is expected. A month
in, it means the schedule was never set up.

### What retention deletes

Each day, exactly these, and nothing else
(`supabase/test/34-scheduled-jobs.sql` checks it deletes all of them and
changes no other row in any table):

| What | Once older than |
|---|---|
| Activity log entries (`events`), including the chore-edit history | 90 days (`RETENTION_EVENT_DAYS`) |
| Crash reports | 90 days (the same setting) |
| Pairing codes, counted from when they expired | 2 days (`RETENTION_PAIRING_DAYS`) |
| Pairing guess counts (the rate limit) | 2 days (the same setting) |
| Retry receipts (what stops a resent purchase charging twice) | 30 days |
| A deleted family's Stripe cancellation record, once Stripe confirmed it | 30 days (7 if there was nothing to cancel) |

It also cancels, at Stripe, any deleted family's subscription that could not
be cancelled at the moment of deletion, so it needs `STRIPE_SECRET_KEY` too. A
cancellation still waiting for Stripe is never deleted.

## 3. Get the keys

- [ ] `npx web-push generate-vapid-keys` → the public and private VAPID keys.
      Once, ever: changing them later stops every phone's notifications.
- [ ] Supabase → Settings → API → the project URL, the **anon** key and the
      **service role** key.
- [ ] Stripe → the plans and the ticket packs:
      - Starter is **free**: no Stripe price.
      - Standard: $9.99 a month **and** $99.90 a year → `STRIPE_PRICE_STANDARD`,
        `STRIPE_PRICE_STANDARD_YEAR`.
      - Elite: $15.99 a month **and** $159.90 a year → `STRIPE_PRICE_ELITE`,
        `STRIPE_PRICE_ELITE_YEAR`.
      - Three **one-off** Flash Ticket prices ($2.99 for 2, $5.99 for 5,
        $11.99 for 12) → `STRIPE_PRICE_FLASH_2`, `_FLASH_5`, `_FLASH_12`.
      - The School League: eight prices, a month and a year (ten months'
        money) for each size: up to 300 students $29 / $290, up to 800
        $59 / $590, up to 1,500 $99 / $990, more $149 / $1,490 → the
        `STRIPE_PRICE_SCHOOL_*` settings. See
        [PAYMENTS.md](PAYMENTS.md#the-school-league).

      These are the prices in the code (`TIERS` in
      `src/state/initialState.js`, `FLASH_TICKET_PACKS` in
      `src/lib/billing.js`, `SCHOOL_PRICES` in `src/lib/schools.js`); the app,
      the help pages and the terms all read them from there. A Stripe price
      must match the code's, or a family is shown one price and charged
      another. Yearly is ten months' money. A new family gets 14 days of Elite
      free, no card; a school 30 days.

      Set every yearly id if you sell yearly: a missing one means a family who
      has just paid for a year is put back on the free plan by the very
      message that was meant to upgrade them. How many tickets a pack gives,
      and what each skin costs, are fixed on the server: a buyer cannot pay for
      the small pack and be given the large one.
- [ ] Stripe → Developers → Webhooks → add `https://rankup.<your domain>/api/stripe-webhook`,
      and copy its signing secret. Send it **these events**:
      - `checkout.session.completed`
      - `checkout.session.async_payment_succeeded`
      - `customer.subscription.created`, `customer.subscription.updated`,
        `customer.subscription.deleted`
      - `invoice.paid` and `invoice.payment_succeeded`
      - `invoice.payment_failed` (received and deliberately ignored: the
        subscription's own status change is what moves the plan)
      - `charge.refunded` — without it a refunded plan or ticket pack is never
        taken back

      [PAYMENTS.md](PAYMENTS.md) says what each one does to a family.
- [ ] Stripe → Settings → Billing → **Customer portal**: turn it on. Cancelling
      and changing cards happen there. Its default return link:
      `https://rankup.<your domain>/#/parent/plan`.
- [ ] Stripe → Settings → Business → **Public details**: the business name
      **MTRX Horizyn**, the company's support email, and a statement
      descriptor that says RankUp (for example `MTRX RANKUP`), so a parent
      recognises the charge.

## 4. Set the settings on your host

Copy from `.env.example`, which lists every setting the code reads and nothing
else (`tests/config.mjs` fails otherwise). On Cloudflare Pages: the project's
Settings → Environment variables (they reach both the build and the functions).
On Vercel: Project Settings → Environment Variables.

**The rule that matters:** anything named `VITE_*` is built into the JavaScript
every phone downloads. A secret in a `VITE_` name is a published secret.

| Setting | What it is | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The project's address and public key, for the app. The server functions read the anon key too, when they ask the database something as the signed-in parent, so it must be set on the host, not only in a local file. | No |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The same address, and the key that bypasses every database rule | **Yes** |
| `PUBLIC_SITE_URL` | `https://rankup.<your domain>` (section 1a), no trailing slash. Stripe sends people back here; without it checkout and the billing portal refuse to start. The build reads it too: a pasted link's preview picture, `sitemap.xml` and the sitemap line in `robots.txt` need the whole address, and are left out without it. | No |
| `VITE_VAPID_PUBLIC_KEY` and `VAPID_PUBLIC_KEY` | The public push key, twice (the app and the server both need it) | No |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | The private push key, and `mailto:` a company address, e.g. `mailto:no-reply@rankup.<your domain>` | Private key: **yes** |
| `VITE_STRIPE_ENABLED` | `true` to switch billing on | No |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe's secret key and the webhook's signing secret | **Yes** |
| `STRIPE_PRICE_*` | The price ids from section 3 | No |
| `CRON_SECRET` | One long random string (`openssl rand -hex 32`) that protects all six scheduled jobs and the detailed health check | **Yes** |
| `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | The email provider's API key, who RankUp's own emails are from (`RankUp <no-reply@rankup.<your domain>>`), and an optional support address for replies. Only the trial reminders use them ([EMAILS.md](EMAILS.md)). Without the first two, `/api/send-trial-emails` sends nothing and the health check says so. Leave `EMAIL_API_BASE` unset: it is for the tests | Key: **yes** |
| `OPERATOR_SECRET` | A different long random string: your key to `/#/operator`, where you check each school is real | **Yes** |
| `STATS_KEY` | Optional. Lets your own console read two counts (families, active families) from `/api/stats`. Unset, that address does not exist. | **Yes** |
| `VITE_GUILDS_ENABLED` | Leave unset for launch (section 7) | No |
| `RETENTION_*`, `REMINDER_GRACE_MINUTES`, `DIGEST_WEEKDAY`, `DIGEST_HOUR` | Optional; the defaults are in `.env.example` | No |

Leave `VITE_DEMO_ON_BOOT` and `STRIPE_API_BASE` unset: one is for the shareable
preview build, the other for the tests.

**Deleting an account** goes through `/api/delete-account`, which needs
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY` and
`STRIPE_SECRET_KEY`: it deletes the family as the parent and then cancels the
family's Stripe subscription at once. If Stripe is down the account is still
deleted, and the daily retention job finishes the cancellation.

The app checks at start-up and shouts in the console if it finds a
secret-shaped value in a `VITE_` name, and `tests/bundle.mjs` builds the app
with every server setting given a fake value and checks none of them reached
the phone.

**Check the deploy instead of guessing:** `GET /api/health` with the
`CRON_SECRET` lists `database`, `payments`, `push`, `scheduled_jobs` and
`site_url` as true or false.

## 5. Fill in the placeholders

- [ ] `src/data/legalText.js` → `OPERATOR`. The name is already **MTRX
      Horizyn**: the privacy policy and terms say "RankUp is a product of MTRX
      Horizyn", and "we" means the company. Fill in the company's contact
      email (an address on `<your domain>`) and its registered postal
      address. The company's, never a person's: this repository and the app
      are public. The app shows a warning banner until both are filled in.
      Once the email is there, both help pages end with "Still stuck? Write
      to …" with it.
      The consent notice does not name the operator, so this needs no new
      consent version.
- [ ] Read the privacy policy and terms in that file from start to finish. They
      describe what the app does today. If you change what it does, change
      them.

## 6. Deploy and check it on real phones

- [ ] Run the SQL files (section 2), then push to GitHub; the host builds it.
- [ ] Open `https://rankup.<your domain>` on a **real phone**, not a desktop
      browser, and add it to the home screen (Share → Add to Home Screen).
- [ ] Walk the whole loop: sign up → consent → add a child → assign a chore →
      link a second phone with its code → tap "I did it!" on it → Accept → check
      the XP arrives on the child's phone.
- [ ] Turn notifications on (on the parent's phone) and check one really
      arrives, on Android and on an iPhone added to the home screen.
- [ ] In Stripe **test mode**, subscribe with card `4242 4242 4242 4242` and
      check the family becomes Elite. Then make a renewal fail (a test clock,
      with the card changed to `4000 0000 0000 0341`) and check the family
      drops to Starter and the dashboard says "A payment failed".
- [ ] Refund that test payment in full in Stripe and check the plan says "Your
      payment was refunded". (Cancel the subscription in Stripe as well: a
      refund does not.)
- [ ] Delete a test account (Settings → Delete my account) and check its
      subscription shows as cancelled in Stripe straight away.
- [ ] Check `GET /api/health` with the secret: every job `ok` once each has had
      a chance to run, `billing_cancellations_overdue` 0.
- [ ] Read both help pages on the phone: parents' (Settings → Help & about →
      Help) and schools' (`https://rankup.<your domain>/#/school/help`, also
      linked from the School League's page). Every price and number on them
      is read from the code; check they are what you mean to charge.
- [ ] Sign a test school up at `/#/school` (one form: your account and the
      school), then open `/#/operator` with `OPERATOR_SECRET`: the school is
      waiting, with a checklist of what to check and what RankUp knows.
      Tick every check, verify, and see it ranked.
- [ ] With a test family three days from the end of its free trial, check
      the trial email arrives (and again on the last day), from
      `no-reply@rankup.<your domain>`. In the database:
      `update families set trial_ends_at = now() + interval '3 days' where name = '<test family>'`,
      then wait for the hourly job.

## 7. Keeping the legal side small

The app is built so there is little to be responsible for:

- **No photos at all.** RankUp never takes, sends or keeps a picture. A parent
  who wants proof gets a photo from the child's own camera app, by message, and
  taps Accept. There is no photograph of a child or a home on any RankUp server.
- **Guilds are off by default.** Child-to-child contact across families is the
  heaviest obligation in the product and nobody subscribes for it. Leave
  `VITE_GUILDS_ENABLED` unset for launch.

That leaves a first name, chore history and XP. Still children's data, still
covered by COPPA, but a far smaller thing to defend.

**The cheap way to cover it:** an FTC-approved COPPA Safe Harbor programme such
as **kidSAFE** or **PRIVO**. They review the app and certify it, and the badge is
useful with parents. Check their current prices; it is a yearly fee.

Free things worth doing first, either way:

- [ ] The **ICO Children's Code self-assessment** (UK), online
- [ ] The **FTC's COPPA Six-Step Compliance Plan**, short and readable

## 8. Or the lawyer route ⚠️

**Before one real child's data exists.** Not after a pilot.

- [ ] One paid consultation with a solicitor or attorney who knows children's
      apps. Take [LEGAL.md](LEGAL.md), `src/data/legalText.js` and this list.
- [ ] Ask specifically: is the consent method enough where you are; guild chat
      between children in different families; is age verification needed
      beyond a parent's word.
- [ ] Register with the ICO if you are in the UK.
- [ ] Have them check the privacy policy and terms: an honest draft written
      from what the code does, not a lawyer's document.

## 9. Before you take money

- [ ] The purchaser must be the parent. Payments are behind the parent PIN and a
      child's phone has no way to a payment screen; check that yourself on a
      real child's phone.
- [ ] The Sunday Market is a timed-scarcity mechanic aimed at children, and a
      Flash Ticket is a paid way out of missing one. Regulators look hard at
      that. What keeps it defensible: it sells only cosmetics, shows no
      countdown, and every skin comes back. Keep all three true.
- [ ] Price, renewal date and how to cancel shown before payment.
- [ ] A refund policy, written down and reachable from the app.
- [ ] Stripe Tax switched on.
- [ ] Cancel a real subscription yourself and check it works end to end.

## 10. Then, the important one

**Use it with one real family for a week before telling anyone else.**

Every automated check here passes. None of them can tell you whether a parent
will open the app to accept a chore, which is what the whole product rests on.

---

## What is not built yet

Say so honestly when you launch.

| | Why |
|---|---|
| **Notifications on a child's phone** | Only a parent's phone has the switch, so "Accepted!" and "Back on your list" reach no phone yet; the child sees them on opening RankUp. See [NOTIFICATIONS.md](NOTIFICATIONS.md). |
| **A real phone receiving a push** | Proven against a stand-in push service, not yet a real one. Section 6. |
| **Forgot password** | No screen; you send a reset link from the Supabase dashboard (section 2a). |
| **Guilds** | Built and tested, switched off. Turn on with `VITE_GUILDS_ENABLED=true` once you are ready for child-to-child contact and the moderation it needs. |

The full list, in order: [ROADMAP.md](ROADMAP.md).

## Running the tests

```bash
bash supabase/test/up.sh       # Postgres, the schema, the stand-in API, the dev server
npm run test:db                # the SQL suite: about 1,000 checks, no browser
npm run test:refusals          # every refusal reason in the SQL is given by a test
npm run test:static            # settings, routes, jobs and SQL order agree; nothing shared with sibling sites
npm run test:awards            # the rules, in Node, against Postgres
npm run test:smoke             # the app in a real browser
npm run test:sync              # two and three phones against Postgres
npm run test:built             # the production build: no secrets, the policy, the framed games
bash supabase/test/up.sh --cf && npm run test:api   # the server functions under workerd
```

[tests/README.md](../tests/README.md) and
[supabase/test/README.md](../supabase/test/README.md) say what each one covers.
