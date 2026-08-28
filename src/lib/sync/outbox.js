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
      (o) => o.type === 'upsert' && o.table === op.table && o.row?.id === op.row?.id,
    )
    if (index !== -1) {
      ops[index] = { ...ops[index], row: op.row }
      writeOutbox(ops)
      return ops[index]
    }
  }

  ops.push(entry)
  writeOutbox(ops)
  return entry
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
