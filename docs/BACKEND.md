# Adding accounts and sync (Supabase)

Right now RankUp stores everything in one browser on one device. This file explains what
to do about that, in the order it should be done.

**Nothing in here is built yet.** `supabase/schema.sql` is a complete, ready-to-run
database design, and `src/lib/storage.js` is the one file that has to change. That is
the whole job, structurally.

---

## What "a backend" actually gives you

Three separate things, often confused:

1. **Authentication** — knowing who is logged in. Without it there is no way for the
   app on your phone and the app on your kid's phone to know they belong together.
2. **A database** — one shared copy of the data, so both phones read and write the same
   quests, XP and approvals.
3. **File storage** — somewhere to put the photos that is not the phone's 5 MB browser
   quota.

Supabase provides all three, has a free tier that is genuinely enough to develop and
demo on, and is a normal Postgres database underneath, so nothing about it is a dead end.

Firebase is a reasonable alternative. Supabase is suggested because its database is
plain SQL, which is far easier to reason about than Firestore's document model when your
data has clear relationships (a family has kids, a kid has quests, a quest has
submissions).

---

## The plan, in order

### Step 1 — create the project and run the schema

1. Sign up at [supabase.com](https://supabase.com), create a project, pick a region near
   you.
2. Open the SQL editor and paste in the whole of `supabase/schema.sql`. Run it.
3. From Project Settings → API, copy the **Project URL** and the **anon public key**
   into your `.env` file as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The anon key is safe to ship in the browser. It is not a password — what it can actually
do is decided by the security rules in the schema (see "Row Level Security" below).

### Step 2 — prove ONE thing end to end before converting everything

Do not port the whole app at once. Pick the smallest slice that proves the plumbing:

> A parent signs up, adds a kid, assigns one quest. The kid signs in on a second
> device and sees that quest.

Once that works, everything else is repetition. If it does not work, you find out with
50 lines of code invested rather than 500.

### Step 3 — rewrite `src/lib/storage.js`

Every read and write in the app already goes through that file. Today it is
`localStorage.getItem` / `setItem`. Tomorrow it is Supabase queries. The 20 screens do
not change.

The one genuine complication: `loadState()` is synchronous today (it returns instantly),
and a database call is not (it takes time). So the app needs a loading state on first
open. That is one extra screen, not a rewrite.

### Step 4 — move photos to Supabase Storage

Instead of stuffing a base64 data URL into `localStorage`, upload the JPEG to a Storage
bucket and keep only its URL in the database. This also fixes the "oldest photos get
dropped when the quota fills" behaviour that exists today.

### Step 5 — real guilds, last

Guilds are the hardest part, not because of the code but because of the safety
requirements: it connects a child to children in other families. That needs verified
parental consent on **both** sides, a way to report and block, and moderation for the
chat. Do not ship kid-to-kid contact casually. → [LEGAL.md](LEGAL.md)

---

## Row Level Security — the part that matters most

Postgres has a feature called Row Level Security: rules, stored in the database itself,
that decide which rows each logged-in user may see or change. `supabase/schema.sql`
turns it on for every table.

This matters because the anon key ships in the browser, so a determined person can send
any query they like. RLS is what makes that safe: the database refuses to return another
family's rows no matter what is asked. Security enforced in the app's own JavaScript is
not security — anyone can edit the JavaScript.

The rules in the schema say, in plain terms:

- A parent can read and write everything belonging to their own family, and nothing else.
- A kid can read their own profile and their own quests, and can create submissions.
- A kid **cannot** approve a submission, change their own XP, or edit a quest's XP value.
  That last one is the whole game's integrity in one rule.

---

## What will break when you switch

Worth knowing in advance so it does not feel like something went wrong:

- **Everything is slower and can fail.** A local read never fails. A network read can
  time out on a bad connection. Every screen that saves needs to handle "that did not
  work, try again".
- **Two people can edit at once.** A parent approving on their phone while the kid
  submits on theirs. Postgres handles the conflict; your interface has to explain it.
- **Existing local data does not migrate itself.** Either write a one-time import, or
  accept that test data is lost. For a pre-launch app, accepting the loss is fine.

---

## Roughly what it costs

Supabase's free tier covers 500 MB of database and 1 GB of file storage — plenty for
development and a pilot with real families. The first paid tier is $25/month. That is
the point at which the $9.99 subscriptions need to be real. → [PAYMENTS.md](PAYMENTS.md)
