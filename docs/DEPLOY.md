# Getting RankUp online

You need it deployed for two reasons beyond sharing it: **the camera only works on
`https://`**, and the AI photo check needs a server to hold the API key.

Both options below are free at this size and deploy automatically every time you push to
GitHub.

---

## Vercel (recommended, because `api/verify-photo.js` works with no setup)

1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, **Add New → Project**,
   pick the repository.
3. Vercel detects Vite by itself. Leave the build settings alone:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Before deploying, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` → your key (optional; skip it to run the on-device checks only)
   - `VITE_AI_VERIFY_URL` → `/api/verify-photo`
5. Deploy.

The `api/` folder becomes a serverless function automatically. Nothing else to configure.

---

## Netlify

Netlify looks for functions in a different folder, so add one file:

```toml
# netlify.toml, in the project root
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"
```

```js
// netlify/functions/verify-photo.js
import handler from '../../api/verify-photo.js'

export default async (request) => {
  const body = await request.text()
  let status = 200
  let payload = null
  const res = {
    status: (code) => { status = code; return res },
    json: (data) => { payload = data; return res },
    setHeader: () => res,
    end: () => res,
  }
  await handler({ method: request.method, body }, res)
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

Then set the same two environment variables in Site settings → Environment variables.

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
2. Complete the setup, assign a quest, open it, tap **Take photo proof**. The camera
   should ask permission and show a live view. If it does not, you are on `http://`, not
   `https://`.
3. Take a photo. If you configured the API key, the report should include a sentence of
   description from Claude. If it does not, the report will say the cloud check did not
   run — check the environment variables and redeploy.
