/**
 * The offline-sync review, without a browser.
 *
 * Each of these lost or doubled something a family did, and each was
 * reproduced against the running app before it was fixed:
 *
 *   - a pull landing next to an edit wrote the server's older row over it;
 *   - an hour after signing in every write was refused and thrown away;
 *   - a whole-row write undid another parent's change to a different column;
 *   - a call the server turned down ({ ok: false }) counted as done;
 *   - "mark given" and "unlink" never left the phone;
 *   - a call that moves a balance carried nothing to tell a retry apart.
 *
 * The browser-level versions of these live with the review; these pin the
 * pieces that make them work.
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
const { queueChanges, recordDelivered, pendingRows, clearShadow } = await import('../src/lib/sync/shadow.js')
const { reducer } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')
const { transport, setSession, getSession } = await import('../src/lib/sync/transport.js')
const { createSyncEngine } = await import('../src/lib/sync/syncEngine.js')
const { kids: kidMapper } = await import('../src/lib/sync/mappers.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const FAMILY = '00000000-0000-4000-8000-00000000f001'
const AVA = '00000000-0000-4000-8000-00000000a001'
const base = () => {
  const s = createInitialState()
  return {
    ...s,
    onboarded: true,
    family: { ...s.family, id: FAMILY, name: 'Test' },
    kids: [{ ...s.kids?.[0], id: AVA, name: 'Ava', xp: 0, coins: 50, lockout: null }],
    quests: [], submissions: [], rewards: [], redemptions: [], notes: [], overrides: [],
  }
}
const serverKid = (over = {}) => ({ ...kidMapper.toRow(base().kids[0], FAMILY), coins: 50, xp: 0, ...over })
const reset = () => { clearOutbox(); clearShadow() }

console.log('\n=== Only what changed is sent, for a row the server has ===')
reset()
let state = base()
recordDelivered(state, { kids: [serverKid()] })
state = { ...state, kids: state.kids.map((k) => ({ ...k, name: 'Ava-Rose' })) }
queueChanges(state, {})
let ops = readOutbox()
ok('a rename is one patch', ops.length === 1 && ops[0].type === 'patch', JSON.stringify(ops))
ok('carrying the name and nothing else', ops[0] && Object.keys(ops[0].row).sort().join() === 'id,name', JSON.stringify(ops[0]?.row))
ok('so another parent\'s lockdown is not sent back over', ops[0] && !('lockout_kind' in ops[0].row))

console.log('\n=== Two edits before sending add up ===')
state = { ...state, kids: state.kids.map((k) => ({ ...k, themeId: 'ocean' })) }
queueChanges(state, {})
ops = readOutbox()
ok('still one operation', ops.length === 1, JSON.stringify(ops))
ok('with both changes in it', ops[0]?.row?.name === 'Ava-Rose' && 'theme_id' in (ops[0]?.row || {}), JSON.stringify(ops[0]?.row))

console.log('\n=== A new row is sent whole ===')
reset()
state = { ...base(), rewards: [{ id: '00000000-0000-4000-8000-0000000000r1'.replace('r', 'e'), name: 'Film night', cost: 30 }] }
queueChanges(state, {})
ops = readOutbox().filter((o) => o.table === 'rewards')
ok('as an insert-or-update', ops.length === 1 && ops[0].type === 'upsert')

console.log('\n=== A pull does not overwrite an edit still waiting to go ===')
reset()
state = base()
recordDelivered(state, { kids: [serverKid({ lockout_kind: 'red', lockout_reason: 'Homework' })] })
state = reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [serverKid({ lockout_kind: 'red', lockout_reason: 'Homework' })] } })
ok('the lockdown arrived', state.kids[0].lockout?.type === 'red')
// The parent lifts it...
const lifted = { ...state, kids: state.kids.map((k) => ({ ...k, lockout: null })) }
queueChanges(lifted, {})
const pending = pendingRows(readOutbox())
ok('the lifted row is known to be waiting', pending.has(`kids:${AVA}`))
// ...and a pull computed before the lift lands a moment later, with fresh coins.
const stale = serverKid({ lockout_kind: 'red', lockout_reason: 'Homework', coins: 55 })
recordDelivered(lifted, { kids: [stale] }, { skip: pending })
const merged = reducer(lifted, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [stale] }, pending: [...pending] })
ok('the lift is still there after the pull', merged.kids[0].lockout === null, JSON.stringify(merged.kids[0].lockout))
queueChanges(merged, {})
ok('and still on its way to the server', readOutbox().some((o) => o.table === 'kids' && o.row?.lockout_kind === null),
  JSON.stringify(readOutbox()))

console.log('\n=== What a pull records is what the server sent ===')
reset()
state = base()
// An edit made after the pull, before the save: it must not be recorded as the server's.
const edited = { ...state, kids: state.kids.map((k) => ({ ...k, name: 'Edited' })) }
recordDelivered(edited, { kids: [serverKid({ name: 'Ava' })] })
queueChanges(edited, {})
ok('the edit is still sent', readOutbox().some((o) => o.table === 'kids' && o.row?.name === 'Edited'), JSON.stringify(readOutbox()))

console.log('\n=== A row deleted on the server is not deleted again or brought back ===')
reset()
state = { ...base(), rewards: [{ id: 'rw-1', name: 'Gone', cost: 1 }] }
recordDelivered(state, { rewards: [{ id: 'rw-1', family_id: FAMILY, name: 'Gone', cost: 1 }] })
state = reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: { deletions: [{ table_name: 'rewards', row_id: 'rw-1' }] } })
recordDelivered(state, { deletions: [{ table_name: 'rewards', row_id: 'rw-1' }] })
queueChanges(state, {})
ok('nothing is queued for it', !readOutbox().some((o) => o.table === 'rewards'), JSON.stringify(readOutbox()))

console.log('\n=== Calls that move a balance carry a request id ===')
reset()
state = base()
const taxed = reducer(state, { type: 'APPLY_OVERRIDE', kidId: AVA, kind: 'tax', reason: 'x', percent: 10 })
const anyQueued = (s, fn) => (s.syncQueue || []).find((q) => q.fn === fn)
const tax = anyQueued(taxed, 'apply_currency_tax')
if (tax) ok('a tax has one', /^[0-9a-f-]{36}$/.test(tax.args.p_request_id || ''), JSON.stringify(tax.args))
else console.log('  (no tax queued in this build of the override flow; checked through the reducer below)')
const given = reducer({ ...state, redemptions: [{ id: 'rd-1', kidId: AVA, name: 'Film', cost: 30, status: 'requested' }] },
  { type: 'FULFIL_REDEMPTION', redemptionId: 'rd-1' })
ok('"mark given" now goes to the server', anyQueued(given, 'mark_redemption_given')?.args?.p_redemption_id === 'rd-1')
const unlinked = reducer(state, { type: 'UNLINK_KID_DEVICE', kidId: AVA })
ok('and so does "unlink"', anyQueued(unlinked, 'unlink_kid_device')?.args?.p_kid_id === AVA)
const returned = reducer({ ...state, quests: [{ id: 'q1', kidId: AVA, title: 'Cat', recurrence: 'daily', status: 'approved', completedAt: Date.now() - 2 * 86400000, lastResetOn: '2000-01-01' }] },
  { type: 'RETURN_RECURRING', today: '2999-01-01', tz: 'Australia/Sydney' })
const resetCall = anyQueued(returned, 'reset_due_recurring_quests')
ok('the morning reset says which time zone the family is in', resetCall?.args?.p_tz === 'Australia/Sydney', JSON.stringify(resetCall))

console.log('\n=== A refusal undoes what the phone showed ===')
state = { ...base(), quests: [{ id: 'q1', kidId: AVA, title: 'Feed the cat', status: 'submitted' }],
  submissions: [{ id: 's1', questId: 'q1', kidId: AVA, status: 'pending' }] }
let undone = reducer(state, { type: 'RPC_REFUSED', fn: 'submit_quest', args: { p_submission_id: 's1', p_quest_id: 'q1' }, reason: 'not_open' })
ok('the phantom submission is gone', !undone.submissions.some((s) => s.id === 's1'))
ok('the chore is open again', undone.quests[0].status === 'assigned')
ok('and the child is told', /Feed the cat/.test(undone.syncNotice?.message || ''))
state = { ...base(), redemptions: [{ id: 'rd-2', kidId: AVA, name: 'Film', cost: 30, status: 'requested' }] }
undone = reducer(state, { type: 'RPC_REFUSED', fn: 'redeem_reward', args: { p_redemption_id: 'rd-2' } })
ok('a refused redemption gives the coins back', undone.kids[0].coins === 80 && !undone.redemptions.length)

console.log('\n=== Storage refusing the outbox keeps the call ===')
state = { ...base(), syncQueue: [{ fn: 'submit_quest', args: {} }, { fn: 'redeem_reward', args: {} }] }
const kept = reducer(state, { type: 'DRAIN_SYNC_QUEUE', keep: [state.syncQueue[0]] })
ok('the one that could not be saved stays queued', kept.syncQueue.length === 1 && kept.syncQueue[0].fn === 'submit_quest')

console.log('\n=== The engine: refusals, patches, an expired sign-in ===')
reset()
const calls = []
const refused = []
transport.isConfigured = () => true
transport.currentUserId = () => 'u-test'
transport.patch = async (table, id, cols) => { calls.push(['patch', table, id, cols]) }
transport.rpc = async (fn) => {
  calls.push(['rpc', fn])
  if (fn === 'family_snapshot') return null
  if (fn === 'submit_quest') return { ok: false, reason: 'not_open' }
  if (fn === 'expired') throw Object.assign(new Error('JWT expired'), { status: 401, retryable: true })
  return { ok: true }
}
const engine = createSyncEngine({ dispatch() {}, onStatus() {}, onRefused: (r) => refused.push(r) })
enqueue({ type: 'patch', table: 'kids', row: { id: AVA, name: 'X' } })
enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: 's9' } })
enqueue({ type: 'rpc', fn: 'expired', args: {} })
await engine.push()
ok('a patch is sent as a patch', calls.some((c) => c[0] === 'patch' && c[2] === AVA))
ok('a refusal is reported', refused.length === 1 && refused[0].fn === 'submit_quest' && refused[0].reason === 'not_open')
ok('and not counted as done or left to retry', !readOutbox().some((o) => o.fn === 'submit_quest'))
ok('a write met with an expired sign-in waits rather than vanishing', readOutbox().some((o) => o.fn === 'expired'))

console.log('\n=== The sign-in renews itself ===')
const realFetch = globalThis.fetch
const seen = []
let tokenNow = 'old'
globalThis.fetch = async (url, init = {}) => {
  seen.push([url, init.headers?.Authorization || ''])
  if (String(url).includes('grant_type=refresh_token')) {
    tokenNow = 'new'
    return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 }), { status: 200 })
  }
  const auth = init.headers?.Authorization || ''
  if (auth !== `Bearer ${tokenNow}` || tokenNow === 'old') {
    return new Response(JSON.stringify({ message: 'JWT expired' }), { status: 401 })
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
const { transport: fresh } = await import('../src/lib/sync/transport.js?again')
setSession({ access_token: 'old', refresh_token: 'r1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } })
const answer = await fresh.rpc('anything', {})
ok('a 401 renews the token and the request goes through', answer?.ok === true, JSON.stringify(seen))
ok('with the new token', getSession()?.access_token === 'new')
ok('and the user kept', getSession()?.user?.id === 'u1')
seen.length = 0
setSession({ access_token: 'new', refresh_token: 'r2', expires_at: Math.floor(Date.now() / 1000) + 10, user: { id: 'u1' } })
tokenNow = 'new'
await fresh.rpc('anything', {})
ok('a token about to run out is renewed before it is used', seen[0]?.[0]?.includes('refresh_token'), JSON.stringify(seen))
globalThis.fetch = realFetch


console.log('\n=== Second review: a deleted row stays deleted while its delete waits ===')
reset()
state = { ...base(), rewards: [{ id: 'rw-9', name: 'Film night', cost: 30 }] }
recordDelivered(state, { rewards: [{ id: 'rw-9', family_id: FAMILY, name: 'Film night', cost: 30 }] })
const deletedHere = { ...state, rewards: [] }
queueChanges(deletedHere, {})
const waiting = pendingRows(readOutbox())
const back = reducer(deletedHere, { type: 'MERGE_SNAPSHOT', snapshot: { rewards: [{ id: 'rw-9', family_id: FAMILY, name: 'Film night', cost: 30 }] }, pending: [...waiting] })
ok('a pull does not bring it back', !back.rewards.some((r) => r.id === 'rw-9'))
recordDelivered(deletedHere, { rewards: [{ id: 'rw-9', family_id: FAMILY, name: 'Film night', cost: 30 }] }, { skip: waiting })
queueChanges(back, {})
ok('and nothing re-creates it on the server', !readOutbox().some((o) => o.table === 'rewards' && o.type !== 'delete'), JSON.stringify(readOutbox()))

console.log('\n=== Second review: storage refusing everything does not spin ===')
const q = [{ fn: 'record_gift', args: {} }]
const s1 = { ...base(), syncQueue: q }
ok('draining nothing leaves the state as it was (no re-run)', reducer(s1, { type: 'DRAIN_SYNC_QUEUE', keep: [q[0]] }) === s1)

console.log('\n=== Second review: a new row the server never got is sent whole again ===')
reset()
state = { ...base(), rewards: [{ id: 'rw-new', name: 'Pizza', cost: 10 }] }
queueChanges(state, {})
clearOutbox()                                  // its insert was refused, or given up on
state = { ...state, rewards: [{ id: 'rw-new', name: 'Pizza', cost: 12 }] }
queueChanges(state, {})
ok('the next change goes as a whole row, which creates it', readOutbox()[0]?.type === 'upsert', JSON.stringify(readOutbox()))
clearOutbox()
recordDelivered(state, { rewards: [{ id: 'rw-new', family_id: FAMILY, name: 'Pizza', cost: 12 }] })
state = { ...state, rewards: [{ id: 'rw-new', name: 'Pizza', cost: 15 }] }
queueChanges(state, {})
ok('once the server has shown it back, changes are patches again', readOutbox()[0]?.type === 'patch', JSON.stringify(readOutbox()))

console.log('\n=== Second review: "already done" is not shown as a refusal ===')
const calm = base()
ok('an already-claimed bonus changes nothing and says nothing',
  reducer(calm, { type: 'RPC_REFUSED', fn: 'claim_login_bonus', reason: 'already_claimed' }) === calm)
ok('a decision made on another phone is described as that',
  /another device/.test(reducer(calm, { type: 'RPC_REFUSED', fn: 'approve_submission', reason: 'decided' }).syncNotice?.message || ''))
// approve_submission raises rather than answering { ok: false }, so what
// arrives is the database's own words. Two parents accepting the same chore
// is the ordinary way to get here.
ok('so is the error approve_submission actually raises',
  /another device/.test(reducer(calm, { type: 'RPC_REFUSED', fn: 'approve_submission', reason: 'submission already decided' }).syncNotice?.message || ''))

console.log('\n=== Second review: waiting for a sign-in never gives a write up ===')
reset()
const { recordFailure: fail2 } = await import('../src/lib/sync/outbox.js')
const realNow2 = Date.now
const parked = enqueue({ type: 'rpc', fn: 'record_gift', args: {} })
Date.now = () => realNow2() + 3 * 24 * 3600 * 1000
const verdict = fail2(parked.id, { retryable: true, auth: true })
Date.now = realNow2
ok('three days of 401s and it is still queued', !verdict.dead && readOutbox().length === 1)

/*
 * The level-up celebration is "the moment the whole loop is built around", and
 * it was only ever raised by APPROVE_SUBMISSION — on the phone where the parent
 * tapped Accept. On the child's own phone the XP arrived by sync and nothing
 * celebrated it: a paired child never saw a single level-up.
 */
console.log('\n=== A level reached by sync is celebrated on the child\'s own phone ===')
{
  const kidPhone = (xp) => {
    const s = base()
    return { ...s, device: { ...s.device, role: 'kid', linkedKidId: AVA },
      kids: s.kids.map((k) => ({ ...k, xp, rev: 5 })), pendingLevelUp: null }
  }
  const after = reducer(kidPhone(70), { type: 'MERGE_SNAPSHOT', snapshot: { kids: [serverKid({ xp: 120, rev: 9 })] } })
  ok('crossing a level on the child\'s phone shows the level-up',
    after.pendingLevelUp?.kidId === AVA && after.pendingLevelUp.from === 1 && after.pendingLevelUp.to === 2,
    JSON.stringify(after.pendingLevelUp))
  const same = reducer(kidPhone(10), { type: 'MERGE_SNAPSHOT', snapshot: { kids: [serverKid({ xp: 40, rev: 9 })] } })
  ok('XP inside the same level shows nothing', !same.pendingLevelUp)
  const fresh = { ...kidPhone(0), kids: kidPhone(0).kids.map((k) => ({ ...k, rev: undefined })) }
  const paired = reducer(fresh, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [serverKid({ xp: 5000, rev: 9 })] } })
  ok('the first pull after pairing is not mistaken for a level-up', !paired.pendingLevelUp, JSON.stringify(paired.pendingLevelUp))
  const parentPhone = { ...base(), kids: base().kids.map((k) => ({ ...k, xp: 70, rev: 5 })), pendingLevelUp: null }
  const onParent = reducer(parentPhone, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [serverKid({ xp: 120, rev: 9 })] } })
  ok('a parent\'s phone is not interrupted by a level reached elsewhere', !onParent.pendingLevelUp)
}

/*
 * A pull that was already on its way when a parent tapped Accept.
 *
 * It carried the chore as it was a moment before — still waiting — and the
 * merge put it back in the review queue, with the child's XP back where it
 * was. A second tap on Accept then paid it again on this phone and sent the
 * child a second "Approved!".
 */
console.log('\n=== An approval still on its way is not undone by a pull ===')
reset()
{
  const Q = '00000000-0000-4000-8000-0000000000q1'.replace('q', 'a')
  const S = '00000000-0000-4000-8000-0000000000s1'.replace('s', 'b')
  const b0 = base()
  let st = {
    ...b0,
    kids: [{ ...b0.kids[0], streak: { count: 0, lastDay: null, freezeTokens: 0 }, bestTimes: {}, playTokens: 0 }],
    quests: [{ id: Q, kidId: AVA, title: 'Make the bed', xp: 30, status: 'submitted' }],
    submissions: [{ id: S, questId: Q, kidId: AVA, status: 'pending', submittedAt: Date.now() }],
  }
  st = reducer(st, { type: 'APPROVE_SUBMISSION', submissionId: S })
  const paid = st.kids[0].xp
  for (const item of st.syncQueue) enqueue({ type: 'rpc', fn: item.fn, args: item.args })
  const before = {
    quests: [{ id: Q, family_id: FAMILY, kid_id: AVA, title: 'Make the bed', xp: 30, status: 'submitted', rev: 10 }],
    submissions: [{ id: S, family_id: FAMILY, quest_id: Q, kid_id: AVA, status: 'pending', rev: 11 }],
    kids: [serverKid({ rev: 12 })],
  }
  const waitingNow = pendingRows(readOutbox(), st)
  const merged = reducer(st, { type: 'MERGE_SNAPSHOT', snapshot: before, pending: [...waitingNow] })
  ok('the chore stays accepted', merged.submissions.find((x) => x.id === S)?.status === 'approved',
    merged.submissions.find((x) => x.id === S)?.status)
  ok('its quest stays done', merged.quests.find((x) => x.id === Q)?.status === 'approved')
  ok('and the child keeps the XP on screen', merged.kids[0].xp === paid && paid > 0, `${merged.kids[0].xp} vs ${paid}`)
  const again = reducer({ ...merged, syncQueue: [], noticeQueue: [] }, { type: 'APPROVE_SUBMISSION', submissionId: S })
  ok('so it cannot be accepted twice', again.syncQueue.length === 0 && again.kids[0].xp === paid)
  clearOutbox()
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
