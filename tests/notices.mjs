/**
 * A notice is not lost because a phone had no signal.
 *
 * A push was sent the moment something happened, straight from the phone it
 * happened on. A child tapping "I did it!" with no signal lost the notice for
 * good, while the chore itself waited in the outbox and went up later: the
 * parent was never told. And a child's phone, which has no notification
 * settings at all, never asked for a push in the first place, because the
 * request was gated on that phone's own "notifications on".
 *
 * Now the push request waits in the outbox, behind the change it is about.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }

const { enqueue, readOutbox, clearOutbox } = await import('../src/lib/sync/outbox.js')
const { transport } = await import('../src/lib/sync/transport.js')
const { createSyncEngine } = await import('../src/lib/sync/syncEngine.js')
const notifications = await import('../src/lib/notifications.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== A child\'s phone asks for the push, whatever its own settings ===')
const routeNotice = notifications.routeNotice
ok('there is one place that decides', typeof routeNotice === 'function')
if (routeNotice) {
  const submitted = { role: 'parent', kind: 'submission', args: ['Ava', 'Make the bed'] }
  const onKidPhone = routeNotice(submitted, { deviceRole: 'kid', showHere: false, pushReady: true })
  ok('a child who never turned notifications on still tells their parent', onKidPhone.remote === true, JSON.stringify(onKidPhone))
  const approved = { role: 'kid', kidId: 'k1', kind: 'approved', args: ['Make the bed', 45] }
  const onParentPhone = routeNotice(approved, { deviceRole: 'parent', showHere: false, pushReady: true })
  ok('nor does a parent\'s own setting decide whether the child is told', onParentPhone.remote === true)
  ok('with no push set up, nothing is asked for',
    routeNotice(submitted, { deviceRole: 'kid', showHere: true, pushReady: false }).remote === false)
  ok('and an unknown notice is nothing at all',
    routeNotice({ role: 'parent', kind: 'nope' }, { deviceRole: 'kid', showHere: true, pushReady: true }).remote === false)
}

console.log('\n=== The phone that did it is not buzzed by its own tap ===')
if (routeNotice) {
  const approved = { role: 'kid', kidId: 'k1', kind: 'approved', args: ['Make the bed', 45] }
  ok('a parent approving on their phone is not told "Approved!" on it',
    routeNotice(approved, { deviceRole: 'parent', showHere: true, pushReady: true }).local === null)
  const submitted = { role: 'parent', kind: 'submission', args: ['Ava', 'Make the bed'] }
  ok('nor is a child\'s own phone told their parent has something to review',
    routeNotice(submitted, { deviceRole: 'kid', showHere: true, pushReady: true }).local === null)
  const shared = routeNotice(submitted, { deviceRole: 'parent', showHere: true, pushReady: false })
  ok('on a phone the family shares, a chore done in the child\'s view is shown for the parent',
    shared.local?.title === 'Ava finished a quest', JSON.stringify(shared))
  ok('and not when the parent has notifications off',
    routeNotice(submitted, { deviceRole: 'parent', showHere: false, pushReady: false }).local === null)
}

console.log('\n=== With no signal, the notice waits with the chore ===')
clearOutbox()
let online = false
const calls = []
transport.isConfigured = () => true
transport.currentUserId = () => 'u-test'
transport.rpc = async (fn) => {
  if (!online) throw Object.assign(new Error('Failed to fetch'), { status: 0, retryable: true })
  calls.push(`rpc:${fn}`)
  return { ok: true }
}
let noticeAnswer = 'sent'
const sendNotice = async (notice) => {
  if (!online || noticeAnswer === 'network') {
    throw Object.assign(new Error('The notice could not be sent yet.'), { retryable: true })
  }
  calls.push(`notice:${notice.kind}`)
  return noticeAnswer === 'sent' ? { ok: true, sent: 1 } : { ok: false, reason: noticeAnswer }
}
const engine = createSyncEngine({ dispatch() {}, onStatus() {}, onRefused() {}, sendNotice })

enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: 's1' } })
enqueue({ type: 'notice', notice: { familyId: 'f', role: 'parent', kind: 'submission', args: ['Ava', 'Make the bed'] } })
await engine.push()
ok('nothing is sent while the phone is offline', calls.length === 0, calls.join())
ok('and the notice is still waiting, not thrown away', readOutbox().some((o) => o.type === 'notice'), JSON.stringify(readOutbox()))

// Back in signal, after the backoff.
online = true
const later = readOutbox().map((o) => ({ ...o, nextAttemptAt: 0 }))
localStorage.setItem('rankup.outbox.v1', JSON.stringify(later))
await engine.push()
ok('back in signal, the chore goes up and then the parent is told', calls.join() === 'rpc:submit_quest,notice:submission', calls.join())
ok('once', readOutbox().length === 0, JSON.stringify(readOutbox()))

console.log('\n=== A push that cannot be sent never holds up the chores ===')
clearOutbox()
calls.length = 0
noticeAnswer = 'http_502'
enqueue({ type: 'notice', notice: { familyId: 'f', role: 'kid', kind: 'approved', args: ['Bed', 45] } })
enqueue({ type: 'rpc', fn: 'approve_submission', args: {} })
await engine.push()
ok('an answer from the push sender, even a refusal, is final', !readOutbox().some((o) => o.type === 'notice'), JSON.stringify(readOutbox()))
ok('and what was queued behind it still goes', calls.includes('rpc:approve_submission'), calls.join())

console.log('\n=== No notice about something the server turned down ===')
clearOutbox()
calls.length = 0
noticeAnswer = 'sent'
transport.rpc = async (fn) => {
  calls.push(`rpc:${fn}`)
  if (fn === 'submit_quest') return { ok: false, reason: 'not_open' }
  if (fn === 'approve_submission') throw Object.assign(new Error('submission already decided'), { status: 400, retryable: false })
  return { ok: true }
}
enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: 's-refused' } })
enqueue({ type: 'notice', ref: 's-refused', notice: { familyId: 'f', role: 'parent', kind: 'submission', args: ['Ava', 'Bed'] } })
enqueue({ type: 'rpc', fn: 'approve_submission', args: { p_submission_id: 's-twice' } })
enqueue({ type: 'notice', ref: 's-twice', notice: { familyId: 'f', role: 'kid', kind: 'approved', args: ['Bed', 30] } })
enqueue({ type: 'rpc', fn: 'reject_submission', args: { p_submission_id: 's-fine' } })
enqueue({ type: 'notice', ref: 's-fine', notice: { familyId: 'f', role: 'kid', kind: 'rejected', args: ['Bed'] } })
await engine.push()
ok('a parent is not told about a chore the server did not take', !calls.includes('notice:submission'), calls.join())
ok('a child is not told "Approved!" again when another parent got there first', !calls.includes('notice:approved'), calls.join())
ok('a call that went through still sends its notice', calls.includes('notice:rejected'), calls.join())
ok('and nothing is left waiting', readOutbox().length === 0, JSON.stringify(readOutbox()))

clearOutbox()
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
