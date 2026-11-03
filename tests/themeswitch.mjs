/**
 * Switching themes is quick and keeps every bit of progress, even with work
 * still waiting to be sent.
 *
 * A child (or a parent on a shared phone) flicking between themes, back and
 * forth, while the phone has no signal and chores, a game and a note are
 * still in the outbox. Afterwards: the same XP, coins, level, streak,
 * tokens, skins and scores; every waiting change still waiting, in order,
 * untouched; one theme change to send, not twenty; and, back on the theme
 * they started on, the dragon fight's start where it was. Then the signal
 * comes back and everything arrives once.
 *
 * Runs the real reducer, shadow, outbox and sync engine in Node, then times
 * the switch on screen in the look-around family (a browser, no server).
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }

const { reducer } = await import('../src/state/reducer.js')
const { createInitialState, makeKid } = await import('../src/state/initialState.js')
const { queueChanges, recordDelivered, clearShadow } = await import('../src/lib/sync/shadow.js')
const { enqueue, readOutbox, clearOutbox } = await import('../src/lib/sync/outbox.js')
const { transport } = await import('../src/lib/sync/transport.js')
const { createSyncEngine } = await import('../src/lib/sync/syncEngine.js')
const { kids: kidMapper } = await import('../src/lib/sync/mappers.js')
const { KID_THEMES } = await import('../src/data/kidThemes.js')
const { levelFromXp } = await import('../src/lib/xp.js')
const { earnedBadgeIds } = await import('../src/data/badges.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const FAMILY = '00000000-0000-4000-8000-00000000f026'
const AVA = '00000000-0000-4000-8000-00000000a026'
const CHOSEN = Date.UTC(2026, 9, 1)
const START = 'blockcraft'
const OTHERS = KID_THEMES.map((t) => t.id).filter((id) => id !== START)

/** What "progress" means: everything a theme must never touch. */
const progress = (s) => {
  const k = s.kids.find((x) => x.id === AVA)
  return JSON.stringify({
    xp: k.xp, level: levelFromXp(k.xp).level, coins: k.coins, streak: k.streak, tokens: k.playTokens,
    skins: k.skins, bestScores: k.bestScores, storySeen: k.storySeen, badges: earnedBadgeIds(s, k),
    submissions: s.submissions, quests: s.quests.map((q) => [q.id, q.status]), notes: s.notes.length,
  })
}

/** Moves what the reducer asked for into the outbox, as AppContext does. */
const drain = (s) => {
  for (const { fn, args, foldKey } of s.syncQueue || []) enqueue(foldKey ? { type: 'rpc', fn, args, foldKey } : { type: 'rpc', fn, args })
  return { ...s, syncQueue: [], noticeQueue: [] }
}

function family(role) {
  clearOutbox(); clearShadow()
  const s0 = createInitialState()
  const kid = {
    ...makeKid({ name: 'Ava', themeId: START }), id: AVA, xp: 4200, coins: 90, playTokens: 3, rev: 7,
    themeChosenAt: CHOSEN, skins: ['gold'], bestScores: { snake: 80 }, storySeen: { ch1: CHOSEN },
    streak: { count: 6, lastDay: '2026-11-02', freezeTokens: 1 },
  }
  let s = {
    ...s0, onboarded: true, family: { ...s0.family, id: FAMILY, name: 'Test', pin: '1234' },
    device: role === 'kid' ? { ...s0.device, role: 'kid', linkedKidId: AVA } : { ...s0.device, role: 'parent' },
    kids: [kid],
  }
  // The server already has the child as they are now.
  recordDelivered(s, { kids: [{ ...kidMapper.toRow(kid, FAMILY), theme_chosen_at: new Date(CHOSEN).toISOString() }] })
  // Offline: two chores sent, a game played, a note written. None of it has gone.
  s = reducer(s, { type: 'ADD_QUESTS', quests: [{ kidId: AVA, title: 'Bins' }, { kidId: AVA, title: 'Dishes' }] })
  if (role !== 'kid') { queueChanges(s, { role }) }
  for (const q of s.quests) s = reducer(s, { type: 'SUBMIT_QUEST', submission: { questId: q.id, kidId: AVA } })
  if (role !== 'kid') s = reducer(s, { type: 'APPROVE_SUBMISSION', submissionId: s.submissions[0].id })
  s = reducer(s, { type: 'FINISH_MINIGAME', kidId: AVA, game: 'snake', score: 40, coins: 2 })
  s = reducer(s, { type: 'ADD_NOTE', note: { kidId: AVA, from: role === 'kid' ? 'kid' : 'parent', text: 'Back at six' } })
  s = drain(s)
  queueChanges(s, { role })
  return s
}

for (const role of ['kid', 'parent']) {
  console.log(`\n=== ${role === 'kid' ? "A child's own phone" : 'A parent\'s phone'}, offline, flicking through themes ===`)
  let s = family(role)
  const before = progress(s)
  const waiting = readOutbox().filter((o) => !(o.fn === 'set_kid_look') && !(o.table === 'kids'))
  ok(`${waiting.length} changes waiting to be sent`, waiting.length >= 4, JSON.stringify(readOutbox().map((o) => o.fn || o.table)))

  const times = []
  for (let i = 0; i < 24; i++) {
    const to = i % 2 === 0 ? OTHERS[i % OTHERS.length] : START
    const t0 = performance.now()
    s = reducer(s, { type: 'SET_KID_THEME', kidId: AVA, themeId: to })
    queueChanges(s, { role })
    times.push(performance.now() - t0)
  }
  const slowest = Math.max(...times)
  ok(`each switch is quick: slowest ${slowest.toFixed(1)} ms of work on the phone`, slowest < 50, times.join(','))
  ok('progress is exactly as it was', progress(s) === before)

  // Back where it started: the dragon fight's start is where it was.
  const ava = () => s.kids.find((k) => k.id === AVA)
  ok('back on the first theme, the moment it was chosen is the server\'s again', ava().themeId === START && ava().themeChosenAt === CHOSEN,
    `${ava().themeId} ${ava().themeChosenAt}`)
  ok('nothing kept aside once back', !('themeBefore' in ava()))

  // One last switch to somewhere else, and that is what goes.
  const final = OTHERS[3]
  s = reducer(s, { type: 'SET_KID_THEME', kidId: AVA, themeId: final })
  queueChanges(s, { role })
  ok('a theme away from the first one has a new moment', ava().themeChosenAt !== CHOSEN && ava().themeBefore?.id === START)
  ok('and progress still exactly as it was', progress(s) === before)

  const ops = readOutbox()
  const still = ops.filter((o) => waiting.some((w) => w.id === o.id))
  ok('every change that was waiting is still waiting, in order, unchanged',
    JSON.stringify(still) === JSON.stringify(waiting.map((w) => ops.find((o) => o.id === w.id))) && still.length === waiting.length
      && still.every((o, i) => o.id === waiting[i].id && JSON.stringify(o.args ?? o.row) === JSON.stringify(waiting[i].args ?? waiting[i].row)))
  const looks = ops.filter((o) => o.fn === 'set_kid_look' || (o.table === 'kids' && o.row?.theme_id !== undefined))
  ok('twenty-five switches are one theme change to send', looks.length === 1, JSON.stringify(looks))
  ok(`carrying the last theme (${final})`, (looks[0]?.args?.p_theme_id ?? looks[0]?.row?.theme_id) === final)
  ok('and no XP, coins or streak with it', looks[0] && !['xp', 'coins', 'streak_count', 'play_tokens'].some((c) => c in (looks[0].row || looks[0].args || {})))

  console.log('  … the signal comes back')
  const sent = []
  transport.isConfigured = () => true
  transport.currentUserId = () => 'u-test'
  transport.upsert = async (table, row) => { sent.push(`upsert ${table}:${row.id}`) }
  transport.patch = async (table, id, row) => { sent.push(`patch ${table}:${id}:${Object.keys(row).join('+')}`) }
  transport.delete = async (table, id) => { sent.push(`delete ${table}:${id}`) }
  transport.rpc = async (fn, args) => {
    if (fn === 'family_snapshot') return { server_rev: 1 }
    sent.push(`${fn}:${args.p_submission_id || args.p_kid_id || ''}:${args.p_theme_id || ''}`)
    return { ok: true }
  }
  const engine = createSyncEngine({ dispatch() {}, sendNotice: async () => {} })
  await engine.sync()
  ok('everything went', readOutbox().length === 0, JSON.stringify(readOutbox()))
  ok('each chore once', s.submissions.every((sub) => sent.filter((x) => x.startsWith(`submit_quest:${sub.id}`)).length === 1), sent.join('\n'))
  ok('the game once', sent.filter((x) => x.startsWith('play_minigame')).length === 1)
  ok('the theme once, the last one', sent.filter((x) => x.startsWith('set_kid_look') || /^patch kids:.*theme_id/.test(x)).length === 1, sent.join('\n'))
  ok('nothing deleted', !sent.some((x) => x.startsWith('delete')))
}

console.log('\n=== In the browser: tap Save to the new look, back and forth ===')
{
  const { launch, BASE, SHOT_DIR } = await import('./helpers.mjs')
  const { browser, page, errors } = await launch()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Have a look around/ }).click()
  await page.waitForTimeout(1500)
  await page.getByTestId('demo-tour').getByRole('button', { name: /See Ava's world/ }).click()
  await page.waitForTimeout(800)
  await page.evaluate(() => { window.location.hash = '/kid/profile' })
  await page.waitForTimeout(800)
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).kids
    .map((k) => JSON.stringify([k.xp, k.coins, k.streak, k.playTokens, k.skins, k.bestScores])).join('|'))
  const first = await saved()
  const took = []
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: /Ask a parent to change the theme/ }).click()
    await page.locator('input[type=password]').fill('1234')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await page.waitForTimeout(250)
    await page.locator('button[aria-pressed]').nth(i % 2 === 0 ? 4 : 1).click()
    took.push(await page.evaluate(async () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg')
      const save = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save theme')
      const t0 = performance.now()
      save.click()
      await new Promise((r) => {
        const check = () => (getComputedStyle(document.documentElement).getPropertyValue('--bg') !== bg ? r() : requestAnimationFrame(check))
        check()
      })
      await new Promise((r) => requestAnimationFrame(() => r()))
      return Math.round(performance.now() - t0)
    }))
    await page.waitForTimeout(350)
    if (i === 0) await page.screenshot({ path: `${SHOT_DIR}/theme-switched.png` })
  }
  ok(`each switch is on screen within half a second (${took.join(', ')} ms)`, Math.max(...took) < 500)
  ok('and every child\'s XP, coins, streak, tokens, skins and scores are as they were', (await saved()) === first)
  ok('with no errors on the page', errors.length === 0, errors.join('; '))
  await browser.close()
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
