# Launch checklist

Everything in the code is done. What is left is the things only you can do —
they need your accounts, your bank details, and one conversation with a lawyer.

Work down the list. Nothing below is optional if real families are going to use
this.

---

## 1. Create the accounts (about an hour)

- [ ] **Supabase** — [supabase.com](https://supabase.com), new project, pick a
      region near your users.
- [ ] **Vercel** — [vercel.com](https://vercel.com), connect the GitHub repo.
- [ ] **Anthropic** *(optional)* — [console.anthropic.com](https://console.anthropic.com)
      for the AI photo check. The app works without it.
- [ ] **Stripe** — [stripe.com](https://stripe.com). Needs business details and
      a bank account, so start this early; verification can take days.

## 2. Set up the database (about fifteen minutes)

In the Supabase SQL editor, run these **in order**:

- [ ] `supabase/schema.sql`
- [ ] `supabase/sync.sql`
- [ ] `supabase/guilds.sql`
- [ ] `supabase/notifications.sql`
- [ ] `supabase/consent.sql`
- [ ] `supabase/billing.sql`
- [ ] Create a **private** Storage bucket called `proof-photos`.
- [ ] Schedule `purge_stale_photos(14)` daily (Supabase → Database → Cron).
      Reviewed photos are already destroyed the moment a parent decides; this
      only sweeps up ones nobody ever got round to looking at.

## 3. Generate the keys

- [ ] `npx web-push generate-vapid-keys` → the two VAPID values
- [ ] Supabase → Settings → API → the project URL, the **anon** key, and the
      **service role** key
- [ ] Stripe → two monthly prices ($9.99 Standard, $15.99 Elite) → the price ids
- [ ] Stripe → Developers → Webhooks → add `https://YOURDOMAIN/api/stripe-webhook`
      → the signing secret

## 4. Set the environment variables in Vercel

Copy from `.env.example`. **The rule that matters:** anything named `VITE_*` is
compiled into the JavaScript every phone downloads. A secret in a `VITE_` name
is a published secret.

Safe in `VITE_`: the Supabase URL, the Supabase **anon** key, the VAPID
**public** key, `VITE_STRIPE_ENABLED`.

Never in `VITE_`: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`, `ANTHROPIC_API_KEY`.

The app checks for this at start-up and shouts in the console if it finds a
secret-shaped value in a public name.

## 5. Fill in the things marked as placeholders

- [ ] `src/data/legalText.js` → `OPERATOR` — your name, contact email, postal
      address. The app shows a warning banner until you do.
- [ ] Read the privacy policy and terms in that file end to end. They describe
      what the app actually does today. If you change anything, change them.

## 6. Deploy and check it

- [ ] Push to GitHub; Vercel builds automatically.
- [ ] Open the site on a **real phone**, not a desktop browser.
- [ ] Add it to the home screen (Share → Add to Home Screen).
- [ ] Walk the whole loop: sign up → consent → add a kid → assign a quest →
      pair a second device → submit a photo → approve → check the XP lands.
- [ ] Confirm the camera works. If it does not, you are on `http://` — it only
      works over `https://`.
- [ ] Turn on notifications and confirm one actually arrives.
- [ ] In Stripe **test mode**, subscribe with `4242 4242 4242 4242`, then check
      the family really becomes Elite. Then use `4000 0000 0000 0341` and check
      a failed payment really drops them to Standard.

## 7. Keeping the legal side small

The app is now built so there is very little to be responsible for:

- **Photos are never retained.** A chore photo is destroyed the instant a parent
  approves or sends it back. There is no library of photographs of children's
  homes to lose, which removes most of the real-world risk in one stroke.
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
      jurisdiction, your photo retention period, guild chat between children in
      different families, and whether you need age verification beyond a
      parent's word.
- [ ] Register with the ICO if you are in the UK.
- [ ] Have them check the privacy policy and terms. They are an honest draft
      written from what the code does, not a lawyer's document.

## 9. Before you take money

- [ ] The purchaser must be the parent. A subscription bought by a child is
      chargeable-back and, in the US, specifically actionable.
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
| **The 20% Discount Tournament** | The leaderboard is sample data. Awarding the prize means applying Stripe coupons to ten subscriptions from a monthly job. |
| **Reminders with the app closed** | They fire while RankUp is open. Background ones need a scheduled server job. |
| **Background push, proven** | The code is written and its logic is sound, but no real push message has ever been delivered — no push service was reachable during development. Test it on two phones. |
| **Guilds** | Built and tested, but switched OFF by default. Turn them on with `VITE_GUILDS_ENABLED=true` once you are ready for kid-to-kid contact and the moderation it implies. |

## Running the tests

```bash
npm run test:db      # 124 database checks — no browser needed
npm run test:smoke   # 39 browser checks, no backend required
npm run test:sync    # 22 browser checks against a real backend
```

`supabase/test/README.md` explains how to stand the local backend up.
