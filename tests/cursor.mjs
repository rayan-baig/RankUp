/**
 * The cursor must never step over a change.
 *
 * `rev` comes from a Postgres sequence, and a sequence hands out its number
 * when a write STARTS, not when it commits. So the head the server reports can
 * already be past a row that nobody can see yet. A device that writes that head
 * down straight away will only ever ask for rows newer than it, and the row
 * that commits a heartbeat later is gone for good — a chore approved, XP paid
 * out, and a phone that never hears about it.
 *
 * This runs the real engine against a fake database that deliberately commits
 * one row late, with a clock the test controls.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
// Node already provides a navigator; pull() does not consult it (sync() does).

let clock = 0
const realNow = Date.now
Date.now = () => clock

const { createSyncEngine, getCursor } = await import('../src/lib/sync/syncEngine.js')
const { transport } = await import('../src/lib/sync/transport.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

// The fake database. `rev` is allocated up front; `commitsAt` is when the row
// actually becomes visible — exactly the gap the real sequence leaves open.
const rows = [
  { id: 'q-late', rev: 500, commitsAt: 1000 },  // allocated at t=0, commits at t=1
  { id: 'q-early', rev: 510, commitsAt: 0 },
]
const head = () => Math.max(...rows.map(r => r.rev))

const delivered = []
const cutoffs = []

transport.isConfigured = () => true
transport.currentUserId = () => 'u-test'
transport.rpc = async (fn, args) => {
  if (fn !== 'family_snapshot') throw new Error(`unexpected rpc ${fn}`)
  const since = args.p_since
  cutoffs.push(since)
  const quests = rows.filter(r => r.rev > since && r.commitsAt <= clock)
  return {
    server_rev: head(),
    families: [], kids: [], submissions: [], rewards: [],
    redemptions: [], notes: [], overrides: [], deletions: [],
    quests: quests.map(r => ({ id: r.id, rev: r.rev })),
  }
}

const engine = createSyncEngine({
  dispatch: action => {
    if (action.type !== 'MERGE_SNAPSHOT') return
    for (const q of action.snapshot.quests) delivered.push({ at: clock, id: q.id })
  },
  onStatus: () => {},
})

const pullAt = async t => { clock = t; await engine.pull() }

console.log('\n=== A head is not banked the moment it arrives ===')
await pullAt(0)
ok('the first pull asks from zero', cutoffs[0] === 0)
ok('it sees the row that committed', delivered.some(d => d.id === 'q-early'))
ok('and does not bank the head yet', getCursor() === 0, `cursor is ${getCursor()}`)

console.log('\n=== Nor on a pull that comes straight after ===')
await pullAt(100)
ok('a wake a tenth of a second later banks nothing', getCursor() === 0, `cursor is ${getCursor()}`)

console.log('\n=== The row that committed late is still delivered ===')
// t=1000 is when q-late becomes visible. The next poll is well past the lag,
// which is exactly the moment the old code would have banked 510 and skipped it.
await pullAt(7000)
ok('that pull still asks from the old cursor', cutoffs.at(-1) === 0, `asked from ${cutoffs.at(-1)}`)
ok('so the late commit arrives', delivered.some(d => d.id === 'q-late'))

console.log('\n=== Only then does the cursor move ===')
await pullAt(15000)
ok('the head is banked once a pull has swept under it', getCursor() === 510, `cursor is ${getCursor()}`)
ok('and the next pull asks from it', cutoffs.at(-1) === 510, `asked from ${cutoffs.at(-1)}`)

console.log('\n=== Nothing is ever asked for from beyond what was delivered ===')
const maxDelivered = Math.max(...delivered.map(d => rows.find(r => r.id === d.id).rev))
ok('the cursor never ran ahead of the rows in hand', getCursor() <= maxDelivered)

Date.now = realNow
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
