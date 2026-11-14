/**
 * Unique ids.
 *
 * These are real UUIDs, generated on the device. That matters for two reasons:
 *
 *   - Two phones create rows at the same time without coordinating, so ids have
 *     to be unique without a central authority handing them out. A counter
 *     would collide the moment a second device existed.
 *   - The database columns are `uuid`. An id like "kid_m4x1" is rejected, which
 *     is exactly what happened the first time sync was switched on.
 *
 * The `prefix` argument is kept for readability at call sites (`uid('quest')`)
 * and deliberately does not appear in the value.
 */
export function uid(prefix = 'id') {
  void prefix
  if (scope) return derivedId(scope)
  return freshUid()
}

function freshUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()

  // Older browsers: build a v4 UUID from whatever randomness is available.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** True for anything this app would accept as a row id. */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
}

/*
 * One action, one outcome, however many times it is worked out.
 *
 * React may run the reducer for a single dispatched action more than once. A
 * tap that lands while an update from a timer or the network is still waiting
 * (a level-up closing itself, a pull arriving, history being pruned) is worked
 * out first on its own, committed, and then worked out again on top of the
 * update that was waiting. That second run is React's, not ours, and is meant
 * to give the same answer. Ours did not: every run drew a new id and read the
 * clock again. The first run's purchase went into the outbox and reached the
 * server; the second run's took its place on the screen with a different id,
 * was never sent, and the next pull brought the first one back beside it. One
 * tap, two purchases, and "Mark given" handing over the one the server had
 * never heard of. tests/oncetap.mjs taps as a moment closes to show it.
 *
 * So inside the reducer an action carries its own ids and its own time,
 * drawn the first time it is worked out and the same every time after: uid()
 * hands out the action's ids in order, and now() its moment. A rerun makes the
 * same purchase, with the same id, at the same time, and the server already
 * treats a repeated id as the same purchase.
 */
const stamps = new WeakMap()
let scope = null

/** The time inside the reducer: the action's own. Outside it, the clock. */
export function now() {
  return scope ? scope.at : Date.now()
}

/**
 * Run `fn` (the reducer, for `action`) with that action's ids and time.
 *
 * Keyed on the action object, which React keeps and hands back for every run.
 * A call made while one is already running (an action that reduces another)
 * shares the outer one's: its inner action is a new object every run, so it
 * could not be recognised on its own.
 */
export function forAction(action, fn) {
  if (scope || !action || typeof action !== 'object') return fn()
  let stamp = stamps.get(action)
  if (!stamp) {
    stamp = { seed: freshUid(), at: Date.now() }
    stamps.set(action, stamp)
  }
  scope = { ...stamp, n: 0 }
  try {
    return fn()
  } finally {
    scope = null
  }
}

/**
 * The action's next id: its seed with the last twelve hex digits counted on.
 * Still a version 4 UUID; a different action has a different random seed.
 */
function derivedId(s) {
  const n = s.n
  s.n += 1
  const node = (parseInt(s.seed.slice(24), 16) + n) % 2 ** 48
  return `${s.seed.slice(0, 24)}${node.toString(16).padStart(12, '0')}`
}
