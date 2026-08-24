# How the photo check works

**The rule that governs everything here: the check gives the parent an opinion. The
parent decides.** There is no auto-approve and there should not be one. In a family app,
a child wrongly accused of cheating by a computer does more damage than a cheat that
slips through.

---

## Layer 1 — checks that run on the phone

These always run. No API key, no internet, no cost, and the photo never leaves the
device. Code: `src/lib/aiVerify.js`.

| Check | What it catches |
|---|---|
| Capture source | The photo came from the photo library instead of the in-app camera |
| Sharpness (Laplacian variance) | Badly out of focus, or a thumb over the lens |
| Brightness | Almost entirely black or blown out white |
| Flat-colour ratio + colour diversity | Screenshots and solid-colour images — real rooms are never this uniform |
| Long axis-aligned edges | A photo of a screen or a user interface, rather than a physical scene |
| Perceptual fingerprint (dHash) | The same photo re-sent for a different quest, compared against every earlier submission |
| Time since the quest was opened | Submitted within seconds of opening it — weak on its own, noted anyway |

Each finding subtracts from a score out of 100 and adds a line the parent can read. Any
`high` severity finding, or a score under 45, marks the submission **Flagged**.

## Layer 2 — Claude looks at the photo

Layer 1 cannot answer the question that actually matters: *does this photo show a made
bed?* Layer 2 can. It is **off by default** because it needs an API key and costs money
per check.

It answers two things separately:

- **authenticity** — is this a real photo someone just took, or stock media / a
  screenshot / a photo of a screen?
- **matchesTask** — does the visible scene plausibly show the finished chore?

It is prompted to be generous. A messy background, a bad angle, or a partly visible
result is normal for a child's photo and is not evidence of anything. When it cannot
tell, it says so rather than guessing "fake".

### Adaptive quests are handled differently

When a quest is marked adaptive, the model is told the definition of "done" is
deliberately looser and personal to that child, and to lean strongly toward "unclear"
over "no". The score also gets a small bonus. Judging a child with a disability against
a fixed standard is exactly what adaptive tasks exist to avoid.

---

## Turning Layer 2 on

### 1. Get an API key

Sign up at [console.anthropic.com](https://console.anthropic.com) and create an API key.
Add credit — checks are billed per image, and an image of this size costs a fraction of
a cent, but it is not free.

### 2. Put the key on the server, never in the app

```bash
# .env — the key is a secret. Note there is NO "VITE_" prefix.
ANTHROPIC_API_KEY=sk-ant-...
```

Anything named `VITE_SOMETHING` gets bundled into the JavaScript that is sent to every
phone, where anyone can read it. `ANTHROPIC_API_KEY` has no prefix, so it stays on the
server and only `api/verify-photo.js` can see it.

On Vercel: Project Settings → Environment Variables → add `ANTHROPIC_API_KEY`. On
Netlify: Site settings → Environment variables. Redeploy afterwards.

### 3. Point the app at it

```bash
# .env
VITE_AI_VERIFY_URL=/api/verify-photo
```

Leave that blank to run Layer 1 only. When it is blank the parent's screen says plainly
that only the on-device checks ran — it does not pretend.

### Trying it locally

`npm run dev` runs `api/verify-photo.js` too (a small plugin in `vite.config.js` wires it
up), so a `.env` with both values set gives you the full two-layer check on your own
machine.

---

## What it costs to run

One check is one image plus a short prompt — call it well under a cent at current
pricing. A family doing five photo chores a day is a few cents a month. At the $9.99
subscription price this is not a problem; it is worth watching if the app ever gets
large. Pricing changes, so check
[anthropic.com/pricing](https://www.anthropic.com/pricing) rather than trusting a number
written here.

---

## If it fails

The app never blocks a submission on the check. If the network is down, the key is
missing, or the service times out, the submission still goes to the parent and the report
says why the check did not run. A kid who did their chore should never be stuck because a
server was busy.

---

## Things it will not catch

Be honest about this with anyone you demo to:

- A photo of a genuinely tidy room that *someone else* tidied.
- A chore done badly but photographed from a flattering angle.
- A photo taken yesterday of the same chore done properly then. (The duplicate check
  catches the *identical file*; it cannot catch a fresh photo of an unchanged room.)

None of these are solvable by looking at one image, which is exactly why a parent stays
in the loop.
