/**
 * 0.31.0, in plain Node: Pilot core 1.4.0, and a Pilot that is useful before
 * an AI key. tests/fixes31ui.mjs walks the same in a real browser.
 *
 *   1. the welcome's pills and the screens' suggestions: all but the key
 *      work with no key (core 1.4.0's `answer` and `link`); the AI prompts
 *      left are the ones that take the AI;
 *   2. "What's waiting for me?": the chores waiting for review, by count and
 *      chore name, from the family's own data;
 *   3. "How is my kid doing?": the dashboard's This week numbers;
 *   4. "Explain this screen": every screen Pilot is on has its own words;
 *   5. never a child's, the family's or a grown-up's name in an answer (it is
 *      kept in the chat, which goes with the next question once a key is
 *      added), and nothing sent: no network in the answers' code;
 *   6. the answers through the core's own renderer: RankUp's links are this
 *      site's (same tab), the family's words can't add markdown;
 *   7. kept as they were: the tab bar's slot, the avoid list, and where Pilot
 *      is never shown.
 *
 * The thirteen core files' fingerprints are in tests/fixes28.mjs, the core's
 * own tests in tests/js/pilot.test.js.
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
const DAY = 86400000

const { pilotSnapshot, updatePilot, pilotRoute, childMayHaveIt } = await import('../src/lib/pilotGate.js')
const rankup = await import('../src/pilot/pilotRankUp.js')
const { config, chips, SCREENS } = rankup._test
const answers = await import('../src/pilot/pilotAnswers.js').catch(() => ({}))
const { createInitialState, TIERS, TIER_LADDER } = await import('../src/state/initialState.js')
const { weekCompare } = await import('../src/lib/thisWeek.js')
const { priceWords } = await import('../src/lib/plans.js')

// The core's own cleaning and renderer, as the browser runs them.
const box = { window: {}, document: {}, URL }
vm.runInNewContext(read('public/pilot/pilot-panel.js'), box)
vm.runInNewContext(read('public/pilot/pilot-render.js'), box)
const Panel = box.window.PilotPanel
const Render = box.window.PilotRender
const HERE = 'https://rankup.example/#/parent'

// A family like the demo's: two children, chores waiting, some accepted.
const now = Date.now()
const family = {
  ...createInitialState(),
  onboarded: true,
  session: { role: 'parent', parentUnlocked: true },
  family: { ...createInitialState().family, id: 'f1', name: 'The Rivera Family', parentName: 'Maria Rivera' },
  kids: [{ id: 'k1', name: 'Ava', xp: 300, coins: 40 }, { id: 'k2', name: 'Noah', xp: 90, coins: 12 }],
  quests: [
    { id: 'q1', kidId: 'k1', title: 'Feed the cat', status: 'submitted' },
    { id: 'q2', kidId: 'k2', title: 'Feed the cat', status: 'submitted' },
    { id: 'q3', kidId: 'k1', title: "Help Noah with **his** [bike](/x)", status: 'submitted' },
    { id: 'q4', kidId: 'k2', title: 'Make your bed', status: 'assigned' },
    { id: 'q5', kidId: 'k1', title: 'Dishes', status: 'approved' },
  ],
  submissions: [
    { id: 's1', kidId: 'k1', questId: 'q1', status: 'pending', submittedAt: now - 3 * 3600000 },
    { id: 's2', kidId: 'k2', questId: 'q2', status: 'pending', submittedAt: now - 2 * 3600000 },
    { id: 's3', kidId: 'k1', questId: 'q3', status: 'pending', submittedAt: now - 3600000 },
    { id: 's4', kidId: 'k1', questId: 'q5', status: 'approved', decidedAt: now - 3600000, awarded: { xp: 30 } },
    { id: 's5', kidId: 'k2', questId: 'q5', status: 'approved', decidedAt: now - DAY - 3600000, awarded: { xp: 20 } },
    { id: 's6', kidId: 'k1', questId: 'q5', status: 'approved', decidedAt: now - 8 * DAY, awarded: { xp: 25 } },
  ],
}
const NAMES = /\b(Ava|Noah|Rivera|Maria)\b/
const at = (route, state = family) => { updatePilot({ state, route, dispatch: () => {} }); return pilotSnapshot()?.route === route }
const withChat = (n, fn) => {
  globalThis.window = { Pilot: { store: { loadChat: () => Array.from({ length: n }, () => ({ role: 'user', text: 'hi' })) } } }
  try { return fn() } finally { delete globalThis.window }
}
const run = (item, ctx = { ready: false }) => (typeof item.answer === 'function' ? item.answer(ctx) : item.answer)

console.log('\n=== 1. Useful before a key: the pills and suggestions ===')
const pills = Panel.welcomePills(config.welcomePills, HERE)
const pill = (label) => pills.find((p) => p.label === label) || {}
ok('five pills, as before', JSON.stringify(pills.map((p) => p.label)) === JSON.stringify(["What's waiting for me?", 'Add a chore for…', 'How is my kid doing?', 'Explain this screen', 'Add my AI key']))
ok('"What\'s waiting for me?", "How is my kid doing?" and "Explain this screen" are RankUp\'s own answers (no key, no AI)',
  ["What's waiting for me?", 'How is my kid doing?', 'Explain this screen'].every((l) => typeof pill(l).answer === 'function' && !pill(l).builtin && !pill(l).action))
ok('"Add a chore for…" opens Assign, on this site', pill('Add a chore for…').link === 'https://rankup.example/#/parent/assign')
ok('only "Add my AI key" is left for the key, so the key is still asked for once', pill('Add my AI key').action === 'settings'
  && Panel.keyPillGiven(config.welcomePills) === true && pills.filter((p) => p.builtin).length === 1)
ok('the line under an answer while there is no key (answerMore)', config.answerMore === 'Want more? Add your AI key to ask anything.')
ok('(the gate sees Parent Mode)', at('/parent'))
const homeChips = withChat(2, () => chips())
ok('Home once chatting: "What\'s waiting for me?" (an answer), "Add a chore for…" (Assign), "How are the kids doing?" (an answer)',
  JSON.stringify(homeChips.map((c) => c.label)) === JSON.stringify(["What's waiting for me?", 'Add a chore for…', 'How are the kids doing?'])
  && typeof homeChips[0].answer === 'function' && /#\/parent\/assign$/.test(homeChips[1].link) && typeof homeChips[2].answer === 'function')
ok('and through the core\'s cleaning they stay an answer and a link on this site', (() => {
  const c = Panel.cleanChips(homeChips, HERE)
  return c.length === 3 && typeof c[0].answer === 'function' && c[1].link === 'https://rankup.example/#/parent/assign'
})())
ok('Home before any chat: no suggestion repeats a pill (all three are pills)', withChat(0, () => chips()).length === 0, withChat(0, () => chips()).map((c) => c.label).join())
at('/parent/plan')
const planChip = withChat(0, () => chips())[0] || {}
ok(`the plan screen: "What does ${TIERS.elite.name} add?" is answered at once`, typeof planChip.answer === 'function' && new RegExp(TIERS.elite.name).test(run(planChip)))
at('/parent/help')
const helpThird = withChat(1, () => chips())[2] || {}
ok('a screen with no suggestion of its own: "What can I do here?" explains it, at once', helpThird.label === 'What can I do here?' && /\*\*Help\*\*/.test(run(helpThird)))
at('/parent/approvals')
ok('what really takes the AI stays an AI prompt (Review\'s "Accept the oldest one")', withChat(0, () => chips())[0]?.prompt === 'Accept the oldest chore that is waiting.')
const fresh = { ...createInitialState(), onboarded: false }
at('/welcome', fresh)
const doorChips = withChat(1, () => chips())
ok('"I\'m a parent" set-up: how it works, is it safe, and the plans, all answered at once', doorChips.length === 3 && doorChips.every((c) => c.answer !== undefined), doorChips.map((c) => c.label).join(' | '))
const plans = run(doorChips[2])
ok('the plans\' prices come from the plan list itself (TIERS), none typed', TIER_LADDER.filter((t) => t.price).every((t) => plans.includes(priceWords(t)) && plans.includes(priceWords(t, 'year'))), plans)
ok('the pills on a page with no family yet answer kindly, never an error', /Once your family is set up/.test(run(pill("What's waiting for me?"))) && /Once your family is set up/.test(run(pill('How is my kid doing?'))))

console.log('\n=== 2. "What\'s waiting for me?" ===')
at('/parent')
const waiting = run(pill("What's waiting for me?"))
ok('the count: "3 chores are waiting for you to review"', /\*\*3 chores\*\* are waiting for you to review/.test(waiting), waiting)
ok('by chore name, with how many of each, oldest first', /- Feed the cat \(2\)\n- Help \[name\] with his bike\(\/x\)/.test(waiting), waiting)
ok('a link to Review (RankUp\'s own path)', /\[Open Review\]\(\/#\/parent\/approvals\)/.test(waiting))
ok('one waiting: "1 chore is waiting", "accept it"', /\*\*1 chore\*\* is waiting/.test(answers.waitingAnswer?.({ ...family, submissions: family.submissions.slice(0, 1) }) || '')
  && /accept it or/.test(answers.waitingAnswer?.({ ...family, submissions: family.submissions.slice(0, 1) }) || ''))
ok('nothing waiting: says so, and where it will show', /Nothing is waiting for you right now/.test(answers.waitingAnswer?.({ ...family, submissions: [] }) || ''))
const many = { ...family, quests: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, kidId: 'k1', title: `Chore ${i}` })),
  submissions: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, kidId: 'k1', questId: `m${i}`, status: 'pending', submittedAt: i })) }
ok('a long list: the first eight, then "and 4 more chores"', (() => { const t = answers.waitingAnswer(many); return /- Chore 7\n- and 4 more chores/.test(t) && !/Chore 8/.test(t) })())

console.log('\n=== 3. "How is my kid doing?": This week ===')
const week = weekCompare(family)
const weekText = run(pill('How is my kid doing?'))
ok('chores done, XP earned and days in a row, as the dashboard\'s This week counts them', weekText.includes(`**Chores done:** ${week.now.chores}`)
  && weekText.includes(`**XP earned:** ${week.now.xp}`) && weekText.includes(`**Days in a row:** ${week.now.streak}`), weekText)
ok('each beside last week, in words (no arrows to read)', /\(up 1 on last week\)/.test(weekText) && !/[▲▼]/.test(weekText), weekText)
ok('both children together, with a link to Kids for each one', /That is both children together/.test(weekText) && /\[Kids\]\(\/#\/parent\/kids\)/.test(weekText))
ok('and what is waiting in Review', /3 chores are waiting for you in \[Review\]/.test(weekText))
ok('nothing accepted yet: nothing to compare, said plainly', /nothing to compare yet/.test(answers.weekAnswer?.({ ...family, submissions: [] }) || ''))

console.log('\n=== 4. "Explain this screen" ===')
const missing = [...Object.keys(SCREENS), '/welcome'].filter((r) => answers.explainAnswer?.(r, family) === answers.explainAnswer?.('/nowhere', family))
ok('every screen Pilot is on has its own explanation', missing.length === 0, missing.join(', '))
at('/parent/approvals')
const explained = run(pill('Explain this screen'))
ok('Review, explained in plain words, with what is on it now (counts only)', /This is \*\*Review\*\*/.test(explained) && /Right now: 2 children, 1 chore to do, 3 waiting for review\./.test(explained), explained)
ok('with a key, it says the box is there for more', /Ask me anything about it/.test(run(pill('Explain this screen'), { ready: true })) && !/Ask me anything/.test(explained))
at('/gift', fresh)
ok('a public page: its explanation, no family numbers', /\*\*Give page\*\*/.test(run(pill('Explain this screen'))) && !/Right now/.test(run(pill('Explain this screen'))))

console.log('\n=== 5. No names, nothing sent ===')
const everyAnswer = []
for (const route of [...Object.keys(SCREENS), '/welcome']) {
  at(route)
  for (const p of pills.filter((x) => x.answer)) everyAnswer.push([route, p.label, run(p)])
  for (const c of withChat(1, () => chips()).filter((x) => x.answer)) everyAnswer.push([route, c.label, run(c)])
}
const named = everyAnswer.filter(([, , t]) => NAMES.test(t))
ok(`no child's, family's or grown-up's name in any answer (${everyAnswer.length} answers, every screen)`, everyAnswer.length > 50 && named.length === 0, named.map(([r, l]) => `${r} ${l}`).slice(0, 3).join(' | '))
ok('a chore title naming a child is shown as [name]', /Help \[name\] with/.test(waiting))
const answersCode = code('src/pilot/pilotAnswers.js')
ok('the answers\' code calls no network and reads no storage', answersCode.length > 2000 && !/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|transport|localStorage|sessionStorage|import\(/.test(answersCode))
ok('it imports only RankUp\'s own rules and words', [...answersCode.matchAll(/from '([^']+)'/g)].map((m) => m[1]).every((m) => /^\.\.\/(state\/initialState|lib\/(plans|thisWeek|xp))\.js$/.test(m)))
const realFetch = globalThis.fetch
let called = 0
globalThis.fetch = () => { called += 1; throw new Error('no network') }
at('/parent')
for (const p of pills.filter((x) => x.answer)) run(p)
globalThis.fetch = realFetch
ok('answering every pill makes no request', called === 0)

console.log('\n=== 6. Through the core\'s renderer ===')
const links = (text) => Render.parse(text, { local: true }).flatMap((b) => [b, ...(b.items || [])]).flatMap((b) => (Array.isArray(b) ? b : b.c || []))
  .flatMap(function walk(n) { return [n, ...(n.c || []).flatMap(walk)] }).filter((n) => n.t === 'a').map((n) => n.href)
const waitingLinks = links(waiting)
ok('the waiting answer\'s link is this site\'s Review (opens in the same tab)', JSON.stringify(waitingLinks) === '["/#/parent/approvals"]'
  && Render.sameSite(Render.safeHref(waitingLinks[0], HERE), HERE), JSON.stringify(waitingLinks))
ok('a chore title can\'t add a link or bold of its own', !waitingLinks.includes('/x') && !/\*\*his\*\*/.test(waiting))
ok('every link in every answer is one of RankUp\'s own screens', everyAnswer.every(([, , t]) => links(t).every((h) => /^\/#\/parent\/[a-z]+$/.test(h))),
  everyAnswer.flatMap(([, , t]) => links(t)).filter((h) => !/^\/#\/parent\/[a-z]+$/.test(h)).join())
ok('screenLink: the app\'s base path and the hash route', answers.screenLink?.('/parent/assign') === '/#/parent/assign')
ok('plainWords keeps the family\'s words as words', answers.plainWords?.('**Big** [x](/y) `z` <b>') === 'Big x(/y) z b')

console.log('\n=== 7. Kept as they were ===')
const src = read('src/pilot/pilotRankUp.js')
ok('the tab bar\'s slot (phone) and the sidebar\'s slot (computer): placeNow still asked through dockedPlace first',
  /mascot\.placeNow = \(opts\) =>/.test(src) && /dockedPlace\(\) \|\| place\(opts\)/.test(src))
const docAt = (left, view = 1440) => ({ documentElement: { dataset: { pilotTabs: 'on' } }, defaultView: { innerWidth: view },
  querySelector: () => ({ getBoundingClientRect: () => ({ left, width: 56 }) }) })
ok('bottom right in the phone\'s bar, bottom left in the sidebar, never tucked', JSON.stringify(rankup.dockedPlace(docAt(300, 375))) === JSON.stringify({ corner: 'br', peek: false, typing: false })
  && rankup.dockedPlace(docAt(12)).corner === 'bl')
ok('the avoid list is unchanged', JSON.stringify(config.avoid) === JSON.stringify(['[data-pilot-avoid]', '[data-pilot-primary]', '.demo-bar']))
ok('kidView still refuses whenever the gate says no', /kidView: \(\) => !shows\(\)/.test(src))
const parentState = family
ok('never on the front door, or any child\'s screen', !pilotRoute('/', { ...createInitialState(), onboarded: false })
  && ['/kid', '/kid/quests', '/kid/shop', '/kid/profile', '/switch'].every((r) => !pilotRoute(r, parentState)))
ok('never on a child\'s phone', childMayHaveIt({ ...parentState, device: { role: 'kid' } }) === true)
ok('and on a parent screen in Parent Mode', pilotRoute('/parent/approvals', parentState) && !childMayHaveIt(parentState))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
