# Payments

Billing is built and wired. It is **off until you connect your own Stripe
account**, because only you can do that — it needs your business details and
your bank account.

With it off, the plan screen flips tiers locally so both can be tried, and says
plainly that nothing is being charged.

---

## The rule everything else follows from

**A family's tier is written by Stripe's webhook and by nothing else.**

Not by the app, not by a device, not by a request. The database enforces it:
`UPDATE` on `families` is granted only for `name` and `parent_theme_id`, so a
parent writing `tier = 'elite'` is refused outright rather than silently
ignored. `supabase/test/08-billing.sql` proves it.

It also **fails closed**. Anything other than an active or trialing
subscription resolves to Standard — past due, cancelled, unpaid, unknown. The
failure direction matters: if the webhook is misconfigured nobody gets Elite,
rather than everybody getting it free.

And a downgrade never takes anything away from a child. XP, level, currency and
streaks are untouched by any billing change. Elite features lock; earned
progress does not.

---

## Setting it up

### 1. Create the products

In the Stripe dashboard, two products, each with a monthly and a yearly
recurring price (the plan screen offers both; a year is ten months' money):

| Product | Price | Note the price id |
|---|---|---|
| RankUp Standard | $9.99 / month | `price_...` → `STRIPE_PRICE_STANDARD` |
| RankUp Standard | $99.90 / year | `price_...` → `STRIPE_PRICE_STANDARD_YEAR` |
| RankUp Elite Pass | $15.99 / month | `price_...` → `STRIPE_PRICE_ELITE` |
| RankUp Elite Pass | $159.90 / year | `price_...` → `STRIPE_PRICE_ELITE_YEAR` |

Starter is free and has no Stripe price. `tests/plans.mjs` reads this table
and fails if a price on the plan screen is not in it.

### 2. Run the SQL

`supabase/billing.sql` in the Supabase SQL editor, after `schema.sql`.

### 3. Set the environment variables

```bash
VITE_STRIPE_ENABLED=true          # turns on real checkout in the app

# SERVER ONLY — never a VITE_ name
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD=price_...
STRIPE_PRICE_STANDARD_YEAR=price_...
STRIPE_PRICE_ELITE=price_...
STRIPE_PRICE_ELITE_YEAR=price_...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 4. Point the webhook at your deployment

Stripe dashboard → Developers → Webhooks → add an endpoint:

```
https://your-domain.com/api/stripe-webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded` (bank payments that clear later)
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid` and `invoice.payment_succeeded` (record each renewal's money)
- `invoice.payment_failed` (received and deliberately ignored: the
  subscription's own status change is what moves the plan)
- `charge.refunded` (a refund: see "Refunds and failed payments" below)

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**The signature check is not optional.** Without it, anyone who finds that URL
can post "subscription active" and give themselves Elite for ever. The handler
reads the raw request body specifically so the signature verifies — a JSON
parser re-serialises, the bytes change, and the check fails, which people then
"fix" by removing the check. Do not.

### 5. Test before going live

Use Stripe's test mode and the CLI:

```bash
stripe listen --forward-to localhost:5173/api/stripe-webhook
stripe trigger checkout.session.completed
```

Card `4242 4242 4242 4242` succeeds; `4000 0000 0000 0341` fails after
attaching — use it to check that a failed payment really does drop the family
to Standard.

---

## Refunds and failed payments

What the webhook does, and what the parent is told. The words are in
`billingNotice` in `src/lib/billing.js`; they show on the plan screen and,
for a payment problem, on the parent dashboard.

| Stripe says | Plan | The parent sees |
|---|---|---|
| `past_due` (a renewal's card was declined; Stripe is retrying) | Starter at once | "A payment failed", naming the plan that stopped, and "Manage billing" to update the card |
| `unpaid` / `incomplete_expired` (Stripe gave up) | Starter | "Your plan has stopped" |
| `paused` (a trial ended with no card) | Starter | "Your plan is paused" |
| `charge.refunded`, the plan's payment **in full** | Starter, status `refunded` | "Your payment was refunded" |
| `charge.refunded`, partly, or an earlier period's payment (a later invoice was paid since) | unchanged | nothing |
| `charge.refunded`, a Flash Ticket pack in full | unchanged | the pack's tickets are taken back, as many as are left (never below zero) |
| back to `active` | the plan they pay for | the notice goes |

Every status Stripe sends can be stored. The column used to accept only five
of them, so `unpaid`, `incomplete`, `incomplete_expired` and `paused` made the
webhook fail on every retry and left the family on the plan they had stopped
paying for. Each of these, and a refund or a pack credited once however often
it is replayed, is checked by `tests/api.mjs` through the real runtime.

**A refund in full does not cancel the subscription in Stripe.** Cancel it
there too, or the next renewal charges the card and puts the plan back.

When Stripe itself is down, checkout and the billing portal answer
`stripe_unavailable` within about twenty seconds, and the app says Stripe is
not answering and that nothing about the plan has changed.

## Cancelling and card changes

These go to Stripe's own customer portal (`/api/billing-portal`), not to
screens rebuilt here. That is deliberate: how cancellation is presented carries
legal obligations in several places, and Stripe keeps theirs current.

Enable the portal once in Stripe: Settings → Billing → Customer portal.

---

## When a family deletes its account

Deleting the account (Settings → Delete my account) **cancels the family's
Stripe subscription at once**, so the card is never charged again. Before
this, the database removed the family and with it the only link to the
subscription, which went on renewing every month for an account that no
longer existed.

How it works, and why it cannot lose one:

- The app asks `/api/delete-account` (`api/delete-account.js`) with the
  parent's own token. That calls `delete_family_account` as the parent (same
  rules as ever: a parent, the typed DELETE), which removes the family and, **in
  the same transaction**, writes its customer and subscription ids into
  `billing_cancellations`. If the deletion fails nothing is queued; if it
  succeeds the cancellation cannot be lost.
- The endpoint then cancels with the secret key, on the server. Every live
  subscription on the family's customer is cancelled (not only the one the
  family row knew of: a checkout that had just completed is caught too), at
  once, with `invoice_now=false` and `prorate=false`, so there is no final
  invoice. A school's plan on the same customer is left alone.
- **The account is deleted whatever Stripe does.** If Stripe is down or
  refuses, the endpoint still answers `ok`, and the row stays queued with the
  error. The daily `/api/run-retention` tries everything still queued, and so
  does the webhook whenever Stripe sends news about that family, until Stripe
  confirms. A row is marked done only on Stripe's confirmation, and a
  subscription Stripe has already cancelled counts as done.
- **It is never forgotten.** Retention never deletes a row still waiting, and
  `/api/health` reports `billing_cancellations_overdue` (and is not ok) for any
  that has waited more than a day: Stripe refusing, or `STRIPE_SECRET_KEY` not
  set on the retention job.
- **Idempotent.** Each cancel carries an idempotency key; running the queue
  again, or two runs at once, cancels nothing twice.
- **A checkout paid after the deletion** (a payment page left open) is caught
  by the webhook: it recognises the deleted family and cancels the new
  subscription before it renews. An app opened before this change, which asks
  the database directly, still queues the cancellation; the daily job makes it.

Webhook events about a deleted family (including the "subscription deleted"
the cancellation itself causes) are answered `200` and dropped, rather than
failing and being retried by Stripe for three days. A payment already taken is
still recorded for the totals, against no family. Events for a family id this
database never had are dropped too, and their subscriptions are **never**
cancelled: only a family known to have deleted itself here is.

**The Stripe customer is kept.** It holds the invoices and payments the family
made, which you must keep for tax, and it is what a refund or a chargeback on
those payments is handled against. Stripe keeps those records whatever happens
to the customer. RankUp's database keeps only the queue row (the customer and
subscription ids, under a one-way fingerprint of the family id rather than the
id itself), until 30 days after Stripe confirmed the cancellation. Every
deletion also leaves that fingerprint, with no Stripe ids, for a week, so a
late checkout can be recognised. If a parent asks for the Stripe record to be
erased too, delete the customer in the Stripe dashboard once you no longer
need its payments for tax or disputes.

No refund is given automatically for the rest of the period. If you want to
give one, refund the last payment in Stripe; the webhook handles it.

**Withdrawing consent is not deleting the account.** It removes the children
and keeps the parent's account, so the subscription carries on until the
parent cancels it in the billing portal or deletes the account; the
withdrawal screen says so. **Schools** have no deletion of their own: the last
member of staff cannot leave a school, and a school cancels from its School
League page through the portal. Deleting a parent's account never touches a
school's plan.

`tests/api.mjs` drives all of this through the real runtime against a
stand-in Stripe: deleting with Stripe up, down and not answering, an older app
deleting through the database, a subscription already cancelled, a checkout
paid after the deletion, and a family the database never had.
`supabase/test/30-deleted-billing.sql` checks the queue itself.

---

## What this costs you

Stripe takes about 2.9% + 30¢ per transaction. On $9.99 that is roughly 59¢, so
you keep about $9.40.

If you ever ship native iOS or Android apps, Apple and Google **require** their
own billing for digital subscriptions and take 15–30%. On $9.99 that is
$1.50–$3.00 per family per month. It is a real argument for staying a web app
longer than feels comfortable.

---

## The 20% Discount Tournament — one thing you must schedule

Parent Alliances are real: `supabase/alliances.sql` counts each member family's
approved quests for the month, and `api/settle-alliances.js` gives the winner
20% of one month's price as credit on their Stripe account (worked out from
their own subscription, so a yearly plan gets 20% of a month, not of a year). **Nothing pays out until you schedule that endpoint**, so
until you do, families will see a leaderboard and never see a discount.

Set `CRON_SECRET` to a long random string, then call it once a month:

```
POST https://your-site/api/settle-alliances
Authorization: Bearer <CRON_SECRET>
```

On Cloudflare, a Worker Cron Trigger; on Vercel, a `vercel.json` cron; anywhere
else, whatever runs a monthly job. Run it a day or two into the month so the
previous month is definitely closed — with no body it settles the month just
gone, and it accepts `{"month":"YYYY-MM-01"}` to catch up a missed one.

Three properties make it safe to retry, and they are covered by
`supabase/test/10-alliances.sql`:

- **It cannot pay twice.** The award row's key is (alliance, month), and each
  credit is sent to Stripe with an idempotency key naming the award, so even a
  run that dies half way and is run again gives each prize once.
- **It does not forget.** Each run gives every prize still owed
  (`unapplied_alliance_awards`), not only the month it has just decided, so a
  prize Stripe refused last time is tried again.
- **It cannot be called by a customer.** `settle_alliances` is revoked from
  `public`, so even a leaked user token cannot reach it, and the endpoint needs
  the shared secret on top.
- **It cannot be steered.** The winner is computed from approved submissions in
  the database. The request body names a month and nothing else.

If Stripe refuses a credit, that award stays `applied_at = null` rather than
being marked paid, so an unpaid winner is visible instead of silently lost.

---

## The School League

Schools pay by size. In Stripe, make one product, "RankUp School League", with
eight recurring prices, and put their ids in the `STRIPE_PRICE_SCHOOL_*`
variables (see `.env.example`):

| Size | Students | Monthly | Yearly |
|---|---|---|---|
| small | up to 300 | $29 | $290 |
| medium | 301–800 | $59 | $590 |
| large | 801–1,500 | $99 | $990 |
| xl | 1,501+ | $149 | $1,490 |

The same numbers are in `supabase/schools.sql` and `src/lib/schools.js`, and
`tests/schools.mjs` fails if those two disagree. If you change a price, change
it in Stripe too.

- **Checkout** is `api/school-checkout.js`. Only a school's admin can start it,
  and the price is picked from the school's own size, never from the request.
  Days left on the 30-day free trial carry onto the card. A checkout page
  opened before the school corrected its size still carries the old price, so
  the webhook checks every live school subscription against the school's band
  and moves it to the right price from the next invoice (no proration). A
  price you set by hand in Stripe, outside the eight band prices, is left
  alone.
- **The webhook** you already have handles schools as well. A school's events
  carry `school_id`; they switch the school on and off and never touch a
  family's plan. A failing card keeps the school playing while Stripe retries.
- **Each month**, schedule `api/settle-schools.js` the same way as the alliance
  job (it is in `vercel.json`, a day after the month ends):

  ```
  POST https://your-site/api/settle-schools
  Authorization: Bearer <CRON_SECRET>
  ```

  It closes the month (District Champions, rivalry results, School Stars) and
  gives each Champion its free month: one month's price as credit on its
  Stripe account if it pays (so a yearly plan gets a month off, not a year),
  thirty more trial days if it is still on its trial. A free month that could not be
  given stays owed and is tried again next run. It never gives one twice.
- **Checking schools are real**: open `https://your-site/#/operator` and type
  your `OPERATOR_SECRET`. New schools are listed first, with who signed each up
  and their email; verify, un-verify, suspend or lift a suspension there.
  Until a school is verified it is in no league and sees no child's name.

---

## Still to do

**Before charging a single real family**, confirm all of:

- The purchaser is the parent. A subscription bought by a child is
  chargeable-back and, in the US, specifically actionable.
- Price, renewal date and cancellation route are disclosed before payment.
- Sales tax / VAT is handled — Stripe Tax does most of it.
- Your refund policy is written down and reachable from the app.

The parental consent this app records is tied to the card payment, which is one
of COPPA's accepted verification methods. That is a genuine reason to have
billing live before you take real families — see [LEGAL.md](LEGAL.md).
