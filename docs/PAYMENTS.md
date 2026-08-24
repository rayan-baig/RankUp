# Subscriptions: what it would actually take

Today, switching between Standard ($9.99) and Elite Pass ($15.99) in the app flips
feature flags so you can test both. **No card is taken. Nothing is charged. There is no
receipt, no renewal, and no way to cancel, because there is nothing to cancel.**

Do not build this before there is something worth paying for. It is deliberately last on
the roadmap.

---

## Two routes, and the choice is not really yours

### Stripe — for the web app

Roughly 2.9% + 30¢ per transaction. On $9.99 that is about 59¢, so you keep ~$9.40.

You need: a Stripe account, Stripe Checkout for the payment page, and a **webhook** — a
URL Stripe calls to tell your server "this family paid" or "this family's card failed".
Without the webhook the app cannot know whether someone is actually subscribed, because
the browser cannot be trusted to report it.

This also means subscriptions cannot work until there is a real backend, since the
subscription state has to live somewhere the app cannot fake. → [BACKEND.md](BACKEND.md)

### Apple / Google in-app purchase — if you ever ship native apps

Apple and Google take **15–30%** and, critically, **require** you to use their billing
for digital subscriptions inside an app. On $9.99 that is $1.50–$3.00 per family per
month.

This is a real argument for staying a web app longer than feels comfortable: on the web
you keep about 94% of the price; in an app store you keep 70–85%.

---

## The Elite features that assume billing exists

Two of them cannot be finished without it, and it is worth being clear about that now:

- **The 20% Discount Tournament.** The prize is 20% off the winning alliance's bill.
  There is no bill. Applying a real discount means Stripe coupons or price overrides
  applied to nine other families' subscriptions, driven by a monthly job. This is
  genuinely one of the more complicated things in the whole product, and it is currently
  a screen with sample data on it.
- **Complete Ad Removal.** Elite removes ads. There are no ads to remove, because no ad
  network is integrated. If ads are ever added to the Standard tier, note that
  **children's advertising is heavily regulated** — behavioural advertising to under-13s
  is restricted under COPPA and effectively banned by Apple's Kids Category and Google
  Play Families. → [LEGAL.md](LEGAL.md)

---

## Before charging a single real family

- A refund policy, and a way to cancel that is not an email to you.
- Clear disclosure of the price, the renewal date and the cancellation route, *before*
  payment. Legally required in most places, and required by both app stores.
- **The purchaser must be the parent.** A subscription bought by a child is
  chargeable-back and, in the US, specifically actionable under COPPA and FTC rules
  about children and payments.
- Sales tax / VAT. Stripe Tax handles most of this; ignoring it is not an option once
  there is real revenue.

---

## A suggested sequence

1. Real accounts and a database (nothing works without it).
2. Ship free to a handful of real families. Find out whether the loop actually reduces
   nagging.
3. Only then: Stripe Checkout for Standard, one plan, no tournament discount.
4. Elite once the parent-side tools have proved they are worth $6 more.
