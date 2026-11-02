# Getting RankUp online

> **This page is for a quick preview.** To launch for real families (database,
> payments, scheduled jobs, legal), follow [LAUNCH.md](LAUNCH.md) instead; it
> recommends Cloudflare Pages.

You need it deployed to share it, and because phones only install a site (and only
send notifications) when it is on `https://`.

Both options below are free at this size and deploy automatically every time you push to
GitHub.

---

## Vercel

1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, **Add New → Project**,
   pick the repository.
3. Vercel detects Vite by itself. Leave the build settings alone:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.

---

## Netlify

```toml
# netlify.toml, in the project root
[build]
  command = "npm run build"
  publish = "dist"
```

A preview needs nothing else. For payments, reminders and the other server jobs, use
the Cloudflare set-up in [LAUNCH.md](LAUNCH.md).

---

## Putting it on a phone's home screen

Once deployed, on the phone:

- **iPhone (Safari):** Share → Add to Home Screen
- **Android (Chrome):** ⋮ → Add to Home screen

It then opens full-screen with its own icon, with no browser address bar. This is what
`public/manifest.webmanifest` is for.

It is still a website — it updates when you deploy, with no app store involved. What it
does *not* get is real push notifications on iOS (limited even when installed) or a
listing in the App Store.

---

## Custom domain: `rankup.<your domain>`

RankUp is a product of MTRX Horizyn. The company has the one domain (not chosen
yet; `<your domain>` below), and RankUp lives on a **subdomain** of it,
`rankup.<your domain>`, never on the bare domain or under a path. A subdomain is
an origin of its own, so RankUp's storage, sign-in and service worker are its
own, and nothing on the company's other sites can read them.

1. **DNS.** Where `<your domain>`'s DNS is managed, add a `CNAME` named `rankup`
   pointing at the host: `<your project>.pages.dev` on Cloudflare Pages, or the
   target Vercel shows (`cname.vercel-dns.com` at the time of writing). Just
   this one name; no wildcard.
2. **The host's custom-domain step.** Cloudflare: Workers & Pages → the project →
   Custom domains → Set up a custom domain → `rankup.<your domain>` (with the
   domain's DNS on Cloudflare it adds the CNAME for you). Vercel: Project →
   Settings → Domains → add `rankup.<your domain>`. Netlify: Domain management →
   Add a domain.
3. **HTTPS.** Each host issues and renews the certificate itself once the CNAME
   resolves, usually within minutes. Wait for it to show as active, then open
   `https://rankup.<your domain>`.
4. **`PUBLIC_SITE_URL=https://rankup.<your domain>`** in the host's settings, for
   payments.

A preview needs nothing more. For a real launch, the rest of what hangs off the
address (Supabase's Site URL and redirect URLs, the Stripe webhook, the MTRX
Horizyn console's `RANKUP_URL` and `RANKUP_STATS_URL`, and email sent from
`no-reply@rankup.<your domain>`) is in
[LAUNCH.md, section 1a](LAUNCH.md#1a-the-address-rankupyour-domain-half-an-hour-most-of-it-waiting).

---

## Checking a deploy actually worked

1. Open the site on a real phone.
2. Complete the setup and assign a quest.
3. On the kid's side, open it and tap **I did it!**, then **Send to parent**.
4. On the parent's side, the chore should be waiting. Tap **Accept** and the XP should
   land. RankUp takes no photos: a parent who wants proof gets one from the child's
   own camera app, by message.
