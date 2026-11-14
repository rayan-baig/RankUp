/**
 * The server down for an hour, and the phone left to get on with it.
 *
 * Runs the real sync engine, on its own timers, against a stand-in server
 * that is switched off for an hour and then on again, on a clock this test
 * drives. While it is off, a family keeps going: chores sent, accepted, a
 * game, the notices that go with them. And the very first accept reaches the
 * server just as it goes down, with the answer lost on the way back, so the
 * phone sends it again an hour later.
 *
 * What has to hold:
 *   - it backs off: an hour of nothing is about a minute between tries, not
 *     a request every few seconds;
 *   - nothing is lost: every change is still waiting when the server returns;
 *   - it recovers by itself, within a minute of the server coming back, with
 *     nobody touching anything;
 *   - nothing is done twice: each chore once, each accept paid once, the game
 *     paid once, each notice sent once, the lost-answer accept recognised as
 *     a repeat rather than "decided on another device";
 *   - the person is told, in plain words, what is happening and when it ends.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { hidden: false, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }

// The clock, and the engine's timers, are the test's.
let clock = Date.UTC(2026, 10, 3, 15, 0)
Date.now = () => clock
const timers = []
globalThis.setTimeout = (fn, ms = 0) => { const t = { fn, at: clock + ms, id: Symbol('t') }; timers.push(t); return t.id }
globalThis.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i !== -1) timers.splice(i, 1) }
/** Run timers in order until `until`, moving the clock to each. */
async function runUntil(until, stop = () => false) {
  for (;;) {
    await new Promise((r) => setImmediate(r))
    timers.sort((a, b) => a.at - b.at)
    const next = timers[0]
    if (!next || next.at > until || stop()) break
    timers.shift()
    clock = Math.max(clock, next.at)
    await next.fn()
    // Let any promise the timer started settle.
    await new Promise((r) => setImmediate(r))
  }
  if (!stop()) clock = Math.max(clock, until)
}

const { createSyncEngine, SYNC_STATUS } = await import('../src/lib/sync/syncEngine.js')
const { enqueue, readOutbox } = await import('../src/lib/sync/outbox.js')
const { transport } = await import('../src/lib/sync/transport.js')
const { syncWords, DOWN_AFTER_MS } = await import('../src/lib/sync/words.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/* ---------- the stand-in server, answering as supabase/*.sql does ---------- */
const server = { down: false, loseNextAnswer: false, requests: 0, downRequests: 0, downPulls: 0, log: [] }
const submissions = new Map()
const paid = new Map()
const receipts = new Map()
const unavailable = () => Object.assign(new Error('service unavailable'), { retryable: true, status: 503 })
const lostAnswer = () => Object.assign(new Error('gateway timeout'), { retryable: true, status: 504 })

transport.isConfigured = () => true
transport.currentUserId = () => 'parent-1'
transport.needsSignIn = () => false
transport.rpc = async (fn, args = {}) => {
  server.requests += 1
  if (server.down) { server.downRequests += 1; if (fn === 'family_snapshot') server.downPulls += 1; throw unavailable() }
  if (fn === 'family_snapshot') return { server_rev: server.requests }
  let answer
  if (fn === 'submit_quest') {
    // A second send of the same submission is a repeat (submit_quest).
    if (submissions.has(args.p_submission_id)) answer = { ok: true, repeat: true }
    else { submissions.set(args.p_submission_id, 'pending'); answer = { ok: true } }
  } else if (fn === 'approve_submission') {
    const now = submissions.get(args.p_submission_id)
    if (!now) throw Object.assign(new Error('submission not found'), { retryable: false, status: 400 })
    // The same parent sending it again is answered quietly (approve_submission).
    if (now === 'approved') answer = null
    else { submissions.set(args.p_submission_id, 'approved'); paid.set(args.p_submission_id, (paid.get(args.p_submission_id) || 0) + 1); answer = null }
  } else if (fn === 'play_minigame') {
    if (!receipts.has(args.p_request_id)) receipts.set(args.p_request_id, { ok: true, coins: 3 })
    answer = { ...receipts.get(args.p_request_id), ...(server.log.some((l) => l === `play_minigame:${args.p_request_id}`) ? { repeat: true } : {}) }
  } else answer = { ok: true }
  server.log.push(`${fn}:${args.p_submission_id || args.p_request_id || ''}`)
  if (server.loseNextAnswer) { server.loseNextAnswer = false; server.down = true; throw lostAnswer() }
  return answer
}
const notices = []
const refused = []
let shown = null
const engine = createSyncEngine({
  dispatch() {},
  onStatus: (s) => { shown = s },
  onRefused: (r) => refused.push(r),
  sendNotice: async (notice) => {
    if (server.down) throw unavailable()
    notices.push(notice.ref)
  },
})
const words = () => syncWords({ ...shown, now: clock, online: true })

/* ---------- the afternoon ---------- */
console.log('\n=== Before: everything up to date ===')
engine.start()
await runUntil(clock + 30_000)
ok('it starts up to date', shown?.status === SYNC_STATUS.IDLE && words().text === 'Up to date', words().text)

const ids = { a: 'sub-a', b: 'sub-b', c: 'sub-c' }
// Ava sends a chore and her parent accepts it at once: the accept reaches
// the server just as it goes down, and its answer is lost.
enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: ids.a, p_quest_id: 'q-a', p_kid_id: 'ava' } })
enqueue({ type: 'notice', ref: ids.a, notice: { kind: 'submission', ref: ids.a } })
await engine.sync({ silent: true })
server.loseNextAnswer = true
enqueue({ type: 'rpc', fn: 'approve_submission', args: { p_submission_id: ids.a, p_tz: 'Europe/London' } })
enqueue({ type: 'notice', ref: ids.a, notice: { kind: 'approved', ref: ids.a } })
engine.wake()
await runUntil(clock + 2_000)
const downAt = clock
ok('the server is now down, and the accept\'s answer never came', server.down && paid.get(ids.a) === 1)

console.log('\n=== An hour with the server down ===')
// The family carries on: two more chores, one accepted, a game.
await runUntil(clock + 5 * 60_000)
enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: ids.b, p_quest_id: 'q-b', p_kid_id: 'ava' } })
enqueue({ type: 'notice', ref: ids.b, notice: { kind: 'submission', ref: ids.b } })
enqueue({ type: 'rpc', fn: 'submit_quest', args: { p_submission_id: ids.c, p_quest_id: 'q-c', p_kid_id: 'ava' } })
enqueue({ type: 'notice', ref: ids.c, notice: { kind: 'submission', ref: ids.c } })
enqueue({ type: 'rpc', fn: 'play_minigame', args: { p_kid_id: 'ava', p_game: 'snake', p_score: 60, p_request_id: 'req-1' } })
engine.wake()
await runUntil(clock + 20 * 60_000)
enqueue({ type: 'rpc', fn: 'approve_submission', args: { p_submission_id: ids.b, p_tz: 'Europe/London' } })
enqueue({ type: 'notice', ref: ids.b, notice: { kind: 'approved', ref: ids.b } })
engine.wake()
const waitingMid = readOutbox().length
await runUntil(downAt + 60 * 60_000)
const queued = readOutbox()
ok(`nothing lost: all ${queued.length} changes still waiting after an hour`, queued.length === waitingMid && queued.length === 9,
  queued.map((o) => o.fn || o.type).join(','))
ok('in the order they were made', queued.map((o) => o.fn || o.type).join(',')
  === 'approve_submission,notice,submit_quest,notice,submit_quest,notice,play_minigame,approve_submission,notice')
ok(`it backed off: ${server.downPulls} rounds in the hour (${server.downRequests} requests), about one a minute`,
  server.downPulls <= 70 && server.downPulls >= 40 && server.downRequests <= 90, `${server.downPulls} rounds, ${server.downRequests} requests`)
const during = words()
ok(`and says so plainly: "${during.text}"`, /^Server down since /.test(during.text) && /9 saved on this phone/.test(during.text)
  && /Nothing is lost/.test(during.hint), JSON.stringify(during))
ok('not "No internet": the phone is online, the server is not', !/No internet/.test(during.text))
ok(`only after a minute of failing (${DOWN_AFTER_MS / 1000} s), not on a blip`,
  /Can’t sync yet/.test(syncWords({ ...shown, downSince: clock - 10_000, now: clock }).text))

console.log('\n=== The server comes back; nobody touches anything ===')
server.down = false
const backAt = clock
await runUntil(clock + 5 * 60_000, () => readOutbox().length === 0)
const took = clock - backAt
ok(`it recovered by itself in ${Math.round(took / 1000)} s`, readOutbox().length === 0 && took <= 61_000, `${readOutbox().length} left after ${took} ms`)
ok('each chore arrived once', [...submissions.keys()].sort().join() === 'sub-a,sub-b,sub-c'
  && server.log.filter((l) => l.startsWith('submit_quest')).length === 3, server.log.join(' '))
ok('each accept paid once, the lost-answer one included', paid.get(ids.a) === 1 && paid.get(ids.b) === 1 && !paid.has(ids.c),
  JSON.stringify([...paid]))
ok('the game paid once', receipts.size === 1)
ok('the lost-answer accept was a repeat, not "decided on another device"', refused.length === 0, JSON.stringify(refused))
const sent = (ref, i) => notices.filter((n) => n === ref).length === i
ok('each notice sent once: two for each accepted chore, one for the one still waiting',
  sent(ids.a, 2) && sent(ids.b, 2) && sent(ids.c, 1), JSON.stringify(notices))
const order = server.log.filter((l) => !l.startsWith('family_snapshot'))
ok('and every accept arrived after the chore it accepts', order.indexOf(`submit_quest:${ids.b}`) < order.indexOf(`approve_submission:${ids.b}`))
const after = words()
ok(`then it says so: "${after.text}"`, after.text === 'Back online · everything sent', JSON.stringify(after))
await runUntil(clock + 30_000)
ok(`and a little later: "${words().text}"`, words().text === 'Up to date')
ok('back to the usual pace: the next check within twenty seconds', timers.length === 1 && timers[0].at - clock <= 20_000,
  JSON.stringify(timers.map((t) => t.at - clock)))

engine.stop()
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
