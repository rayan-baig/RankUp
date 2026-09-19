/**
 * A bad afternoon on the server must not delete a child's work.
 *
 * The outbox used to spend one of eight lives on every failure, whatever the
 * failure was. Eight polls is about a minute, so a minute of the backend being
 * unreachable silently threw away the chore submission the kid had just
 * photographed — and threw away the approval the parent had just tapped — with
 * nothing on screen to say it had happened.
 *
 * Runs the real engine and the real outbox against a transport that fails on
 * demand, on a clock the test drives.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }

let clock = 1_000_000
const realNow = Date.now
Date.now = () => clock

const { createSyncEngine } = await import('../src/lib/sync/syncEngine.js')
const { enqueue, readOutbox, clearOutbox } = await import('../src/lib/sync/outbox.js')
const { transport } = await import('../src/lib/sync/transport.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const retryable = () => Object.assign(new Error('service unavailable'), { retryable: true, status: 503 })
const rejected = () => Object.assign(new Error('violates row-level security'), { retryable: false, status: 403 })

let upsertFails = null
let upserts = 0
let pulls = 0

transport.isConfigured = () => true
transport.currentUserId = () => 'u-test'
transport.upsert = async () => { upserts += 1; if (upsertFails) throw upsertFails() }
transport.rpc = async (fn) => {
  if (fn === 'family_snapshot') { pulls += 1; return null }
  throw new Error(`unexpected rpc ${fn}`)
}

const engine = createSyncEngine({ dispatch: () => {}, onStatus: () => {} })

console.log('\n=== A server having trouble never destroys a queued change ===')
clearOutbox()
upsertFails = retryable
enqueue({ type: 'upsert', table: 'submissions', row: { id: 's1', status: 'pending' } })
for (let i = 0; i < 30; i += 1) {
  clock += 6 * 60_000          // past the longest backoff, so every round really tries
  await engine.sync({ silent: true })
}
ok('the submission is still queued after thirty failed rounds', readOutbox().length === 1,
  `outbox holds ${readOutbox().length}`)
ok('and it really was being retried, not just sitting there', upserts >= 25, `${upserts} attempts`)

console.log('\n=== It is let go only after a full day of failing ===')
clock += 25 * 60 * 60_000
await engine.sync({ silent: true })
ok('a day of nothing but failure finally retires it', readOutbox().length === 0,
  `outbox holds ${readOutbox().length}`)

console.log('\n=== And the device keeps receiving while it cannot send ===')
ok('a failing push did not stop the pull', pulls >= 25, `${pulls} pulls`)

console.log('\n=== The retries space themselves out ===')
clearOutbox(); upserts = 0
enqueue({ type: 'upsert', table: 'submissions', row: { id: 's2', status: 'pending' } })
clock += 1000
await engine.sync({ silent: true })   // first try, fails, backs off
const after = upserts
clock += 1000                          // still inside the backoff
await engine.sync({ silent: true })
ok('a round inside the backoff does not hammer the server', upserts === after, `${upserts} vs ${after}`)
clock += 60_000
await engine.sync({ silent: true })
ok('but once the wait is over it tries again', upserts === after + 1)

console.log('\n=== A newer edit to the same row does not inherit the wait ===')
enqueue({ type: 'upsert', table: 'submissions', row: { id: 's2', status: 'approved' } })
const queued = readOutbox()
ok('the edit folded into the waiting operation', queued.length === 1)
ok('and the wait was cleared with it', !queued[0].nextAttemptAt, `nextAttemptAt=${queued[0].nextAttemptAt}`)

console.log('\n=== A write the server REFUSES is still retired ===')
clearOutbox(); upsertFails = rejected; upserts = 0
enqueue({ type: 'upsert', table: 'kids', row: { id: 'k-not-mine', xp: 99999 } })
clock += 30_000
await engine.sync({ silent: true })
ok('a rejected write is dropped rather than retried forever', readOutbox().length === 0,
  `outbox holds ${readOutbox().length}`)

console.log('\n=== It goes through the moment the server comes back ===')
clearOutbox(); upsertFails = retryable; upserts = 0
enqueue({ type: 'upsert', table: 'submissions', row: { id: 's3', status: 'pending' } })
clock += 1000
await engine.sync({ silent: true })
ok('queued while the server is down', readOutbox().length === 1)
upsertFails = null
clock += 60_000
await engine.sync({ silent: true })
ok('and sent as soon as it recovers', readOutbox().length === 0)

Date.now = realNow
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
