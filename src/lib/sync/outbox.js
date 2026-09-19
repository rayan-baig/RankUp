/**
 * The outbox.
 *
 * Every change a device makes is written to its own storage immediately and
 * queued here to be sent. That ordering matters: a kid photographing a chore in
 * a basement with no signal must not lose the submission, and a parent tapping
 * Approve on a train must not have to wait for a round trip.
 *
 * The queue survives a reload, drains in order, and drops an operation only
 * once the server has accepted it — or once it has failed so many times that
 * retrying is clearly pointless.
 */

const KEY_BASE = 'rankup.outbox.v1'
const MAX_ATTEMPTS = 8

function key() {
  try {
    const device = new URLSearchParams(window.location.search).get('device')
    return device ? `${KEY_BASE}.${device.replace(/[^a-z0-9_-]/gi, '')}` : KEY_BASE
  } catch {
    return KEY_BASE
  }
}

export function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(key()) || '[]')
  } catch {
    return []
  }
}

function writeOutbox(ops) {
  try {
    localStorage.setItem(key(), JSON.stringify(ops))
    return true
  } catch (err) {
    console.warn('[RankUp] Could not save the outbox:', err)
    return false
  }
}

/**
 * Queue a change.
 *
 * Repeated edits to the same row collapse into the latest one — a parent
 * dragging an XP slider should send one write, not forty. Deletes are never
 * collapsed away, because "created then deleted while offline" still has to
 * reach the server as a delete if the row was ever pushed.
 */
export function enqueue(op) {
  const ops = readOutbox()
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, attempts: 0, ...op }

  if (op.type === 'upsert') {
    const index = ops.findIndex(
      (o) => o.type === 'upsert' && o.table === op.table && o.row?.id === op.row?.id
        // Never collapse into an op that is CURRENTLY BEING SENT. push() holds
        // the id it is awaiting and deletes exactly that id when the request
        // succeeds — so folding a newer row into it meant the success of the
        // OLD row discarded the new one, which had already been marked synced
        // in the shadow and could therefore never be re-queued. A slow mobile
        // link and a second edit were all it took to lose the edit for good.
        && !o.sending,
    )
    if (index !== -1) {
      // The fresh row gets a fresh budget: inheriting a nearly-exhausted
      // attempts count would retire a brand-new write after one or two tries.
      ops[index] = { ...ops[index], row: op.row, attempts: 0 }
      return writeOutbox(ops) ? ops[index] : null
    }
  }

  ops.push(entry)
  // Returns null when the write failed — a full quota is an expected state in
  // an app that keeps base64 photos in localStorage. The caller must not record
  // this row as queued when it is not.
  return writeOutbox(ops) ? entry : null
}

/** Marks the ops push() is about to send, so enqueue will not fold into them. */
export function markSending(ids) {
  const set = new Set(ids)
  const ops = readOutbox().map((o) => (set.has(o.id) ? { ...o, sending: true } : o))
  writeOutbox(ops)
}

export function removeOps(ids) {
  const drop = new Set(ids)
  writeOutbox(readOutbox().filter((o) => !drop.has(o.id)))
}

export function recordFailure(id) {
  const ops = readOutbox()
  const op = ops.find((o) => o.id === id)
  if (!op) return { dead: false }
  op.attempts = (op.attempts || 0) + 1
  const dead = op.attempts >= MAX_ATTEMPTS
  writeOutbox(dead ? ops.filter((o) => o.id !== id) : ops)
  return { dead, attempts: op.attempts }
}

export function clearOutbox() {
  writeOutbox([])
}

export const OUTBOX_MAX_ATTEMPTS = MAX_ATTEMPTS
