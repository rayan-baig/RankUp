# Emails

Which emails a family (or a school) gets from RankUp, who sends each one, and
what you have to set up for it. Three senders, and only one of them is this repository's
code. A gift's two emails are the only ones that can go to somebody who has
no RankUp account: the buyer, and the person they bought it for.

| Email | Sent by | When | Set up |
|---|---|---|---|
| **Confirm your email** (the welcome) | Supabase Auth | Sign-up, if **Confirm email** is on | Supabase dashboard: the template below |
| **Reset your password** | Supabase Auth | When you send one from the dashboard (the app has no "forgot password" screen yet) | Supabase dashboard: the template below |
| **3 days left of your trial** | RankUp, `/api/send-trial-emails` | Three days before a family's free trial ends, in its own time zone | `EMAIL_API_KEY`, `EMAIL_FROM`, the hourly job (below) |
| **Last day of your free trial** | RankUp, `/api/send-trial-emails` | On the day it ends, in its own time zone (late the evening before, for a trial that ends in the first two hours of a day, which an hourly job could miss) | The same |
| **Your School League month** (to a school's admin) | RankUp, `/api/settle-schools` | Once a month, when the month is closed (the 2nd) | `EMAIL_API_KEY`, `EMAIL_FROM`, the monthly job |
| **Your RankUp gift** (the buyer's receipt, with the code) | RankUp, the Stripe webhook (`api/_shared/gifts.js`) | The moment Stripe confirms a gift is paid for | `EMAIL_API_KEY`, `EMAIL_FROM`, `GIFT_CODE_SECRET` |
| **"<name> gave your family a year of RankUp"** (to the person it is for) | RankUp, the same | The same moment, only if the buyer chose "Email it to them now" | The same |
| **A district's quote request** (to whoever runs RankUp, not a family) | RankUp, `/api/district-quote` | When somebody sends the "Get a quote" form on the district page: at most 3 an hour from one place, 30 in all | `SALES_EMAIL` (or `SUPPORT_EMAIL`), with `EMAIL_API_KEY` and `EMAIL_FROM` |
| **A district's invoice** | Stripe | When a district's yearly plan starts and each year it renews | Stripe dashboard: email finalized invoices to customers ([PAYMENTS.md](PAYMENTS.md#school-districts)) |
| **The error report** (to whoever runs RankUp, not a family) | RankUp, `/api/send-trial-emails` | Hourly, when there is a new error: each error at most once an hour, at most 20 a day | `ERRORS_EMAIL`, with `EMAIL_API_KEY` and `EMAIL_FROM` |
| **Receipt** | Stripe | Each payment | Stripe dashboard (below) |
| **A payment failed** | Stripe | A renewal's card is declined | Stripe dashboard (below) |
| **Your plan has ended** | Stripe, if your account offers it; otherwise nobody | A subscription is cancelled, or Stripe stops retrying | Stripe dashboard (below) |

There is no separate welcome email beyond Supabase's confirmation, and no
email to a child: children have no email address in RankUp.

Every email RankUp writes is short, says what the app says in the same words,
has a plain-text part, says how to get help, and ends with
`RankUp is a product of MTRX Horizyn.` It never names a child (an email can be
forwarded) and never a person behind the company. The sender is
`RankUp <no-reply@rankup.mtrxhorizyn.com>`, set up once with the provider as
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
  > [See your plan] → `https://rankup.mtrxhorizyn.com/#/parent/plan`
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
  company's support address; without it, `SUPPORT_EMAIL` if that is set,
  and otherwise the email points only to Help).
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

## RankUp's own: a school's month

`api/settle-schools.js`, after it has closed last month; words in
`api/_shared/email.js` (`schoolMonthEmail`), the facts in
`supabase/schools.sql` (`school_month_summary`, `claim_school_month_emails`).

- **Who.** Each admin of each school whose month was settled, one email to
  each address. Never a teacher, never a parent, and never a school that is
  suspended.
- **What.** The month's league result (its score per student and its place
  among the district's ranked schools, District Champion and the free month,
  each rivalry won, lost or drawn, or why it was not ranked), what the school
  paid that month (from the invoices Stripe reported), and what happens next:
  the date the plan renews, the date it ends if it was cancelled, the date the
  free trial ends, or that it has ended. No child is in it: the School Stars
  stay on the school's page.

  > **Subject:** Hill School: your School League month, October 2026
  >
  > Hello,
  >
  > Hill School scored 12.3 points per student in October 2026, with 41
  > taking part: 2nd of 5 schools in North Valley.
  >
  > Against Lake School: you won.
  >
  > In October 2026 you paid $49.00.
  >
  > Your plan renews on 14 November 2026.
  >
  > Open the school page: https://rankup.mtrxhorizyn.com/#/school
  >
  > Need help? The school help page is https://rankup.mtrxhorizyn.com/#/school/help.
  > Or write to help@rankup.mtrxhorizyn.com; a person reads it.
  >
  > RankUp is a product of MTRX Horizyn.
  > You get this because you run Hill School's School League account. One
  > email a month.

- **Once per school per month.** The job claims each school's month in the
  database before sending (only the job can: the functions are revoked from
  `public`, `anon` and `authenticated`), marks it sent after, and gives the
  claim back if the send failed, so the next run tries again. A run that died
  between sending and marking is covered by the provider's idempotency key.
- **Without the email settings** the month is still closed and the free
  months still given; the emails wait until they are set and the job runs.
- **Tested** by `supabase/test/47-school-month-email.sql` (what it says,
  who gets it, once only, a failed send retried, a dead run's claim taken
  again, nobody else can call it), `tests/noticewords.mjs` (every variant's
  words) and `tests/api.mjs` (the job under workerd against a stand-in
  provider).

---

## RankUp's own: the error report

`api/_shared/errorReport.js`, sent by the hourly `api/send-trial-emails.js`
after the trial reminders; words in `api/_shared/email.js`
(`errorReportEmail`); what goes in it decided in `supabase/crashes.sql`
(`claim_error_report`, `finish_error_report`).

- **Who.** One address, `ERRORS_EMAIL`: whoever runs RankUp. Unset, nothing
  is claimed and nothing is sent; the errors are still kept for 90 days.
- **What.** Crashes on phones (`crash_reports`, as before) and, new, errors
  in the server functions (`server_errors`): every function that used to
  write an error only to the host's log now also records it with
  `reportError` (`api/_shared/job.js`), and so does a scheduled job's failed
  run. Each line says where (a screen, or a function's name), how many times
  since it was last reported, the message, and "New." the first time.
- **Never a family in it.** No child's or adult's name, no email, no family
  id, no request, no token. Emails, tokens, ids (a family's is a uuid;
  Stripe's), quoted values and long numbers are taken out when an error is
  recorded (`error_scrub`, and `scrubErrorText` in the function before it
  is sent); every word that is anybody's name in RankUp (any child's, adult's
  or family's) is taken out when the report is written (`error_name_scrub`),
  because only the database knows them all; and the email is scrubbed again
  as it is written.
- **How often.** Each distinct error (where, and what it said once scrubbed)
  at most once an hour; at most 20 reports in any 24 hours; at most 20 errors
  in one report, with "and N more" for the next. A report that could not be
  sent gives its errors back for the next run; a run that died after
  claiming gives them back after half an hour; the idempotency key stops a
  retried send arriving twice.
- **The words:**

  > **Subject:** RankUp: 2 errors to look at, 1 new
  >
  > Hello,
  >
  > RankUp recorded 2 kinds of error since the last report.
  >
  > New. On a phone, on /parent/settings, 3 times: TypeError: rewards.map is not a function
  >
  > In the server function billing-portal, once: Request failed with status 500
  >
  > No family is named in this email: names, emails, ids and tokens are
  > taken out before it is written.
  >
  > What to do about each: docs/IF-SOMETHING-BREAKS.md in RankUp's code. ...
  >
  > --
  > RankUp is a product of MTRX Horizyn.
  > You get this because ERRORS_EMAIL is set to this address. Each error at
  > most once an hour, and at most 20 of these a day.

- **Tested** by `supabase/test/48-error-report.sql` (scrubbing, a child's
  and an adult's name and an email in a message never reaching the report,
  once an hour, 20 a day, given back, only the job can call it),
  `tests/api.mjs` (the job under workerd: a crash with a child's name and a
  parent's email in it, and the email that goes out has neither) and
  `tests/emails.mjs`.

---

## RankUp's own: a gift's two emails

`api/_shared/gifts.js`, from the Stripe webhook once a gift's checkout is
paid; words in `api/_shared/email.js` (`giftReceiptEmail`, `giftEmail`); the
order in `supabase/billing.sql` (`fulfil_gift_order`, `mark_gift_sent`).
[PAYMENTS.md](PAYMENTS.md#gift-subscriptions-a-year-of-rankup) has how gifts
work.

- **Who.** The receipt to the buyer's email, always. The gift to the
  recipient's email, only if the buyer chose "Email it to them now"; "I'll
  give it myself" sends nothing to anybody else. Never to a child.
- **Once.** Each is marked sent after the provider accepts it and carries an
  idempotency key (`gift-receipt:<session>`, `gift-send:<session>`), so
  Stripe sending the payment twice, or retrying, never sends one twice. If
  the provider refuses, the webhook answers 500 and Stripe's retry sends it,
  with the same code. Without `EMAIL_API_KEY` and `EMAIL_FROM` the webhook
  answers 500 until they are set: the code reaches people only by email.
- **The receipt**, for Elite Pass emailed to the family:

  > **Subject:** Your RankUp gift: a year of Elite Pass
  >
  > Hello,
  >
  > Thank you for giving a year of RankUp. Here is the gift code for Elite
  > Pass, for 1 year:
  >
  > Gift code: ABCD-EFGH-JKMN
  >
  > We have emailed the gift to The Riveras at `<their email>`, with the code
  > and how to use it. *("You said you would give it yourself: print the gift
  > card, or pass the code on however you like." for "I'll give it myself".)*
  >
  > To redeem it, a parent opens RankUp (or sets it up, free), goes into
  > Parent Mode, then Settings, Redeem a gift, and types the code. Their
  > family then has Elite Pass free for 12 months from that day.
  >
  > The code can be used until 14 November 2028, once. If the family already
  > pays for RankUp, the gift year starts when their paid plan ends, so they
  > never pay twice.
  >
  > You paid $79.99, once. Nothing renews and nothing more is charged. Stripe
  > sends its own receipt for the payment.
  >
  > [Print the gift card] → `https://rankup.mtrxhorizyn.com/#/gift/card?code=...`
  >
  > Need help? ... Or write to `<EMAIL_REPLY_TO>`; a person reads it.
  >
  > --
  > RankUp is a product of MTRX Horizyn.
  > You get this because you bought a RankUp gift. We keep your email for
  > this receipt and for help with the gift until the code runs out.

- **The gift**, to the person it is for:

  > **Subject:** Grandma Jo gave your family a year of RankUp
  > *("Someone gave ..." when the buyer left their name out)*
  >
  > Hello The Riveras,
  >
  > Grandma Jo gave your family a year of RankUp Elite Pass: your kids'
  > chores become quests, and they earn XP and level up when you accept them.
  >
  > Grandma Jo wrote: "Happy holidays!"
  >
  > Your gift code: ABCD-EFGH-JKMN
  >
  > To redeem it, a parent opens RankUp (or sets it up, free), goes into
  > Parent Mode, then Settings, Redeem a gift, and types the code. Your family
  > then has Elite Pass free for 12 months from that day. No card is needed
  > and nothing is charged.
  >
  > Use it by 14 November 2028. If you already pay for RankUp, your gift year
  > starts when your paid plan ends.
  >
  > [Open RankUp] → `https://rankup.mtrxhorizyn.com/`
  >
  > Need help? ...
  >
  > --
  > RankUp is a product of MTRX Horizyn.
  > You get this because somebody bought you a RankUp gift and asked us to
  > email it. Your name and email are used only to send it, and deleted
  > within 30 days.

- **Never the buyer's email address** in the gift: the builder is handed the
  whole order and does not read it, and `tests/emails.mjs` and
  `tests/billingwalk.mjs` check every variant. What the buyer typed is plain
  text, escaped in the HTML part; links and email addresses are refused in
  the names and the message, so RankUp's address cannot be used to send
  somebody a link. The recipient's name is asked for as a grown-up's or the
  family's, not a child's.
- **The card link** carries the code after the `#`, which a browser never
  sends to a server. Turn **click tracking off** at the email provider, so
  the link is not rewritten through the provider's own address.
- **Tested** by `tests/emails.mjs` (both, every variant: each plan, emailed
  or given by hand, with and without names, message, amount and date, with
  and without a site and a support address) and `tests/billingwalk.mjs`
  (sent once through the real webhook, through replays and the provider
  being down).

---

## RankUp's own: a district's quote request

The "Get a quote" form on the district page (`#/district`) is for a district
with more schools than a plan holds (100), or one that needs to pay another
way. `api/district-quote.js` checks what was typed with the same rules as the
form (`src/lib/quoteRules.js`) and sends one email to `SALES_EMAIL`, or
`SUPPORT_EMAIL` when that is all that is set: the district, the person's name
and role, how many schools and about how many students, their note, and their
email, which is also the reply-to, so answering it answers them.

- **Nothing they typed is stored.** The email is the only copy. The database
  keeps only a keyed hash of where the request came from and when, for the
  limit (3 an hour from one place, 30 an hour in all), and the retention job
  deletes those after 2 days.
- **Never a child.** Only a grown-up at a district fills it in, and it asks
  nothing about any child.
- If the email cannot be sent, the person is told to try again in a few
  minutes, and the error goes in the error report.
- **Tested** by `tests/emails.mjs` (every variant) and `tests/api.mjs` (sent
  through the real function, refused when not filled in, rate limited, the
  provider down).

A school its district pays for gets its month's email as before, saying the
district pays for the school instead of what the school paid.

---

## Every email, checked

`tests/emails.mjs` renders every email RankUp's own code sends, in every
variant (each plan, each kind of school month, each way a gift or a quote
request can be filled in, with and without a site and a support address), and checks each has a plain-text part, no blank left
unfilled, the footer once in each part, nothing wider than 600px, and the
same words and links in both parts. A new kind of email in
`api/_shared/email.js` fails it until its variants are added.

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
