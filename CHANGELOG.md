# Changelog

What changed in RankUp, newest first, in plain words. The version at the top
is the one in `package.json`; the app shows it under Settings → Help & about, and
`/api/health` reports it. `tests/release.mjs` fails if this file has no entry
for that version.

## 0.12.0 — 2026-11-07

Theme Genesis: "What's it inspired by?", and Season themes in their own names.

- Spark has a new box, "What's it inspired by?" ("e.g. racing, space, dinosaurs, a game you love"). A child types an idea, taps "Make it", and the whole starting theme is filled in: a name (with two more to pick from), the vibe, colours of its own, a pattern, a mascot, the four worlds and the coins, with a short line saying what it picked ("Racing vibes: checkered flags, red and black, 🏎️"). Everything can still be changed in Design and Build; the idea's colours are the first palette in Design.
- It works on the phone alone: a library of 57 kid-friendly topics built into the app (racing, football, space, dinosaurs, City Nights, Blocky World, pirates, castles, unicorns, robots and more). No AI and no network; what is typed is never saved or sent. Games, leagues and brands are only aliases that lead to a generic topic ("f1" and "nascar" give Racing, "minecraft" Blocky World, "rocket league" Car Soccer, "fifa" Football, "pokemon" Creature Collectors), so the theme never carries the brand. Games for older players lead to a gentle topic with nothing about crime, weapons or fighting ("gta" gives City Nights: a neon city, cars and skyscrapers). An idea it does not know finds the closest topic, or "Something new" ("Here's a starting point. Make it yours!"). A rude idea gets the same gentle no as a rude name.
- Four new background patterns (Checkers, Stripes, Snow, Hearts) and 32 more mascots to go with the topics. A stored theme is the same small design as before; the library is in the app, not in the data.
- A theme sent to RankUp for a Season can't use another company's game, league or brand name (F1, NASCAR, GTA, Minecraft, Fortnite, Roblox, Pokémon, Mario, Rocket League, FIFA, NBA, NFL, Disney, Marvel, Lego and others), because it could become an official RankUp theme in every family's picker. A family's own theme may still be called what they like. The phone says "Season themes can't use other companies' names. Give it your own name to send it in." and the database checks the same list again when a theme is sent; whole words only, so "Marvellous Mountains" is fine.
- The privacy policy says the box stays on the phone, and that Season themes carry no brand names; the consent notice is unchanged.
- SQL (sync.sql): run it again on the live database.

## 0.11.0 — 2026-11-07

Theme Genesis: children make themes of their own, and the best become a Season.

- Theme Genesis, a small version of Genesis from the MTRX Horizyn site. From the You tab's theme picker ("Make your own theme"), or from Settings for a chosen child, a theme goes through four short steps with a checklist and a progress bar: Spark (a name and a starting vibe: space, ocean, jungle, candy, robots or something new), Design (ten kid-friendly palettes or their own three colours, kept readable whatever they pick; eight background patterns drawn in SVG; a mascot from 24 emoji), Build (the four worlds and the coins, named already so it is quick) and Launch (their home screen in the new theme, then "Use this theme"). Drafts are saved, edited later and deleted; five themes a child.
- A child's theme is a look and some names over a built-in theme's structure: the same five forms and four worlds at the same levels. XP, coins, streaks, rewards and unlocks are worked out exactly as before. Switching between their own theme and a built-in one is as quick as any theme switch and keeps all progress; the theme lock still holds (the PIN on a shared phone; on a child's own phone, "Use this theme" asks and a parent switches it on from Review). Deleting the theme a child wears puts them on the one it was made from.
- Seen only by the family. Themes sync between the family's phones like the rest (a parent sees every one; a child only their own), and nobody outside the family can read them. A parent renames or removes any of them in Settings → Kids' own themes. Names are plain text with a rude-word filter, on the phone and again in the database; nothing a child types goes to any outside or AI service.
- Seasons. A child can ask to send a finished theme to RankUp; nothing goes until a parent says yes in Review, with an optional credit line (a first name or nickname, never filled in for them). What is sent is the theme alone. One a child a month. The operator page (`#/operator`) has a Theme submissions tab: each theme as a live preview, grouped by month, with Pick for next Season, Decline and Remove, and the Seasons themselves (number, name, start day). On a Season's first day every family's theme picker shows its themes, marked "Season N" with the credit, and a child's home shows "New Season!" once; the family whose theme was picked is told in the app. No deploy is needed. Declined and unpicked themes are deleted after 90 days by the retention job.
- The privacy policy says all of this in its own two sections; the consent notice is unchanged.
- SQL (sync.sql, retention.sql, consent.sql): run them again on the live database.

## 0.10.0 — 2026-11-03

In line with the company's other apps: errors come to one inbox, usage is counted without counting anybody, and a staging copy.

- Errors to one inbox. The server functions now write their errors down (a checkout that could not start, Stripe or the database not answering, a scheduled run that failed), as phones already did their crashes. Set `ERRORS_EMAIL` and the hourly email job sends one short report of what is new: each error at most once an hour, at most 20 reports a day. No child's or adult's name, no email, no family id, no request and no token is ever in it: they are taken out when an error is written down, every name RankUp knows is taken out again when the report is written, and the email is scrubbed once more. `/api/health` counts the server's errors beside the crashes.
- Daily usage totals: families signed up, chores accepted, rewards bought, games played, schools signed up and help page views. Totals only, by day: no id, no name, no time of day, no cookie and no outside service; counted inside the database as each thing happens (a help page view is sent with the public key alone, so not even the request says who). The operator page shows the last 30 days, and `/api/stats` gives them to the MTRX Horizyn console. Kept 400 days. The privacy policy says so in one sentence.
- Settings → Help & about shows the family's plan beside the version and Help, and the support address when there is one: the new optional `SUPPORT_EMAIL`, which both help pages and the emails use too.
- docs/STAGING.md: a second copy at `staging.rankup.<your domain>` with its own Supabase project, Pages project, Stripe test mode and email sandbox, never sharing a key with live; the SQL files run there first; and how a tested commit is promoted to live.
- Every email RankUp sends itself is checked in every variant (tests/emails.mjs): a plain-text part, no blank, the footer once, nothing wider than 600px, the same words and links in both parts. A trial reminder with no end date no longer says "on undefined".

## 0.9.0 — 2026-11-03

Ready for many families at once, older phones, and schools that hear from us.

- The database was load-tested with 1,000 families' phones syncing at once (docs/LOAD-TEST.md, tools/loadtest.mjs). The first thing to break was the connection pool, at 1,600 phones going flat out. The pull is now a third faster and about half as much again gets through: the checks that decide what each phone may see are worked out once per request instead of once per row, the guild roster reads one child's week by an index made for it, and the Sunday digest no longer reads the whole time zone database for every family (9 seconds at 1,000 families, now a third of a second).
- Reminders and the weekly digest go out in batches the server claims first, within what one run of a Cloudflare Function may do. 10,000 reminders due at the same minute are each sent once, over several short runs; a run cut off part-way is picked up five minutes later without anyone getting two. Each push is cheaper to sign, and a slow push service can no longer hold the job.
- "Add to Home Screen" is offered after the family's first accepted chore, once, on the parent's dashboard; never on a first visit, never on a child's phone, never while a child plays. Android gets an Install button; an iPhone gets the two steps.
- Built for iPhone Safari 15 and Chrome from about four years back. The chore history no longer breaks on iPhones before iOS 15.4, and cards and buttons keep their colours on phones without color-mix().
- Each school's admin gets a short email when the month closes: the league result, what the school paid that month, and when the plan renews.

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
