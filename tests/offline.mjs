/**
 * The phone's half of the promises: what a device does on its own clock, in
 * its own storage, with or without a connection.
 *
 * Run under a time zone that changes its clocks (the npm script sets
 * America/New_York), because the daylight-saving checks below are about the
 * phone's own calendar. The database's half is tests/guarantees.mjs.
 *
 *   - streaks and the streak freeze, mirrored from approve_submission
 *   - a daily chore across both clock changes; a child abroad
 *   - a timed chore stopped exactly at the deadline
 *   - "send back" leaving the chore as it was
 *   - thirty days offline, a browser killed mid-send, a phone waking after
 *     days asleep with an expired sign-in
 *   - a phone that is no longer in a family erasing itself, fully
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size },
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }

let clock = Date.UTC(2026, 9, 1, 12)
const realNow = Date.now
Date.now = () => clock

const { liveStreak, finishedOnTime } = await import('../src/lib/xp.js')
const { daysBetween } = await import('../src/lib/dates.js')
const { recurrenceDue, dayOf } = await import('../src/lib/recurrence.js')
const { reducer, bumpStreak } = await import('../src/state/reducer.js')
const { createInitialState, makeKid } = await import('../src/state/initialState.js')
const { createSyncEngine, getCursor, setCursor } = await import('../src/lib/sync/syncEngine.js')
const { enqueue, readOutbox, clearOutbox } = await import('../src/lib/sync/outbox.js')
const { transport, setSession, getSession } = await import('../src/lib/sync/transport.js')
const { saveState, wipeDevice } = await import('../src/lib/storage.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York') {
  console.log('  (run with TZ=America/New_York — the clock-change checks need a zone that changes)')
}

/* ================================================================== */
console.log('\n=== The streak freeze, on the phone, matches the server ===')
{
  const s = { count: 6, lastDay: '2026-10-05', freezeTokens: 1 }
  ok('one missed day with a freeze: still alive on screen', liveStreak(s, '2026-10-07') === 6)
  ok('two missed days: gone', liveStreak(s, '2026-10-08') === 0)
  ok('one missed day and no freeze: gone', liveStreak({ ...s, freezeTokens: 0 }, '2026-10-07') === 0)
  const bumped = bumpStreak(s, '2026-10-07')
  ok('the next approval spends it and carries on (6 -> 7)', bumped.count === 7 && bumped.freezeTokens === 0 && bumped.lastDay === '2026-10-07')
  ok('yesterday is not a missed day: the freeze is kept', bumpStreak(s, '2026-10-06').freezeTokens === 1)
  ok('two missed days start again and keep the freeze', bumpStreak(s, '2026-10-08').count === 1 && bumpStreak(s, '2026-10-08').freezeTokens === 1)

  // The reducer's Accept spends it the same way and says so in the history.
  // The reducer reads the real calendar (new Date()), not the test's clock.
  const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const kid = { ...makeKid({ name: 'Ava' }), id: 'k1', streak: { count: 6, lastDay: dayOf(twoDaysAgo), freezeTokens: 1 } }
  const base = createInitialState()
  let state = { ...base, family: { ...base.family, tier: 'standard', trialTier: null }, kids: [kid],
    quests: [{ id: 'q1', kidId: 'k1', title: 'Feed the cat', xp: 20, status: 'submitted' }],
    submissions: [{ id: 's1', questId: 'q1', kidId: 'k1', status: 'pending' }] }
  state = reducer(state, { type: 'APPROVE_SUBMISSION', submissionId: 's1' })
  const after = state.kids[0]
  ok('accepting a chore after one missed day spends the freeze on the phone too', after.streak.count === 7 && after.streak.freezeTokens === 0)
  ok('and pays the streak bonus the server will (+10%)', after.xp === 22, `xp ${after.xp}`)
  ok('the parent\'s history says a freeze was used', state.events.some((e) => e.type === 'streak_freeze'))
}

/* ================================================================== */
console.log('\n=== A daily chore across the clock changes, on the phone\'s calendar ===')
{
  ok('the day before and after spring forward are two days apart', daysBetween('2026-03-07', '2026-03-09') === 2)
  ok('and across fall back too', daysBetween('2026-10-31', '2026-11-02') === 2)
  for (const [label, from, to] of [['spring forward', '2026-03-06T05:00:00Z', '2026-03-10T04:00:00Z'],
    ['fall back', '2026-10-30T04:00:00Z', '2026-11-03T05:00:00Z']]) {
    let quest = { recurrence: 'daily', status: 'approved', completedAt: Date.parse(from), lastResetOn: null }
    const perDay = {}
    for (let t = Date.parse(from); t <= Date.parse(to); t += 15 * 60_000) {
      const today = dayOf(new Date(t))
      if (recurrenceDue(quest, today)) {
        perDay[today] = (perDay[today] || 0) + 1
        // Back on the list, and done a minute later.
        quest = { ...quest, status: 'approved', lastResetOn: today, completedAt: t + 60_000 }
      }
    }
    const days = Object.keys(perDay)
    ok(`${label}: back exactly once on each of ${days.length} days, never twice, none skipped`,
      days.length === 4 && Object.values(perDay).every((c) => c === 1), JSON.stringify(perDay))
  }
  // Came back on Monday, only done on Wednesday: not back again on Wednesday.
  const late = { recurrence: 'daily', status: 'approved', lastResetOn: '2026-09-07', completedAt: Date.parse('2026-09-09T15:00:00Z') }
  ok('a daily chore done two days late is not back the same day', !recurrenceDue(late, '2026-09-09') && recurrenceDue(late, '2026-09-10'))
  // A streak counted across the change is not broken by a 23-hour day.
  ok('a streak survives the 23-hour day', liveStreak({ count: 5, lastDay: '2026-03-07', freezeTokens: 0 }, '2026-03-08') === 5)
}

/* ================================================================== */
console.log('\n=== A child abroad ===')
{
  // The phone counts days on its own calendar, wherever it is.
  ok('east: yesterday in the new zone keeps the streak alive', liveStreak({ count: 4, lastDay: '2026-10-01', freezeTokens: 0 }, '2026-10-02') === 4)
  ok('west: a last day that is "tomorrow" here is not a broken streak',
    liveStreak({ count: 4, lastDay: '2026-10-03', freezeTokens: 0 }, '2026-10-02') === 4)
  ok('and the next approval there keeps it rather than restarting',
    bumpStreak({ count: 4, lastDay: '2026-10-03', freezeTokens: 0 }, '2026-10-02').count === 4)
}

/* ================================================================== */
console.log('\n=== A timed chore stopped exactly at the deadline ===')
{
  ok('5:00.000 on a five-minute chore is on time', finishedOnTime(300, 300000))
  ok('5:00.001 is not', !finishedOnTime(300, 300001))
  ok('a clock never started is not', !finishedOnTime(300, 0))
  ok('a chore with no timer is always on time', finishedOnTime(0, 0))
}

/* ================================================================== */
console.log('\n=== "Send back" leaves the chore as it was, on the phone ===')
{
  const kid = { ...makeKid({ name: 'Ava' }), id: 'k1', xp: 120, coins: 30 }
  const quest = { id: 'q1', kidId: 'k1', title: 'Hoover', xp: 55, difficulty: 'hard', doubleXp: true, timerSeconds: 600,
    recurrence: 'weekly', pence: 150, testScore: true, lastResetOn: '2026-09-28', status: 'assigned', redoCount: 0 }
  let state = { ...createInitialState(), kids: [kid], quests: [quest], submissions: [] }
  state = reducer(state, { type: 'SUBMIT_QUEST', submission: { questId: 'q1', kidId: 'k1', testScore: 91, elapsedMs: 1000, onTime: true } })
  const sub = state.submissions[0]
  state = reducer(state, { type: 'REJECT_SUBMISSION', submissionId: sub.id, note: 'Under the bed too' })
  const after = state.quests[0]
  const strip = ({ status: _s, redoNote: _n, redoCount: _c, ...rest }) => rest
  ok('every setting is as it was', JSON.stringify(strip(after)) === JSON.stringify(strip(quest)), JSON.stringify(after))
  ok('open again with the note', after.status === 'redo' && after.redoNote === 'Under the bed too' && after.redoCount === 1)
  ok('nothing paid or taken', state.kids[0].xp === 120 && state.kids[0].coins === 30)
  state = reducer(state, { type: 'SUBMIT_QUEST', submission: { questId: 'q1', kidId: 'k1', testScore: 95 } })
  ok('and it can be sent again', state.quests[0].status === 'submitted' && state.submissions.filter((s) => s.status === 'pending').length === 1)
}

/* ================================================================== */
/* A fake server, and an engine talking to it.                         */
const server = { log: [], submissions: new Set(), down: null, stall: null }
const offline = () => Object.assign(new Error('Failed to fetch'), { status: 0, retryable: true })
const unavailable = () => Object.assign(new Error('service unavailable'), { status: 503, retryable: true })
transport.isConfigured = () => true
let userId = 'u-parent'
transport.currentUserId = () => userId
const send = async (what, fn) => {
  if (server.down) throw server.down()
  server.log.push(what)
  const result = fn ? fn() : null
  if (server.stall) return new Promise(() => {})   // the page dies before the answer
  return result
}
transport.upsert = (table, row) => send(`upsert ${table} ${row.id}`)
transport.patch = (table, id, row) => send(`patch ${table} ${id} ${Object.keys(row).filter((k) => k !== 'id').join(',')}`)
transport.delete = (table, id) => send(`delete ${table} ${id}`)
let snapshot = () => ({ server_rev: 1, quests: [] })
transport.rpc = (fn, args) => {
  if (fn === 'family_snapshot') {
    if (server.down) return Promise.reject(server.down())
    return Promise.resolve(snapshot())
  }
  return send(`${fn} ${args.p_submission_id || ''}`.trim(), () => {
    if (fn === 'submit_quest') {
      if (server.submissions.has(args.p_submission_id)) return { ok: true, repeat: true }
      server.submissions.add(args.p_submission_id)
    }
    return { ok: true }
  })
}
const sync = async (engine, rounds = 1, step = 6 * 60_000) => {
  for (let i = 0; i < rounds; i += 1) { clock += step; await engine.sync({ silent: true }) }
}

console.log('\n=== Thirty days with no connection: nothing is lost ===')
{
  clearOutbox(); server.log = []
  const engine = createSyncEngine({ dispatch: () => {}, onStatus: () => {} })
  enqueue({ type: 'upsert', table: 'quests', row: { id: 'q-new', title: 'Water plants' } })
  enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: 's-30', p_quest_id: 'q-new' } })
  enqueue({ type: 'rpc', fn: 'approve_submission', args: { p_submission_id: 's-30' } })
  enqueue({ type: 'delete', table: 'rewards', id: 'r-old' })
  // A phone that says it is online but reaches nothing (a dead cell, a wifi
  // login page), trying every hour for thirty days.
  server.down = offline
  await sync(engine, 30 * 24, 60 * 60_000)
  ok('after thirty days of failing to connect, all four changes are still queued', readOutbox().length === 4, `${readOutbox().length} left`)
  // And a phone that knows it is offline does not even try.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
  const skipped = await engine.sync({ silent: true })
  ok('a phone that knows it is offline waits without spending anything', skipped.skipped === 'offline')
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
  server.down = null
  await sync(engine, 6)
  ok('back online, every change arrives', readOutbox().length === 0, `${readOutbox().length} left`)
  ok('in the order they were made', server.log.join(' | ') === 'upsert quests q-new | submit_quest s-30 | approve_submission s-30 | delete rewards r-old',
    server.log.join(' | '))
}
{
  // Failed once with the server down, then a month in a drawer.
  clearOutbox(); server.log = []
  const engine = createSyncEngine({ dispatch: () => {}, onStatus: () => {} })
  enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: 's-drawer', p_quest_id: 'q' } })
  server.down = unavailable
  await sync(engine, 1)
  clock += 30 * 86400000
  await sync(engine, 1)
  ok('a change that failed once, then waited a month, is not thrown away on its next failure', readOutbox().length === 1)
  server.down = null
  await sync(engine, 2)
  ok('and it goes through', server.log.includes('submit_quest s-drawer') && readOutbox().length === 0)
}

/* ================================================================== */
console.log('\n=== The browser killed in the middle of sending ===')
{
  clearOutbox(); server.log = []; server.submissions.clear()
  const before = createSyncEngine({ dispatch: () => {}, onStatus: () => {} })
  enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: 's-kill', p_quest_id: 'q1' } })
  enqueue({ type: 'patch', table: 'quests', row: { id: 'q2', title: 'Dishes' } })
  // The server takes the submission, and the page dies before the answer.
  server.stall = true
  before.sync({ silent: true })
  await new Promise((r) => setTimeout(r, 10))
  ok('the server has the submission', server.submissions.has('s-kill'))
  ok('the outbox, in storage, still holds it, marked as in flight', readOutbox().length === 2 && readOutbox()[0].sending === true)
  // The phone opens the app again: a new page, a new engine, same storage.
  server.stall = null
  const after = createSyncEngine({ dispatch: () => {}, onStatus: () => {} })
  ok('a new page knows nothing is in flight any more', readOutbox().every((o) => !o.sending))
  enqueue({ type: 'patch', table: 'quests', row: { id: 'q2', xp: 40 } })
  ok('so an edit made now folds into the change still waiting, as it should', readOutbox().length === 2
    && readOutbox()[1].row.title === 'Dishes' && readOutbox()[1].row.xp === 40)
  await sync(after, 2)
  ok('everything is sent and the outbox is empty', readOutbox().length === 0)
  ok('the submission was sent again and recognised, not doubled', server.submissions.size === 1
    && server.log.filter((l) => l === 'submit_quest s-kill').length === 2)
  ok('both edits to the chore arrived', server.log.includes('patch quests q2 title,xp'))
}

/* ================================================================== */
console.log('\n=== A phone waking after days asleep, its sign-in long expired ===')
{
  const real = { rpc: transport.rpc }
  // The real request path, with a fake network.
  const { transport: fresh } = await import('../src/lib/sync/transport.js?wake')
  const calls = []
  let refreshAnswer = 'ok'
  globalThis.fetch = async (url, init = {}) => {
    const auth = init.headers?.Authorization
    calls.push(`${init.method || 'GET'} ${url} ${auth || ''}`)
    if (url.includes('grant_type=refresh_token')) {
      if (refreshAnswer === 'offline') throw new Error('Failed to fetch')
      if (refreshAnswer === 'refused') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      return new Response(JSON.stringify({ access_token: 'new-token', refresh_token: 'r2', expires_in: 3600 }), { status: 200 })
    }
    if (auth === 'Bearer old-token') return new Response(JSON.stringify({ message: 'JWT expired' }), { status: 401 })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  setSession({ access_token: 'old-token', refresh_token: 'r1', expires_in: 3600, user: { id: 'u-parent' } })
  clock += 4 * 86400000                     // four days in a drawer
  const r = await fresh.rpc('approve_submission', { p_submission_id: 's1' })
  ok('the first request renews the sign-in before it goes', calls[0].includes('grant_type=refresh_token'), calls[0])
  ok('and goes with the new token, not the expired one', calls[1]?.endsWith('Bearer new-token') && r?.ok === true, calls[1])
  ok('the renewed sign-in is kept for next time', getSession()?.access_token === 'new-token' && getSession()?.user?.id === 'u-parent')

  // Woken with no signal: nothing is lost, it waits.
  setSession({ access_token: 'old-token', refresh_token: 'r2', expires_in: 3600, user: { id: 'u-parent' } })
  clock += 4 * 86400000
  refreshAnswer = 'offline'
  let thrown = null
  try { await fresh.rpc('approve_submission', {}) } catch (err) { thrown = err }
  ok('woken with no signal, the call fails as something to retry, not something to drop',
    thrown?.retryable === true, thrown && `${thrown.status} ${thrown.message}`)
  refreshAnswer = 'ok'
  const again = await fresh.rpc('approve_submission', {})
  ok('and goes through once the signal is back', again?.ok === true)

  // The refresh token itself refused (signed out elsewhere): only signing in helps.
  setSession({ access_token: 'old-token', refresh_token: 'r3', expires_in: 3600, user: { id: 'u-parent' } })
  clock += 4 * 86400000
  refreshAnswer = 'refused'
  thrown = null
  try { await fresh.rpc('approve_submission', {}) } catch (err) { thrown = err }
  ok('a refused renewal asks the person to sign in, and keeps the change waiting',
    fresh.needsSignIn() === true && thrown?.retryable === true && thrown?.auth === true)
  transport.rpc = real.rpc
  globalThis.fetch = undefined
}

/* ================================================================== */
console.log('\n=== A phone that is no longer in a family erases itself ===')
{
  let told = 0
  snapshot = () => null
  userId = 'u-kid'
  const engine = createSyncEngine({ dispatch: () => {}, onStatus: () => {}, onNoFamily: () => { told += 1 } })
  clearOutbox()
  await sync(engine, 1)
  ok('one empty answer is not enough to act on', told === 0)
  await sync(engine, 1)
  ok('two in a row, while signed in, and the phone is told it has no family', told === 1)
  userId = null
  told = 0
  await sync(engine, 3)
  ok('a phone with no sign-in at all is never told that', told === 0)
  userId = 'u-kid'
  told = 0
  server.down = () => Object.assign(new Error('JWT expired'), { status: 401, retryable: true, auth: true })
  await sync(engine, 3)
  ok('nor is one whose sign-in has merely expired', told === 0)
  server.down = null
  snapshot = () => ({ server_rev: 5, quests: [] })

  // And erasing it takes everything, for this device and nothing else's.
  store.clear()
  saveState({ kids: [{ name: 'Ava' }] })
  setSession({ access_token: 't', refresh_token: 'r', user: { id: 'u-kid' } })
  enqueue({ type: 'patch', table: 'notes', row: { id: 'n1', read: true } })
  setCursor(42)
  for (const k of ['rankup.pairing.v1', 'rankup.notifications.v1', 'rankup.badges.seen.v1', 'rankup.reminders.fired.v1',
    'rankup.crashes.v1', 'rankup.sync.shadow.v1', 'rankup.photos.v1', 'rankup.something.new.v3']) localStorage.setItem(k, '{}')
  localStorage.setItem('rankup.state.v1.kid', '{"other":"device"}')   // a second device in a dev browser
  localStorage.setItem('unrelated', 'x')
  wipeDevice()
  const left = [...store.keys()]
  ok('every RankUp key on the phone is gone: state, sign-in, outbox, cursor, pairing, notifications',
    !left.some((k) => k.startsWith('rankup.') && !k.endsWith('.kid')), left.join(', '))
  ok('another device\'s storage (a dev browser running two) and other sites\' keys are untouched',
    left.includes('rankup.state.v1.kid') && left.includes('unrelated'))
  ok('so the phone holds no sign-in and no cursor afterwards', getSession() === null && getCursor() === 0)

  // The fresh start says why, and names nobody.
  const wiped = reducer({ ...createInitialState(), onboarded: true, kids: [{ name: 'Ava' }] }, { type: 'DEVICE_WIPED', reason: 'unlinked' })
  ok('the phone starts again from the front door, holding nothing', !wiped.onboarded && wiped.kids.length === 0 && wiped.deviceWiped === 'unlinked')
}

Date.now = realNow
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
