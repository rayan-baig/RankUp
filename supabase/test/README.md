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

Point the app at it with a `.env.local`:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=local-anon-key
```

**It does not check passwords.** It trusts the bearer token completely, because
its job is to exercise the database rules, not to be an auth server. Development
only — it is never imported by the app and never deployed.
