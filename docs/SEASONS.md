# Seasons

## How this file is read

A monthly scheduled task reads this file to build the content for the next
Seasons. Keep it in exactly this shape:

1. The line that starts `Launch date:`. Until launch day it says
   `Launch date: not yet`. On launch day the owner changes it to the day, in
   the form `Launch date: YYYY-MM-DD` (for example `Launch date: 2027-03-01`),
   and sets the same day in the operator console (#/operator, Theme
   submissions, "Launch day").
2. The line that starts `Rule:`. Do not change it.
3. The table under "Seasons built", one row per Season, oldest first, with
   exactly these four columns: Season (its number), Name, Starts (YYYY-MM-DD)
   and Built in version (the RankUp version whose CHANGELOG entry added that
   Season's content, such as 0.23.0). Starts is `launch date` for Season 1
   until the launch date is filled in. A row is added when a Season's
   content is built, never removed.

To work out when Season n starts: launch date + 4 x (n - 1) months, on the
same day of the month. The database does the same sum (season_start_for in
supabase/sync.sql) and makes each Season by itself, 30 days ahead; this file
is the plan in words, not the switch.


Launch date: not yet

Rule: Season 1 starts on the launch date. Each Season starts 4 months after the previous one.

## Seasons built

| Season | Name | Starts | Built in version |
|---|---|---|---|
| 1 | Founding Season | launch date | 0.23.0 |

## What a Season is

- **Its start is automatic.** The daily autopilot (`run_season_autopilot`,
  run by pg_cron where it is switched on, and by the daily
  `/api/run-retention` job either way) makes each Season 30 days before it
  starts. A Season is secret until its first day; then every family's app
  shows "New Season!" by itself.
- **New themes are the owner's pick, always.** Themes that children made and
  their parents sent are never published without the owner choosing them:
  in the operator console, "Queue for next Season" (any time) or "Pick" (for
  a Season already made). Queued themes go into the next Season that has not
  started. If nothing is queued, the Season still starts, with its event and
  its deal and no new theme, and the owner gets an email seven days before.
- **The Season's deal** runs for its first 14 days, if the settings
  `STRIPE_SEASON_COUPON` and `SEASON_DEAL_PERCENT` are set (docs/PAYMENTS.md,
  "Deals"). Parents only, never on a child's phone, with its real end date.

## Season 1: the Founding Season

- Starts on the launch date.
- **Founding Season badge**: earned by doing 10 chores during Season 1
  (accepted by a parent). Never bought. Shown on the badge shelf only while
  it can be earned, and kept for good by everyone who earned it.
- **Season 1 banner** on a child's home screen during Season 1: what the
  badge is and how many chores are done, with no countdown.
- **Founding Families** deal for parents (the first families on a yearly
  plan get their first year at a founding price), from the launch date.
- The holiday gift sale is separate and runs by its own dates (settings).
