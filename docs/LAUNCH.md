# Launch checklist

Everything in the code is done. What is left is the things only you can do —
they need your accounts, your bank details, and a decision about how you want
to cover the legal side (section 7).

Work down the list. Nothing below is optional if real families are going to use
this.

---

## 1. Create the accounts (about an hour)

- [ ] **Supabase** — [supabase.com](https://supabase.com), new project, pick a
      region near your users. The free tier is enough while you build and
      test (500MB of database, 50,000 monthly users). **Before real families
      use it, move to the paid plan** (about $25/month): the free plan does not
      keep backups you can count on, and losing the database loses every
      family. See docs/BACKUPS.md.
- [ ] **A host.** Two are configured and the same `/api` handlers run on either:
      - **Cloudflare Pages** — free, and its free tier permits commercial use.
        Config is `wrangler.toml`; the Node handlers run through
        `functions/api/[[route]].js`. This is the cheaper option, by about
        $240/year.
      - **Vercel** — [vercel.com](https://vercel.com), config in `vercel.json`.
        The Hobby tier is free but non-commercial, so taking payments means Pro
        at about $20/month.

      Whichever you pick, deploy the other as a fallback before you need one:
      switching hosts under pressure with a live Stripe webhook is the worst
      possible time to find out something does not port.

      **Not yet verified on Cloudflare:** `web-push` reaches for Node crypto.
      `nodejs_compat` is enabled for it, but send one real push from a Cloudflare
      deploy before trusting it. Everything else — Stripe checkout, the billing
      portal and webhook signature verification — was exercised
      against the adapter and behaves identically on both.
- [ ] **Stripe** — [stripe.com](https://stripe.com). Needs business details and
      a bank account, so start this early; verification can take days.

## 2. Set up the database (about fifteen minutes)

In the Supabase SQL editor, run these **in order**:

**Upgrading later: always run the files again *before* deploying the new app.** A
newer app calls functions the older database does not have yet, and those calls are
refused (games, gifts and purchases would show as not accepted).

(The same order the tests use, in `supabase/test/run.sh`. Leaving one out
breaks that feature for every family: co-parents, the allowance pot,
charity and referrals each live in their own file.)

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
- No storage bucket is needed: RankUp keeps no photos.

## 2a. Sign-in protection (five minutes, in the Supabase dashboard)

Parent sign-in, sign-up and password resets are Supabase Auth's, not code in
this repository, so their limits are set in the dashboard, not here. Nothing
in the app throttles sign-in itself (a limit in the browser would be no limit).

- [ ] **Authentication → Rate Limits.** Supabase limits per IP address out of
      the box (sign-ins and sign-ups, token refreshes, verifications, emails
      sent, anonymous sign-ins — the last is how a child's phone signs in, so
      do not set it below a few an hour). Check the numbers there; there is no
      per-account lockout, so a slow guesser spread over many addresses is
      limited only by password strength.
- [ ] **Authentication → Providers → Email:** minimum password length 10, and
      turn on leaked-password protection if your plan has it.
- [ ] **Do not turn on CAPTCHA yet.** The app does not send a CAPTCHA token, so
      every sign-in would be refused.
- [ ] **Password resets.** The app has no "forgot password" screen yet; a parent
      who forgets theirs needs a reset link sent from the dashboard (Users →
      Send password recovery). Set **Email OTP expiration** to 15 minutes. A
      recovery link works once. Check on the live project, once, that a link is
      dead after the password has been changed: send one, change the password,
      then open the link. This cannot be tested locally — the local stand-in
      does not implement auth.

## 2b. Schedule the jobs — none of them are optional

Set `CRON_SECRET` to a long random string. Each job is one HTTP request with
`Authorization: Bearer <CRON_SECRET>`; they accept GET or POST, because
schedulers differ on which they send.

**On Vercel** the schedule ships in `vercel.json` and Vercel sends the header
itself once `CRON_SECRET` is set in the project — there is nothing else to do.

**On Cloudflare Pages there is no scheduler.** Pages Functions have no
`scheduled` handler, so these will never fire on their own. Either deploy a
small Worker with a Cron Trigger that `fetch`es the job URLs below with the header,
or point any external scheduler at them. Do not assume Pages will run them.

| Job | How often | What breaks without it |
|---|---|---|
| `/api/send-reminders` | every 15 min | Daily reminders never arrive |
| `/api/send-digests` | hourly | The Sunday digest never goes out |
| `/api/run-retention` | daily | Old activity records pile up, and a deleted family's Stripe cancellation that failed is never retried |
| `/api/settle-alliances` | monthly | Nobody is ever paid their discount |
| `/api/settle-schools` | monthly | No District Champion, no School Stars, no free month |

The hourly one looks wasteful and is not: the database decides whose Sunday
evening it actually is, so an hourly run is what makes a digest arrive at six
in the evening in every time zone instead of six in yours.

### Knowing it is all still running

Every job records that it ran, and `/api/health` reports how long each has been
quiet. This is the failure mode that matters: all four fail by going SILENT —
no error, no alert, just reminders that stop arriving. A scheduler that never
fires looks identical to one that works, which is how the POST-only bug in this
repo survived as long as it did.

```
GET  https://your-site/api/health                        -> {"ok":true}
GET  https://your-site/api/health   (with CRON_SECRET)   -> the detail
```

Point any free uptime monitor at the shallow one. It is public on purpose and
says nothing useful to a stranger; the detail — which job is stale, crashes in the last 24 hours — needs the secret, and
returns **503** when something is wrong so a monitor treats it as down.

Worth knowing: a job that has **never** run reports `never_run`, not `stale`.
Before launch that is every job and it is fine. A month in, it means the
schedule was never set up at all.

| When | Request | What breaks without it |
|---|---|---|
| every 10–15 min | `/api/send-reminders` | reminder times are saved and never delivered |
| daily | `/api/run-retention` | see below |
| monthly | `/api/settle-alliances` | families see a leaderboard and never get the discount |
| monthly | `/api/settle-schools` | schools never get their Champion, Stars or free month |

**Retention keeps the database small.** The activity log keeps every row and
spent pairing codes never leave unless this job runs. Each day it deletes
exactly these, and nothing else:

| What | Once older than |
|---|---|
| Activity log entries (`events`) | 90 days (`RETENTION_EVENT_DAYS`) |
| Crash reports | 90 days (the same setting) |
| Pairing codes, counted from when they expired | 2 days (`RETENTION_PAIRING_DAYS`) |
| Pairing guess counts (the rate limit) | 2 days (the same setting) |
| Retry receipts (what stops a resent purchase charging twice) | 30 days |
| The record of a deleted family's Stripe cancellation, once Stripe confirmed it | 30 days (7 if there was nothing to cancel) |
| A photo left on an undecided chore by an older version of the app (the chore itself stays) | 14 days (`RETENTION_PHOTO_DAYS`) |

RankUp keeps no photos; the last line only clears ones an older version left.
`supabase/test/34-scheduled-jobs.sql` checks that the job deletes all of
these and changes not one other row in any table.

It also cancels, at Stripe, any deleted family's subscription that could not
be cancelled at the moment of deletion, so it needs `STRIPE_SECRET_KEY` as
well; see docs/PAYMENTS.md. A cancellation still waiting for Stripe is never
deleted. `/api/health` turns red if one has waited more than a day.

## 3. Generate the keys

- [ ] `npx web-push generate-vapid-keys` → the two VAPID values
- [ ] Supabase → Settings → API → the project URL, the **anon** key, and the
      **service role** key
- [ ] Stripe → the family plans and the ticket packs:
      - Starter is **free**: no Stripe price.
      - Standard: $9.99 a month **and** $99.90 a year → `STRIPE_PRICE_STANDARD`,
        `STRIPE_PRICE_STANDARD_YEAR`.
      - Elite: $15.99 a month **and** $159.90 a year → `STRIPE_PRICE_ELITE`,
        `STRIPE_PRICE_ELITE_YEAR`.
      - Three **one-off** Flash Ticket prices ($2.99 / 2, $5.99 / 5,
        $11.99 / 12) → `STRIPE_PRICE_FLASH_2`, `_FLASH_5`, `_FLASH_12`.
      - School League: eight prices, see docs/PAYMENTS.md.
      All the yearly ids must be set if you sell yearly: a missing one means
      a family who just paid for a year is put back on the free plan.

      The three ticket packs exist because Stripe's flat 30c is 10% of a $2.99
      sale and 2.5% of an $11.99 one. They are sized against the shop, not
      against round numbers: skins cost 1-3 tickets by rarity and the whole set
      is eleven, so twelve is "everything" and anything larger would be selling
      a family something they cannot spend. The ticket count for each pack, and
      the price of each rarity, are both fixed server-side — a caller can
      neither buy the small pack and be credited the large one, nor claim the
      legendary for the price of a common.
- [ ] Stripe → Developers → Webhooks → add `https://YOURDOMAIN/api/stripe-webhook`
      → the signing secret. Subscribe it to the events listed in
      [PAYMENTS.md](PAYMENTS.md) step 4, `charge.refunded` included: without
      it a refunded plan or ticket pack is never taken back.

## 4. Set the environment variables in Vercel

Copy from `.env.example`. **The rule that matters:** anything named `VITE_*` is
compiled into the JavaScript every phone downloads. A secret in a `VITE_` name
is a published secret.

Safe in `VITE_`: the Supabase URL, the Supabase **anon** key, the VAPID
**public** key, `VITE_STRIPE_ENABLED`.

Never in `VITE_`: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`.

The app checks for this at start-up and shouts in the console if it finds a
secret-shaped value in a public name. `npm run test:smoke` checks the other
direction — that every setting the code reads is actually in `.env.example`,
so the file you are copying from is never missing one.

**Two that are easy to miss**, because nothing breaks until somebody real hits
them:

- [ ] `PUBLIC_SITE_URL` — your public https address. Stripe sends people back
      here after paying. Without it, checkout and the billing portal refuse to
      start rather than sending a paying parent to a broken page.
- [ ] `CRON_SECRET` — one long random string (`openssl rand -hex 32`) for all
      three scheduled jobs. Without it they refuse every caller including your
      own scheduler, and reminders and digests never go out.

`GET /api/health` with that secret lists all of these as booleans, so you can
check the deploy rather than guess at it.

## 5. Fill in the things marked as placeholders

- [ ] `src/data/legalText.js` → `OPERATOR` — your name, contact email, postal
      address. The app shows a warning banner until you do.
- [ ] Read the privacy policy and terms in that file end to end. They describe
      what the app actually does today. If you change anything, change them.

## 6. Deploy and check it

**Every update after launch:** run the SQL files again, in the order in
`docs/BACKEND.md`, *before* the new app build goes live. They are safe to run
over a live database, and a new app talking to an old database fails on the
functions that changed.

- [ ] Push to GitHub; Vercel builds automatically.
- [ ] Open the site on a **real phone**, not a desktop browser.
- [ ] Add it to the home screen (Share → Add to Home Screen).
- [ ] Walk the whole loop: sign up → consent → add a kid → assign a quest →
      pair a second device → tap "I did it!" → accept → check the XP lands.
- [ ] Turn on notifications and confirm one actually arrives.
- [ ] In Stripe **test mode**, subscribe with `4242 4242 4242 4242`, then check
      the family really becomes Elite. Then use `4000 0000 0000 0341` and check
      a failed payment really drops them to Standard.

## 7. Keeping the legal side small

The app is now built so there is very little to be responsible for:

- **No photos at all.** RankUp never takes, sends or keeps a picture. A parent
  who wants proof gets a photo from the child's own camera app, by message,
  and taps Accept. There is no photograph of a child or their home on any
  RankUp server to protect or lose.
- **Guilds are off by default.** Kid-to-kid contact across families is the
  heaviest obligation in the product and nobody subscribes for it. Leave
  `VITE_GUILDS_ENABLED` unset for launch.

That leaves: a first name, chore history, and XP. Still children's data, still
covered by COPPA — but a far smaller thing to defend.

**The cheap way to cover it:** an FTC-approved COPPA Safe Harbor programme such
as **kidSAFE** or **PRIVO**. They exist precisely so small operators do not have
to hire counsel — they review the app, certify it, and you get a trust badge
that is genuinely useful marketing to parents. Check their current pricing; it
is an annual fee rather than an hourly one.

Free things worth doing first, either way:

- [ ] The **ICO Children's Code self-assessment** (UK) — free, online
- [ ] The **FTC's COPPA Six-Step Compliance Plan** — short and readable

## 8. Or the lawyer route ⚠️

**Do this before one real child's data exists.** Not after a pilot, not after
launch.

- [ ] One paid consultation with a solicitor or attorney who knows children's
      apps. Take them: `docs/LEGAL.md`, `src/data/legalText.js`, and this list.
- [ ] Ask specifically about: whether your consent method is sufficient in your
      jurisdiction, guild chat between children in
      different families, and whether you need age verification beyond a
      parent's word.
- [ ] Register with the ICO if you are in the UK.
- [ ] Have them check the privacy policy and terms. They are an honest draft
      written from what the code does, not a lawyer's document.

## 9. Before you take money

- [ ] The purchaser must be the parent. A subscription bought by a child is
      chargeable-back and, in the US, specifically actionable. Flash Tickets are
      already built this way — the purchase lives behind the parent PIN and a
      kid's device has no route to a payment screen — but check it yourself on a
      real kid device before launch.
- [ ] The Sunday Market is a timed-scarcity mechanic aimed at children, and a
      Flash Ticket is a paid way out of missing one. Regulators look hard at
      that pattern. What keeps it defensible is that the market sells nothing
      but cosmetics, shows no countdown, and every skin comes back — keep all
      three true if you change it.
- [ ] Price, renewal date and cancellation route disclosed before payment.
- [ ] Refund policy written down and reachable from the app.
- [ ] Stripe Tax switched on.
- [ ] Cancel a real subscription yourself and confirm it works end to end.

## 10. Then, and this is the important one

**Use it with one real family for a week before telling anyone else about it.**

Every automated check in this repository passes. None of them can tell you
whether a parent will actually open the app to approve a chore, which is the
assumption the entire product rests on. That is worth more than any further
engineering, and it costs nothing.

---

## What is still not built

Be honest about these when you launch.

| | Why |
|---|---|
| **Reminders with the app closed** | They fire while RankUp is open. Background ones need a scheduled server job. |
| **Background push, on a real phone** | Proven end to end against a stand-in push service (`tests/push.mjs`): the production build sends it, the signature verifies, and it decrypts with the phone's keys. It sends with `fetch`, because Node's `https` does not exist on Cloudflare and every push failed there before. A real phone's push service is the one step not yet tried. |
| **Guilds** | Built and tested, but switched OFF by default. Turn them on with `VITE_GUILDS_ENABLED=true` once you are ready for kid-to-kid contact and the moderation it implies. |

## Running the tests

```bash
npm run test:db      # every database check (about 900) — no browser needed
npm run test:smoke   # browser checks, no backend required
npm run test:sync    # browser checks against a real backend
```

`supabase/test/README.md` explains how to stand the local backend up.
