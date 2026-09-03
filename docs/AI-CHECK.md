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

## What it costs, and how that was cut

Vision input is billed roughly by pixel area — about `(width × height) / 750`
tokens. A 1280px capture is ~2,185 tokens; a 768px one is ~786. For the only
question this layer is asked — *is this a real photograph of this chore, or a
screenshot* — the extra two-thirds bought nothing.

Three changes, none of which cost quality:

| | effect |
|---|---|
| Shrink to 768px before sending | −64% image tokens |
| Cap the reply at 400 tokens (was 1200) | the reply is a small JSON verdict; output is the expensive half |
| Skip the call when the on-device layer is already sure | ~60% fewer calls |

That last one is the structural win. The free on-device checks already catch
the two common cheats — a photo of a screen (flat colour, low colour
diversity) and last week's photo sent again (perceptual hash). When one of
those has fired, the parent will look hard at the photo whatever Claude says.
When the picture is a sharp live-camera capture with no flags and a high score,
Claude has nothing to add either. The call is only worth paying for in the
ambiguous middle, and that is now the only place it is made.

**Roughly, per family doing five chores a day (150 photos a month):**

| | per photo | per family per month |
|---|---|---|
| Before | $0.019 | **$2.91** |
| Now, on Claude Opus 5 | $0.012 | **$0.75** |
| Now, on Claude Haiku 4.5 | $0.0025 | **$0.15** |

### Switching model

`AI_VERIFY_MODEL` picks the model; it defaults to `claude-opus-5`. Haiku 4.5 is
a fifth of the price ($1/$5 per million tokens against $5/$25) and is
comfortably able at this task, which is a photograph-authenticity judgement
rather than hard reasoning:

```
AI_VERIFY_MODEL=claude-haiku-4-5
```

That is the single biggest remaining lever — it takes the AI cost from about 8%
of a $9.99 subscription to under 2%. Try it against a handful of real photos,
including a deliberately faked one, before switching for good.

The AI check is off entirely on the Starter plan, which is the other reason
this stays affordable: the cheapest tier never makes a call at all.


## Getting the cost to exactly zero

The cloud layer is optional and always was. Leave `VITE_AI_VERIFY_URL` unset and
the app never makes a call, costs nothing, and still ships nine checks that run
free on the child's own phone:

| | catches |
|---|---|
| Capture source | a picture chosen from the gallery rather than taken now |
| Blur, darkness, blown highlights | a photo of nothing in particular |
| Flat colour + colour diversity | a screenshot, or a photo of a screen |
| UI edge detection | app chrome and status bars in frame |
| Perceptual hash | last week's photo sent again, and near-duplicates |
| Time-to-submit | a "chore" finished suspiciously instantly |

Those are the two cheats children actually try. The Claude layer adds one thing
they cannot: whether the photograph shows *the chore that was asked for*. That
is worth paying for once there is revenue — it is not worth paying for on day
one, and the review screen says plainly when it did not run.

**Ship with it off. Turn it on when families are paying.**

## Who is allowed to spend it

`/api/verify-photo` requires a signed-in caller's token and claims one check
against that family's monthly allowance before any image is sent to Anthropic.
Without that, a deployed endpoint is a public licence to spend the operator's
balance — and a looping client does the same damage without anyone intending it.

- Signed-out callers are refused outright.
- Starter families are refused: the plan does not include the check.
- Every family has 200 checks a month. With the on-device layer settling most
  photos first, ordinary use lands near sixty, so the ceiling is a runaway
  guard rather than a limit anyone meets.
- Only `claim_photo_check()` moves the counter; a device cannot reset its own.
