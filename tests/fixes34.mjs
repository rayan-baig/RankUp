/**
 * 0.33.1, in plain Node: Pilot core 1.4.3. tests/fixes34ui.mjs walks the
 * same in a real browser.
 *
 *   1. the core is 1.4.3 (fingerprints in tests/fixes28.mjs, its own tests
 *      in tests/js/pilot.test.js), with what RankUp uses from it: sameItem,
 *      the no-key reply in the chat, a typed label always matching, the
 *      compact window while typing on a short screen;
 *   2. 0.33.0's no-key workaround is gone: with no key, once chatting,
 *      RankUp no longer leaves out the suggestions a pill already makes.
 *      Core 1.4.3 counts one answer (or one link) as one item, so on every
 *      screen Pilot is on, through the core's own code:
 *        - every pill and suggestion RankUp answers, typed as its own words,
 *          gets that answer (no tie between a pill and its suggestion);
 *        - under an answer, the row offers each thing once, never the one
 *          just pressed or its twin;
 *        - with nothing that fits, Pilot's "needs a key" row offers each once;
 *   3. RankUp's config for 1.4.3: `match` words on every answer and link,
 *      its own "Summarise this", the handle on, the no-key reply on, the tab
 *      bar's slot and the sidebar's slot, nothing moved by --pilot-keep-d,
 *      and still no Pilot on the front door, a child's screen or phone.
 *
 * Run against core 1.4.2 (MTRX a1c9253) with 0.33.0's chips(), section 2
 * fails: "What's waiting for me?" typed on Home is a tie (key settings), and
 * the row under an answer shows "How are the kids doing?" and "How is my kid
 * doing?" side by side.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HERE = 'https://rankup.example/'

const { updatePilot, pilotShows, pilotRoute, childMayHaveIt } = await import('../src/lib/pilotGate.js')
const rankup = await import('../src/pilot/pilotRankUp.js')
const { config, chips, screenChips, SCREENS } = rankup._test
const { createInitialState } = await import('../src/state/initialState.js')
const { buildDemoFamily } = await import('../src/lib/demoFamily.js')

// The core's chat window, run in Node as its own tests do (tests/js/pilot.test.js).
const sandbox = { window: {}, document: {}, URL }
vm.runInNewContext(read('public/pilot/pilot-panel.js'), sandbox)
const Panel = sandbox.window.PilotPanel
const at = (state, route) => updatePilot({ state, route, dispatch: () => {} })
// Pilot as the config sees it: a key or not, and how long the chat is.
const withPilot = (ready, n, fn) => {
  globalThis.window = { Pilot: { ready: () => ready, store: { loadChat: () => Array.from({ length: n }, () => ({ role: 'user', text: 'hi' })) } } }
  try { return fn() } finally { delete globalThis.window }
}
const labels = (list) => list.map((x) => x.label)
// One item or two, as the core counts (core 1.4.3). An older core has no sameItem: one object is one item.
const same = (a, b) => (typeof Panel.sameItem === 'function' ? Panel.sameItem(a, b) : a === b)

console.log('\n=== 1. Pilot core 1.4.3 ===')
ok('the chat window is 1.4.3 (every file\'s fingerprint in tests/fixes28.mjs)', Panel.VERSION === '1.4.3' && /const VERSION = "1\.4\.3"/.test(read('public/pilot/pilot.js')))
ok('it tells one item from two (sameItem), and answers in the chat with no key (noKeyItems)', typeof Panel.sameItem === 'function' && typeof Panel.noKeyItems === 'function'
  && typeof Panel.noKeyText === 'function')
ok('and goes compact while typing on a short screen (under 500 px visible)', Panel.SHORT_MOST === 500 && typeof Panel.isShort === 'function' && Panel.isShort(420) && !Panel.isShort(812)
  && /\.pilot-panel\.pilot-typing\.pilot-short \.pilot-tagline/.test(read('public/pilot/pilot-panel.css')))

console.log('\n=== 2. 0.33.0\'s no-key workaround is gone ===')
const rk = code('src/pilot/pilotRankUp.js')
const chipsFn = (rk.match(/function chips\(\) \{[\s\S]*?\n\}/) || [''])[0]
ok('chips() no longer asks whether there is a key: only the welcome leaves out what a pill does', /onWelcome\(\) \? welcomeChips\(list\) : list/.test(chipsFn) && !/keyReady/.test(chipsFn), chipsFn)
const demo = buildDemoFamily()
const PARENT = Object.keys(SCREENS).filter((r) => r.startsWith('/parent'))
const PUBLIC = Object.keys(SCREENS).filter((r) => !r.startsWith('/parent'))
const fresh = { ...createInitialState(), onboarded: false }
const screens = [...PARENT.map((r) => [demo, r]), ...PUBLIC.map((r) => [fresh, r]), [fresh, '/welcome']]
ok(`(every screen Pilot is on: ${screens.length})`, screens.length >= 25)
for (const r of PARENT) {
  at(demo, r)
  const noKey = withPilot(false, 2, () => labels(chips()))
  const all = withPilot(false, 2, () => labels(screenChips()))
  if (JSON.stringify(noKey) !== JSON.stringify(all) || noKey.length !== 3) ok(`${r}: once chatting with no key, the whole list`, false, noKey.join(' | '))
}
ok('every parent screen, once chatting with no key: its three suggestions (what\'s waiting and adding a chore among them)', PARENT.every((r) => {
  at(demo, r)
  const l = withPilot(false, 2, () => labels(chips()))
  return l.length === 3 && l[0] === "What's waiting for me?" && l[1] === 'Add a chore for…'
}))
ok('the welcome still leaves out what a pill does (the core shows pills and suggestions side by side there)', (() => { at(demo, '/parent'); return withPilot(false, 0, () => chips()).length === 0 })())

// Each screen's items, cleaned as the core cleans them: the pills, then the suggestions.
const itemsAt = (state, route) => {
  at(state, route)
  return withPilot(false, 2, () => {
    const pills = Panel.ownPills(config.welcomePills, HERE)
    const sugg = Panel.cleanChips(chips(), HERE)
    return { pills, sugg, all: pills.concat(sugg) }
  })
}
const plainItem = (x) => Boolean(x.link || x.answer !== undefined)
let typedChecked = 0
const typedMiss = []
for (const [state, route] of screens) {
  const { all } = itemsAt(state, route)
  for (const item of all.filter(plainItem)) {
    for (const typed of [item.label, item.label.toLowerCase().replace(/[?’'!.…]/g, ''), ` ${item.label.toUpperCase()} `]) {
      const got = withPilot(false, 2, () => Panel.matchTyped(typed, all))
      typedChecked += 1
      if (!got || !same(got, item)) typedMiss.push(`${route}: "${typed}" -> ${got ? got.label : 'nothing (key settings)'}`)
    }
  }
}
ok(`every pill and suggestion RankUp answers, typed as its own words (any case, no "?"), gets that answer on every screen (${typedChecked} checked)`,
  typedMiss.length === 0 && typedChecked >= 150, typedMiss.slice(0, 6).join(' · '))
// The pairs 0.33.0 kept apart: one answer, two labels, now one item.
{
  const { pills, sugg } = itemsAt(demo, '/parent')
  const byLabel = (list, l) => list.find((x) => x.label === l)
  ok('Home: "How are the kids doing?" and the pill "How is my kid doing?" are one item (one answer)', same(byLabel(sugg, 'How are the kids doing?'), byLabel(pills, 'How is my kid doing?')))
  ok('and so are the two "What\'s waiting for me?" and the two "Add a chore for…" (one link)', same(byLabel(sugg, "What's waiting for me?"), byLabel(pills, "What's waiting for me?"))
    && same(byLabel(sugg, 'Add a chore for…'), byLabel(pills, 'Add a chore for…')))
  const typedHome = (t) => withPilot(false, 2, () => Panel.matchTyped(t, pills.concat(sugg))?.label || null)
  ok('Home, no key, chatting: "What\'s waiting for me?" typed is answered, not a tie', typedHome("What's waiting for me?") === "What's waiting for me?")
  ok('"Anything pending for review?" finds what\'s waiting; "How are my kids doing this week?" the week', typedHome('Anything pending for review?') === "What's waiting for me?"
    && /How (is my kid|are the kids) doing\?/.test(typedHome('How are my kids doing this week?') || ''))
  ok('a question none fits is still nothing: "Write me a poem about dragons"', typedHome('Write me a poem about dragons') === null)
}
// Under an answer: each thing once, never what was just pressed or its twin.
const rowMiss = []
let rowsChecked = 0
for (const [state, route] of screens) {
  const { pills, sugg, all } = itemsAt(state, route)
  for (const pressed of all.filter(plainItem)) {
    const chat = [{ role: 'user', text: pressed.label }, { role: 'assistant', text: 'An answer.', local: true }]
    const row = Panel.againItems(chat, pills, sugg, true)
    rowsChecked += 1
    const body = row.filter((x) => !(x.builtin && x.action === 'settings'))
    const twice = body.some((x, i) => body.some((y, j) => j > i && same(x, y)))
    const back = body.some((x) => same(x, pressed))
    if (twice || back || row.length > Panel.AGAIN_MOST + 1) rowMiss.push(`${route} after "${pressed.label}": ${labels(row).join(' | ')}`)
  }
}
ok(`under each of RankUp's answers the row offers each thing once, never the one just pressed or its twin (${rowsChecked} rows)`, rowMiss.length === 0 && rowsChecked >= 60, rowMiss.slice(0, 4).join(' · '))
// A typed match: the answer remembers what it matched (`of`), and that is left out too.
{
  const { pills, sugg } = itemsAt(demo, '/parent')
  const chat = [{ role: 'user', text: 'Anything pending?' }, { role: 'assistant', text: 'One chore.', local: true, of: "What's waiting for me?" }]
  const row = labels(Panel.againItems(chat, pills, sugg, false))
  ok('Home, after a typed "Anything pending?": neither "What\'s waiting for me?" is offered again', !row.includes("What's waiting for me?") && row.length >= 2, row.join(' | '))
}
// Nothing fits, no key: Pilot's own "needs a key" message, and what works now under it.
const noKeyMiss = []
for (const [state, route] of screens) {
  const { pills, sugg } = itemsAt(state, route)
  if (typeof Panel.noKeyItems !== 'function') { noKeyMiss.push(`${route}: no noKeyItems (core before 1.4.3)`); continue }
  const row = Panel.noKeyItems(pills, sugg, true)
  const body = row.slice(0, -1)
  const last = row[row.length - 1]
  if (!(last && last.builtin && last.action === 'settings' && last.label === 'Add my AI key')
    || body.some((x, i) => body.some((y, j) => j > i && same(x, y)))
    || body.some((x) => !plainItem(x)) || body.length < 3 || body.length > Panel.AGAIN_MOST) noKeyMiss.push(`${route}: ${labels(row).join(' | ')}`)
}
ok('with nothing that fits, Pilot\'s "needs a key" row on every screen: what RankUp answers, each once, then "Add my AI key"', noKeyMiss.length === 0, noKeyMiss.slice(0, 4).join(' · '))
ok('in the core\'s words for a site: "I need an AI key to answer that one. Here\'s what I can help with right now:"',
  typeof Panel.noKeyText === 'function' && Panel.noKeyText(config.noKeyReply, true, true) === "I need an AI key to answer that one. Here's what I can help with right now:")

console.log('\n=== 3. RankUp\'s config for core 1.4.3 ===')
ok('the no-key reply stays on (no noKeyReply: false), so a typed question never jumps to key settings', config.noKeyReply === undefined && !/noKeyReply/.test(rk))
ok('the handle on, typed matching on', config.handle !== false && config.matchTyped !== false)
const matchMiss = []
for (const [state, route] of screens) {
  at(state, route)
  for (const k of [false, true]) {
    const list = withPilot(k, 2, () => chips()).concat(config.welcomePills)
    for (const x of list.filter(plainItem)) if (!Array.isArray(x.match) || x.match.length < 4) matchMiss.push(`${route}: ${x.label}`)
  }
}
ok('every pill and suggestion RankUp answers or links carries `match` words, on every screen, key or not', matchMiss.length === 0, [...new Set(matchMiss)].slice(0, 5).join(' · '))
ok('its own "Summarise this" with no key (config.screenChip), the core\'s with one', withPilot(false, 1, () => config.screenChip)?.label === 'Summarise this'
  && typeof withPilot(false, 1, () => config.screenChip).answer === 'function' && withPilot(true, 1, () => config.screenChip) === undefined)
ok('no RankUp style moves the tucked robot by --pilot-keep-d, and none sizes a gutter from --pilot-side (34 px in 1.4.3)',
  !/--pilot-keep-d\b/.test(read('src/styles/index.css')) && !/--pilot-side/.test(read('src/styles/index.css')) && config.gutter === false)
ok('the tab bar\'s slot on a phone and the sidebar\'s on a computer: RankUp still answers placement first', /mascot\.placeNow = \(opts\) =>/.test(rk) && /dockedPlace\(\) \|\| place\(opts\)/.test(rk)
  && /M\(\)\.placeNow\(/.test(read('public/pilot/pilot.js')))
const fakeDoc = (left, width = 1440) => ({ documentElement: { dataset: { pilotTabs: 'on' } }, defaultView: { innerWidth: width },
  querySelector: () => ({ getBoundingClientRect: () => ({ left, width: 80 }) }) })
ok('the sidebar\'s slot: bottom left; the tab bar\'s: bottom right; never tucked, never hidden', JSON.stringify(rankup.dockedPlace(fakeDoc(12))) === JSON.stringify({ corner: 'bl', peek: false, typing: false })
  && JSON.stringify(rankup.dockedPlace(fakeDoc(310, 375))) === JSON.stringify({ corner: 'br', peek: false, typing: false }))
ok('the chat docked down the right on a computer, the screen moved over (index.css)', /html\[data-area='parent'\]\[data-pilot-tabs='on'\]\[data-pilot-open='on'\] body \{ padding-right: calc\(var\(--rk-dock\) \+ 32px\); \}/.test(read('src/styles/index.css')))
// Where Pilot is never: the front door, before "I'm a parent", a child's screen or phone.
const kidPhone = { ...demo, device: { role: 'kid', linkedKidId: 'k1' } }
const kidTurn = { ...demo, session: { ...demo.session, role: 'kid', parentUnlocked: false } }
ok('never on the front door (only the parent\'s set-up on that route)', pilotRoute('/', fresh, false) === false && pilotRoute('/welcome', fresh, false) === false && pilotRoute('/welcome', fresh, true) === true)
ok('never on a child\'s screen, a child\'s turn or a child\'s phone', pilotRoute('/kid', demo) === false && pilotRoute('/kid/quests', demo) === false
  && childMayHaveIt(kidPhone) && childMayHaveIt(kidTurn))
at(kidPhone, '/parent')
ok('and the gate says no on a child\'s phone even at a parent\'s address', pilotShows() === false)
ok('kidView refuses whenever the gate says no', config.kidView() === true)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
