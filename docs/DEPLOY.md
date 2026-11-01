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

## Custom domain

Both hosts let you point a domain at the site for free (you pay only for the domain
itself, roughly $10–15/year). Vercel: Project → Settings → Domains. It handles the
https certificate automatically.

---

## Checking a deploy actually worked

1. Open the site on a real phone.
2. Complete the setup and assign a quest.
3. On the kid's side, open it and tap **I did it!**, then **Send to parent**.
4. On the parent's side, the chore should be waiting. Tap **Accept** and the XP should
   land. RankUp takes no photos: a parent who wants proof gets one from the child's
   own camera app, by message.
