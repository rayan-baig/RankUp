# Emails

Which emails a family gets from RankUp, who sends each one, and what you have
to set up for it. Three senders, and only one of them is this repository's
code.

| Email | Sent by | When | Set up |
|---|---|---|---|
| **Confirm your email** (the welcome) | Supabase Auth | Sign-up, if **Confirm email** is on | Supabase dashboard: the template below |
| **Reset your password** | Supabase Auth | When you send one from the dashboard (the app has no "forgot password" screen yet) | Supabase dashboard: the template below |
| **3 days left of your trial** | RankUp, `/api/send-trial-emails` | Three days before a family's free trial ends, in its own time zone | `EMAIL_API_KEY`, `EMAIL_FROM`, the hourly job (below) |
| **Last day of your free trial** | RankUp, `/api/send-trial-emails` | On the day it ends, in its own time zone (late the evening before, for a trial that ends in the first two hours of a day, which an hourly job could miss) | The same |
| **Receipt** | Stripe | Each payment | Stripe dashboard (below) |
| **A payment failed** | Stripe | A renewal's card is declined | Stripe dashboard (below) |
| **Your plan has ended** | Stripe, if your account offers it; otherwise nobody | A subscription is cancelled, or Stripe stops retrying | Stripe dashboard (below) |

There is no separate welcome email beyond Supabase's confirmation, and no
email to a child: children have no email address in RankUp.

Every email RankUp writes is short, says what the app says in the same words,
has a plain-text part, says how to get help, and ends with
`RankUp is a product of MTRX Horizyn.` It never names a child (an email can be
forwarded) and never a person behind the company. The sender is
`RankUp <no-reply@rankup.<your domain>>`, set up once with the provider as
[LAUNCH.md](LAUNCH.md#email-from-the-shared-domain) describes (SPF, DKIM and
DMARC on the parent domain).

---

## RankUp's own: the trial reminders

`api/send-trial-emails.js`, words in `api/_shared/email.js`
(`trialEmail`), who is due in `supabase/digests.sql`
(`due_trial_reminders`).

- **Who.** A family on a free trial of a better plan than the one it pays for
  (a family already paying for Elite is told nothing when an Elite trial
  ends). Every adult in the family who is a parent, each to their own
  address; never a supporter.
- **When.** Schedule the job **hourly** (LAUNCH.md section 2b). The database
  decides, in each family's time zone: "3 days left" once the end is within
  three days but not today, "Last day" on the day it ends. If the first was
  missed (the job was down) only the second goes.
- **Once.** Each reminder is claimed before it is sent and marked sent after,
  so it goes once per family, ever, however often or however many times at
  once the job runs. A send that fails is given back and tried on the next
  run. Each email carries an idempotency key, so a run that died between
  sending and marking cannot send it twice.
- **The words**, for a family on Starter trying Elite Pass:

  > **Subject:** 3 days left of Elite Pass, free *(the trial banner's own title)*
  >
  > Hello,
  >
  > Your free trial of Elite Pass ends in 3 days, on Friday 14 November.
  >
  > After that you are on Starter, which is free, unless you choose a plan.
  > Nothing is charged by itself.
  >
  > Everything your children have earned stays exactly where it is.
  >
  > To keep Elite Pass, open RankUp and go to Settings, then Your plan.
  >
  > [See your plan] → `https://rankup.<your domain>/#/parent/plan`
  >
  > Need help? Open RankUp, then Settings, Help & about, Help. Or write to
  > `<EMAIL_REPLY_TO>`; a person reads it.
  >
  > --
  > RankUp is a product of MTRX Horizyn.
  > You get this because your family started a free trial. There is one more
  > email about it, on the day it ends.

  On the day: **"Last day of your free trial"**, "Your free trial of Elite
  Pass ends today" ("ends tonight" when it goes the evening before), and
  "This is the last email about it." Plan names come
  from the plan list, so they follow it.

- **Settings** (`.env.example`, section 6a): `EMAIL_API_KEY` (the provider's
  API key, a secret), `EMAIL_FROM`, and optionally `EMAIL_REPLY_TO` (the
  company's support address; without it the email points only to Help).
  The code is written for Resend's HTTP API (`POST /emails`): a Cloudflare
  Worker cannot send SMTP. Another provider needs `sendEmail` in
  `api/_shared/email.js` changed to its API.
- **Without them** the job answers `not_configured`, records no run, and
  `/api/health` shows `send-trial-emails` as `never_run`: an email nobody set
  up does not look healthy.
- **Tested** by `supabase/test/40-trial-emails.sql` (who is due, time zones,
  once only, a failed send retried, nobody else can list it) and
  `tests/api.mjs` (the job under workerd against a stand-in provider: the
  words, both parts, the footer, the help line, once only, the provider
  down).

---

## Supabase: confirm and reset (dashboard)

Supabase → Authentication → **Emails → Templates**. These are Supabase's
templates; RankUp's code does not send them, so the words live here. Paste
each subject and body as written.

**Confirm sign up**

- Subject: `Confirm your email for RankUp`
- Body:

  ```html
  <p>Hello,</p>
  <p>Tap the button to confirm this is your email. Then open RankUp and sign in to set up your family.</p>
  <p><a href="{{ .ConfirmationURL }}">Confirm my email</a></p>
  <p>If you did not sign up for RankUp, ignore this email. Nothing happens.</p>
  <p>Need help? Open RankUp, then Settings, Help &amp; about, Help.</p>
  <hr>
  <p>RankUp is a product of MTRX Horizyn.</p>
  ```

**Reset password**

- Subject: `Reset your RankUp password`
- Body:

  ```html
  <p>Hello,</p>
  <p>Tap the button to choose a new password for RankUp. The link works once and runs out soon.</p>
  <p><a href="{{ .ConfirmationURL }}">Choose a new password</a></p>
  <p>If you did not ask for this, ignore this email. Your password stays as it is.</p>
  <p>Need help? Open RankUp, then Settings, Help &amp; about, Help.</p>
  <hr>
  <p>RankUp is a product of MTRX Horizyn.</p>
  ```

Supabase sends these as HTML only; it adds no plain-text part of its own
choosing. Keep them this short so they read the same either way.

Turn off any other template you do not use (Magic Link, Change Email, Invite
User): the app uses none of them.

---

## Stripe: receipts, failed payments, a plan ending (dashboard)

Stripe writes these itself, in its own template, and they cannot be given
RankUp's exact words. What you control is what they say about who you are and
which ones are sent. Check the names below against your dashboard: Stripe
moves these settings from time to time.

- **Settings → Business → Public details**: business name **MTRX Horizyn**,
  the company's support email and a statement descriptor that says RankUp
  (LAUNCH.md section 3). Every Stripe email shows these, which is how a
  parent finds help from one.
- **Settings → Business → Customer emails**: switch on **Successful
  payments** (the receipt) and **Refunds**.
- **Billing → Revenue recovery** (failed payments): switch on the email to
  customers when a **card payment fails**, with the link to update the card.
  In the app the same moment says "A payment failed" (`billingNotice` in
  `src/lib/billing.js`); the family is on Starter until it goes through.
- **A plan ending.** If your Stripe account offers an email when a
  subscription is cancelled or when retries run out, switch it on. If it does
  not, no email is sent: the plan screen says "Your plan has ended" or "Your
  plan has stopped", and nothing a child earned is touched.
- **Stripe's own trial reminder: leave it on.** A family who chooses a plan
  during RankUp's trial carries the rest of it into Stripe as a Stripe trial
  (`api/create-checkout.js`), and the card is charged when it ends. Stripe's
  reminder before that charge is the one that family needs. RankUp's two
  reminders go only to families whose plan would get smaller when the trial
  ends, so the two never reach the same family.

If you want any of these in RankUp's own words, they would be sent from the
webhook (`api/stripe-webhook.js`) the same way as the trial reminders. That
is not built: today Stripe sends them.
