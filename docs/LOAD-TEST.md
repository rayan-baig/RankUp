# The database under load

What happens when a thousand families' phones sync at once, what broke
first, and what was changed. The tool is `tools/loadtest.mjs`; anyone can run
it again, and should before and after a change to `supabase/*.sql` that
touches a phone's pull, submit, accept or purchase.

## How it was measured

- **The data.** A throwaway local Postgres 16 with every file in
  `supabase/` applied in the order `supabase/test/run.sh` uses, then 1,000
  families: one or two parents each (1,333 in all), two or three children
  each (2,500), every child with their own paired phone, eight open chores a
  child, three months of history (120 accepted or sent-back chores a child:
  300,000 submissions, 285,000 events), six rewards a family, 25,000 past
  purchases, notes. 245 MB on disk. Names are made up.
- **The phones.** Every parent and child has a phone: 3,833. A step of the
  test takes the first N of them (shuffled, so a mix of families and roles)
  and runs each as a loop that does what the app does: a child's phone pulls
  (`family_snapshot` since its cursor), taps "I did it!" (`submit_quest`) and
  buys rewards (`redeem_reward`); a parent's phone pulls, accepts
  (`approve_submission`), adds chores (an insert into `quests`, as the app
  writes one) and marks rewards given (`mark_redemption_given`). Each phone's
  first pull is from zero, as on a phone opening RankUp for the first time,
  and one in fifty after that too.
- **Every request** is a transaction the way Supabase's API runs one: role
  `authenticated`, the caller's id set, the call, commit. Row level security
  and every check inside the functions are in force.
- **No pause between requests.** A virtual phone here asks again as soon as it
  has its answer, about every 40 ms; a real phone asks every 8 seconds at most.
  So one virtual phone is a couple of hundred real ones, and the steps go far
  past anything 1,000 families could send.
- **15 database connections**, which is about what Supabase's pooler gives a
  small project. A request waits for a free one, as it would at the pooler,
  and the wait is in its latency.
- **One machine**: 4 cores, the database and the load generator together.
  Network time between a phone and Supabase (typically 50 to 150 ms) is not
  in these numbers.
- **"Broken"** means: 95% of ordinary pulls take over a second, or more than
  1% of requests fail, or a request cannot get a connection within 5 seconds.
  A refusal the app expects (two parents accepting the same chore, not enough
  coins) is counted as a refusal, not an error.

```bash
supabase/test/up.sh                               # or any Postgres 16; see supabase/test/README.md
node tools/loadtest.mjs --setup                   # build and seed rankup_load (about 30 s)
node tools/loadtest.mjs --steps 25,100,400,1600,3833 --seconds 20 --json /tmp/load.json
node tools/loadtest.mjs --jobs                    # each scheduled job's query, once
```

`--families`, `--pool`, `--db` (never `rankup_test`) and `--top` (the
slowest statements, from `pg_stat_statements` when the server preloads it)
are the other options. PGHOST, PGPORT and PGUSER as for the SQL suite.

## Before

| Phones | Requests/s | Pull since cursor, median / 95% | Pull from zero, median / 95% | Accept, median / 95% | Errors |
|---:|---:|---:|---:|---:|---:|
| 25 | 1,297 | 17 / 30 ms | 52 / 97 ms | — | 0 |
| 100 | 1,506 | 63 / 80 ms | 97 / 501 ms | 69 / 89 ms | 0 |
| 400 | 1,390 | 260 / 299 ms | 316 / 1,965 ms | 263 / 297 ms | 0 |
| 1,600 | 1,134 | 1,007 / 2,882 ms | 2,440 / 5,011 ms | 997 / 1,832 ms | 514 |
| 3,833 | 844 | 4,876 / 5,007 ms | 5,012 / 5,065 ms | 4,892 / 5,008 ms | 6,635 |

Every function, at 100 phones: pulls since the cursor 1,337/s, pulls from
zero 32/s, new chores 64/s, purchases 45/s, "I did it!" 22/s, accepts 4/s,
"Mark given" 2/s, all with medians of 63 to 69 ms (97 ms from zero).

**The first thing that broke: the connection pool, at 1,600 phones.** The
database's processors were full from about 100 phones on, so every request
waited in line for one of the 15 connections; at 1,600 the line was a second
long for an ordinary pull and five seconds for a phone's first pull, which
then gave up (514 failed, every one "could not get a connection"). Nothing
else failed at any step: no deadlock, no lock timeout, no wrong answer.
Accepts, purchases and "I did it!" queued behind the pulls but never broke.

## Why, and what changed

`pg_stat_statements` put the pull, `family_snapshot`, far ahead of everything
else (520 of the 590 seconds spent in the twelve busiest statements), at
about 5 ms each though every query inside it read only a few rows
by its index. The time was in the row level security helpers:

1. **`current_family_id()`, `is_parent()` and `current_kid_id()` were SQL
   functions.** A security definer SQL function is never inlined, and Postgres
   plans its body again at every place a statement calls it; the pull calls it
   in ten places. As PL/pgSQL its plan is kept for the connection. Same
   answers, same checks (`supabase/schema.sql`).
2. **The policies called them on every row.** `is_parent()` was asked 3.7
   million times in one run: once for every chore, submission and note a
   parent's phone looked at. Written `(select is_parent())` in the policy it
   is asked once per query (Supabase gives the same advice for `auth.uid()`).
   Changed in every policy on the nine tables a phone pulls; not on `parents`,
   where it made the table's own policies recurse, and which holds one or two
   rows a family. `supabase/test/45-load.sql` checks every one.

The scheduled jobs, timed once each over the same data (`--jobs`):

| Job | Before | After |
|---|---:|---:|
| `due_digests`, a Sunday evening with every family due | **8,905 ms** | 305 ms |
| `due_reminders` | 2 ms | 2 ms |
| `due_trial_reminders` | 3 ms | 3 ms |
| `settle_alliances` | 2 ms | 2 ms |
| `settle_school_month` | 3 ms | 4 ms |
| `run_retention` | 2 ms | 2 ms |
| `usage_counts` | 49 ms | 38 ms |

3. **The weekly digest read the whole time zone database once per family.**
   `family_week_digest` checked a family's zone by asking
   `pg_timezone_names`, which reads every zone file, about 9 ms a call. At
   1,000 families that was 9 seconds a run, hourly every Sunday evening; at
   10,000, 90 seconds, past what the job's host allows. Now `is_time_zone()`
   (`supabase/schema.sql`) tries the conversion instead, which takes
   microseconds and accepts what the job then does with the zone.
   `due_trial_reminders` and `save_reminder_schedule` asked the same way and
   use it too.

**The index.** Every query a phone sends already uses an index made for it
(`supabase/test/36-hot-queries.sql` checks them), and none of the jobs read a
table end to end except `usage_counts`, the owner's console, which counts 30
days of events by `events_created_at_idx`. One index clearly helped:

4. **`events (kid_id, type, day)`**, replacing `events (kid_id, type)`. A
   guild's roster adds up each member's accepted chores over the last seven
   days, for every member, whenever a child opens it. The old index found all
   of a child's accepted-chore events (about 115 in the 90 days retention
   keeps) to use 8: 0.79 ms a member. With the day in it, it reads the 8:
   0.20 ms. It serves everything the old one did. `supabase/schema.sql`,
   `create index if not exists`, and the old one dropped `if exists`, so the
   file is still safe to run again.

## After

| Phones | Requests/s | Pull since cursor, median / 95% | Pull from zero, median / 95% | Accept, median / 95% | Errors |
|---:|---:|---:|---:|---:|---:|
| 25 | 2,217 | 10 / 18 ms | 26 / 60 ms | — | 0 |
| 100 | 2,287 | 41 / 57 ms | 59 / 301 ms | 49 / 70 ms | 0 |
| 400 | 2,042 | 174 / 232 ms | 208 / 1,353 ms | 178 / 223 ms | 0 |
| 1,600 | 1,880 | 675 / 844 ms | 1,658 / 4,481 ms | 682 / 842 ms | 0 |
| 3,833 | 1,335 | 1,799 / 4,915 ms | 4,142 / 5,048 ms | 1,785 / 4,857 ms | 2,845 |

At 100 phones: pulls since the cursor 2,035/s, from zero 48/s, new chores
98/s, purchases 74/s, "I did it!" 23/s, accepts 5/s, "Mark given" 3/s; medians
41 to 49 ms. The pull went from 4.9 ms of database time to 2.0 ms.

**About half as much again gets through (1,506 to 2,287 requests a second),
the pull is a third faster, and the pool now holds at 1,600 phones** with no
errors. It breaks at 3,833, every phone of all 1,000 families with no pause
at all, in the same way as before: waiting for a connection, the phones' first
pulls first.

What that means for 1,000 real families: their 3,833 phones, every one open
and syncing at its fastest (every 8 seconds), would send about 480 requests a
second. That is a fifth of what this machine served. The app slows to every
20 seconds when nothing is happening and once a minute in the background.

## Supabase is not this machine

These numbers are this machine's, and the shape is what carries over, not the
figures. On a real project:

- **Connections are the first limit, as here.** The pooler (Supavisor) gives
  a project a pool of database connections, sized by its compute (around 15
  to 20 on the smallest; each size up gives more), and caps how many clients
  may wait for one (around 200 on the smallest). Past the pool, requests
  queue, which is the slope in the tables above; past the client cap, they are
  refused. Watch **Database → Connections** and the pooler's "client
  connections" in the dashboard, and move up a compute size before the queue
  is routine rather than after.
- **The CPU is smaller.** The smallest computes share two cores; this test
  had four to itself. Expect the requests a second to be a fraction of these,
  and watch **CPU** in the dashboard's database report: it was the thing that
  filled first here, and a full CPU is what makes the queue.
- **Time limits.** Supabase stops a statement from a signed-in phone after 8
  seconds (`authenticated`'s `statement_timeout`), and from the anon key after
  3. Nothing a phone sends came near that here, but a pull from zero for a
  very large family is the one to watch.
- **Database size.** The free plan holds 500 MB; these 1,000 families with
  three months of history took 245 MB. Submissions are kept for good (they
  are the history), and events for 90 days. Watch **Database → Disk size**,
  and plan the paid plan's disk at roughly 1 MB a family a year.
- **The slow-query list.** Supabase has `pg_stat_statements` on: **Database
  → Query performance** shows the same list `--top` prints here. The pull
  (`family_snapshot`) should stay at the top by calls and near 2 ms each; if
  something else climbs past it, that is the next thing to look at.
- **The network.** Every number here is the database's alone. A phone adds
  its own round trip to Supabase, and the API in front of the database adds a
  little; neither changes what breaks first.

Re-run it before a launch that could bring many families at once (a school
signing up its parents, a press mention) with `--families` set to the number
expected, and on a Supabase branch database if one is available, with
`--pool` set to the project's pool size.
