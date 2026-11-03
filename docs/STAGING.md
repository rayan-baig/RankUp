# Staging: a second copy at `staging.rankup.<your domain>`

A copy of RankUp that nobody's family uses, where a change is tried on real
phones, against a real Supabase, a real (test-mode) Stripe and a real email
provider, before it goes live. Same code, same SQL files, same settings by
name; **different values for every one of them**. Nothing on staging can read,
charge, email or wake anything on live.

Set it up once, after live is set up ([LAUNCH.md](LAUNCH.md)); it follows the
same steps with the differences below. Then every change goes: CI green →
staging → live (the last section).

---

## 1. A separate Supabase project

- [ ] **A new project**, not a branch or a schema of the live one: its own
      database, its own sign-ins, its own keys. The free plan is fine for
      staging.
- [ ] **Run every SQL file, in order**, exactly as LAUNCH.md section 2 lists
      them, in the new project's SQL editor. Then the check there: both
      answers `false`.
- [ ] **Authentication → URL Configuration.** Site URL
      `https://staging.rankup.<your domain>`; redirect URLs
      `https://staging.rankup.<your domain>/**` only. Never live's address
      here, and never staging's on the live project.
- [ ] **Authentication → Emails.** The same templates as live
      ([EMAILS.md](EMAILS.md)), sent through the email sandbox (section 4).
- [ ] Sign-in protection as LAUNCH.md section 2a.
- [ ] Only test accounts, made up for staging. Never copy live's database
      into staging: it holds children's data, and staging is a place where
      things are meant to break.

## 2. Cloudflare Pages: a second project

A **second Pages project** (for example `rankup-staging`) from the same
GitHub repository, rather than a preview deployment of the live one. Each
project has its own settings and its own custom domain, so staging's values
can never be read by a live build, or the other way round.

- [ ] Workers & Pages → Create → Pages → connect the repository. Build
      command `npm run build`, output `dist` (the same as live;
      `wrangler.toml` says so).
- [ ] **Production branch: `staging`.** Live's project builds `main`;
      this one builds `staging`. Turn off preview deployments for other
      branches here (Settings → Builds → Branch control), so a work branch
      never runs with staging's keys.
- [ ] **Custom domain** `staging.rankup.<your domain>`: the project →
      Custom domains → Set up a custom domain. Pages issues the certificate
      for that exact name. (A plain proxied DNS record would not be enough:
      a zone's free certificate covers one level of subdomain,
      `*.<your domain>`, and this name is two levels deep.)
- [ ] **Its own settings** (section 5), set as the project's Production
      variables.
- [ ] Optional: keep strangers out with Cloudflare Access on
      `staging.rankup.<your domain>`, with a **Bypass** rule for `/api/*`,
      which the scheduler and Stripe's test webhook must still reach.

If you would rather not have a second project, a preview deployment of the
live project works too (the `staging` branch's alias, with the custom domain
pointed at `staging.<project>.pages.dev`), with every setting below entered
as a **Preview** variable. It is the weaker choice: Preview variables apply
to every branch's preview, so any branch pushed to GitHub would run with
staging's keys, and one project's settings page holds both copies' values,
one wrong tab from mixing them.

On **Vercel**, the same idea: a second Vercel project with its own domain and
its own environment variables. Its `crons` in `vercel.json` call staging's
own jobs with staging's `CRON_SECRET`.

## 3. Stripe in test mode

- [ ] Stripe's **test mode** (the same account, with the test-mode switch
      on). Test mode has its own keys, products, prices, webhooks and
      customer portal settings, and charges nothing.
- [ ] Create the same plans, ticket packs and school prices as LAUNCH.md
      section 3, at the same amounts, in test mode. Their price ids differ
      from live's: staging gets the test ones.
- [ ] A **test-mode webhook** to `https://staging.rankup.<your domain>/api/stripe-webhook`,
      with the same events as live; its signing secret is staging's
      `STRIPE_WEBHOOK_SECRET`.
- [ ] The customer portal's return link, in test mode:
      `https://staging.rankup.<your domain>/#/parent/plan`.
- [ ] Pay with `4242 4242 4242 4242`; a failing card and a test clock as in
      LAUNCH.md section 6.

## 4. The email sandbox

- [ ] Staging's own API key at the email provider, never live's. With Resend:
      a second API key with sending access only, and send only to its test
      addresses (`delivered@resend.dev`, `bounced@resend.dev`) or to your own
      inbox. A staging account must never be made with a real family's
      address.
- [ ] `EMAIL_FROM=RankUp staging <no-reply@rankup.<your domain>>`, so a
      staging email is never mistaken for a live one.
- [ ] `ERRORS_EMAIL` unset, or a different inbox from live's: the error
      report says "RankUp" either way.
- [ ] Supabase's SMTP settings (section 1) through the same sandbox key.

## 5. The settings: same names, never the same values

Copy the names from `.env.example`, as for live. Every secret is made again
for staging; nothing is pasted from live.

| Setting | On staging |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The staging Supabase project's |
| `PUBLIC_SITE_URL` | `https://staging.rankup.<your domain>` |
| `CRON_SECRET` | **A new one** (`openssl rand -hex 32`). Live's opens live's jobs and live's detailed health check; it is never typed anywhere else |
| `OPERATOR_SECRET` | **A new one.** Live's decides which schools see children's names |
| `STATS_KEY` | Leave unset, so the MTRX Horizyn console never counts staging's test families as real ones |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Test mode's (`sk_test_…`, the test webhook's secret, the test price ids) |
| `VITE_STRIPE_ENABLED` | `true` |
| `VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **A new pair** (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | The same company address as live is fine: it is not a secret |
| `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ERRORS_EMAIL` | The sandbox's (section 4) |
| `SUPPORT_EMAIL` | The same as live, or unset |
| `VITE_GUILDS_ENABLED`, `RETENTION_*` and the rest | As live, unless the change being tried is one of them |

Leave `EMAIL_API_BASE`, `STRIPE_API_BASE` and `VITE_DEMO_ON_BOOT` unset, as on
live: they are for the tests and the shareable preview.

**Check nothing is shared.** On staging,
`GET /api/health` with staging's `CRON_SECRET` answers with the detail; with
live's it must answer only `{"ok":…,"version":…}`. And the other way round on
live.

## 6. The scheduled jobs

Staging needs its jobs running too, or a change that breaks one is not seen
until live: the six in LAUNCH.md section 2b, at the same times, each called
with **staging's** `CRON_SECRET` at `https://staging.rankup.<your domain>/api/…`.
On Cloudflare that is a second scheduler Worker (or a second set of entries in
your outside scheduler) with `SITE` and `CRON_SECRET` set to staging's. Never
point one scheduler at both, with one secret.

## 7. Running the SQL files there first

**Every change that touches `supabase/` is run on staging before live,** the
same way as an upgrade on live (LAUNCH.md section 2, "Upgrading later"): all
the files, in order, every time. Then, on staging:

- [ ] the check in LAUNCH.md section 2 (both `false`);
- [ ] `GET /api/health` with staging's `CRON_SECRET`: `database` true, and
      each job `ok` once it has had a chance to run;
- [ ] the app opened on a real phone, on the screens the change touched.

A file that fails on staging is fixed, committed and run again on staging.
It is never run on live first "to see".

## 8. Promoting a tested commit to live

Staging and live build two branches of the same repository, `staging` and
`main`, so promoting is moving `main` to the exact commit staging has run.

1. **Put the commit on staging.** It must already be green in CI (every
   suite runs on every push):

   ```bash
   git push origin <commit>:staging
   ```

   Cloudflare builds it. `GET https://staging.rankup.<your domain>/api/health`
   answers the version in that commit's `package.json`.
2. **Run the SQL files on staging** (section 7), if `supabase/` changed.
3. **Try it on staging** on real phones: LAUNCH.md section 6's walk for
   anything it touched, Stripe in test mode, the emails in the sandbox.
4. **Run the SQL files on live**, all of them, in order. The files are made
   to run over a live database with the old app still serving it, so this
   goes first: a newer app calling a function live's database does not have
   yet would be refused (LAUNCH.md section 2).
5. **Move `main` to the same commit**, as a fast-forward only, so live gets
   exactly what was tried and nothing else:

   ```bash
   git fetch origin
   git merge-base --is-ancestor origin/main <commit> && git push origin <commit>:main
   ```

   If `main` has anything the commit does not, the first command stops it:
   bring that onto `staging` and start again from step 1.
6. **Check live**: `GET https://rankup.<your domain>/api/health` answers the
   same version; with live's `CRON_SECRET`, every job `ok` within the hour.
   If something is wrong, Cloudflare's Deployments → the previous deployment
   → Rollback puts the last build back at once. The database needs no
   rollback: the files are written so that the app before them keeps
   working over the new database, which is what step 4 relied on.

Never build live from a commit staging has not run, and never let live and
staging share a database, a key or a secret, even for a moment.
