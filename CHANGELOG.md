# Changelog

What changed in RankUp, newest first, in plain words. The version at the top
is the one in `package.json`; the app shows it under Settings → Help & about, and
`/api/health` reports it. `tests/release.mjs` fails if this file has no entry
for that version.

## 0.8.1 — 2026-11-03

- One tap on a reward is one purchase. A tap that landed while something else was about to be drawn (a level-up closing itself, a sync arriving) could leave two of the same reward on the child's phone, a few milliseconds apart: the one the server had, and a copy it never heard of. "Mark given" could then hand over the copy, so the real one stayed on the parent's dashboard. Every change on the phone now keeps its own ids and time however many times the app works it out, so the copy is the same purchase; the shop's button also ignores a second tap in the same frame. The coins were only ever taken once by the server. tests/oncetap.mjs taps as a level-up closes.

## 0.8.0 — 2026-11-03

Quick moments, a phone that does not fill up, and schools.

- A level-up lasts about two and a half seconds, a tap anywhere skips it, and the tap still reaches what is under it. Several levels at once (a big sync, or chore after chore accepted) are one moment, not a queue. A streak going up gets a two-second moment of its own; badges earned together are one toast.
- The arcade says, in a child's words, how many tokens they have, how many coins they can still win today, and when winnings come back.
- Switching themes back and forth keeps everything, with chores still waiting to be sent; going back to the theme you started on does not restart Block Craft's dragon fight.
- Old, finished chores and notes the server already has (over 60 days) are let go of on the phone, so a busy family's year no longer fills it. Nothing waiting to be sent is ever touched. Chore history says the phone keeps 60 days; Download my data has everything.
- With the server down for a long time, the phone asks less often, says "Server down since …" with how many changes are saved on the phone, and sends everything within a minute of it coming back. An accept or a send-back sent again because its answer was lost is recognised as the same one.
- A school signs up on one form (account and school together), and the number of students typed to see the price is kept: 9 steps to the first league table instead of 11.
- The operator page has a checklist for checking a school is real, beside what RankUp knows about it; Verify waits until every check is ticked.
- A help page for schools, with prices and numbers from the code.
- docs/LAUNCH.md brought up to date: the six jobs, the trial emails and EMAIL_ settings, re-running every SQL file, checking the server-only functions are shut, the prices, the PIN reset and the help pages.

## 0.7.1 — 2026-11-03

Fixes from a review of 0.7.0.

- The database functions only the server may run (the scheduled jobs, the Stripe webhook's) can no longer be called with the app's public key. Supabase grants new functions to the browser's roles by name, and they were only revoked from everyone in general; the trial-email list, with parents' email addresses, was one of them.
- A free trial that ends just after midnight gets its last-day email (late the evening before, "ends tonight"). The hourly job never landed in its short last day.
- A family whose payment was refunded, but whose plan is still set to renew in Stripe, is asked to cancel it before choosing a new plan, so the card is never charged for two.

## 0.7.0 — 2026-11-03

Payments end to end, and the records a parent keeps.

- A plan's whole life is tested end to end against a stand-in Stripe: subscribe, renew, a failed payment, a refund, cancel, and subscribe again for a year, for a family and for a school.
- A refunded plan stays refunded. Cancelling it in Stripe's portal no longer gives the plan back for free until the period ends.
- A plan cancelled in the portal says "Your plan is ending" and the date. A plan that has ended says so, instead of "It runs until" a date already past for the family.
- Schools: a failed payment is shown to the school's admin, a refund takes the school out of the league, late Stripe news is ignored, and a paying school can open "Card, invoices and cancelling" (it was refused).
- Every notification's words are in one place, short, kind, and true to what happened ("Accepted!", "Back on your list"). A test checks their length and that every link goes to a real screen.
- A link into Parent Mode (a notification, the weekly digest, the way back from Stripe) opens that screen after the PIN, not the dashboard.
- Chore history: every chore each child sent in, accepted or sent back, by whom, and the XP, filterable by child. A parent can add a note to a past chore; what it paid cannot be changed.
- Rewards can have a weekly limit per child, held by the database too, so purchases made offline cannot go over it.
- A pocket money record per child: what was earned, added and paid, when, by whom, and the balance after each line.
- Removing a co-parent asks first, and cancels the invitations they sent. Invitations show when they stop working.

## 0.6.0 — 2026-11-03

Getting ready for launch.

- The version is shown in Settings → Help & about, and `/api/health` reports it.
- A help page for parents answers the common questions, with prices from the plan list.
- A link to a screen that does not exist shows "We can't find that page" and a way home.
- A screen that cannot download with no internet says so, and Try again works once the signal is back.
- With no internet, the app says "No internet" and how many things are saved on the phone. A chore sent offline says "Saved on your phone" until it has really gone.
- The server's errors are short JSON codes, never internal details.
- Every arcade game, and every sport in SportsMania, says how to play as it starts.
- Link previews no longer mention photos, and their picture uses the site's full address.
- `robots.txt` keeps search engines off `/api/`, and a sitemap lists the front door.
- Settings names the plan a family is really on: a free family is on Starter, not "Standard".
- Every price and trial length comes from the plan list, including the dashboard's Elite banner and the terms.
- Two emails before a free trial ends, three days before and on the day, once each per family, from a new hourly job (`/api/send-trial-emails`). docs/EMAILS.md lists every email RankUp sends and what to set up in Supabase and Stripe.
- A forgotten Parent Mode PIN can be reset: "Forgot your PIN?" asks for the account's password again, then a new PIN. Not on a child's phone.
- "Download my data" also gives an easy-to-read summary (children, chores, history, rewards) beside the full JSON, and the JSON now includes what each child spent.
- The plan screen says what each plan adds, in plain words, from the limits the app enforces, and what a year saves against twelve months.

## 0.5.0 — 2026-11-02

A new family's first ten minutes, and RankUp's own address.

- One front door, fewer taps to the first accepted chore, and a first-week checklist.
- RankUp lives at `rankup.<your domain>` and shares nothing with the company's other sites.
- RankUp is a product of MTRX Horizyn.
- Both parents in two families hear when a child asks to join a guild.
- Up-to-date build tools; no known security advisories.

## 0.4.0 — 2026-11-02

Two phones, one family, and payments that hold up.

- Chores, coins, rewards and the family goal stay right across every phone in a family.
- Streaks, the daily bonus and the arcade limit count on the family's own day.
- Stripe refunds, failed renewals and Stripe being down are all handled and explained.
- Deleting the account cancels the subscription at once.
- The first screen opens without downloading the whole app.
- The arcade's framed games run in the real build.
- No photos at all: the consent notice says so, and older consents still stand.

## 0.3.0 — 2026-11-01

Safer underneath.

- RankUp no longer takes, keeps or sends photos.
- Offline changes are kept and sent later, never lost or sent twice.
- Notifications are proven end to end, at most sixty an hour per family.
- A Content-Security-Policy for the built app.
- A backups guide, and family counts for the owner's console.

## 0.2.0 — 2026-10-30

The School League.

- Schools sign up by size, pay by size and compete for their district.
- A page for checking that schools are real, and staff can leave a school.
- Fixes from two reviews: who can do what, and payments.

## 0.1.0 — 2026-10-26

The first build.

- Chores become quests. A child taps "I did it!", a parent accepts, and XP, levels and coins follow.
- Kid and parent themes, rewards, streaks and the arcade.
- Block Craft: a story told in battles, secret worlds and a chore-powered dragon fight.
