/**
 * The outbox.
 *
 * Every change a device makes is written to its own storage immediately and
 * queued here to be sent. That ordering matters: a kid tapping "I did it!" in
 * a basement with no signal must not lose the submission, and a parent tapping
 * Accept on a train must not have to wait for a round trip. What the app says
 * about it (SyncBadge, QuestDetail) is held to how this behaves: saved on the
 * phone at once, sent in order whenever the app is open and online.
 *
 * The queue survives a reload, drains in order, and drops an operation only
 * once the server has accepted it — or once it has failed so many times that
 * retrying is clearly pointless.
 */

const KEY_BASE = 'rankup.outbox.v1'

/**
 * Two completely different kinds of failure, and they must not share a budget.
 *
 * A REJECTED write — the server understood it and said no — is not going to
 * start working. A handful of tries and it is retired, loudly.
 *
 * A failed CONNECTION, or a server that is having a bad afternoon, says nothing
 * about the write at all. Counting those the same way was how a child's chore
 * submission could be destroyed: eight polls is about a minute, so one minute
 * of the backend being down silently deleted the chore they had just sent,
 * with nothing on screen to say so. A retryable failure now only ever makes the
 * queue WAIT — longer each time, up to five minutes — and an operation is
 * abandoned for this reason only after a full day of failing, which is well
 * past the point where the data was still worth anything.
 */
const MAX_ATTEMPTS = 8
const RETRY_BASE_MS = 4000
const RETRY_MAX_MS = 5 * 60 * 1000
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000
/**
 * And a day is a day of TRYING, not a day on the calendar.
 *
 * The clock started at the first failure and nothing else counted, so a phone
 * that failed once, sat in a drawer for a month and failed once more on
 * waking threw the write away on that second try. Failing to reach anything
 * at all (no signal, a captive wifi page) does not start the clock either:
 * that is the phone being offline, not the write failing, and a phone offline
 * for thirty days must still deliver everything it did in them.
 */
const MIN_TRIES_BEFORE_GIVING_UP = 30

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

  if (op.type === 'upsert' || op.type === 'patch') {
    const index = ops.findIndex(
      (o) => (o.type === 'upsert' || o.type === 'patch') && o.table === op.table && o.row?.id === op.row?.id
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
      // attempts count would retire a brand-new write after one or two tries,
      // and inheriting a backoff would sit a brand-new write out for minutes.
      // A patch carries only the columns that changed, so two of them add up
      // rather than the second replacing the first. A whole row (a new one,
      // not yet on the server) stays a whole row, with the change folded in.
      const waiting = ops[index]
      const type = waiting.type === 'upsert' || op.type === 'upsert' ? 'upsert' : 'patch'
      ops[index] = { ...waiting, type, row: { ...waiting.row, ...op.row }, attempts: 0 }
      delete ops[index].nextAttemptAt
      delete ops[index].firstFailedAt
      return writeOutbox(ops) ? ops[index] : null
    }
  }

  // A repeated call with the same fold key replaces the one already waiting.
  // A child flicking through themes should send one set_kid_look, not nine.
  if (op.type === 'rpc' && op.foldKey) {
    const index = ops.findIndex((o) => o.foldKey === op.foldKey && !o.sending)
    if (index !== -1) {
      ops[index] = { ...ops[index], args: op.args, attempts: 0 }
      delete ops[index].nextAttemptAt
      delete ops[index].firstFailedAt
      return writeOutbox(ops) ? ops[index] : null
    }
  }

  ops.push(entry)
  // Returns null when the write failed — a full phone is an expected state
  // for an app that keeps a family's history in localStorage. The caller must not record
  // this row as queued when it is not.
  return writeOutbox(ops) ? entry : null
}

/**
 * Nothing is in flight when a page starts.
 *
 * `sending` is written to storage, so a browser killed mid-send (a phone
 * reclaiming memory, a swipe away) left it set for ever: the op was still
 * sent again, as it must be, but no later edit to that row could ever fold
 * into it again. Called once, when the engine is made.
 */
export function releaseSending() {
  const ops = readOutbox()
  if (!ops.some((o) => o.sending)) return
  writeOutbox(ops.map((o) => {
    if (!o.sending) return o
    const { sending: _sending, ...rest } = o
    void _sending
    return rest
  }))
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

/**
 * Note that an operation did not go through.
 *
 * `retryable` is the whole point of this function: see MAX_ATTEMPTS above. A
 * retryable failure sets a time to try again rather than spending a life.
 */
export function recordFailure(id, { retryable = false, auth = false, network = false } = {}) {
  const ops = readOutbox()
  const op = ops.find((o) => o.id === id)
  if (!op) return { dead: false }
  op.attempts = (op.attempts || 0) + 1
  // It is not in flight any more. Leaving this set meant every later edit to
  // the same row had to queue a separate operation instead of folding in.
  delete op.sending
  let dead
  if (retryable) {
    // Waiting for somebody to sign in again is not the write failing: it
    // must not count towards the day after which the write is given up.
    // Nor is having no connection at all; see MIN_TRIES_BEFORE_GIVING_UP.
    if (!auth && !network) {
      op.firstFailedAt = op.firstFailedAt || Date.now()
      op.serverFailures = (op.serverFailures || 0) + 1
    }
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(op.attempts - 1, 10))
    op.nextAttemptAt = Date.now() + wait
    dead = Boolean(op.firstFailedAt) && Date.now() - op.firstFailedAt >= GIVE_UP_AFTER_MS
      && (op.serverFailures || 0) >= MIN_TRIES_BEFORE_GIVING_UP
    if (dead) {
      console.warn(
        `[RankUp] Giving up on ${op.type} ${op.table || op.fn} after a day of failing to reach the server.`,
      )
    }
  } else {
    dead = op.attempts >= MAX_ATTEMPTS
  }
  writeOutbox(dead ? ops.filter((o) => o.id !== id) : ops)
  return { dead, attempts: op.attempts, retryAt: op.nextAttemptAt }
}

/**
 * The operations that may be sent right now, in order, stopping at the first
 * one that is still waiting out a backoff.
 *
 * Stopping rather than skipping is deliberate. A submission and the approval
 * that answers it have to arrive in that order, so nothing may overtake an
 * operation that is merely resting.
 */
export function readySlice(now = Date.now()) {
  const ops = readOutbox()
  const ready = []
  for (const op of ops) {
    if (op.nextAttemptAt && op.nextAttemptAt > now) break
    ready.push(op)
  }
  return ready
}

export function clearOutbox() {
  writeOutbox([])
}

export const OUTBOX_MAX_ATTEMPTS = MAX_ATTEMPTS
