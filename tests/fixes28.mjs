/**
 * 0.28.0, in plain Node: Pilot core 1.2.0 and RankUp's own Pilot welcome.
 * tests/fixes28ui.mjs walks the same in a real browser.
 *
 *   1. the core is 1.2.0, the MTRX Horizyn site's files (commit 4c82361)
 *      byte for byte;
 *   2. RankUp's welcome: its tagline and five pills, chat keys only, kept on
 *      the screen, its one pop-up that isn't a dialog, the avoid list and the
 *      tab bar's slot as before;
 *   3. this screen's suggestions on the welcome come from the core now, with
 *      what a pill already does left out; the whole list once chatting;
 *   4. 0.27.0's workarounds are gone: the row RankUp put into the welcome
 *      (and its MutationObserver) and the style rule hiding the picture and
 *      video key sections.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => readFileSync(f, 'utf8')
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n=== 1. Pilot core 1.2.0, copied unchanged ===')
// The first 16 hex digits of each file's sha256 at MTRX Horizyn commit
// 4c82361. A file edited here, or copied from another commit, fails.
const CORE = [
  ['pilot.js', 'b08414622cf07124'],
  ['pilot-store.js', 'b43fa177c626d5b7'],
  ['pilot-mascot.js', 'd3e3c0d066f50c67'],
  ['pilot-engine.js', '73df16d8c108676d'],
  ['pilot-providers.js', '3d86f09a1186a80c'],
  ['pilot-media.js', '630cdf62403c27c5'],
  ['pilot-render.js', 'f970ba3fe286e30e'],
  ['pilot-panel.js', 'fe80cdb71981b3a0'],
  ['pilot-motion.js', 'b3e623dec9d46991'],
  ['pilot-actor.js', '412fa7979ac219fe'],
  ['pilot.css', '96ffe0be9cf86f25'],
  ['pilot-panel.css', '51091b11ebcb2b77'],
  ['pilot-actor.css', 'f1d7cddaaf7f84a9'],
]
const changed = CORE.filter(([f, want]) => createHash('sha256').update(readFileSync(`public/pilot/${f}`)).digest('hex').slice(0, 16) !== want)
ok('all thirteen core files are 1.2.0 as the MTRX Horizyn site has them', changed.length === 0, changed.map(([f]) => f).join(', '))
ok('each says "Pilot core 1.2.0" on its first line', CORE.every(([f]) => read(`public/pilot/${f}`).split('\n')[0].includes(`Pilot core 1.2.0 · ${f}`)))
ok('and the loader\'s VERSION is 1.2.0', /const VERSION = "1\.2\.0"/.test(read('public/pilot/pilot.js')))

console.log('\n=== 2. RankUp\'s own welcome ===')
const { pilotSnapshot, updatePilot } = await import('../src/lib/pilotGate.js')
const rankup = await import('../src/pilot/pilotRankUp.js')
const { config, chips } = rankup._test
const { createInitialState } = await import('../src/state/initialState.js')

ok('the tagline is RankUp\'s: "Your family\'s chore helper"', config.tagline === "Your family's chore helper", config.tagline)
ok('short enough for one line on a 320px phone (under 30 characters)', config.tagline.length < 30)

// The pills as the core itself cleans them (pilot-panel.js welcomePills).
const sandbox = { window: {}, document: {} }
vm.runInNewContext(read('public/pilot/pilot-panel.js'), sandbox)
const Panel = sandbox.window.PilotPanel
const pills = JSON.parse(JSON.stringify(Panel.welcomePills(config.welcomePills)))
ok('five pills, in this order, through the core\'s own cleaning', JSON.stringify(pills.map((p) => p.label)) === JSON.stringify(
  ["What's waiting for me?", 'Add a chore for…', 'How is my kid doing?', 'Explain this screen', 'Add my AI key']), pills.map((p) => p.label).join(' | '))
const pill = (label) => pills.find((p) => p.label === label) || {}
ok('"What\'s waiting for me?" is sent at once', pill("What's waiting for me?").send === true && pill("What's waiting for me?").action === "What's waiting for me to review?")
ok('"Add a chore for…" fills the box for the parent to finish (not sent, the gap after "for" kept)',
  pill('Add a chore for…').send === false && pill('Add a chore for…').builtin === false && pill('Add a chore for…').action === 'Add a chore for ')
ok('"How is my kid doing?" is sent at once', pill('How is my kid doing?').send === true && /How is each of my children doing this week\?/.test(pill('How is my kid doing?').action))
ok('"Explain this screen" is the core\'s explain-screen (RankUp\'s screenText keeps names out)', pill('Explain this screen').builtin === true && pill('Explain this screen').action === 'explain-screen')
ok('"Add my AI key" opens key settings', pill('Add my AI key').builtin === true && pill('Add my AI key').action === 'settings')
ok('each with one of the window\'s own icons', JSON.stringify(pills.map((p) => p.icon)) === JSON.stringify(['chat', 'bolt', 'spark', 'bars', 'key']))
ok('the design\'s five are not what RankUp shows', !pills.some((p) => /Ask anything|Help with code|Customize with your API key/.test(p.label)))

const hidden = JSON.parse(JSON.stringify([...Panel.hiddenSections(config.hideKeySections)]))
ok('no picture or video key settings (hideKeySections)', JSON.stringify(hidden) === '["image","video"]', JSON.stringify(hidden))
ok('kept on the screen when tucked away (keepInViewport)', config.keepInViewport === true)
ok('no first look (revealMs: 0): its "pilot-hello" class on Pilot\'s root is also the greeting bubble\'s, whose style would take the robot out of the slot',
  config.revealMs === 0 && /rootEl\.classList\.add\("pilot-hello"\)/.test(read('public/pilot/pilot.js'))
  && /\.pilot-hello \{\s*position: relative;/.test(read('public/pilot/pilot-panel.css')))
ok('and the core turns the first look off for 0', /M\(\)\.firstLook\(storage\("sessionStorage"\), `\$\{store\.prefix\}-hello`, config\.revealMs\)/.test(read('public/pilot/pilot.js'))
  && /if \(!ms\) return;/.test(read('public/pilot/pilot.js')))
ok('the "sign in again" sheet, which isn\'t a dialog, is one of Pilot\'s pop-ups', JSON.stringify(config.modals) === '["[data-pilot-modal]"]'
  && /data-pilot-modal=""/.test(read('src/components/SyncBadge.jsx')))
ok('RankUp\'s other pop-ups are dialogs, which the core already steps back for', /role="dialog" aria-modal="true"/.test(read('src/components/ui.jsx'))
  && /dialog\[open\], \[aria-modal="true"\], \[role="dialog"\]/.test(read('public/pilot/pilot-mascot.js')))
ok('the avoid list is as before', JSON.stringify(config.avoid) === JSON.stringify(['[data-pilot-avoid]', '[data-pilot-primary]', '.demo-bar']))
ok('and the phone gutter off (the robot is in the tab bar\'s slot)', config.gutter === false)
const src = read('src/pilot/pilotRankUp.js')
ok('the tab bar\'s slot: the core\'s placeNow is still asked through RankUp\'s dockedPlace first',
  /mascot\.placeNow = \(opts\) =>/.test(src) && /dockedPlace\(\) \|\| place\(opts\)/.test(src))
const fakeDoc = (tabs, width = 56) => ({ documentElement: { dataset: { pilotTabs: tabs } }, querySelector: () => ({ getBoundingClientRect: () => ({ width }) }) })
ok('in the slot it is never tucked away, so keepInViewport\'s shrinking leaves it be',
  JSON.stringify(rankup.dockedPlace(fakeDoc('on'))) === JSON.stringify({ corner: 'br', peek: false, typing: false }))
ok('and the core decides off the slot', rankup.dockedPlace(fakeDoc('off')) === null && rankup.dockedPlace(fakeDoc('on', 0)) === null)
ok('a pop-up is checked before placeNow, so the robot hides behind one in the slot too',
  (() => { const l = read('public/pilot/pilot.js'); return l.indexOf('M().modalOpen(document, rootEl') < l.indexOf('M().placeNow({') && /if \(open \|\| modal \|\| /.test(l) })())

console.log('\n=== 3. This screen\'s suggestions on the welcome ===')
const parent = { ...createInitialState(), onboarded: true, session: { role: 'parent', parentUnlocked: true }, kids: [{ id: 'k', name: 'Mo' }] }
const at = (route) => { updatePilot({ state: parent, route, dispatch: () => {} }); return pilotSnapshot()?.route === route }
const labels = (list) => list.map((c) => c.label)
const withChat = (n, fn) => {
  globalThis.window = { Pilot: { store: { loadChat: () => Array.from({ length: n }, () => ({ role: 'user', text: 'hi' })) } } }
  try { return fn() } finally { delete globalThis.window }
}
ok('(the gate sees Parent Mode)', at('/parent'))
ok('Home, before any chat: no suggestion repeats a pill (all three are pills there)', withChat(0, () => chips()).length === 0, labels(withChat(0, () => chips())).join(' | '))
ok('Home, once chatting (the pills are gone): the whole list again', JSON.stringify(labels(withChat(2, () => chips())))
  === JSON.stringify(["What's waiting for me?", 'Add a chore for…', 'How are the kids doing?']))
at('/parent/approvals')
ok('Review, before any chat: "Accept the oldest one", the one thing the pills don\'t do', JSON.stringify(labels(withChat(0, () => chips()))) === '["Accept the oldest one"]')
at('/parent/settings')
ok('Settings: "Add a reward" ends on a gap for the parent to finish, which only a pill can leave, so not on the welcome',
  withChat(0, () => chips()).length === 0 && labels(withChat(1, () => chips())).includes('Add a reward'))
at('/parent/plan')
ok('Plans: "What does Elite add?" on the welcome', labels(withChat(0, () => chips())).length === 1 && /add\?$/.test(labels(withChat(0, () => chips()))[0]))
ok('no store to ask (Node, an old core): the whole list', labels(chips()).length === 3)
ok('welcomeChips leaves out a pill\'s words, by label or by prompt', rankup.welcomeChips([{ label: "What's waiting for me?", prompt: 'x' },
  { label: 'x', prompt: 'How is each of my children doing this week?' }, { label: 'Keep', prompt: 'Keep this.' }]).map((c) => c.label).join() === 'Keep')
ok('the core shows them on the welcome itself (pilot-chips-welcome)', /class: "pilot-chips pilot-chips-welcome"/.test(read('public/pilot/pilot-panel.js')))

console.log('\n=== 4. 0.27.0\'s workarounds are gone ===')
ok('no row of RankUp\'s own put into the welcome (starterRow)', !('starterRow' in rankup) && !/starterRow|rk-starters|pilot-starters/.test(src))
ok('no MutationObserver watching Pilot\'s welcome', !/observe\(welcome/.test(src) && !/watchForWelcome|placeStarters/.test(src))
ok('RankUp never draws a pill or chip of its own', !/createElement\('button'\)/.test(code('src/pilot/pilotRankUp.js')) && !/pilot-chip/.test(code('src/pilot/pilotRankUp.js')))
const css = read('src/styles/index.css')
ok('no style rule hiding the picture and video key sections', !/details\.pilot-section/.test(css) && !/rk-starters/.test(css))
ok('the tab bar\'s slot and its placement rules stay', /html\[data-pilot-tabs='on'\] \.tabbar-dock \{ display: block; flex: 0 0 56px; \}/.test(css)
  && /html\[data-pilot-tabs='on'\] \.pilot-root\.rk-pilot\.pilot-at-br \{/.test(css))
ok('RankUp\'s "Reduce motion" still keeps the robot still', /html\[data-reduce-motion='true'\] \.pilot-root \.pilot-launcher::before/.test(css))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
