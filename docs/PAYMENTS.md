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

## Still to do

**The 20% Discount Tournament** is the one feature that needs billing and does
not have it. Awarding it means applying a Stripe coupon to ten separate
subscriptions from a monthly job. The leaderboard exists; the discount does not
reach a bill.

**Before charging a single real family**, confirm all of:

- The purchaser is the parent. A subscription bought by a child is
  chargeable-back and, in the US, specifically actionable.
- Price, renewal date and cancellation route are disclosed before payment.
- Sales tax / VAT is handled — Stripe Tax does most of it.
- Your refund policy is written down and reachable from the app.

The parental consent this app records is tied to the card payment, which is one
of COPPA's accepted verification methods. That is a genuine reason to have
billing live before you take real families — see [LEGAL.md](LEGAL.md).
