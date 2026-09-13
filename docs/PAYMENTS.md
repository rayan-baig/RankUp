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

In the Stripe dashboard, two recurring monthly prices:

| Product | Price | Note the price id |
|---|---|---|
| RankUp Standard | $9.99 / month | `price_...` → `STRIPE_PRICE_STANDARD` |
| RankUp Elite Pass | $15.99 / month | `price_...` → `STRIPE_PRICE_ELITE` |

### 2. Run the SQL

`supabase/billing.sql` in the Supabase SQL editor, after `schema.sql`.

### 3. Set the environment variables

```bash
VITE_STRIPE_ENABLED=true          # turns on real checkout in the app

# SERVER ONLY — never a VITE_ name
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD=price_...
STRIPE_PRICE_ELITE=price_...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 4. Point the webhook at your deployment

Stripe dashboard → Developers → Webhooks → add an endpoint:

```
https://your-domain.com/api/stripe-webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

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

## Cancelling and card changes

These go to Stripe's own customer portal (`/api/billing-portal`), not to
screens rebuilt here. That is deliberate: how cancellation is presented carries
legal obligations in several places, and Stripe keeps theirs current.

Enable the portal once in Stripe: Settings → Billing → Customer portal.

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
approved quests for the month, and `api/settle-alliances.js` gives the winner a
20% Stripe coupon. **Nothing pays out until you schedule that endpoint**, so
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

- **It cannot pay twice.** The award row's key is (alliance, month), and the
  function returns only rows it actually inserted. A second run issues nothing.
- **It cannot be called by a customer.** `settle_alliances` is revoked from
  `public`, so even a leaked user token cannot reach it, and the endpoint needs
  the shared secret on top.
- **It cannot be steered.** The winner is computed from approved submissions in
  the database. The request body names a month and nothing else.

If Stripe rejects a coupon, that award stays `applied_at = null` rather than
being marked paid, so an unpaid winner is visible instead of silently lost.

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
