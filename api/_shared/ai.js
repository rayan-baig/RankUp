/**
 * The one place this product talks to a model.
 *
 * WHY THIS FILE EXISTS: every hardcoded fact about a model is a thing that
 * goes stale. The first version of the photo check carried a list of which
 * models accept `output_config.effort`, and that list was wrong within months —
 * it sent the parameter to Haiku 4.5, which rejects it, so every single photo
 * check returned 400 and the retry sent the identical request again. A family's
 * monthly allowance was spent on checks that never ran.
 *
 * The lesson is not "keep the list updated". Nobody updates a list in a file
 * they are not looking at. The lesson is that the code should find out for
 * itself, once, and remember. That is what negotiate() below does: it tries the
 * richer request, and if the API says that parameter is not for this model, it
 * drops it and never sends it again for that model. A model released next year
 * that accepts something this one does not gets the benefit with no code
 * change, and a model that stops accepting something degrades instead of
 * breaking.
 *
 * Everything model-shaped lives here — the id, the capability negotiation, the
 * refusal fallback, and what actually served the request — so swapping models
 * or adding a second AI feature is one file rather than a search.
 */

import Anthropic from '@anthropic-ai/sdk'

/**
 * Which model judges the photos.
 *
 * Haiku 4.5 by default, chosen for cost: the job is a photograph authenticity
 * judgement rather than hard reasoning, and it is a fifth of Opus's price.
 * Override with AI_VERIFY_MODEL to trade the money back — nothing else in the
 * code needs to change, which is the point of it being one constant.
 */
export const MODEL = process.env.AI_VERIFY_MODEL || 'claude-haiku-4-5'

/**
 * What we have learned this process can send to this model.
 *
 * Per model id, so overriding AI_VERIFY_MODEL starts the negotiation again
 * rather than inheriting the previous model's answers. Held in memory on
 * purpose: a serverless instance lives long enough for this to pay for itself
 * many times over, and a cold start simply learns it again on its first call.
 */
const learned = new Map()

function capabilitiesFor(model) {
  if (!learned.has(model)) {
    learned.set(model, { effort: true, serverFallback: true })
  }
  return learned.get(model)
}

/** A 400 naming a parameter is the API telling us that model does not take it. */
function rejectedParameter(err, needle) {
  if (err?.status !== 400) return false
  const message = String(err?.message || '').toLowerCase()
  return message.includes(needle)
}

/**
 * Send a request, dropping anything this model turns out not to accept.
 *
 * Tries the full shape first: the server-side refusal fallback, so a safety
 * decline is re-run on another model inside the same call rather than coming
 * back empty; and an effort setting, so the model is told how hard to think.
 * Each is dropped permanently for this model the first time the API rejects
 * it by name, and the request is retried at once — the caller never sees the
 * negotiation, only the answer.
 *
 * `effort` is passed rather than fixed here because what a task is worth
 * thinking about is the caller's business, not this file's.
 */
export async function ask(client, request, { effort = 'medium' } = {}) {
  const model = request.model || MODEL
  const caps = capabilitiesFor(model)

  for (;;) {
    const body = { ...request, model }
    if (caps.effort && effort) body.output_config = { ...body.output_config, effort }

    try {
      if (caps.serverFallback) {
        return await client.beta.messages.create({
          ...body,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      }
      return await client.messages.create(body)
    } catch (err) {
      // Each of these is learned once and then never sent to this model again,
      // which is what stops a stale assumption costing a call every time.
      if (caps.effort && rejectedParameter(err, 'effort')) {
        caps.effort = false
        continue
      }
      if (caps.serverFallback && err?.status === 400) {
        // Either the beta is not enabled for this account or this model does
        // not take it. Both mean: ask plainly and stop offering.
        caps.serverFallback = false
        continue
      }
      throw err
    }
  }
}

/** A client, or null when no key is configured. Never throws on a missing key. */
export function makeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

/**
 * What actually served a request, for the operator rather than the parent.
 *
 * Worth recording because the model that answers is not always the one asked
 * for — a refusal is re-run on a fallback — and because comparing models on
 * real photographs is the only honest way to decide whether a dearer one earns
 * its price. Guessing from a benchmark does not transfer to a blurry picture of
 * a made bed.
 */
export function servedBy(message) {
  return {
    model: message?.model || MODEL,
    fell_back: Boolean(
      (message?.usage?.iterations || []).some((entry) => entry?.type === 'fallback_message'),
    ),
  }
}

/** What this deployment can do, for /api/health. Booleans only, never the key. */
export function aiStatus() {
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: MODEL,
    // What negotiation has settled on so far in this instance. Absent on a cold
    // start, which is honest: it has not asked yet.
    negotiated: Object.fromEntries(learned),
  }
}
