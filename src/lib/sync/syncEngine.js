/**
 * The sync engine.
 *
 * Local first: every change is already saved on the device before this gets
 * involved. The engine's only job is to move changes outward and pull other
 * devices' changes in.
 *
 *   push()  drain the outbox, oldest first, stopping on the first retryable
 *           failure so ordering is never broken
 *   pull()  ask the server what has changed since our cursor and merge it
 *
 * Conflicts are resolved by an explicit rule rather than by whoever wrote last:
 * see MERGE_SNAPSHOT in the reducer. The short version is that the server owns
 * anything to do with XP and currency (only approve_submission moves those, and
 * only a parent can call it), while the device owns its own local view.
 */

import { transport } from './transport.js'
import { readOutbox, removeOps, recordFailure } from './outbox.js'

const CURSOR_KEY = 'rankup.sync.cursor.v1'
const PULL_INTERVAL_MS = 8000

function cursorKey() {
  try {
    const device = new URLSearchParams(window.location.search).get('device')
    return device ? `${CURSOR_KEY}.${device.replace(/[^a-z0-9_-]/gi, '')}` : CURSOR_KEY
  } catch {
    return CURSOR_KEY
  }
}

/**
 * A cursor belongs to the account that earned it.
 *
 * family_snapshot reports the server's current revision to every caller,
 * including one who is allowed to see nothing yet. So a kid's device polling
 * while it waits to be paired would store a cursor at the head of the log, and
 * then only ever ask for rows written AFTER pairing — every quest the parent
 * had already assigned would be invisible, forever. Stamping the cursor with
 * the user it was earned as means a device that changes identity (pairing, or
 * signing in) starts again from zero and pulls the whole family.
 */
export function getCursor() {
  try {
    const saved = JSON.parse(localStorage.getItem(cursorKey()) || 'null')
    if (!saved || typeof saved !== 'object') return 0
    if (saved.uid !== (transport.currentUserId() || null)) return 0
    return Number(saved.rev) || 0
  } catch {
    return 0
  }
}

export function setCursor(rev) {
  localStorage.setItem(
    cursorKey(),
    JSON.stringify({ uid: transport.currentUserId() || null, rev: Number(rev) || 0 }),
  )
}

export function resetCursor() {
  localStorage.removeItem(cursorKey())
}

export const SYNC_STATUS = {
  OFFLINE: 'offline',
  IDLE: 'idle',
  SYNCING: 'syncing',
  ERROR: 'error',
  DISABLED: 'disabled',
}

export function createSyncEngine({ dispatch, onStatus }) {
  let running = false
  let timer = null
  let inFlight = false
  let status = transport.isConfigured() ? SYNC_STATUS.IDLE : SYNC_STATUS.DISABLED
  let lastError = null

  const setStatus = (next, error = null) => {
    status = next
    lastError = error
    onStatus?.({ status: next, error, pending: readOutbox().length })
  }

  /** Send everything queued. Stops at the first retryable failure to keep order. */
  async function push() {
    const ops = readOutbox()
    if (!ops.length) return { sent: 0 }
    let sent = 0

    for (const op of ops) {
      try {
        if (op.type === 'upsert') await transport.upsert(op.table, op.row)
        else if (op.type === 'delete') await transport.delete(op.table, op.id)
        else if (op.type === 'rpc') await transport.rpc(op.fn, op.args)
        removeOps([op.id])
        sent += 1
      } catch (err) {
        if (err.retryable) {
          // Network or server trouble: leave it queued and try again later.
          recordFailure(op.id)
          throw err
        }
        // A rejected write is not going to start working. Drop it rather than
        // blocking everything behind it forever, but say so loudly.
        console.warn(`[RankUp] Server rejected ${op.type} on ${op.table || op.fn}:`, err.message)
        const { dead } = recordFailure(op.id)
        if (!dead) removeOps([op.id])
      }
    }
    return { sent }
  }

  /** Ask for everything that changed since our cursor. */
  async function pull() {
    const since = getCursor()
    const snapshot = await transport.rpc('family_snapshot', { p_since: since })
    if (!snapshot) return { changed: 0 }

    // `families` belongs in this list: when a subscription changes, the family
    // row is the ONLY thing that moves. Leaving it out meant an upgrade landed
    // in the browser only when some unrelated row happened to change too.
    const changed =
      ['families', 'kids', 'quests', 'submissions', 'rewards', 'redemptions', 'notes', 'overrides', 'deletions']
        .reduce((n, key) => n + (snapshot[key]?.length || 0), 0)

    if (changed > 0) dispatch({ type: 'MERGE_SNAPSHOT', snapshot })
    if (snapshot.server_rev != null) setCursor(snapshot.server_rev)
    return { changed }
  }

  /** One full cycle. Push before pull, so our own writes come back merged. */
  async function sync({ silent = false } = {}) {
    if (!transport.isConfigured()) return { skipped: 'not-configured' }
    if (inFlight) return { skipped: 'in-flight' }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus(SYNC_STATUS.OFFLINE)
      return { skipped: 'offline' }
    }

    inFlight = true
    if (!silent) setStatus(SYNC_STATUS.SYNCING)
    try {
      await push()
      const result = await pull()
      setStatus(SYNC_STATUS.IDLE)
      return result
    } catch (err) {
      setStatus(err.status === 0 ? SYNC_STATUS.OFFLINE : SYNC_STATUS.ERROR, err.message)
      return { error: err.message }
    } finally {
      inFlight = false
    }
  }

  function start() {
    if (running || !transport.isConfigured()) return
    running = true
    timer = setInterval(() => sync({ silent: true }), PULL_INTERVAL_MS)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    sync()
  }

  function stop() {
    running = false
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }

  // Coming back from a tunnel, or switching back to the tab, are the two moments
  // a person most expects to see fresh data.
  const onOnline = () => sync()
  const onVisible = () => { if (document.visibilityState === 'visible') sync() }

  return {
    start,
    stop,
    sync,
    push,
    pull,
    get status() { return status },
    get lastError() { return lastError },
    get pending() { return readOutbox().length },
  }
}
