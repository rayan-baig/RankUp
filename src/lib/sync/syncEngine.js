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
import { readOutbox, readySlice, removeOps, recordFailure, markSending } from './outbox.js'

const CURSOR_KEY = 'rankup.sync.cursor.v1'
/**
 * How often to ask the server what changed.
 *
 * A fixed eight-second poll is the single most expensive thing this app can do.
 * Two devices per family, polling around the clock, is 450 requests each an
 * hour — about 648 million a month at a thousand families, for a product where
 * almost nothing changes between one poll and the next. That is a hosting bill
 * with no feature attached to it.
 *
 * So the interval breathes. It starts fast, because a parent approving a chore
 * should land on the child's phone quickly. Each poll that finds nothing slows
 * the next one down. Anything actually happening — a change arriving, something
 * queued to send, the tab coming back to the foreground, or the person simply
 * touching the screen — snaps it straight back to fast.
 *
 * A hidden tab does not poll at all. Nobody is looking, and onVisible already
 * syncs the moment they look again, so the only thing background polling buys
 * is somebody else's bandwidth bill and the child's battery. That is where
 * nearly all of the saving comes from, because a phone in a pocket is the
 * normal case.
 *
 * While somebody IS looking, the backoff is capped hard and deliberately low.
 * The parent staring at the review screen waiting for their kid's photo to
 * arrive is the whole product; making them wait a minute for it to appear
 * would be saving pennies by breaking the thing the pennies pay for.
 */
const PULL_MIN_MS = 8000
/** Longest a visible screen may go without checking. Bounds how stale it looks. */
const PULL_VISIBLE_MAX_MS = 20000
/** A hidden tab does no network at all; this is just how often it re-checks that. */
const PULL_HIDDEN_MS = 60000
const BACKOFF = 1.5

function cursorKey() {
  try {
    const device = new URLSearchParams(window.location.search).get('device')
    return device ? `${CURSOR_KEY}.${device.replace(/[^a-z0-9_-]/gi, '')}` : CURSOR_KEY
  } catch {
    return CURSOR_KEY
  }
}

/**
 * How long a head sits in hand before it is written down.
 *
 * Two different races close on this one delay, and both of them end with a
 * change that silently never arrives.
 *
 * The first is in the database. `rev` comes off a sequence, and a sequence
 * gives out its number when a write STARTS. A transaction can take rev 500 and
 * commit a moment after the server reported head 501. Banking 501 on the spot
 * would mean only ever asking for rows past it, and 500 would be gone for good.
 *
 * The second is on this device. Merged rows reach localStorage through a
 * debounced save, so for a fraction of a second the cursor would be newer than
 * the state it is a cursor for. A reload in that gap loses the rows and never
 * asks for them again.
 *
 * Holding each head for a few seconds and asking from the older one covers
 * both: anything that commits late, or any save still in flight, falls inside
 * the overlap and is simply sent again. Re-sending is free in correctness terms
 * because merging a row twice is the same as merging it once — the only cost is
 * that a burst of changes travels about twice, which at this app's traffic is
 * measured in kilobytes.
 */
const CURSOR_LAG_MS = 6000

/** Heads the server has given us that are not yet old enough to trust. */
const held = []
/** A head that is old enough, waiting for one more round trip. See ageHeads. */
let ripe = null

/**
 * Move each head one step closer to being written down. Called at the top of a
 * pull, before the cursor is read.
 *
 * There are two steps rather than one, and the second is the one that does the
 * real work. Ageing a head past the lag is not enough on its own: what makes a
 * late commit safe is that some pull actually WENT AND ASKED with the older
 * cursor after that commit landed. So a head that comes of age is only marked
 * ripe here; the pull that follows runs against the previous cursor, sweeping
 * up anything that committed late, and only then is the ripe head banked.
 *
 * That second step doubles as the fix for the local race: by the time a head is
 * banked, the merge that came with it is a full poll old, so the debounced save
 * that writes it to storage has long since run. The cursor can never be newer
 * than the state it belongs to.
 *
 * Steady state costs about two polls of overlap. Merging a row twice is the
 * same as merging it once, so the only price is bandwidth.
 */
function ageHeads(now = Date.now()) {
  if (ripe != null) {
    if (ripe > getCursor()) setCursor(ripe)
    ripe = null
  }
  let ready = null
  while (held.length && now - held[0].at >= CURSOR_LAG_MS) ready = held.shift().rev
  if (ready != null) ripe = ready
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
  held.length = 0
  ripe = null
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
    const ops = readySlice()
    if (!ops.length) return { sent: 0 }
    // Claim them before the first await. A newer edit arriving mid-flight must
    // start its own op rather than being folded into one whose success is about
    // to delete it — see enqueue.
    markSending(ops.map((op) => op.id))
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
          // Network or server trouble. The write itself is fine, so it keeps
          // its place in the queue and simply waits — longer each time.
          //
          // This returns rather than throws on purpose. Throwing meant a
          // struggling server also stopped the device PULLING, so a phone that
          // could not send stopped receiving too, and sat there showing stale
          // chores until the outbox happened to clear.
          recordFailure(op.id, { retryable: true })
          return { sent, error: err }
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
    ageHeads()
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
    // Not setCursor: take the head in hand and write it down a few seconds from
    // now, once anything committing late has landed and the merge above is
    // safely saved. See CURSOR_LAG_MS.
    const head = Number(snapshot.server_rev)
    if (Number.isFinite(head) && head > 0) held.push({ rev: head, at: Date.now() })
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
      const pushed = await push()
      const result = await pull()
      // A send that is waiting its turn again is still an error worth showing,
      // but the pull above ran regardless, so the screen is at least current.
      if (pushed.error) setStatus(SYNC_STATUS.ERROR, pushed.error.message)
      else setStatus(SYNC_STATUS.IDLE)
      return result
    } catch (err) {
      setStatus(err.status === 0 ? SYNC_STATUS.OFFLINE : SYNC_STATUS.ERROR, err.message)
      return { error: err.message }
    } finally {
      inFlight = false
    }
  }

  /** Grows while nothing is happening, resets the moment something does. */
  let quietRounds = 0

  function nextDelay() {
    return Math.min(PULL_VISIBLE_MAX_MS, Math.round(PULL_MIN_MS * BACKOFF ** quietRounds))
  }

  function schedule(delay = nextDelay()) {
    clearTimeout(timer)
    if (!running) return
    timer = setTimeout(tick, delay)
  }

  const isHidden = () => typeof document !== 'undefined' && document.hidden

  async function tick() {
    if (!running) return
    // Nothing queued and nobody looking: skip the round trip entirely. Work
    // waiting in the outbox still goes out, because the person who created it
    // may have pocketed the phone a second later.
    if (isHidden() && readySlice().length === 0) {
      schedule(PULL_HIDDEN_MS)
      return
    }
    const result = await sync({ silent: true })
    // A round that never ran learned nothing, so it must not count as a quiet
    // one. Getting this wrong swallowed wakes: a tap arriving while a slow sync
    // was still in flight would come back "skipped", bump the backoff, and push
    // the next check further away — exactly the opposite of what a tap means.
    if (result?.skipped) {
      schedule(result.skipped === 'in-flight' ? 1000 : PULL_MIN_MS)
      return
    }
    lastSyncAt = Date.now()
    // Work that is deliberately waiting out a backoff does not count as
    // movement: treating it as movement pinned the poll at its fastest rate for
    // as long as the server was unwell, which is the worst possible moment to
    // be asking it the most often.
    const moved = (result?.changed || 0) > 0 || readySlice().length > 0
    quietRounds = moved ? 0 : Math.min(quietRounds + 1, 8)
    schedule()
  }

  function start() {
    if (running || !transport.isConfigured()) return
    running = true
    quietRounds = 0
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pointerdown', onInteract, { capture: true, passive: true })
    window.addEventListener('hashchange', onInteract)
    sync().finally(() => { lastSyncAt = Date.now(); schedule() })
  }

  function stop() {
    running = false
    clearTimeout(timer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pointerdown', onInteract, { capture: true })
    window.removeEventListener('hashchange', onInteract)
  }

  /** Back to the fast cadence, and go now. */
  function wake() {
    quietRounds = 0
    schedule(0)
  }

  // Coming back from a tunnel, switching back to the tab, or just touching the
  // screen are the moments a person most expects to see fresh data — and the
  // ones worth paying for. Touch is rate-limited to the fast interval so that
  // scrolling a list does not turn into a request per tap.
  let lastSyncAt = 0
  const onOnline = () => wake()
  const onVisible = () => { if (document.visibilityState === 'visible') wake() }
  const onInteract = () => { if (Date.now() - lastSyncAt >= PULL_MIN_MS) wake() }

  return {
    start,
    stop,
    sync,
    wake,
    push,
    pull,
    get status() { return status },
    get lastError() { return lastError },
    get pending() { return readOutbox().length },
  }
}
