# Changelog

What changed in RankUp, newest first, in plain words. The version at the top
is the one in `package.json`; the app shows it under Settings → Help & about, and
`/api/health` reports it. `tests/release.mjs` fails if this file has no entry
for that version.

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
