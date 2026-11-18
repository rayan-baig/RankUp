# Changelog

What changed in RankUp, newest first, in plain words. The version at the top
is the one in `package.json`; the app shows it under Settings → Help & about, and
`/api/health` reports it. `tests/release.mjs` fails if this file has no entry
for that version.

## 0.20.2 — 2026-11-18

- **Block Craft's avatar pictures are back.** The owner's nine uploaded pictures are used again for the nine forms, and the rings round the avatar use their colours again. Everything else from 0.20.1 stays: the new names, the theme picker lines, the battle scenes and the arcade changes.

## 0.20.1 — 2026-11-18

Our own artwork and names throughout.

- **Block Craft has its own hero.** The nine avatar pictures were made by a picture generator and copied another company's game: its best-known character, then its armour, one metal after another. They are gone. In their place is a hero drawn for RankUp: an ivory cube helmet with a dark visor and two glowing green eyes, a sprout growing out of the top, an orange scarf and a purple tunic. Each form adds to the hero's own gear: a second leaf and a satchel, copper shoulder guards and a star badge, a cape and a flower, glowing runes, a gold band and an ember flower, a ring of runes, a crystal circlet and a cape full of stars, and at the dragon a gold crown and wings of light. Drawn as small pictures (4 to 10 KB each, was about 15 KB) by `scripts/draw-blockcraft-avatars.mjs`, and checked inside the circle at every size the app shows them. The rings round the avatar follow the same colours, not the old metals.
- **The Block Craft battles match.** The hero in every battle is the same cube-helmed hero with a green blade. The raiders wear hoods and pale masks; the fire creatures are little flame wisps; the shades of the Far Isle are empty floating cloaks with two cold eyes; the portal is a stone arch with fire in its seams; the Far Isle has crystal spires on violet rock; the villagers have ordinary faces; and the dragon's eyes and breath are amber. The companion who joins at the Ember Gate is **Sparkbit**, a little flying cube with leaf wings.
- **Block Craft's names are our own.** Emeralds are now **Gems**. The worlds are **The Ember Gate** (was named after the other game's fire world), **The Ashlands**, **The Far Isle** (was "The End") and The Dragon. Raid Night and Hero's Return are unchanged.
- **No brand or real person in the theme picker.** Each theme's line under its name now says what kind of game it feels like: Falling blocks, Blocky adventure, Squad tactics, Battle royale, Anime, Cute pastel, Pop star stage, Winged horses, Sweet bakery, Fashion studio, Cozy village, Cyberpunk, Platform jumping, Rhythm runner and Creature collecting.
- **Coins and worlds renamed where they copied a game.** Renown is **Merit**, V-Coins are **Drop Coins**, Mana Orbs are **Beat Orbs**, Pocket Coins are **Tamer Coins**. Plumber Kingdom no longer loses a princess or cuts a bridge, and its worlds are Meadow Run, Underground, Lava Castle and **Starlight Path**. Monster Tamer's worlds are **First Trail**, Deep Cavern, **Volcano Arena** (a trophy, not a badge) and **Champion Climb**. Campfire Cozy no longer opens with a loan.
- **The arcade.** Find the Impostor is **Find the Fibber**: five animal friends (Fox, Owl, Frog, Bear and Cat), an empty cookie jar, and "Case 1 of 3". 2048 is **Number Merge**, Formula 1 in SportsMania is **Grand Prix**. Tennis Tour's players and tournaments are all made up for the game, with no real players, tournaments or tours named; the football match's all-star team has nicknames, not real footballers.
- Spending, saved games and scores are unchanged: only names and pictures changed, never an id. No SQL change, no new setting. Tests updated for the new names (`tests/arcade3.mjs`, `tests/arcade4.mjs`, `tests/sweets.mjs`, `tests/battles.mjs`, `tests/forms.mjs`).

## 0.20.0 — 2026-11-18

The first five minutes: a demo anyone can open, a shorter start, and no blank screens.

- **"See it live"** on the front door opens a pretend family (the Riveras: Sam, Ava and Noah, always the same made-up first names) with no account and no email. A bar on every screen says **DEMO**, switches between the parent's view and each child's ("See it as: Parent · Ava · Noah"), and has **"Start for free"**, which clears the demo and opens the sign-up straight away instead of the front door again.
- **The demo shows the whole loop.** Accepting Ava's waiting chore now levels her up, she has enough to spend on a reward, and "Start here" adds one-tap links to Rewards, the league and the chore history. The league says plainly what a real family also gets.
- **Nothing in the demo leaves the phone.** On top of the existing network switch, a gift's checkout, a pilot request and a district's quote (the three calls that need no sign-in) now refuse in the demo with a plain message, so the demo never reaches Stripe or sends an email.
- **"Getting started"** (was "Your first week"): add a child, link their phone, add a first chore, accept a finished chore. Still ticked only from real state, and gone when done or hidden. "Add 3 starter chores" (make your bed, read for 20 minutes, load the dishwasher; three from the adaptive pack for a child who needs it) is one tap on the list, and "We share one phone" finishes the phone step for a family with one phone. The pairing screen says the same. Sign-up to the first accepted chore is 22 taps (was 24).
- **Starter rewards.** A family with no rewards sees "No rewards yet" on the dashboard with three to add in one tap (a film pick, a later bedtime, a day out), or "Make my own", which opens Settings on the rewards. Settings offers the same three when the list is empty.
- **No blank screens.** Review, chore history, pocket money, recent activity, a child's quests and rewards, and the tools with no child yet each say what will appear there and offer the one next step. The words are in one place (`src/data/emptyStates.js`).
- **Setup words.** Shorter and plainer on the family and child screens (the PIN, adaptive quests, picking a world); "First name only" for a child.
- **On a phone.** Small text links (Manage, Chore history, Hide this list, back links, Add a note, the front door's gift and schools links) are now at least 40px tall to tap. Every main screen was checked at 375px wide with nothing scrolling sideways.
- No SQL change, no new setting. Tests: new `tests/demolive.mjs` (smoke) and `tests/firststeps.mjs` (awards); `tests/lookaround.mjs` and `tests/firstten.mjs` updated, and the tests that open the demo now tap "See it live".

## 0.19.2 — 2026-11-18

The rest of the pre-launch review: money that could be taken twice or not at all, and numbers that could give a family away.

- **The half-price month is never given back by mistake.** When Stripe's answer is lost (a timeout, its own error), RankUp now asks Stripe whether the coupon is on the plan before giving the month back. On it: taken. Not on it: given back. Stripe cannot say: kept as taken, and the parent is told plainly and can write to us.
- **"Send the invoice" and "Update the plan" always reach Stripe as new requests when the plan really changed.** Their keys carry a billing version that moves on with every school added or taken off, every size or suspension, and every piece of news from Stripe, so A, then B, then A again, or cancelling and invoicing again the same day, all work; a second tap still makes one plan. The same for a school paying by invoice.
- **No school with two plans.** Asking for a plan by invoice closes any card checkout the school's admin left open. If a card plan is still paid while the school is already paid for (by its own plan or its district), it is cancelled at once and refunded in full, the owner is told, and that refund is not mistaken for the school's real plan being refunded.
- **A school paying for itself and through its district pays once.** When a district that has paid covers a school with a plan of its own, that plan is set to stop at the end of the time already paid for, and the school's admins get one email saying so. The school page says this before joining a district.
- **Numbers that could give a family away are hidden.** Anywhere RankUp shows a group's numbers (a school's card and league, its houses, its district's picture and its pilot report), it now needs at least 5 students from at least 3 families; chore totals, averages, the busiest week and the kinds of chore need at least 3 of them to have done a chore. A school's average is no longer shown below that, and the leftover rule that stops subtraction applies to families and chores too. The privacy policy says so.
- **Cover before payment is 30 days, once.** A district, or a school paying by invoice, is covered for at most 30 days before its first invoice is paid, once ever: cancelling and invoicing again does not start another 30 days. After that, cover starts when an invoice is paid.
- **Two gifts each keep their own plan.** Standard and Elite Pass gifts give 12 months of Elite Pass first, then 12 of Standard, rather than Elite Pass for both years.
- **A waiting gift starts when the paid plan really ends.** A gift redeemed while a cancelled plan runs to its end now starts the day that plan ends early (a refund, a cancel at once), with all its months.
- **Plan switching only where RankUp opens it.** The Elite and yearly confirm pages use a portal configuration of their own (`STRIPE_PORTAL_PLAN_CHANGE_CONFIG`); the general portal should not allow switching, so the half-price coupon can never land on a yearly charge. Steps in docs/PAYMENTS.md, "The customer portal's two configurations".
- **Nothing to buy on a child's phone.** The front door's gift and "For schools" links are hidden on a phone set up (or being set up) as a child's, and on a child's phone that was unlinked; they still show before anyone chooses who they are.
- **A refunded gift**: unchanged, the family keeps its year.
- **Before deploying:** make the plan-change portal configuration and set `STRIPE_PORTAL_PLAN_CHANGE_CONFIG`; turn "Customers can switch plans" off in the default portal configuration. docs/PAYMENTS.md.
- SQL: schema.sql (`families.gift_then_tier`, `gift_then_until`, `effective_tier`), billing.sql (`redeem_gift_code`, `billing_status`, `start_waiting_gift` from `apply_subscription_change`) and schools.sql (the rule `school_group_shown`, `school_chores_shown`, `school_min_families`, `school_min_active`, `school_month_ok`, applied in the school card, league, rivalries, settlement, month email, district picture, houses and report; `school_month_scores.shown`; `school_points_between` now gives each student's family; cover before payment on `schools` and `districts`; `billing_version` and its trigger; the tables `school_checkout_sessions` and `school_duplicate_plans`, row level security on and no policy; `record_school_checkout`, `open_school_checkouts`, `forget_school_checkout`, `mark_duplicate_plan`, `duplicate_plan`, `duplicate_plan_payment`, `schools_paying_twice`, `mark_district_takeover`; `record_school_payment` and `record_district_payment` take the subscription). Every new function is revoked from `public, anon, authenticated`. Run every file again on the live database, in the documented order; no new file. Tests: `supabase/test/59-review-fixes.sql` extended; 18, 23, 31, 32, 55, 56 and 58 updated; `tests/api.mjs`, `tests/keepplan.mjs`, `tests/trials.mjs`, `tests/gifts.mjs` and `tests/emails.mjs` extended.

## 0.19.1 — 2026-11-17

Fixes from a review of gifts, districts, pausing and pilots before launch.

- **Pausing around a renewal no longer gives a month away.** A renewal that falls inside a pause has its invoice voided by Stripe. "Start my plan again now" used to take the pause off and nothing more, so the month that invoice was for was free: pausing the day before each renewal and resuming the day after was a plan never paid for. Now, when a renewal fell inside the pause, resuming gives back exactly the days that were paid for before the pause and not used (nothing is charged for those), and then a new month starts and is charged; with none left, the new month starts that day and is charged that day. With no renewal inside the pause, nothing changes: billing carries on from the next renewal date. The plan screen says so under the button, and says when the next payment is afterwards. `plan_pauses.paid_until` keeps the renewal date the pause started with; `plan_pause_credit` (server only) reads it for `/api/keep-plan`.
- **No half-price year.** "Switch to yearly" during the half-price month bills the year at once, and that month's coupon takes half off the next invoice, whatever it is. The yearly switch is now refused for the same 31 days a pause waits (`half_price_yearly`), with a plain message.
- **A district pays for the schools it pays for.** A suspended school is left off a district's bill, but it still took one of the places the plan pays for, so the last school of its size added sat out the league while the district paid for it. A suspended school now takes no place and is never shown as covered.
- SQL: billing.sql (`plan_pauses.paid_until`, set by `start_plan_pause` and `sync_plan_pause`; `plan_pause_credit`, revoked from `public, anon, authenticated`) and schools.sql (`district_covers`). Run every file again on the live database, in the documented order; no new file. New SQL test: `supabase/test/59-review-fixes.sql`; 32 updated. `tests/keepplan.mjs` covers both resumes and the yearly switch.

## 0.19.0 — 2026-11-16

School pilots, a report for the school office, houses, and a "For schools" page.

- **"For schools"**: the School League's front page (`#/school`, now linked from the front door) says in plain words what RankUp does (chores at home as a game, a friendly league between classes or houses), what a school sees (totals only, nothing for fewer than 5 students), what children never do (no typing to strangers, no photos, nothing without a parent), the prices, and how a pilot works.
- **Request a pilot**: a short form on that page (school, name, role, work email, town, about how many students, a note), emailed to `SALES_EMAIL` (or `SUPPORT_EMAIL`) with the existing sender and the person as reply-to, the same way as a district's "Get a quote". Nothing typed is stored: only a keyed hash of where a request came from, for the limit of 3 an hour from one place and 30 in all, counted apart from quotes. New server function `/api/pilot-request`.
- **Pilot codes**: on the operator page, a new **Pilots** tab makes a code for a school: who it is for, the pilot's length (90 days unless `PILOT_DAYS` says otherwise; 14 to 365) and the date it must be used by (60 days by default). The code (`XXXXX-XXXXX`) is shown once; only its hash is kept. The school's admin types it when signing up, or under Plan on the school's page, and the trial becomes a pilot of that length from that day. Single use, one pilot per school, 5 wrong codes an hour. It never adds to a paid plan: a school paying by card or invoice, or whose district pays, is told so and the code stays unused. The operator page lists every code and each pilot's end date, and can take back a code nobody used.
- **The reminder**: 14 days before a pilot ends, each of the school's admins gets one email (the hourly `/api/send-trial-emails` job): the day it ends, the price for the school's size, card or invoice, and a link to the report. Not if the school has chosen a plan.
- **The pilot report** (`#/school/report`, the school's admin only, during or after a pilot or trial): one printable page with, for the whole school and for each house or class, students taking part, the share who did at least one chore, chores done and the average per student; for the school, the busiest week and the three most popular kinds of chore (the app's own categories). The district picture's privacy rules exactly: never a child's name, nickname or anything typed, and no numbers for a group of fewer than 5 students. It ends with the school's price from the School League list and how to buy. There is no "what families said": RankUp asks families for no rating, and a child's own words are never shown.
- **Houses (or classes)**: a school's admin names up to 12 (a short name children can read, the rude-word list) and chooses "Houses" or "Classes"; a parent chooses which one each child is in, on the parent's School League page. The school's board shows each house's average, students, share and chores this month, for staff, families and students. A house shows no numbers under 5 students taking part, and while the students left over (in no house, or in a house too small) would be 1 to 4, the smallest house shown is hidden too, so no group's numbers can be worked out from the school's total by subtraction.
- **A school paying by invoice**: "a year, by invoice" under Plan makes a yearly Stripe Invoicing subscription at the school's yearly price (`/api/school-checkout`, `method: 'invoice'`), due in `DISTRICT_INVOICE_DAYS`; what is left of the trial or pilot is kept, so nothing is due before it ends.
- Help for schools, the privacy policy (houses, a pilot request not kept) and the terms (pilots, paying by invoice) say the same. The consent notice is unchanged. `SectionTitle`'s tick is a class now rather than an inline style.
- **Before deploying:** nothing new in Stripe beyond turning on emailing finalized invoices (already needed for districts). Optionally set `PILOT_DAYS`. docs/PAYMENTS.md, "School pilots".
- SQL: schools.sql (the tables `school_groups`, `school_pilots` and `school_pilot_attempts`, all with row level security on and no policy; `schools.group_kind`, `school_members.group_id`, `district_quote_attempts.kind`; the house functions, `redeem_school_pilot` and `school_pilot_report` for signed-in users; `create_school_pilot`, `withdraw_school_pilot`, `operator_school_pilots`, `due_pilot_reminders`, `claim_pilot_reminder`, `finish_pilot_reminder`, `record_pilot_request`, `school_points_between`, `school_group_totals`, `school_house_board`, `school_max_groups`, `school_group_name` and `school_report_categories`, all revoked from `public, anon, authenticated`; the houses and the pilot in `school_card`, `my_schools`, `operator_schools` and the family's data export) and retention.sql (pilot codes and tries). Run every file again on the live database, in the documented order; no new file. New SQL test: `supabase/test/58-pilots-and-houses.sql`; 18, 31, 32 and 34 updated. New browser test `tests/schoolpilot.mjs`.

## 0.18.0 — 2026-11-15

Pause instead of cancel, and an Elite offer for parents at the right moment.

- **Pause instead of cancel.** On the plan screen, "Cancel my plan" (always there, in plain words) and "Manage billing or update card" open "Before you cancel" first: pause for 1, 2 or 3 months, and on a monthly plan one month at half price; "Cancel my plan" is in the same sheet and opens Stripe's own cancel page in one tap. Only an active monthly plan that is not already ending can pause (a month of pause on a yearly plan stops no payment).
- **While paused**: Stripe takes no money (the subscription's `pause_collection`, behavior "void", so the invoices that fall inside are voided and a monthly plan paused for N months misses exactly N charges), the family has Starter's features, and nothing is deleted: every child, their XP, coins and items stay. A free trial or a gift still counts in full: only the paid plan is paused (`effective_tier`, and the app's `effectiveTier`). Children see "Paused — your progress is safe" on their home screen, with no price or plan name. The plan screen and the dashboard say until when; "Start my plan again now" resumes early.
- **Billing starts again by itself** on the date, and the plan counts again at that moment whether or not Stripe's news has arrived. Three days before, each parent gets one email saying when, what will be charged (the plan list's price) and that cancelling is a tap away, from the existing hourly email job (`/api/send-trial-emails`), once per pause.
- **The half-price month**: a Stripe coupon (`STRIPE_SAVE_COUPON`, 50% off, once), added beside any discount the plan already has, at most once per family, ever; marked taken before Stripe is asked, so two taps cannot both have it, and given back only if Stripe did not apply it. Not on a yearly plan, not while paused, not for a plan already ending. Unset, the offer is not made.
- **Stripe's own news**: a pause made or changed in Stripe's dashboard, Stripe resuming it, and the plan ending while paused all come through the webhook (`customer.subscription.updated` / `deleted`, no new event), out of order and replayed safely.
- **The owner's console**: three new daily counts, plans paused, half-price months taken and plans cancelled, in `/api/stats` (`daily`) and on the operator page. Totals only.
- **The Elite nudge**, on the parent's dashboard in Parent Mode only, for a family on Standard: after a great week (10 or more chores accepted in seven days, "Elite Pass gives 1.5× XP on every chore"), or when the family hit a Standard limit (an Elite tool opened, a guild full at 5). At most once every 14 days on that phone, with "Not now". It upgrades through the existing prices: a paying family on Stripe's confirm page (the billing portal), any other through checkout. Never on a child's phone or in a child's turn on a shared phone.
- **"Switch to yearly — save about 30%"** in Settings for a parent paying monthly, with the real saving from the plan list's two prices, on Stripe's confirm page.
- **The billing portal** (`/api/billing-portal`) can open on one page: `flow: 'cancel'`, `'upgrade'` or `'yearly'`. New server function `/api/keep-plan` (pause, resume, the half-price month). Help, the privacy policy and the terms say how pausing works and what is kept.
- **Stripe, before deploying:** make a coupon, 50% off, duration "once", and set `STRIPE_SAVE_COUPON` to its id. In the customer portal's settings, keep cancelling on, and turn on "Customers can switch plans" with the four Standard and Elite Pass prices (the Elite and yearly confirm pages need it). No new webhook event. docs/PAYMENTS.md, "Pause instead of cancel".
- SQL: schema.sql (`families.paused_until`, `effective_tier`), billing.sql (`families.billing_cycle` and `save_offer_used_at`; the table `plan_pauses`, row level security on and no policy; `start_plan_pause`, `finish_plan_pause`, `end_plan_pause`, `sync_plan_pause`, `claim_save_offer`, `finish_save_offer`, `due_pause_reminders`, `claim_pause_reminder`, `finish_pause_reminder`, `stripe_subscription_for_family` and `count_plan_change`, all revoked from `public, anon, authenticated`; `apply_subscription_change` and `billing_status`), health.sql (the three counts) and retention.sql (a pause 90 days after it is over). Run every file again on the live database, in the documented order; no new file. New SQL test: `supabase/test/57-pauses.sql`.

## 0.17.0 — 2026-11-14

School districts: one plan for many schools.

- **A district account** (`#/district`, linked from the foot of the School League's front page). Someone at a district office signs the district up in one form (their account, their name, the district's name) and becomes its admin. They add schools by name, town and size; each new school starts like any other (a 30-day trial, checked by us before it joins a league) in the district's own league, and comes with a one-time, 10-letter invite for its principal, good for 30 days. The principal opens the School League page, chooses "I have a code" and becomes the school's admin. A school already on RankUp joins with the district's own code, typed by its admin under the new "District" card on the school's page, and can leave the same way. The district can make a new code or a new invite, and take a school out (it carries on by itself; one it added whose principal never signed up is removed with it).
- **The district picture**: for each school and for the district, this month and last, the students taking part, the share who did a chore, chores done and the average per student, and whether each school is paid for and its principal has signed up. Totals only: never a child's name, nickname, numbers or anything typed, and no numbers at all for a school with fewer than 5 students taking part. The district totals add up only the schools shown, so a small school's number cannot be worked out by subtraction. The school-level privacy rules are unchanged: a district is not staff of its schools and sees none of their codes or Stars.
- **Price**: each school at its size's yearly School League price, less a discount by its place in the plan, biggest school first: 1st to 9th 10% off, 10th to 24th 20% off, 25th onwards 30% off. By place (like tax brackets) rather than one discount for the whole plan, because a flat 20% at ten schools made ten cheaper than nine (and 25 cheaper than 24); now each school added always adds to the total, and a district always pays less than its schools would alone. 2 to 100 schools; above that, a quote. The front page has a calculator. The SQL (`district_price_quote`) and the app (`districtPrice`) are checked against each other, and against 2,000 random plans for "more schools never costs less".
- **Paying by invoice**: Stripe Invoicing, a yearly subscription with `collection_method: send_invoice`, one Stripe price per size and discount with the number of schools as its quantity (12 new price ids; the code names ids, never amounts). Stripe emails the invoice; the district pays by card or bank transfer within `DISTRICT_INVOICE_DAYS` (30 by default), and it renews with a new invoice each year. "Update the plan" adds schools added since (invoiced for the rest of the year) and "Invoices and cancelling" opens Stripe's portal. The webhook reads what the plan's prices pay for; a plan set up by hand in Stripe (a quoted deal) covers every school. A school its district pays for cannot start a plan of its own, and its District Champion month goes as credit on the district's account.
- **When a district stops paying**: a late invoice keeps the schools covered while Stripe chases it; a plan that ends (unpaid, cancelled or refunded in full) takes the cover away, and each school falls back to its own plan, its trial or the free level. Nothing is deleted then; the retention job removes the district a year after its plan ended, and never a school.
- **Get a quote**, for big districts or another way to pay: district, name, role, work email, number of schools, about how many students and a short note. Sent by email to `SALES_EMAIL` (or `SUPPORT_EMAIL`) with the existing email sender, the person as reply-to, and not stored: the database keeps only a keyed hash of where a request came from, for the limit of 3 an hour from one place and 30 an hour in all.
- **Feature switches**: the same as the School League's. Signing up needs the sync service; the invoice buttons need `VITE_STRIPE_ENABLED` and the server's Stripe settings, so nothing can be invoiced until payments are set.
- **Privacy policy and terms**: what a district sees, how long a district's account is kept, that a quote request is not stored, and the district price and what happens when it ends. The consent notice is unchanged: a district sees less than a school, and only totals.
- **Stripe, before deploying:** a product such as "RankUp School League for districts" with 12 yearly recurring prices (small $261 / $232 / $203, medium $531 / $472 / $413, large $891 / $792 / $693, xl $1,341 / $1,192 / $1,043); set `STRIPE_PRICE_DISTRICT_SMALL_10` to `STRIPE_PRICE_DISTRICT_XL_30`, and optionally `DISTRICT_INVOICE_DAYS` and `SALES_EMAIL`. Turn on emailing finalized invoices in Stripe's settings. No new webhook event. docs/PAYMENTS.md, "School districts".
- SQL: schools.sql (the tables `districts`, `district_staff`, `district_schools`, `district_quote_attempts`, all with row level security on and no policy; `district_covers` and the district in `school_is_live`, `school_card`, `school_checkout_info`, `unapplied_school_awards`, `school_month_summary` and `operator_schools`; the district functions, the server-only ones revoked from `public, anon, authenticated`; `billing_events.district_id`), retention.sql (the district rules) and consent.sql (a district admin's sign-in is kept like a school's). Run every file again on the live database, in the documented order; no new file. New SQL test: `supabase/test/56-districts.sql`.

## 0.16.0 — 2026-11-14

Gift subscriptions: "a year of RankUp", for grandparents, aunts and uncles.

- **Give RankUp** (`#/gift`), linked from the front door, the plan screen and Settings. The buyer needs no account: they choose Standard or Elite Pass for 1 year, give their email for the receipt, optionally the name and email of the person it is for, their own name and a short message (200 characters, plain text, the rude-word list, no links), and "Email it to them now" or "I'll give it myself". One payment through Stripe Checkout at the yearly price ($49.99 or $79.99, from the plan list). Nothing renews.
- **The code is made only after Stripe confirms the payment**, by the webhook: 12 characters (`XXXX-XXXX-XXXX`, no 0/O/1/I/L), worked out from the paid checkout with a server secret, so the same payment always gives the same code and a replay or retry never makes a second. Only its hash is stored. Single use, for 2 years from purchase. An unpaid checkout never has a code.
- **Delivery**: the buyer gets a receipt with the code and a printable gift card (`#/gift/card`, everything on it kept after the `#`); if they chose it, the recipient gets "<name> gave your family a year of RankUp" with the message and how to redeem. Both through the existing email sender, with a plain-text part and the MTRX Horizyn footer. The recipient's email never contains the buyer's email address.
- **Redeeming**, in Parent Mode: Settings or the plan screen, "Redeem a gift". The family gets that plan free for 12 months from that day, as a gift beside its paid plan (`families.gift_tier`, `gift_starts_at`, `gift_until`), which the one plan check (`effective_tier`, and the app's `effectiveTier`) honours with the paid plan and the trial. One gift at a time; another adds 12 months to the end, at the better plan. Settings says "Gift plan: Elite Pass until <date>"; the parent's dashboard reminds them 30 days before it ends, in the app only.
- **A family that already pays is never charged twice**: a plan that renews must have renewal turned off first (the code is not spent until then), and the gift starts the day the paid plan ends. A plan chosen during a gift is first charged the day the gift ends.
- **Limits**: 5 codes that did not work an hour per family and 20 per address (stored as a keyed hash), then wait an hour; 10 gifts started an hour per address on the Give page. Children never see buying, redeeming or the gift; the gift pages open only in Parent Mode on a phone that is set up. A refund in full voids an unused code; a used code stays used and the decision is recorded.
- **Privacy**: the policy says in one sentence that the buyer's email is kept for the receipt and support until the code runs out (2 years), and the recipient's name and email and the message are used only to send the gift and deleted 30 days after purchase. The daily retention job deletes them, and an unpaid checkout after 14 days. The consent notice is unchanged.
- **Stripe, before deploying:** make a product such as "RankUp gift" with two one-time prices, $49.99 and $79.99; set `STRIPE_PRICE_GIFT_STANDARD_YEAR`, `STRIPE_PRICE_GIFT_ELITE_YEAR` and a new secret `GIFT_CODE_SECRET`, with email set up. No new webhook event: `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded` carry gifts. docs/PAYMENTS.md, "Gift subscriptions".
- SQL: schema.sql (the three gift columns, `effective_tier`), billing.sql (the gift tables and functions, `billing_status`) and retention.sql. Run every file again on the live database, in the documented order; no new file.

## 0.15.1 — 2026-11-14

The real address: https://rankup.mtrxhorizyn.com.

- LAUNCH.md, DEPLOY.md, STAGING.md, the email, payment, notification and if-something-breaks guides, the README and `.env.example` name `rankup.mtrxhorizyn.com` (and `mtrxhorizyn.com` for the company's DNS records) instead of a placeholder. `PUBLIC_SITE_URL=https://rankup.mtrxhorizyn.com` is the value to set on Cloudflare Pages; `help@rankup.mtrxhorizyn.com` is the suggested `SUPPORT_EMAIL` and `EMAIL_REPLY_TO`, and `RankUp <no-reply@rankup.mtrxhorizyn.com>` the suggested `EMAIL_FROM`.
- Code comments and the `_headers` comment say the same. Nothing in the app changed: every address still comes from its setting, and the privacy policy and terms are as they were.
- No SQL changes.

## 0.15.0 — 2026-11-14

New plan prices.

- Standard is now $5.99 a month or $49.99 a year (was $9.99 / $99.90). Elite Pass is now $9.99 a month or $79.99 a year (was $15.99 / $159.90). Starter stays free, the 14-day trial, the Flash Ticket packs and the School League prices are unchanged.
- A year now saves $21.89 on Standard (30%) and $39.89 on Elite Pass (33%). The new yearly prices are not a whole number of months, so the Monthly / Yearly switch no longer says "2 months free": it says "Save 30% or more", the smaller of the two, and each plan's card says what it saves in dollars and as a percentage. All worked out from the plan list, as before.
- The plan screen, the banners, the front door, the help page and the terms show the new prices, read from the one plan list. The Alliance prize line now reads $7.99 instead of $9.99; a yearly Elite family's referral free month is $6.67.
- **Stripe, before deploying:** make four new recurring prices ($5.99 and $49.99 on Standard, $9.99 and $79.99 on Elite Pass), put their ids in `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_STANDARD_YEAR`, `STRIPE_PRICE_ELITE` and `STRIPE_PRICE_ELITE_YEAR`, and deploy this version at the same time. The app shows what Stripe charges a new family only while those ids match the plan list. Families already subscribed stay on their old price and their plan until moved: keep them as they are, or move them in the Stripe dashboard. docs/PAYMENTS.md, "Changing a price", has the steps.
- No SQL changes.

## 0.14.0 — 2026-11-13

Invite a family, get a free month.

- When a family invites a friend's family and that family starts paying, the inviting family gets one free month of its plan. It is earned on the invited family's first paid invoice, monthly or yearly; a trial's $0 invoice, a failed payment and a payment refunded or disputed before its invoice is counted earn nothing. The family who joins still gets 30 days of Standard when its first chore is accepted; the inviting family no longer gets 30 days for that chore, since the free month replaces it.
- The month is a credit on the inviting family's Stripe account worth one month of the plan it pays for (a yearly plan: a twelfth of the yearly price), taken off its next bill by Stripe. Given once, however often Stripe sends or retries the invoice, with an idempotency key; nothing about the other family is sent to Stripe.
- A family on Starter (or still on its free trial) has its month banked. The card says so, and the month is credited the moment the family subscribes, at the price of the plan it picks.
- Limits, held by the database: never for the same family, the same parent email (a "+tag" is the same email) or the same Stripe customer; one reward per invited family; at most 12 a year. If the invited family's first payment is refunded in full or disputed within 14 days, an unused free month is taken back (a credited one only if the account still holds it); otherwise it stays and what happened is recorded.
- Settings has an "Invite a family, get a free month" card, and the plan screen a shorter copy: the code, how many families joined and how many pay, and the free months earned, on the way, banked or taken back. Counts only, never another family's name or email. "You earned a free month" shows once on the parent's dashboard (seen on one phone is seen for the family). No email, and children never see any of it.
- The privacy policy says in one sentence that a referral records which family invited which, for the reward only. "Download my data" includes the family's referrals and free months, never which families they were. The consent notice is unchanged.
- The webhook also takes `charge.dispute.created`; add it to the webhook's events in Stripe.
- SQL: referrals.sql (new columns on `referrals`, and the functions that decide, bank, credit and withdraw the month) and consent.sql (the download). Run every file again on the live database, in the documented order.

## 0.13.0 — 2026-11-13

Leaderboards, in Adventure and Arena, and guild chat that is tap-to-send only.

- Leaderboards, from a new card on the child's Home and from their Profile: chores done, XP earned, highest level, longest streak, current streak, badges, arcade high scores for every game, Season themes picked, top guilds, and rising stars (the biggest jump this week against last). Each by worldwide, my country, my guild and my family, and by this week, this month and all time where those make sense. A podium for the top three with medals, arrows for places gained or lost since the start of the day, the child's own row highlighted, and their own place shown even far below the top 50 ("#734 of 2,000"). Weeks reset on Monday and months on the 1st, at midnight UTC, and each board says so ("Resets Monday").
- Two modes per child, Adventure and Arena. Every child, new and existing, starts in Adventure: they play at their own pace, are on no worldwide or country board and are shown none; their family's board, and their guild's, are among people the family already approved. Arena puts a child on the worldwide and country boards. Only a parent switches it on, in Parent Mode → Settings → Leaderboards, after reading what it shows; a parent or the child can go back to Adventure at any time, which takes them off every public board in the same moment. Each mode has its own badge and colour on Home and Profile, and the child sees "Enter the Arena" once when a parent switches it on.
- What strangers see of an Arena child: a nickname and numbers, nothing else. The nickname is built from two lists of 80 words and a number from 00 to 99 ("Swift" + "Comet" + 42 → "SwiftComet42"): pick each piece or shuffle, no typing, once a week. All 640,000 nicknames pass the rude-word filter, and the server accepts only names made from the lists. The country is a parent's pick from a list (no location is ever asked for) and shows as a flag. Never a child's name, photo, family, school, town or anything typed. A guild on the public guild board is shown by a team name made from the same words, and only when every child in it is in Arena.
- Fair: chores count at most 8 a day, the School League's own cap, so a parent tapping Accept 200 times tops nothing. XP counts what a chore was worth before the Elite boost (now stored with every accepted chore), at most 200 a chore, so no plan buys a place; the highest-level board uses the same XP and says why a child's board level can be a little lower than on their Home. Guilds rank on their members' average, so a ten-seat guild cannot win on size alone. The guild roster's weekly XP no longer counts the Elite boost either.
- Fast: a new scheduled job, `/api/refresh-leaderboards`, every ten minutes, ranks everybody once and stores the result; opening a board reads one stored page. 4,000 children and 120,000 chores rank in about a second; opening a board of 2,000 takes a couple of milliseconds. It is in `/api/health`, `vercel.json` and docs/LAUNCH.md like the other jobs.
- Guild chat is quick chat only. A child taps one of 101 ready-made messages in seven tabs (Cheers, Teamwork, Chore talk, Reactions, Thanks & sorry, Hello & bye, Goal moments), a row of big emoji, or their own row of recent and starred ones. What is sent and stored is the message's id, never words; the server accepts only ids on the list, at most one every three seconds and eight a minute. There is no text box in a child's guild any more, so no child types to a child in another family. Report and parents' view of reports stay; a child can also mute a guild-mate on their own phone. Messages typed before this version are no longer shown to children; a parent still sees any that were reported. Guilds stay off unless `VITE_GUILDS_ENABLED=true`.
- The privacy policy and terms describe Arena and quick chat; "Download my data" includes each child's mode, nickname and the country. The consent notice is unchanged (Arena is a separate, explicit choice a parent makes for each child, as the School League is); see docs/LEGAL.md.
- SQL: schema.sql, guilds.sql, consent.sql, schools.sql, health.sql, and the new leaderboards.sql after schools.sql. Run them again on the live database, in the documented order, and schedule `/api/refresh-leaderboards`.

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
