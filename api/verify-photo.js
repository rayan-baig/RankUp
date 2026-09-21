/**
 * Serverless function: the "does this photo actually show the chore?" check.
 *
 * Deployed automatically by Vercel from the /api folder. Netlify users: see
 * docs/DEPLOY.md for the one-line wrapper.
 *
 * WHY THIS RUNS ON A SERVER AND NOT IN THE APP:
 * calling Claude needs a secret API key. Anything shipped to a phone browser can
 * be read by anyone using the app, so the key lives here, on the server, and the
 * app only ever talks to this endpoint.
 *
 * This endpoint returns an OPINION. The app shows it to the parent and the
 * parent decides. It must never approve or reject a chore by itself.
 */

import { MODEL, ask, makeClient, servedBy } from './_shared/ai.js'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/*
 * WHAT ONE CHECK ACTUALLY COSTS, measured rather than guessed, because this is
 * the number every "let's optimise the AI bill" idea has to beat.
 *
 * Photos are downscaled to 720px on the long side before they leave the phone
 * (see toCanvas in src/lib/imaging.js), so a typical frame is about 520 image
 * tokens. Add roughly 510 for the system prompt and 60 for the quest details,
 * and a call is ~1,100 input tokens and ~150 output.
 *
 * On Haiku 4.5 ($1 / $5 per million) that is about $0.0018 — under two tenths
 * of a cent. The monthly allowance is 200, so the worst a single family can
 * cost is roughly 37 cents a month against a $9.99 subscription. The on-device
 * checks settle most photos before a call is made at all, so the real average
 * is far below that.
 *
 * TWO THINGS THAT LOOK LIKE SAVINGS AND ARE NOT:
 *
 * Caching the RESPONSE by input, the way you would cache an answer to a
 * repeated question, saves nothing here. Every input is a different photograph
 * of a different room; the same bytes essentially never arrive twice. And
 * keying a cache on the image hash across families would let one family's
 * verdict answer another family's submission, which is worse than the cost it
 * would save.
 *
 * PROMPT caching of the system prompt is the right idea and would also do
 * nothing, silently: the cacheable prefix here is ~510 tokens and Haiku 4.5
 * will not create a cache entry below 4,096. It returns no error — just
 * cache_creation_input_tokens: 0 — so it would look like it was working. If
 * this ever moves to a model with a 512 or 1,024 minimum, or the prompt grows
 * past 4K, revisit it; until then adding cache_control here is a no-op.
 */

const SYSTEM_PROMPT = `You help a parent check photo proof that their child submitted for a household chore in a kids' app called RankUp.

You are an advisory second opinion, not a judge. The parent always makes the final decision, and a wrongly accused child is a much worse outcome than a missed cheat. When you are unsure, say you are unsure — do not guess "fake".

Assess two separate things:

1. authenticity — is this a real photo someone just took of a real place?
   Signals of a problem: it is a screenshot of an app or website; it is a photo of a phone/TV/monitor screen; it is obviously stock or professional marketing photography; it contains watermarks, UI chrome, cursors, status bars, or text overlays typical of a downloaded image; it is a photo of a printed photo.
   Signals it is fine: ordinary domestic lighting, imperfect framing, clutter, real-world imperfections, a hand or shadow in frame.

2. matchesTask — does the visible scene plausibly show the finished chore described?
   Judge generously. A messy background, a bad angle, or a partly visible result is normal for a child's photo and is NOT evidence of cheating.

If the task is marked adaptive, it was written for a child with a physical or mental disability and the definition of "done" is deliberately looser and personal to that child. In that case only report a mismatch when the photo clearly shows something unrelated, and lean strongly toward "unclear" over "no".

Reply with a single JSON object and nothing else — no prose, no markdown fences:
{
  "authenticity": "likely_real" | "unclear" | "likely_fake",
  "matchesTask": "yes" | "unclear" | "no",
  "confidence": <integer 0-100>,
  "summary": "<one short sentence a parent can read at a glance>",
  "observations": ["<what you can actually see, max 4 short items>"],
  "concerns": ["<only genuine concerns, max 3 short items; empty array if none>"]
}`

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!match) return null
  const [, mediaType, data] = match
  // Base64 is 4 characters per 3 bytes, minus any padding. Computed rather than
  // measured with Buffer, which does not exist on Cloudflare Workers.
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  if ((data.length * 3) / 4 - padding > MAX_IMAGE_BYTES) return null
  return { mediaType, data }
}

/** Pull the JSON object out of the reply, even if the model wrapped it in prose. */
function extractJson(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

function buildUserContent({ mediaType, data }, quest) {
  const lines = [
    `Chore title: ${quest.questTitle || '(not given)'}`,
    quest.questDescription ? `Details: ${quest.questDescription}` : null,
    quest.doneMeans ? `The parent says "done" means: ${quest.doneMeans}` : null,
    quest.adaptive ? 'This is an ADAPTIVE task written for this specific child\'s abilities. Judge "done" loosely.' : null,
    'Assess the photo and reply with the JSON object described in your instructions.',
  ].filter(Boolean)

  return [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
    { type: 'text', text: lines.join('\n') },
  ]
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''

/**
 * Claim one check against the caller's monthly allowance.
 *
 * This is the whole reason the endpoint requires a token. Every call spends the
 * operator's money on Anthropic, so an unauthenticated endpoint is a public
 * licence to run up somebody else's bill — and a bug in a client loop does the
 * same thing without anyone meaning to. The database decides, using the
 * caller's own token, whether this family is on a plan that includes the check
 * and has any allowance left.
 */
async function claimCheck(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_photo_check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
      body: '{}',
    })
    if (!res.ok) return { ok: false, reason: 'unauthorised' }
    return await res.json()
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

/** Hands a claimed check back when it was spent on a call that never ran. */
async function refundCheck(token) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/refund_photo_check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
      body: '{}',
    })
  } catch {
    // A refund that cannot be recorded is not worth failing the response over.
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Not an error the parent needs to see as a failure — the app falls back to
    // its on-device checks and says the cloud check did not run.
    return res.status(503).json({ error: 'not_configured', message: 'ANTHROPIC_API_KEY is not set on the server.' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  if (!body) return res.status(400).json({ error: 'Invalid JSON body.' })

  // Check who is asking BEFORE looking at the image, let alone paying for it.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })
  if (!SUPABASE_URL) return res.status(503).json({ error: 'not_configured' })

  // Look at the image BEFORE claiming, not after.
  //
  // Claiming first meant a picture that was too large, or in a format this does
  // not take, spent one of the family's two hundred monthly checks and then
  // returned 400 without giving it back. A phone on a bad camera, or a client
  // bug producing an oversized frame, could burn a whole month's allowance
  // without a single check ever running. Parsing costs nothing and needs no
  // permission, so it goes first.
  const image = parseDataUrl(body.imageDataUrl)
  if (!image) {
    return res.status(400).json({ error: 'imageDataUrl must be a base64 JPEG/PNG/WebP data URL under 5MB.' })
  }

  const claim = await claimCheck(token)
  if (!claim?.ok) {
    const status = claim?.reason === 'monthly_cap' ? 429 : 403
    return res.status(status).json({ error: claim?.reason || 'refused' })
  }

  const client = makeClient()
  const request = {
    model: MODEL,
    // The reply is a small JSON verdict. 1200 was room for an essay nobody
    // reads, and output tokens are the expensive half.
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent(image, body) }],
  }

  try {
    /*
     * Everything model-shaped is negotiated in _shared/ai.js rather than
     * asserted here.
     *
     * This used to carry a hardcoded list of which models accept an effort
     * setting, and the list was wrong: it sent the parameter to Haiku 4.5,
     * which rejects it, so every check 400'd and the retry sent the identical
     * request again — with the family's allowance already spent on a call that
     * never ran. A list in a file nobody is looking at does not stay true. The
     * code finds out for itself now, once per model, and a model released next
     * year gets whatever it accepts with no change here.
     */
    const message = await ask(client, request, { effort: 'medium' })

    if (message.stop_reason === 'refusal') {
      return res.status(200).json({
        authenticity: 'unclear',
        matchesTask: 'unclear',
        confidence: 0,
        summary: 'The AI declined to assess this photo. Please review it yourself.',
        observations: [],
        concerns: [],
        model: MODEL,
      })
    }

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const parsed = extractJson(text)
    if (!parsed) {
      await refundCheck(token)
      return res.status(502).json({ error: 'unreadable_response', message: 'The AI reply could not be parsed.' })
    }

    return res.status(200).json({
      authenticity: parsed.authenticity ?? 'unclear',
      matchesTask: parsed.matchesTask ?? 'unclear',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 240) : '',
      observations: Array.isArray(parsed.observations) ? parsed.observations.slice(0, 4).map(String) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 3).map(String) : [],
      // What actually answered, which is not always what was asked for: a
      // safety decline is re-run on another model inside the same call.
      ...servedBy(message),
    })
  } catch (err) {
    // The check was claimed before the image was even parsed, so a failure here
    // has cost the family one of their two hundred for nothing.
    await refundCheck(token)
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 502
    console.error('[verify-photo]', err?.message || err)
    return res.status(status).json({ error: 'upstream_error', message: err?.message || 'Photo check failed.' })
  }
}

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }
