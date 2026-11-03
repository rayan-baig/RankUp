# Testing the backend for real

The database rules are the part of RankUp that cannot be checked by reading the
code. A policy that looks right and silently allows a kid to edit their own XP
would be invisible until someone exploited it. So the schema is applied to a
real Postgres and the rules are exercised as an actual non-superuser.

## What is checked

`01-security.sql` — a kid cannot raise their own XP, mint currency, change what
a quest is worth, or approve their own submission; one family cannot see or
touch another's rows; only a parent in the right family can approve, and the
same submission cannot pay out twice.

`02-pairing.sql` — the four rules that make a six-digit code safe: expiry, the
five-attempt limit, one-time use, and a live code not being reusable. Also that
the pairing table cannot be listed from a browser.

`03-sync.sql` — "what changed since I last looked?" returns exactly that, stays
inside the caller's family, and reports deletions rather than letting a removed
quest linger on the other device forever.

`04-accounts.sql` — a new account can create its family, and only its own.

The files from `31-` on are generated from the database rather than written
out table by table, so a table or function added later is covered the day
it exists:

`31-every-table.sql` — for every table, one family's parent, child, a
signed-in stranger and the anon key cannot read, insert, update or delete any
other family's rows, nor attach a row of their own to another family's child.

`32-definer-functions.sql` — every security definer function a browser may
call that takes an id asks who is calling, and none lets one family change or
see another's rows, tried three ways each; the server's own functions are not
callable from a browser.

`33-inputs.sql` — every browser-callable function and every directly written
column, given 100,000-character text and the largest and smallest numbers:
nothing over-long or extreme is stored, no call writes rows without limit,
and none keeps the database busy.

`34-scheduled-jobs.sql` — retention deletes exactly what docs/LAUNCH.md lists
and not one other row; reminders across both clock changes; the weekly
digest in each family's own Sunday evening, once; dead push subscriptions
deleted; the family's hourly push cap.

`35-leagues-and-guilds.sql` — Alliance and District Champion ties and
reruns, what a school can see, and guild consent, report, remove and block.

`36-hot-queries.sql` — the sync pull and the per-family and per-child
queries, EXPLAINed on a generated large family, use their indexes.

`37-games.sql` — the moment a child chose their theme (where the dragon fight
starts) is stamped by the database alone and sent to every phone.

`38-refusals.sql` — every refusal no other file reached: a child who is not
there, an account in no family, a name left blank, a guild or an alliance with
no seat left, a family with six adults, a school with three rivals already.

`41-billing-walk.sql` — a family's plan and a school's, one Stripe event at a
time: a period refunded in full stays refunded when Stripe goes on saying
"active" for it (cancelling in the portal does), a plan cancelled in the
portal keeps the date it stops, an ended plan ended when Stripe ended it, and a
school is protected from late news and refunds as a family is.
`tests/billingwalk.mjs` walks the same through the real webhook.

`42-reward-limits.sql` — a reward's weekly limit per child: redeem_reward
counts the child's own redemptions of it over the last seven days, so a
purchase queued offline cannot go over it; a retried purchase is not counted
twice; only a parent sets it, from 1 to 50.

`43-history-and-money.sql` — the one thing a parent may change about a past
chore is a note on it, and that moves nothing else; who sent a chore back is
recorded; the pocket money record holds each child's own latest lines however
busy a brother's ledger, with totals that add up to the pot.

`44-coparent-walk.sql` — a co-parent from invitation to removal: invite,
accept, the same code again (by somebody else, and by them), what a parent and
a supporter can do, removal cutting them off at once and taking their unused
invitations with them, being invited back, and an invitation past its seven
days.

`48-error-report.sql` — a server function's error is stored with emails,
tokens, ids and quoted values taken out, 60 an hour from one function at
most; the error report never carries a child's or an adult's name, an email,
a family id or a token, even when the message had them; each error at most
once an hour, at most 20 reports a day; a report not sent, or claimed by a
run that died, gives its errors back; only the scheduled job can call it.

`49-usage-counts.sql` — the six daily usage totals each go up by one for the
thing they count, through the app's own functions, and for nothing else; a
count holds a day, a name and a number, nothing that could point at a
family; the last 30 days come back whole, to the server only; anybody can
count a help page view and do nothing else; kept 400 days.

`refusals.mjs` (`npm run test:refusals`) — reads every
`jsonb_build_object('ok', false, 'reason', ...)` out of the SQL files, applies
them to a scratch database with each one marked so it raises a notice naming
the function and the reason (the answer itself unchanged), runs the whole
suite, and fails for any refusal that never came out. A new refusal needs a
test the day it is written.

`upgrade-snapshot.sql` — run by `run.sh` after each of its two applications
of the SQL files. It records every function (with its result, security,
settings and grants), trigger, policy and table; `18-upgrade.sql` then requires
the two records to be identical. Nothing is listed by hand, so a function added
tomorrow is covered.

`backup-drill.sh` — takes a copy as docs/BACKUPS.md says, restores it, runs
the SQL files over it, and compares every table and every access rule.

## Running them

You need a Postgres server. On Debian/Ubuntu:

```bash
sudo apt install postgresql
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /var/tmp/rankup-pg -U postgres --auth=trust
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/rankup-pg \
  -o '-k /tmp -p 55432 -c listen_addresses=' -l /var/tmp/rankup-pg/log start
```

Then:

```bash
./supabase/test/run.sh
```

It drops and recreates a scratch database each run, so it never accumulates state.
`DB=name` picks the database's name. The last line says whether everything
passed and, if not, which files failed.

`00-shim.sql` recreates just enough of Supabase — the `auth` schema, `auth.uid()`,
and the `anon`/`authenticated` roles — for a bare Postgres to run the same SQL.
**Never run that file against a real project.**

## The local API

`mock-server.mjs` is a stand-in for Supabase's REST API, backed by the same
Postgres. It exists so the browser can talk real HTTP to a real database with
real row level security, which is how `tests/sync.mjs` verifies the whole loop
end to end.

```bash
export PGHOST=/tmp PGPORT=55432 PGUSER=postgres
node supabase/test/mock-server.mjs        # listens on :54321
```

Like Supabase's own gateway, it answers only requests whose `apikey` header is
one of the project's keys (`local-anon-key`, or the service role key the
server functions use); anything else is a 401.

Point the app at it with a `.env.local`:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=local-anon-key
```

**It does not check passwords.** It trusts the bearer token completely, because
its job is to exercise the database rules, not to be an auth server. Development
only — it is never imported by the app and never deployed.
