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
https://rankup.<your domain>/api/stripe-webhook
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
- `charge.dispute.created` (a chargeback: only takes back a referral's free
  month, see "Bring a friend" below; the plan follows the subscription's
  own events)

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**The signature check is not optional.** Without it, anyone who finds that URL
can post "subscription active" and give themselves Elite for ever. The handler
reads the raw request body specifically so the signature verifies — a JSON
parser re-serialises, the bytes change, and the check fails, which people then
"fix" by removing the check. Do not.

### 5. Test before going live

Use Stripe's test mode and the CLI:

```bash
# The functions run on :8788 (see supabase/test/serve-functions.sh; the dev
# server on :5173 does not serve /api). Give them the STRIPE_WEBHOOK_SECRET
# and STRIPE_SECRET_KEY that `stripe listen` and your test account use.
stripe listen --forward-to localhost:8788/api/stripe-webhook
stripe trigger checkout.session.completed
```

Card `4242 4242 4242 4242` succeeds; `4000 0000 0000 0341` attaches and then
fails to charge. Put it on a test subscription and make it renew (a test
clock) to check that a failed renewal really drops the family to Starter and
the dashboard says "A payment failed" (the table below).

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
| ... and then Stripe says `active` again for the **same period** (cancelling in the portal does this) | stays Starter, `refunded` | still "Your payment was refunded" |
| ... and then a renewal into a **new period** | the plan they pay for | the notice goes |
| `charge.refunded`, partly, or an earlier period's payment (a later invoice was paid since) | unchanged | nothing |
| `charge.refunded`, a Flash Ticket pack in full | unchanged | the pack's tickets are taken back, as many as are left (never below zero) |
| `active`, but cancelled in the portal (`cancel_at_period_end`) | unchanged until it ends | "Your plan is ending", with the date, on the plan screen only |
| `customer.subscription.deleted` (the plan ended) | Starter, status `canceled` | "Your plan has ended", on the plan screen only |
| back to `active` | the plan they pay for | the notice goes |

Every status Stripe sends can be stored. The column used to accept only five
of them, so `unpaid`, `incomplete`, `incomplete_expired` and `paused` made the
webhook fail on every retry and left the family on the plan they had stopped
paying for. Each of these, and a refund or a pack credited once however often
it is replayed, is checked by `tests/api.mjs` through the real runtime.

**A refund in full does not cancel the subscription in Stripe.** Cancel it
there too, or the next renewal charges the card and puts the plan back. Until
it is cancelled (or the parent cancels it from "Manage billing"), checkout
refuses to start a second plan beside it (`refunded_plan_renews`): the plan
screen says "choose a plan below", and both subscriptions would otherwise have
charged the card every period. Until
then Stripe goes on calling the subscription `active`, and cancelling it in the
portal at the end of the period says `active` once more: the webhook used to
take that as the plan coming back, so a refunded family had its plan again,
free, until the period ended. A period refunded in full now stays refunded
until a renewal starts a new one (`apply_subscription_change`).

A plan that has ended says so as it is: the family is on Starter from the
moment Stripe ends it. The plan screen used to say "It runs until" the end of
the period for a plan cancelled at once, to a family already on Starter. A plan
cancelled in the portal and still running says "Your plan is ending" and the
date it stops.

**All of it, one family's whole life in order:** `tests/billingwalk.mjs`
subscribes a family monthly, renews, fails a payment, refunds, cancels and
subscribes again for a year, through the real checkout, portal and signed
webhook against a stand-in Stripe, delivering events twice and out of order at
every step. After each step it checks the plan the database holds, the plan
screen's and the dashboard's words, and what the child can use: the plan the
child's own phone works out, the XP a chore pays (Elite's boost), and whether a
second child can be added. It does the same for a school. The database's half
on its own is `supabase/test/41-billing-walk.sql`.

When Stripe itself is down, checkout and the billing portal answer
`stripe_unavailable` within about twenty seconds, and the app says Stripe is
not answering and that nothing about the plan has changed.
---

## Bring a friend: a free month

When a family invites a friend's family (its code, in Settings → "Invite a
family, get a free month") and that family **starts paying**, the inviting
family gets **one free month of its plan**. The family who joins gets 30 days
of Standard when its first chore is accepted, as before. The inviting family
used to get 30 days too for that chore; that is replaced by the free month,
so one friend is paid for once.

**When it is earned.** On the invited family's first invoice that took money,
monthly or yearly (`invoice.paid` / `invoice.payment_succeeded` with
`amount_paid > 0`). A trial's $0 invoice, a failed payment
(`invoice.payment_failed` never earns anything) and a payment already refunded
in full or disputed when its invoice arrives do not count. The webhook asks
`earn_referral_reward` (`supabase/referrals.sql`), which keeps the invoice on
the referral, so it is decided **once**: Stripe's two events for one payment,
its retries and the invited family's later invoices all answer `duplicate`.

**How it is given: a customer balance credit.** One month at the price of the
plan the inviting family pays for, read from its own Stripe subscription (a
yearly plan gets a twelfth of its yearly price, so $159.90 a year gives
$13.33), in its currency, as a negative balance transaction on its customer
(`api/_shared/referralReward.js`). Stripe takes it off the next invoice by
itself. This is how the Alliance and School League prizes are already paid:

- not a coupon, which takes a percentage off the next invoice, and for a yearly
  plan would be a free year
- not a pause or a longer trial on the subscription: subscriptions are made by
  Checkout and changed only in Stripe's portal, and a credit touches neither
- the credit carries the idempotency key `referral-reward:<invited family>`,
  so a replay, a timeout retry or two deliveries at once give one credit. If
  Stripe fails, the webhook answers 500 and Stripe's retry gives it.
- nothing about the invited family goes to Stripe: the description is the same
  words for everyone ("A free month: a family you invited started paying") and
  there is no metadata

**A family on Starter (or still on its in-app trial)** pays nothing, so there is
nothing to take a month off. Its month is **banked**: the card says "1 free
month banked. It comes off your first bill when you choose a plan.", and the
moment the webhook records its first subscription (`active` or `trialing`), the
banked month is credited at the price of the plan it chose. It is not turned
into free Standard time: that is what the joining family gets, and twelve
Standard months a year would be a free plan for never paying.

**Limits**, all in the database:

| Rule | How |
|---|---|
| No self-referral | Not the same family; not a family with a parent whose email is the same (case, spaces and a `+tag` ignored); not a family paying with the inviter's Stripe customer. Checked when the code is claimed (`same_household`) and again when the reward is decided (`blocked`, `same_email` / `same_customer`) |
| One reward per invited family | The reward lives on the `referrals` row, whose key is the invited family |
| At most 12 a year | `referral_reward_cap()`: free months earned in the last 365 days. The thirteenth is `blocked`, `cap`, and the card says the family has had the most there is |
| Refunded within 14 days | `referral_refund_days()`. A full refund (`charge.refunded`) or a dispute (`charge.dispute.created`) of the invited family's first payment within 14 days of it withdraws the month if it is unused: a banked or not-yet-credited month at once; a credited one only if the inviting family's Stripe balance still holds at least that much credit (it is then reversed with a positive balance transaction, key `referral-withdraw:<invited family>`). Already used on an invoice, or refunded later than 14 days: it stays, and `reward_note` says what happened (`refund_within_14_days_credit_used`, `refund_after_14_days`) |

The first payment is recognised by its charge or payment intent (read from the
invoice, or from Stripe's invoice payments on API versions where the invoice no
longer names them). A refund or dispute that arrives **before** its invoice is
remembered, and that invoice then earns nothing. A Flash Ticket pack refund is
never mistaken for it.

**What families see.** The card in Settings, and a shorter copy on the plan
screen: the code, how many families joined with it and how many pay, and the
free months (earned, on the way, banked, taken back). Counts only:
`my_referrals()` returns no other family's name, id, email or dates, and
answers a child's phone and a supporter with nothing. "You earned a free
month" shows once on the parent's dashboard; OK on one phone is seen for the
family (`see_referral_rewards()`). No email, and nothing on a child's screen.
"Download my data" includes the family's referrals: whether it joined with a
code, how many joined with its own, and each free month it earned, never which
families they were.

**Tests.** `supabase/test/54-referral-rewards.sql` (every rule, the counts, the
revokes), `tests/billingwalk.mjs` "Bring a friend" (the real webhook under
workerd against a stand-in Stripe: a trial, a $0 and a failed invoice earn
nothing; the first paid invoice credits the inviter once, through replays and
out-of-order events; the same customer and the cap; a refund within 14 days
reversing the credit; a dispute before its invoice; a Starter family's month
banked and credited when it subscribes), and `tests/referrals.mjs` (the card,
the notice once, and no child's screen mentioning it).

Run `supabase/referrals.sql` again on the live database (after `billing.sql`,
in the documented order), and `consent.sql` (the download), and add
`charge.dispute.created` to the webhook's events.

---

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
POST https://rankup.<your domain>/api/settle-alliances
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
  family's plan. A failing card keeps the school playing while Stripe retries,
  and the school's page tells its admin "A payment failed" and where to change
  the card. As for a family: events older than the school's latest are ignored
  (a late "active" used to put a school whose plan had ended back in the
  league); a refund in full of the current period takes the school out of the
  league (it was answered and ignored, so a refunded school stayed in as a
  paying one), and "active" for that same period does not put it back; a plan
  cancelled in the portal says when it stops. A paying school's admin reaches
  "Card, invoices and cancelling": the portal used to refuse exactly the
  schools that were paying.
- **Each month**, schedule `api/settle-schools.js` the same way as the alliance
  job (it is in `vercel.json`, a day after the month ends):

  ```
  POST https://rankup.<your domain>/api/settle-schools
  Authorization: Bearer <CRON_SECRET>
  ```

  It closes the month (District Champions, rivalry results, School Stars) and
  gives each Champion its free month: one month's price as credit on its
  Stripe account if it pays (so a yearly plan gets a month off, not a year),
  thirty more trial days if it is still on its trial. A free month that could not be
  given stays owed and is tried again next run. It never gives one twice.
- **Checking schools are real**: open `https://rankup.<your domain>/#/operator` and type
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
