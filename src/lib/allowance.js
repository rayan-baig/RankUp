/**
 * Pocket money, from the app's side.
 *
 * The device keeps a local mirror of the ledger so the number is on screen
 * instantly and still there on a train with no signal. This fetches the
 * server's answer, which replaces it — only the database may decide what a
 * chore paid.
 */

import { transport } from './sync/transport.js'

/**
 * `{ currency, pots, entries }`, or null when there is nothing to ask.
 *
 * Null rather than an empty summary on purpose: a device with no backend has a
 * perfectly good local ledger, and replacing it with an empty one from a
 * server that was never there would wipe a family's pocket money off the
 * screen.
 */
export async function fetchAllowance() {
  if (!transport.isConfigured()) return null
  try {
    return (await transport.rpc('allowance_summary', {})) || null
  } catch (err) {
    console.warn('[RankUp] allowance_summary:', err.message)
    return null
  }
}

/** The server's answer, in the shape the reducer holds. */
export function mergeFrom(summary, requestedAt) {
  return {
    type: 'MERGE_ALLOWANCE',
    entries: (summary?.entries || []).map((e) => ({
      id: e.id,
      kidId: e.kidId,
      pence: e.pence,
      kind: e.kind,
      note: e.note || '',
      at: Date.parse(e.at) || Date.now(),
    })),
    pots: Object.fromEntries((summary?.pots || []).map((p) => [p.kidId, p.pence])),
    // When the request was SENT, not when it came back. Anything written in
    // between is a line the server had not seen, and dropping it would make a
    // payout a parent just recorded vanish for a moment.
    at: requestedAt,
    currency: summary?.currency || 'GBP',
  }
}
