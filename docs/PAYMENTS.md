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
recurring price (the plan screen offers both):

| Product | Price | Note the price id |
|---|---|---|
| RankUp Standard | $5.99 / month | `price_...` → `STRIPE_PRICE_STANDARD` |
| RankUp Standard | $49.99 / year | `price_...` → `STRIPE_PRICE_STANDARD_YEAR` |
| RankUp Elite Pass | $9.99 / month | `price_...` → `STRIPE_PRICE_ELITE` |
| RankUp Elite Pass | $79.99 / year | `price_...` → `STRIPE_PRICE_ELITE_YEAR` |

A year saves $21.89 on Standard (30%) and $39.89 on Elite Pass (33%) against
twelve monthly payments. Neither is a whole number of months, so the plan
screen's Monthly / Yearly switch says "Save 30% or more" (the smaller of the
two, so it never promises more than the plan a parent picks) and each card
gives its own saving in dollars. All of it is worked out from `TIERS` by
`annualSaving` and `yearlyNote` in `src/lib/plans.js`.

Starter is free and has no Stripe price. `tests/plans.mjs` reads this table
and fails if a price on the plan screen is not in it.

And, for gifts (a year bought for another family, below), a product such as
**RankUp gift** with two **one-time** prices, not recurring:

| Product | Price | Note the price id |
|---|---|---|
| RankUp gift | $49.99 once (a year of Standard) | `price_...` → `STRIPE_PRICE_GIFT_STANDARD_YEAR` |
| RankUp gift | $79.99 once (a year of Elite Pass) | `price_...` → `STRIPE_PRICE_GIFT_ELITE_YEAR` |

They must be the yearly amounts in `TIERS`, exactly like the four above: the
Give page shows `TIERS`, and Stripe charges the price. A price change follows
"Changing a price" below for these two as well.

### Changing a price

The prices a parent reads (plan screen, banners, front door, help page, terms)
all come from `TIERS` in `src/state/initialState.js`. What a card is charged
comes from the Stripe price whose id is in `STRIPE_PRICE_*`. Nothing in the
code compares the two: checkout only names a price id, and the webhook maps a
price id to a plan without looking at the amount. So **the app shows what
Stripe charges a new family only if each of the four ids is a Stripe price for
exactly the amount in `TIERS`**, monthly and yearly. That is the guarantee, and
it is kept by hand, in this order:

1. In Stripe, on the existing products, add a new recurring price for each
   new amount (a Stripe price's amount cannot be edited). Leave the old
   prices where they are: families on them still renew through them.
2. Put the four new price ids in `STRIPE_PRICE_STANDARD`,
   `STRIPE_PRICE_STANDARD_YEAR`, `STRIPE_PRICE_ELITE` and
   `STRIPE_PRICE_ELITE_YEAR` on the host, and deploy the version whose
   `TIERS` has the same amounts, at the same time. Between the two, a new
   family is shown one price and charged the other.
3. Open the plan screen, start a checkout for each of the four, and check that
   Stripe's page shows the same amount as the button. Cancel each one.

**Families already subscribed stay on the price they signed up at** until
they are moved. Stripe never changes an existing subscription's price by
itself, and nothing in RankUp does either. Either of these is fine; pick one
on purpose:

- **Keep them as they are.** Nothing to do. They go on paying the old price
  until they cancel or change plan. Their plan is unaffected: once
  `STRIPE_PRICE_*` holds the new ids, the webhook no longer knows the old ones
  and goes by the plan RankUp's checkout wrote on the subscription
  (`metadata.tier`), which every subscription it made carries
  (`tests/api.mjs` checks it). A subscription you made by hand in Stripe,
  without that metadata, would fall to Starter: move it instead. The new
  prices are lower, and a family will see them on the plan screen, so it is
  worth telling them they can move.
- **Move them in the Stripe dashboard.** Customers → the subscription →
  Update subscription → replace the price with the new one for the same plan
  and the same period, with no proration, so the new amount starts at the next
  renewal. A yearly subscriber moves at the end of the year they have paid
  for. The webhook sees the new price id and keeps the family on the same
  plan.

The plan screen only ever shows the current prices. A family still on an old
price sees the new one there; its own amount is on its Stripe invoices and in
"Manage billing".

The referral free month and the Alliance prize are read from the family's own
Stripe subscription, not from `TIERS`, so a family on an old price gets a
month at the price it really pays.

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
STRIPE_PRICE_GIFT_STANDARD_YEAR=price_...   # one-time
STRIPE_PRICE_GIFT_ELITE_YEAR=price_...      # one-time
GIFT_CODE_SECRET=...                        # openssl rand -hex 32, set once
STRIPE_SAVE_COUPON=...                      # the half-price month's coupon id (below)
SUPABASE_SERVICE_ROLE_KEY=...
```

### 4. Point the webhook at your deployment

Stripe dashboard → Developers → Webhooks → add an endpoint:

```
https://rankup.mtrxhorizyn.com/api/stripe-webhook
```

Subscribe it to:

- `checkout.session.completed` (a paid gift becomes its code here)
- `checkout.session.async_payment_succeeded` (bank payments that clear later,
  a gift's included)
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid` and `invoice.payment_succeeded` (record each renewal's money)
- `invoice.payment_failed` (received and deliberately ignored: the
  subscription's own status change is what moves the plan)
- `charge.refunded` (a refund: see "Refunds and failed payments" below; a
  gift's refund voids its code if unused)
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
yearly plan gets a twelfth of its yearly price, so Elite Pass at $79.99 a year
gives $6.67), in its currency, as a negative balance transaction on its customer
(`api/_shared/referralReward.js`). Stripe takes it off the next invoice by
itself. This is how the Alliance and School League prizes are already paid:

- not a coupon, which takes a percentage off the next invoice, and for a yearly
  plan would be a free year
- not a pause or a longer trial on the subscription: a pause is the family's
  own choice ("Pause instead of cancel", below), and a credit touches neither
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

## Gift subscriptions: "a year of RankUp"

For the holidays: a grandparent, an aunt or an uncle buys a year of Standard
or Elite Pass for a family. **The buyer needs no RankUp account.** The family
redeems a code in Parent Mode and has that plan free for 12 months.

No new webhook event is needed: a gift arrives on `checkout.session.completed`
(or `checkout.session.async_payment_succeeded`) and is refunded on
`charge.refunded`, which the webhook already takes.

### Buying

The Give page, `#/gift`, is linked from the front door, the plan screen and
Settings (on a phone that is set up, only in Parent Mode; never on a child's
phone). The buyer chooses Standard or Elite Pass for 1 year, gives their own
email for the receipt, optionally the recipient's name and email, their own
name and a message of at most 200 characters (plain text, the Theme Genesis
rude-word list, no links or email addresses), and either **"Email it to them
now"** or **"I'll give it myself"** (a printable card).

`/api/gift-checkout` checks the form again, keeps it (`start_gift_order`,
`supabase/billing.sql`, which checks it a third time and, since the page
needs no account, allows at most 10 gifts started an hour from one address
and 2,000 across everybody), and opens Stripe Checkout in **payment** mode:
one payment, at the yearly price.

**Why one-time Stripe prices of their own** (`STRIPE_PRICE_GIFT_*_YEAR`)
rather than the yearly subscription prices or an amount worked out in code:

- Checkout's one-off payments take only one-time prices; the yearly prices
  are recurring and Stripe refuses them there.
- An amount written in the code (`price_data`) would break the rule this file
  starts from: the code names a price, Stripe holds the money, and the two
  agree because the ids are kept matching by hand.
- Separate prices keep gifts apart in Stripe's reports, and the receipt names
  "RankUp gift: Elite Pass, 1 year".

Nothing about who the gift is for is sent to Stripe: the session carries only
`kind: gift`, the order id and the plan, and the buyer's email (Stripe asks
for it). The recipient's details stay in RankUp's database and are deleted on
schedule (below).

### The code

**Made only after Stripe confirms payment, by the webhook, never before.** An
order that is never paid has no code (the database refuses a code on an
unpaid order), so a code that never sold cannot exist; the order is deleted
after 14 days. A checkout completed but not yet paid (a bank payment clearing)
waits for `async_payment_succeeded`.

- **Easy to type:** 12 characters, `XXXX-XXXX-XXXX`, from 31 capital letters
  and digits without the ones that read as each other (0 and O, 1, I and L).
  Case, spaces and dashes do not matter when it is typed.
- **Unguessable:** worked out from the paid checkout session with HMAC-SHA256
  under `GIFT_CODE_SECRET` (`api/_shared/gifts.js`), about 59 bits. Without
  the secret nobody can make one; with the limits below nobody can find one.
- **Stored hashed:** the database is handed only `sha256` of the code and
  never holds the code (`fulfil_gift_order`). The code is in the two emails
  and nowhere else.
- **Idempotent:** the same session always gives the same code, and the order
  is keyed on the session, so Stripe's two events for one payment, its
  retries and a replay all answer `duplicate` and send nothing twice. If an
  email fails the webhook answers 500, Stripe retries, and the retry sends the
  same code. Each email has an idempotency key and is marked sent.
- **Single use**, for **2 years** from purchase. The money is recorded once in
  `billing_events` (`gift:<session>`), against no family.

### Delivery

Both emails go through the existing sender (`sendEmail`), with a plain-text
part and the MTRX Horizyn footer; the words are in [EMAILS.md](EMAILS.md).

- **The buyer**, always: a receipt with the code, the plan, how to redeem it,
  the date it must be used by, and a link to the printable gift card
  (`#/gift/card?...`). Everything on the card travels after the `#`, which a
  browser never sends to a server. Stripe sends its own payment receipt too.
- **The recipient**, only for "Email it to them now": "<name> gave your family
  a year of RankUp", the message, the code and how to redeem it. It never
  contains the buyer's email address (`tests/emails.mjs` and
  `tests/billingwalk.mjs` check).

### Redeeming

A parent opens Parent Mode → Settings (or the plan screen) → **Redeem a
gift** (`#/parent/redeem`) and types the code. `/api/redeem-gift` checks the
caller is a parent of the family (not a supporter, not a child's phone) and
calls `redeem_gift_code`, which only the server may call.

- **How plans are stored:** a gift does not touch `tier` (Stripe's column).
  It sets `families.gift_tier`, `gift_starts_at` and `gift_until`, and
  `effective_tier()` (the one plan check every gate asks) takes the best of
  the paid tier, an unexpired trial and a running gift. The app's
  `effectiveTier` mirrors it (`tests/trials.mjs` runs both). When a gift ends
  the family falls back to what it pays for, or Starter; nothing a child
  earned is touched.
- **12 months from redemption.**
- **One gift per family at a time; more stack.** Another code adds 12 months
  to the end, at the better of the two plans for the whole time.
- **Settings** says "Gift plan: Elite Pass until <date>". The parent's
  dashboard reminds them **30 days before it ends**, in the app only: no
  email, and nothing on a child's screen. A family that has already lined up
  a paid plan of at least the same size is not reminded.

### A family that already pays

The rule: **gift time never runs while the family is paying for the same
days, so nobody is charged twice.**

- **A paid plan that will renew:** the code is refused with
  `subscription_renews` and **not spent**. The parent is told to turn renewal
  off in "Manage billing" first. Their paid plan then runs to the end of what
  they paid for.
- **A paid plan already cancelled and running to its end:** the gift starts
  the day it ends (`gift_starts_at`) and runs 12 months from then. Until then
  the family keeps the plan it paid for.
- **Choosing a plan during a gift:** checkout carries the gift's end as the
  subscription's `trial_end`, so the card is first charged the day the gift
  ends, never before. Stripe waits at most two years, so with more than two
  years of stacked gift ahead checkout answers `gift_too_long` instead of
  charging early.
- If a parent turns renewal back on in the portal after redeeming, Stripe
  charges as usual at renewal; the plan screen says to leave it off.

This was chosen over pausing or extending the Stripe subscription from
RankUp's side: subscriptions are made by Checkout and changed only in
Stripe's portal, as everywhere else in this file.

### Limits

| Rule | How |
|---|---|
| Brute force | 5 codes that did not work in an hour per family, 20 per address (a keyed hash of it, never the address), then `too_many_tries` for the hour. A right code does not count |
| The Give page, which needs no account | 10 gifts started an hour per address (`too_many_gifts`), 2,000 across everybody (`busy`) |
| Children | Never see buying or redeeming: the gift pages open only in Parent Mode on a phone that is set up, never on a child's phone, and the endpoint answers only a parent's token |
| Refunds | A refund **in full** (`charge.refunded`) of an unused code voids it (`refunded` when typed). A code already used **stays used**: the family keeps its year, and `refund_note = refunded_after_use` records the decision. A refund that arrives before Stripe's "paid" means no code is ever made. A partial refund changes nothing. Once per charge |

### What is kept, and for how long

| What | Kept |
|---|---|
| The buyer's email | For the receipt and help with the gift, until the code runs out (2 years) |
| The recipient's name and email, the buyer's name and message | Only to send the gift: 30 days after it was paid for |
| A checkout nobody paid for, with what was typed | 14 days |
| Codes typed that did not work, and the count of gifts started from each address (a keyed hash) | 2 days |
| The order (plan, paid, used, refunded, the code's hash) | Kept: the record of the sale |

All deleted by the daily `/api/run-retention` (`run_retention`). The privacy
policy says so in one sentence.

### Tests

`supabase/test/55-gifts.sql` (every rule, the limits, stacking, the paying
family, refunds, nothing reachable from a browser), `34-scheduled-jobs.sql`
(retention deletes exactly the gift rows above), `tests/billingwalk.mjs`
"Gift" (the real gift checkout, webhook and redeem endpoint against the
stand-in Stripe and email provider), `tests/emails.mjs` (both emails, every
variant), `tests/trials.mjs` (the app and the database agree) and
`tests/gifts.mjs` (the Give page, the card, redeeming, Settings, the
reminder, and no child's screen).

### To switch it on

1. In Stripe, make the two one-time prices above.
2. Set `STRIPE_PRICE_GIFT_STANDARD_YEAR`, `STRIPE_PRICE_GIFT_ELITE_YEAR` and
   `GIFT_CODE_SECRET`, with email set up (`EMAIL_API_KEY`, `EMAIL_FROM`): the
   code reaches people only by email.
3. Run every SQL file again, in the documented order (`schema.sql` and
   `billing.sql` changed; `retention.sql` too). No new file.
4. Buy a gift in test mode with card 4242 4242 4242 4242, check both emails,
   redeem the code on a test family, and refund it in Stripe.

---

## Pause instead of cancel

Many families cancel for the summer or the holidays and never come back. So
a parent on the way out is offered a break first, and cancelling stays one tap
away the whole time.

**What a parent sees.** On the plan screen, "Cancel my plan" (always shown
while a plan can still charge) and "Manage billing or update card" open
**Before you cancel**: pause for 1, 2 or 3 months, and, on a monthly plan that
has not had it, one month at half price. "Cancel my plan" is in the same sheet
and opens Stripe's own cancel page straight away (the portal's
`subscription_cancel` flow), and "Billing and card" its front page. All of it
fits on a phone screen with nothing to scroll. When there is nothing to offer
(a yearly plan, a plan already paused or ending, the half-price month running),
both buttons go straight to Stripe.

**Who can pause.** An active, monthly, paid plan that is not set to stop and
not already paused: `start_plan_pause` (`supabase/billing.sql`) decides, with
Stripe's own view of the subscription checked first by `/api/keep-plan`.
On Stripe's trial nothing is charged yet (`not_active`); behind on a payment,
the card comes first; a yearly plan cannot pause, because a month off stops no
payment (`not_monthly`); and not in the 31 days after the half-price month,
whose invoice a pause would void (`half_price_month`).

**How it is done.** `/api/keep-plan` (`{ action: 'pause', months }`):

1. `start_plan_pause` writes the pause down (`plan_pauses`, and
   `families.paused_until`) and says when billing starts again: now plus that
   many months.
2. Stripe: the subscription's `pause_collection` with behavior **void** and
   `resumes_at` on that date, with the idempotency key
   `rankup-pause-<pause id>`. Invoices that fall inside are voided, so nothing
   is charged; a monthly plan paused for N months misses exactly N charges,
   and the days already paid for before the pause are given back as days
   after it, until the next renewal date. Stripe starts charging again by
   itself on `resumes_at`.
3. `finish_plan_pause`: Stripe took it, so it is confirmed and counted; or
   Stripe refused or did not answer, so it is undone as if it never was.

**While paused**, `effective_tier` counts the plan they pay for as Starter
until `paused_until`, and stops at that moment whether or not Stripe's news
has arrived. A free trial or a gift still counts in full: only the paid part
is paused. Nothing is deleted: Starter's one-child rule only stops a new child
being added, and every child, their XP, coins, items and streaks stay. The
plan screen and the parent's dashboard say "Your plan is paused" and the date;
the child's home screen says "Paused — your progress is safe", never a price.
A gift cannot be redeemed during a pause (the plan still renews: turn it off
first), checkout refuses a second plan, and a change of plan in the portal is
refused until it is resumed (it would charge today).

**Resuming early**: "Start my plan again now" (`{ action: 'resume' }`) takes
`pause_collection` off at Stripe, then `end_plan_pause`. Charging carries on
from the next renewal date; nothing is charged that day.

**Three days before** billing starts again, each parent (never a supporter)
gets one email: when, what will be charged at the plan list's price, that
nothing was lost and that cancelling is one tap away (`pauseReminderEmail`,
sent by the hourly `/api/send-trial-emails`; `due_pause_reminders`, claimed
before it is sent, once per pause, again only if the date moves).

**Stripe's news.** Every `customer.subscription.updated` carries
`pause_collection` (or null), and the webhook passes it on
(`sync_plan_pause`): a pause made or moved in Stripe's dashboard is written
down and counted (one with no end date runs until somebody resumes it),
Stripe resuming it ends it, and a plan that ends while paused ends the pause.
Out of order: news written before a pause started does not end it, news
while `/api/keep-plan` is still waiting for Stripe's answer is left to it, and
news from before an early resume does not pause the family again.

**The half-price month** (`{ action: 'save' }`): the coupon in
`STRIPE_SAVE_COUPON`, added to the subscription's `discounts` beside any it
already has (an Alliance prize, say), with the idempotency key
`rankup-save-<family>-<time>`. Once per family, ever:
`families.save_offer_used_at`, set by `claim_save_offer` **before** Stripe is
asked, so two taps cannot both have it, and given back by
`finish_save_offer` only if Stripe did not apply it. Not on a yearly plan
(half off the next invoice would be half a year), not while paused, not for a
plan already ending. Without the setting the offer is not made at all.

**Counted** for the owner's console: `plans_paused` (a pause Stripe took, or
one made in its dashboard), `plans_saved` (a half-price month Stripe applied)
and `plans_cancelled` (once when a plan is set to stop, or once when it ends
with no warning) in `usage_daily`, in `/api/stats` and on the operator page.
Totals only.

**Tests.** `supabase/test/57-pauses.sql` (every rule and refusal, Stripe's
news out of order, the counts, the reminder, the revokes),
`tests/keepplan.mjs` (the real `/api/keep-plan`, portal and webhook under
workerd against a stand-in Stripe: pause, resume, Stripe failing, the
half-price month once, cancelling paused or not, the reminder email) and
`tests/pauseplan.mjs` (the screens, and no child's screen with a price or an
offer).

### To switch it on

1. In Stripe, Products → Coupons: a coupon for **50% off**, duration
   **once**, in the plans' currency; set `STRIPE_SAVE_COUPON` to its id.
   Pausing and cancelling work without it; only the half-price month needs it.
2. Customer portal settings: keep cancelling on (at the end of the period),
   and turn on **Customers can switch plans** with the four Standard and Elite
   Pass prices, so the Elite and yearly confirm pages work (below).
3. Run every SQL file again, in the documented order (`schema.sql`,
   `billing.sql`, `health.sql` and `retention.sql` changed). No new file.
4. In test mode: pause a monthly test subscription for a month, check the
   subscription shows "Collection paused" in Stripe and the plan screen says
   until when; resume it; take the half-price month and check the coupon on
   the subscription; cancel it from the sheet.

---

## The Elite nudge and "Switch to yearly"

**The Elite nudge** is a short card on the parent's dashboard, in Parent Mode
only, for a family on Standard (not on a gift, not paused, not behind on a
payment), at one of two moments (`src/lib/upgradeNudge.js`):

- a **great week**: 10 or more chores accepted in seven days, "Elite Pass
  gives 1.5× XP on every chore";
- a **Standard limit hit**: a parent opened an Elite-only tool (the screen in
  front of it writes that down), or the family's guild is full at Standard's
  size.

At most once every 14 days on that phone, counting from when it was shown or
dismissed, and "Not now" takes it away. It upgrades through the existing
prices: a family already paying moves to Elite on Stripe's own confirm page
(`/api/billing-portal` with `flow: 'upgrade'`, the portal's
`subscription_update_confirm`, Elite for the same period), so Stripe shows the
new price and what is charged today before the parent agrees; any other family
goes through checkout. Every number in it comes from `TIERS`.

**"Switch to yearly — save about 30%"** is a card in Settings for a parent
paying monthly (live, not paused, not ending). The saving is the real
difference between the plan list's two prices (30% on Standard, 33% on Elite
Pass). It opens the same confirm page for the yearly price of the plan they
are on (`flow: 'yearly'`).

Both need "Customers can switch plans" in the portal's settings, with the four
prices. A subscription on a price RankUp does not know (one made by hand) is
told to write to us (`custom_plan`).

**Children never see either**, nor any price, offer or anything to buy: the
cards are on Parent Mode screens only, behind the PIN, and a child's phone has
no Parent Mode. `tests/upgradenudge.mjs` holds the rules and
`tests/pauseplan.mjs` checks every child's screen.

---

## Cancelling and card changes

These go to Stripe's own customer portal (`/api/billing-portal`), not to
screens rebuilt here. That is deliberate: how cancellation is presented carries
legal obligations in several places, and Stripe keeps theirs current. RankUp
offers a pause and the half-price month first (above), and "Cancel my plan"
then opens Stripe's cancel page directly, in one tap.

Enable the portal once in Stripe: Settings → Billing → Customer portal. Keep
cancelling on, and turn on switching plans with the four family prices.

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

Stripe takes about 2.9% + 30¢ per transaction. What that leaves you, before
sales tax and Stripe Tax's own fee:

| Plan | Price | Stripe takes | You keep |
|---|---|---|---|
| Standard, monthly | $5.99 | about 47¢ | about $5.52 |
| Standard, yearly | $49.99 | about $1.75 | about $48.24 |
| Elite Pass, monthly | $9.99 | about 59¢ | about $9.40 |
| Elite Pass, yearly | $79.99 | about $2.62 | about $77.37 |

The flat 30¢ is a bigger share of a smaller price: about 8% of $5.99, against
under 4% of $49.99. A yearly plan pays it once instead of twelve times, so
over a year Standard yearly keeps about $48.24 against about $66.20 for twelve
monthly payments ($71.88 less twelve fees of about 47¢), and Elite Pass about
$77.37 against about $112.80.

If you ever ship native iOS or Android apps, Apple and Google **require** their
own billing for digital subscriptions and take 15–30%. On $5.99 that is about
$0.90–$1.80, and on $9.99 $1.50–$3.00, per family per month. It is a real argument for staying a web app
longer than feels comfortable.

---

## The 20% Discount Tournament — one thing you must schedule

Parent Alliances are real: `supabase/alliances.sql` counts each member family's
approved quests for the month, and `api/settle-alliances.js` gives the winner
20% of one month's price as credit on their Stripe account (worked out from
their own subscription, so a yearly plan gets 20% of a month, not of a year:
Elite Pass monthly at $9.99 gets $2.00 off, and at $79.99 a year about
$1.33). **Nothing pays out until you schedule that endpoint**, so
until you do, families will see a leaderboard and never see a discount.

Set `CRON_SECRET` to a long random string, then call it once a month:

```
POST https://rankup.mtrxhorizyn.com/api/settle-alliances
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
  POST https://rankup.mtrxhorizyn.com/api/settle-schools
  Authorization: Bearer <CRON_SECRET>
  ```

  It closes the month (District Champions, rivalry results, School Stars) and
  gives each Champion its free month: one month's price as credit on its
  Stripe account if it pays (so a yearly plan gets a month off, not a year),
  thirty more trial days if it is still on its trial. A free month that could not be
  given stays owed and is tried again next run. It never gives one twice.
- **Checking schools are real**: open `https://rankup.mtrxhorizyn.com/#/operator` and type
  your `OPERATOR_SECRET`. New schools are listed first, with who signed each up
  and their email; verify, un-verify, suspend or lift a suspension there.
  Until a school is verified it is in no league and sees no child's name.

- **Paying by invoice**: a school office often cannot pay by card. On the
  school's page, Plan, "a year, by invoice" asks for an address and
  `api/school-checkout.js` (`method: 'invoice'`) makes a yearly subscription at
  the school's yearly price with `collection_method: 'send_invoice'`: Stripe
  emails the invoice, the office pays by card or bank transfer within
  `DISTRICT_INVOICE_DAYS` (30 by default), and it renews with a new invoice
  each year. What is left of the trial or pilot is kept as Stripe's trial, so
  the first invoice comes when it ends. The customer is the school's own (its
  name, the invoice address and `school_id`, nothing else). The webhook treats
  it like any school subscription. Turn on emailing finalized invoices in
  Stripe's settings (the same switch districts need). No new price.

---

## School pilots

A free pilot, usually a semester, for a school that wants longer than the
30-day trial to decide. Nothing in Stripe: a pilot is a longer trial.

1. **A school asks.** "Request a pilot" on the School League's front page
   (`#/school`) asks for the school, a name, role, work email, town, about
   how many students and a note. `api/pilot-request.js` emails it to
   `SALES_EMAIL` (or `SUPPORT_EMAIL`) with the person as the reply-to, the same
   way as a district's "Get a quote". Nothing typed is stored; the database
   keeps a keyed hash of where requests came from, for a limit of 3 an hour
   from one place and 30 an hour in all, counted apart from quotes.
2. **You make a code.** Open `#/operator`, the **Pilots** tab: who it is for
   (the school's name, e.g. "Example Academy"), the pilot's length (90 days
   unless `PILOT_DAYS` says otherwise; 14 to 365) and the date the code must be
   used by (60 days from today unless you pick another). The code
   (`XXXXX-XXXXX`) is shown **once**: only its hash is stored. Send it to the
   school. You can take back a code nobody has used.
3. **The school uses it.** Its admin types it when signing the school up, or
   under Plan on the school's page. The trial becomes a pilot of that length
   from that day (`redeem_school_pilot`). Single use; one pilot per school;
   5 wrong codes an hour per sign-in. **It never adds to a paid plan:** a school
   paying by card or invoice, or whose district pays, is told a pilot would add
   nothing, and the code stays unused.
4. **During the pilot** the school is in the league like a school on its trial.
   Its admin can open the **pilot report** (`#/school/report`) any time: one
   printable page of totals (students taking part, the share who did a chore,
   chores done, the average per student, the busiest week, the most popular
   kinds of chore, the same per house or class), the price for its size and how
   to buy. Never a child's name or anything typed, and no numbers for a group
   of fewer than 5 students. There is no "what families said": RankUp asks
   families for no rating.
5. **14 days before it ends** each of the school's admins gets one email (the
   hourly `/api/send-trial-emails` job, `due_pilot_reminders`): when it ends,
   the price for its size, card or invoice, and a link to the report. Not if
   the school has chosen a plan, or its district pays.
6. **After it ends** the school sits out the league until it chooses a plan,
   like a trial that ran out. Nothing is deleted. Paying during the pilot keeps
   the rest of it: nothing is charged, and no invoice is due, until it ends.

The operator page lists every code: not used yet, ran out unused, pilot
running, ended, or paying, with each pilot's end date. Retention deletes a
code nobody used 90 days after its date, and a pilot's record a year after
it ended (never the school). Tests: `supabase/test/58-pilots-and-houses.sql`,
the pilot part of `tests/api.mjs`, and `tests/schoolpilot.mjs`.

---

## School districts

One customer, many schools: a district buys the School League for its schools
at once, by invoice, for a year. The district page is `#/district`, linked
from the foot of the School League's front page. It is behind the same
switches as the School League: signing up needs the sync service, and the
invoice buttons need `VITE_STRIPE_ENABLED` and the server's Stripe settings,
so nothing is invoiced until payments are set.

### The price, and why it is built this way

Each school is priced by its size at the School League's **yearly** price,
less a discount that depends on its **place** in the district's plan, biggest
school first:

| Place in the plan | Discount on that school |
|---|---|
| 1st to 9th | 10% |
| 10th to 24th | 20% |
| 25th onwards | 30% |

A plan is for 2 to 100 schools. One school is the School League itself; more
than 100 is a quote ("Get a quote", below).

The obvious ladder, "2–9 schools 10% off, 10–24 20% off, 25+ 30% off" for
every school in the plan, makes more schools cheaper than fewer. In school
prices: 9 schools at 10% off cost 8.1, 10 at 20% off cost 8.0; 24 at 20% off
cost 19.2, 25 at 30% off cost 17.5. With mixed sizes it is worse: nine large
schools and a small one cost less than the nine alone. A district would save
money by adding a school it did not want, and could not trust the price.

By place, like tax brackets, that cannot happen. A school added costs at least
70% of its own price, and moves at most two schools (the same size or smaller,
because places go biggest first) into a bigger discount, each worth 10% of its
price. So every school added adds to the total, whatever the sizes, and a
district always pays less than its schools would on their own.
`supabase/test/56-districts.sql` checks it for every count from 2 to 100 at
every size and for 400 random districts; `tests/schools.mjs` for 2,000 more
and that the app's calculator (`districtPrice`, `src/lib/schools.js`) and the
database (`district_price_quote`, `supabase/schools.sql`) agree.

What each school costs a year in a district plan:

| Size | Students | Alone (a year) | 10% off | 20% off | 30% off |
|---|---|---|---|---|---|
| small | up to 300 | $290 | $261 | $232 | $203 |
| medium | 301–800 | $590 | $531 | $472 | $413 |
| large | 801–1,500 | $990 | $891 | $792 | $693 |
| xl | 1,501+ | $1,490 | $1,341 | $1,192 | $1,043 |

For example, 12 schools (one large, eight medium, three small): the large and
eight medium at 10% off, the 10th school (a small) at 20% off and two more
small at 20% off: $891 + 8 × $531 + 3 × $232 = $5,835 a year, against $6,580
alone.

### Setting it up in Stripe

1. Make a product, **RankUp School League for districts**, with twelve
   **yearly recurring** prices at the amounts in the table's last three
   columns, and put their ids in `STRIPE_PRICE_DISTRICT_SMALL_10`,
   `_SMALL_20`, `_SMALL_30`, `_MEDIUM_10` … `_XL_30` (`.env.example`). The
   code names these ids and never an amount; a plan whose line has no price
   set is refused ("payments are not set up"), never invoiced at another
   price.
2. In **Settings → Billing → Subscriptions and emails**, turn on emailing
   finalized invoices to customers, and choose what happens to a subscription
   whose invoice stays unpaid after its due date (cancel it, or mark it
   unpaid). That is when a district's schools stop being covered.
3. Optionally set `DISTRICT_INVOICE_DAYS` (30 by default) for how long a
   district has to pay each invoice, and `SALES_EMAIL` for quote requests.
4. The webhook needs no new events: `customer.subscription.*`,
   `invoice.paid` and `charge.refunded` carry districts too. Allow customers
   to cancel in the billing portal's settings, as for schools.

### How a district signs up, pays and adds schools

1. **Sign up.** Someone at the district office opens `#/district`, taps "Set
   up your district", and fills one form: their account (work email and a
   password), their name and the district's name. They are the district's
   admin.
2. **Add schools.** "Add a school": its name, town and number of students.
   The school is made like any new school (a 30-day trial, checked by the
   operator before it joins a league or sees a name), in the district's own
   league, and the admin is shown a one-time, 10-letter invite for its
   principal, good for 30 days (and kept on the school's card until used).
   The principal opens the School League page, "I have a code", types it, and
   becomes the school's admin; they hand parents the school's code as any
   school does. A school **already on RankUp** joins with the district's own
   8-letter code: its admin types it in the "District" card on the school's
   page.
3. **Pay.** "Send me the invoice": the admin says where the invoice goes (a
   finance team's address, say). `api/district-billing.js` makes a Stripe
   customer for the district (its name, that email, the district's id;
   nothing about any school or child) and a yearly subscription with
   `collection_method: send_invoice` and `days_until_due` from
   `DISTRICT_INVOICE_DAYS`: one item per size and discount, its quantity the
   number of schools. Stripe emails the invoice; the district pays by card or
   bank transfer on Stripe's page. Which schools and what they cost come
   from the database, never from the request.
4. **Covered.** The webhook (`apply_district_subscription`) switches the plan
   on and records how many schools of each size its prices pay for. Within a
   size, the schools added first are covered; a school added later waits
   until the admin taps "Update the plan", which changes the same
   subscription (an invoice for the rest of the year for what was added, a
   credit on the next invoice for what was taken off). A plan you set up by
   hand in Stripe for a district, with prices of your own and
   `metadata.district_id` on the subscription (a quoted deal), covers every
   school in the district. A covered school counts as paid: it plays in the
   league, cannot start a plan of its own ("Your district pays for your
   school"), and its District Champion month goes as one month's credit on
   the district's Stripe account.
5. **Renewals.** Yearly, with a new invoice from Stripe each year. The
   district page says when it renews; "Invoices and cancelling" opens Stripe's
   portal.

### When a district stops paying, or cancels

- An invoice paid late (`past_due`) keeps the schools covered while Stripe
  chases it, and the district page says the invoice is overdue.
- A plan that ends (cancelled, unpaid after Stripe's settings give up, or a
  refund in full of the current year) takes the cover away. Each school falls
  back to whatever it has of its own: its own plan if it pays, what is left
  of its free trial, or the free level (families keep using RankUp; the
  school sits the league out until it is paid for).
- **Nothing is deleted then.** The schools, their staff, their students and
  their points, and the district's list of schools, all stay; paying again
  covers them again. The retention job removes the district's account (its
  admin and its list of schools) a year after its plan ended, or a year after
  it signed up if it never paid, and never a school.
- Events are applied once, older news is ignored, and a refunded year stays
  refunded, by the same rules as a school's.

### Get a quote

For a district with more than 100 schools, or one that needs to pay another
way (a purchase order, a contract): the form asks for the district, a name,
role, work email, number of schools, about how many students and a short
note, and `api/district-quote.js` emails it to `SALES_EMAIL` (or
`SUPPORT_EMAIL`) with the person as the reply-to. Nothing typed is stored; the
database keeps a keyed hash of where requests come from, for a limit of 3 an
hour from one place and 30 an hour in all. To set up a quoted deal, make the
subscription by hand in Stripe on the district's customer (or a new one) with
`metadata.district_id` set to the district's id, which the operator page's
school list does not show yet: ask the district admin to send an invoice
first and edit that subscription, or read the id from the `districts` table.

### What a district sees

Totals only (`district_overview`): for each school and the district, this
month and last, students taking part, the share who did a chore, chores done
and the average per student, and how each school is paid for. Never a child's
name, nickname, numbers or anything typed; no numbers at all for a school with
fewer than 5 students taking part; and the district's totals add up only the
schools shown, so a small school's number cannot be worked out by
subtraction. A school's own rules (its Stars, its verification, its codes)
are unchanged and not the district's to see.

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
