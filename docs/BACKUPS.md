# Backups: keeping families' data safe

Everything a family has in RankUp — their children, chores, XP, coins,
rewards, the allowance pot — lives in one Supabase database. If that
database is lost and there is no backup, it is gone for every family, and
there is no way to rebuild it.

## 1. What Supabase does for you

Open your project in the Supabase dashboard and go to **Database → Backups**.

- On a **paid plan**, Supabase takes a backup every day and keeps the last
  several. You can restore one from that page. Check the page says backups
  are being taken; do not assume.
- On the **free plan**, do not count on Supabase having a backup for you.
  Before real families use the app, move to a paid plan, or at the very
  least take your own copies (section 2) every week.
- **Point-in-time recovery** (going back to any minute, not just last
  night) is a paid add-on. Worth it once you have paying families.

## 2. Taking your own copy

Supabase's own backups live with Supabase. A copy you keep somewhere else
(your computer, a cloud drive) protects you if you ever lose access to the
project itself.

You need the database connection string: dashboard → **Connect** → the
"Session pooler" or direct connection string, with your database password
in it. Then, on any computer with PostgreSQL's tools installed:

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth \
  --file=rankup-$(date +%Y-%m-%d).dump \
  "postgresql://postgres.xxxx:YOUR-PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres"
```

**Both `public` and `auth`, always.** `public` holds the families;
`auth` holds the sign-in accounts. Every child's phone and every parent is
linked to an account in `auth`. A copy of `public` alone brings the
families back with nobody able to sign in to them, and the restore refuses
the links between them. (Found by trying it, not by reading about it.)

Keep the file somewhere private: it holds every family's data. Delete old
copies you no longer need.

## 3. Restoring

**From Supabase's own backup:** Database → Backups → pick one → Restore.
Everything written after that backup is lost, so tell families if it
matters.

**From your own copy, into a new empty project:** Supabase's guide
"Backup and restore using the CLI" is the current, correct way for its
platform (the `auth` part of a new project already exists and is managed by
Supabase, which is why their steps differ from a plain restore). Follow
that guide rather than improvising. If in doubt, Supabase support can do
it with you.

## 4. Practise once, before you need it

A backup nobody has restored is a guess. `supabase/test/backup-drill.sh`
does the whole thing against the local test database: takes a copy the way
section 2 says, restores it into an empty database, and checks every
table came back with the same number of rows.

```bash
supabase/test/up.sh                 # the local database, once
supabase/test/backup-drill.sh
```

It last passed on 2026-11-01: 109 accounts, 66 families, 72 children and
every chore, reward and allowance line restored exactly.
