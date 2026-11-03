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
      by: e.by || null,
    })),
    pots: Object.fromEntries((summary?.pots || []).map((p) => [p.kidId, p.pence])),
    // Over every line, not only the ones sent: what went in and out, and when
    // money was last handed over. An older database sends none of these.
    totals: Object.fromEntries((summary?.pots || []).filter((p) => p.paid != null).map((p) => [p.kidId, {
      earned: p.earned || 0, added: p.added || 0, paid: p.paid || 0,
      lastPaidAt: p.lastPaidAt ? Date.parse(p.lastPaidAt) : null,
    }])),
    // When the request was SENT, not when it came back. Anything written in
    // between is a line the server had not seen, and dropping it would make a
    // payout a parent just recorded vanish for a moment.
    at: requestedAt,
    currency: summary?.currency || 'GBP',
  }
}

/** What each kind of line says on the record. */
const LINE_WORDS = { earned: 'Earned', paid: 'Paid out', gift: 'Added', adjustment: 'Corrected' }

/**
 * One child's pocket money record: what they are owed, what went in and out
 * over all time, when they were last paid, and every line with the balance
 * after it, newest first.
 *
 * Made from the same numbers as the pot (potFor), so the two can never
 * disagree: the balance after the newest line IS the pot, and each line
 * before it is worked back from there. That holds even when the server sent
 * only the latest lines, because the pot it sent covers every one. Lines
 * recorded on this phone since the last answer are counted in, as the pot
 * counts them.
 */
export function allowanceRecord(state, kidId, potFor) {
  const since = state.allowanceAt || 0
  const lines = (state.allowance || [])
    .filter((e) => e.kidId === kidId)
    .sort((a, b) => b.at - a.at)
  const pot = potFor(state, kidId)

  let balance = pot
  const withBalance = lines.map((e) => {
    const line = { ...e, words: LINE_WORDS[e.kind] || 'Changed', balanceAfter: balance }
    balance -= e.pence
    return line
  })

  const sum = (list, kind) => list.filter((e) => kind.includes(e.kind)).reduce((t, e) => t + e.pence, 0)
  const server = state.allowanceTotals?.[kidId]
  const fresh = server ? lines.filter((e) => e.at > since) : lines
  const lastPaid = fresh.find((e) => e.kind === 'paid')?.at || null
  const totals = {
    earned: (server?.earned || 0) + sum(fresh, ['earned']),
    added: (server?.added || 0) + sum(fresh, ['gift', 'adjustment']),
    paid: (server?.paid || 0) - sum(fresh, ['paid']),
    lastPaidAt: lastPaid || server?.lastPaidAt || null,
  }
  return {
    pot,
    totals,
    lines: withBalance,
    // The record shows the latest lines; the totals and the pot cover all.
    complete: !server || lines.length < 200,
  }
}
