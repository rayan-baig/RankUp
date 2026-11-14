/**
 * A year of heavy use, and how much of the phone it takes.
 *
 * RankUp keeps everything in localStorage: the family's state, the shadow
 * (what the server has) and the outbox (what is waiting to go). Nothing uses
 * IndexedDB. This plays a busy family through a year, day by day, with the
 * same steps the app takes (lib/prune.js and the save in AppContext): three
 * children, six daily chores and two one-off chores each a day, every one
 * sent and accepted, three arcade games each, a note each, a reward and
 * pocket money every week. It measures the stored size with and without
 * letting go of old, finished history, and checks that letting go is safe:
 * nothing waiting to be sent is ever touched, nothing is deleted on the
 * server, and the badges and counts a child sees do not move.
 *
 * Sizes are what localStorage holds, counted as characters (browsers count
 * keys and values; Safari allows about 5 MB of UTF-16, so 2.5 million).
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

let clock = Date.UTC(2026, 0, 1, 15)
Date.now = () => clock

const { reducer } = await import('../src/state/reducer.js')
const { createInitialState, makeKid } = await import('../src/state/initialState.js')
const { queueChanges, recordDelivered, forgetRows, clearShadow } = await import('../src/lib/sync/shadow.js')
const { enqueue, readOutbox, clearOutbox } = await import('../src/lib/sync/outbox.js')
const { ENTITIES } = await import('../src/lib/sync/mappers.js')
const { saveState } = await import('../src/lib/storage.js')
const { pruneHistory, choreCounts, KEEP_DAYS } = await import('../src/lib/prune.js')
const { earnedBadgeIds } = await import('../src/data/badges.js')
const { activityFeed } = await import('../src/lib/activity.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const SAFARI_CHARS = 2.5e6
let prunes = 0
let outboxTouched = 0
let namedDropped = 0
const chars = () => [...store.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0)
const kb = (n) => `${Math.round(n / 1024).toLocaleString()} K`

/**
 * One year. `prune` turns letting go on; `offlineFrom` is the day the phone
 * loses its signal for good (nothing reaches the server after it).
 */
function year({ prune, offlineFrom = Infinity, onDay = () => {} }) {
  store.clear(); clearOutbox(); clearShadow()
  clock = Date.UTC(2026, 0, 1, 15)
  const s0 = createInitialState()
  let s = { ...s0, onboarded: true, device: { ...s0.device, role: 'parent' }, family: { ...s0.family, id: 'fam-year', name: 'Year', pin: '1234' } }
  let rev = 1
  const act = (a) => { s = reducer(s, a) }
  const drain = () => {
    for (const { fn, args, foldKey } of s.syncQueue || []) enqueue(foldKey ? { type: 'rpc', fn, args, foldKey } : { type: 'rpc', fn, args })
    s = { ...s, syncQueue: [], noticeQueue: [] }
  }
  // The server sends every row back, as a pull would, and the phone records it.
  const deliver = () => {
    clearOutbox()
    const stamp = (list) => list.map((x) => (x.rev != null ? x : { ...x, rev: rev++ }))
    s = { ...s, quests: stamp(s.quests), submissions: stamp(s.submissions), notes: stamp(s.notes) }
    recordDelivered(s, Object.fromEntries(Object.entries(ENTITIES).map(([key, { key: stateKey, mapper }]) => [key, (s[stateKey] || []).map((x) => ({ ...mapper.toRow(x, s.family.id), rev: x.rev }))])))
  }
  // What AppContext's save does.
  const save = () => {
    let saving = s
    if (prune) {
      const outboxBefore = JSON.stringify(readOutbox())
      const pruned = pruneHistory(s, { work: [readOutbox(), s.syncQueue || []] })
      if (pruned.dropped.count) {
        prunes += 1
        forgetRows(pruned.dropped); saving = pruned.state; s = pruned.state
        if (JSON.stringify(readOutbox()) !== outboxBefore) outboxTouched += 1
        const named = new Set(readOutbox().flatMap((o) => [o.args?.p_submission_id, o.args?.p_quest_id, o.row?.id]).filter(Boolean))
        if (pruned.dropped.submissions.some((id) => named.has(id)) || pruned.dropped.quests.some((id) => named.has(id))
          || pruned.dropped.notes.some((id) => named.has(id))) namedDropped += 1
      }
    }
    saveState(saving)
    queueChanges(saving, { role: 'parent' })
  }

  for (const name of ['Ann', 'Bo', 'Cy']) act({ type: 'ADD_KID', kid: makeKid({ name }) })
  for (const k of s.kids) {
    act({ type: 'ADD_QUESTS', quests: Array.from({ length: 6 }, (_, i) => ({
      kidId: k.id, title: `Daily ${i}`, category: ['home', 'school', 'pets', 'outside', 'self', 'home'][i],
      recurrence: 'daily', pence: i === 0 ? 50 : 0, difficulty: i === 5 ? 'boss' : 'medium', timerSeconds: i === 4 ? 600 : 0,
    })) })
  }
  act({ type: 'ADD_REWARD', reward: { name: 'Film night', cost: 30 } })
  save(); deliver()
  const start = clock
  for (let day = 1; day <= 365; day++) {
    clock = start + day * 86400000
    act({ type: 'RETURN_RECURRING', today: new Date(clock).toISOString().slice(0, 10) })
    for (const k of s.kids) act({ type: 'ADD_QUESTS', quests: [{ kidId: k.id, title: `Extra ${day}a`, category: 'home' }, { kidId: k.id, title: `Extra ${day}b`, category: 'school' }] })
    // Yesterday's last chore waited overnight for the parent; accepted now.
    for (const w of s.submissions.filter((x) => x.status === 'pending')) act({ type: 'APPROVE_SUBMISSION', submissionId: w.id })
    // Read by the children by morning.
    for (const k of s.kids) act({ type: 'MARK_NOTES_READ', kidId: k.id, as: 'kid' })
    const todo = s.quests.filter((x) => x.status === 'assigned')
    todo.forEach((q, i) => {
      clock += 60000
      act({ type: 'SUBMIT_QUEST', submission: { questId: q.id, kidId: q.kidId, note: 'done it', ...(q.timerSeconds ? { elapsedMs: 300000 } : {}) } })
      if (i < todo.length - 1) act({ type: 'APPROVE_SUBMISSION', submissionId: s.submissions.at(-1).id, note: 'Great job, thanks!' })
    })
    for (const k of s.kids) for (let g = 0; g < 3; g++) act({ type: 'FINISH_MINIGAME', kidId: k.id, game: 'snake', score: 60, coins: 3 })
    for (const k of s.kids) act({ type: 'ADD_NOTE', note: { kidId: k.id, from: 'parent', text: 'Proud of you today' } })
    if (day % 7 === 0) {
      for (const k of s.kids) {
        act({ type: 'REDEEM_REWARD', rewardId: s.rewards[0].id, kidId: k.id })
        act({ type: 'RECORD_MONEY', kidId: k.id, pence: 100, kind: 'paid', note: 'Saturday' })
      }
    }
    drain()
    save()
    if (day < offlineFrom) deliver()
    onDay(day, s)
  }
  return s
}

const MARKS = [30, 90, 180, 270, 335, 365]
const OFFLINE_FROM = 336
const sizes = { kept: {}, pruned: {} }

console.log('\n=== A year with nothing let go of (how it was) ===')
const full = year({ prune: false, onDay: (day) => { if (MARKS.includes(day)) sizes.kept[day] = chars() } })
console.log(`  ${MARKS.map((d) => `day ${d}: ${kb(sizes.kept[d])}`).join(' · ')} characters`)
ok('without letting go it grows without limit, past what Safari allows', sizes.kept[365] > SAFARI_CHARS && sizes.kept[365] > sizes.kept[180] * 1.6,
  kb(sizes.kept[365]))

console.log(`\n=== The same year, letting go of finished history older than ${KEEP_DAYS} days ===`)
console.log(`  (online until day ${OFFLINE_FROM - 1}, then no signal for the last month)`)
let waitingBefore = null
const end = year({
  prune: true,
  offlineFrom: OFFLINE_FROM,
  onDay: (day) => {
    if (MARKS.includes(day)) sizes.pruned[day] = chars()
    if (day === 200) {
      const parts = Object.fromEntries([...store.entries()].map(([k, v]) => [k.replace('rankup.', ''), kb(k.length + v.length)]))
      console.log('  day 200, by key:', JSON.stringify(parts))
    }
    if (day === 364) waitingBefore = readOutbox().map((o) => JSON.stringify(o))
  },
})
console.log(`  ${MARKS.map((d) => `day ${d}: ${kb(sizes.pruned[d])}`).join(' · ')} characters`)
ok(`online, eleven months take ${kb(sizes.pruned[335])} characters, under three quarters of Safari's ${kb(SAFARI_CHARS)}`, sizes.pruned[335] < SAFARI_CHARS * 0.75)
ok('and it stops growing: months six to eleven add under 10%', sizes.pruned[335] < sizes.pruned[180] * 1.1,
  `${kb(sizes.pruned[180])} → ${kb(sizes.pruned[335])}`)
// Nothing unsent may go, so a month with no signal adds its whole month.
ok(`a month offline on top still fits (${kb(sizes.pruned[365])})`, sizes.pruned[365] < SAFARI_CHARS)
ok('nothing was deleted on the server: no delete in the outbox, ever', !readOutbox().some((o) => o.type === 'delete'))
ok('a chore still waiting for the parent is still there', end.submissions.some((x) => x.status === 'pending')
  && end.quests.filter((q) => q.status === 'submitted').every((q) => end.submissions.some((x) => x.questId === q.id && x.status === 'pending')))
ok('every repeating chore is still there', end.quests.filter((q) => q.recurrence === 'daily').length === 18)

console.log('\n=== The last month offline: nothing waiting is touched ===')
{
  const after = readOutbox().map((o) => JSON.stringify(o))
  ok(`${waitingBefore.length} changes waiting after a month offline`, waitingBefore.length > 1000)
  ok(`letting go ran ${prunes} times and never changed the outbox`, prunes > 100 && outboxTouched === 0, String(outboxTouched))
  ok('nor let go of anything a waiting change names', namedDropped === 0, String(namedDropped))
  ok('every change waiting at the start of the last day is still there', waitingBefore.every((op) => after.some((a) => JSON.parse(a).id === JSON.parse(op).id)))
  const named = [...new Set(readOutbox().flatMap((o) => [o.args?.p_submission_id, o.args?.p_quest_id]).filter(Boolean))]
  const missing = named.filter((id) => !end.submissions.some((x) => x.id === id) && !end.quests.some((q) => q.id === id))
  ok(`and all ${named.length} chores and submissions they name are still on the phone`, missing.length === 0, missing.slice(0, 3).join(', '))
  const offlineSubs = end.submissions.filter((x) => x.rev == null)
  ok(`all ${offlineSubs.length} chores sent offline are kept`, offlineSubs.length >= 24 * 29)
}

console.log('\n=== What a child sees does not move ===')
{
  const same = (st, name) => st.kids.find((k) => k.name === name)
  for (const kid of full.kids) {
    const a = JSON.stringify(earnedBadgeIds(full, kid))
    const b = JSON.stringify(earnedBadgeIds(end, same(end, kid.name)))
    ok(`${kid.name}: the same badges (${JSON.parse(a).length})`, a === b, `${a} vs ${b}`)
  }
  const counts = (st) => st.kids.map((k) => [k.name, choreCounts(st, k.id, activityFeed(st).filter((e) => e.kidId === k.id))])
  ok('the same accepted and sent-back counts on every profile', JSON.stringify(counts(full)) === JSON.stringify(counts(end)),
    `${JSON.stringify(counts(full))} vs ${JSON.stringify(counts(end))}`)
  ok('the same XP and coins', JSON.stringify(full.kids.map((k) => [k.xp, k.coins])) === JSON.stringify(end.kids.map((k) => [k.xp, k.coins])))
}

console.log('\n=== Rows that are never let go of ===')
{
  const { prunable } = await import('../src/lib/prune.js')
  const old = Date.now() - 200 * 86400000
  const dragon = { id: 'k-dragon', themeId: 'blockcraft', xp: 1e9 }
  const st = {
    kids: [dragon, { id: 'k2', themeId: 'galaxy', xp: 10 }],
    quests: [{ id: 'q-local', status: 'approved', recurrence: 'once', completedAt: old }],
    submissions: [
      { id: 's-dragon', kidId: 'k-dragon', questId: 'qx', status: 'approved', decidedAt: old, rev: 1 },
      { id: 's-local', kidId: 'k2', questId: 'q-local', status: 'approved', decidedAt: old },
      { id: 's-named', kidId: 'k2', questId: 'qy', status: 'rejected', decidedAt: old, rev: 2 },
    ],
    notes: [{ id: 'n-unread', read: false, at: old, rev: 3 }],
  }
  const p = prunable(st, { work: [{ type: 'rpc', fn: 'set_history_note', args: { p_submission_id: 's-named' } }] })
  ok('a child in the dragon fight keeps every chore (the fight is counted from them)', !p.submissions.includes('s-dragon'))
  ok('a row the server has never sent back is kept (this phone may hold the only copy)', !p.submissions.includes('s-local') && !p.quests.includes('q-local'))
  ok('a chore something waiting to be sent names is kept', !p.submissions.includes('s-named'))
  ok('a note not yet read is kept', !p.notes.includes('n-unread'))
}

console.log('\n=== Theme Genesis: five themes a child, at their longest, stay small ===')
{
  const { designFromVibe, CURRENCY_MAX, WORLD_MAX, NAME_MAX, MAX_KID_THEMES } = await import('../src/data/themeGenesis.js')
  const { makeKid } = await import('../src/state/initialState.js')
  store.clear(); clearOutbox(); clearShadow()
  const s0 = createInitialState()
  let s = { ...s0, onboarded: true, device: { ...s0.device, role: 'parent' }, family: { ...s0.family, id: 'fam-themes', name: 'Themes', pin: '1234' } }
  s = { ...s, kids: Array.from({ length: 5 }, (_, i) => ({ ...makeKid({ name: `Kid ${i}` }), id: `kid-${i}` })) }
  const before = JSON.stringify(s).length
  const longest = (vibe) => ({ ...designFromVibe(vibe).design, cur: 'C'.repeat(CURRENCY_MAX), worlds: Array(4).fill('W'.repeat(WORLD_MAX)) })
  for (const kid of s.kids) {
    for (let i = 0; i < MAX_KID_THEMES + 2; i += 1) {
      s = reducer(s, { type: 'SAVE_KID_THEME', theme: { kidId: kid.id, name: 'N'.repeat(NAME_MAX), design: longest(['space', 'ocean', 'candy'][i % 3]), status: 'ready' } })
    }
  }
  ok(`no child keeps more than ${MAX_KID_THEMES}`, s.kids.every((k) => s.kidThemes.filter((t) => t.kidId === k.id).length === MAX_KID_THEMES))
  const added = JSON.stringify(s).length - before
  ok(`25 themes at their longest add ${kb(added)} to the saved state (under 16 KB)`, added < 16 * 1024, String(added))
  queueChanges(s, { role: 'parent' })
  const outbox = JSON.stringify(readOutbox()).length
  ok(`and sending them all takes ${kb(outbox)} of outbox (under 24 KB)`, outbox < 24 * 1024, String(outbox))
}

console.log(`\nSizes (characters in localStorage): ${MARKS.map((d) => `day ${d} ${kb(sizes.kept[d])} → ${kb(sizes.pruned[d])}`).join(', ')}`)
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
