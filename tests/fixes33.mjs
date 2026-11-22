/**
 * 0.33.0, in plain Node: the fixes from the round-9 strict review, and Pilot
 * core 1.4.2. tests/fixes33ui.mjs walks the same in a real browser.
 *
 *   0. Pilot core 1.4.2: RankUp's own "Summarise this" through
 *      config.screenChip (the 0.32.0 tap-catching workaround gone), `match`
 *      words so a question typed with no key finds the answer it fits, the
 *      handle on, the tab bar's slot and the sidebar's slot as before;
 *   1. Recent activity: words for every event the app logs, "quests_returned"
 *      ("🔁 3 daily chores are back for today") among them;
 *   2. Pilot's answers: the plan in words that can all be true ("You're
 *      trying Elite Pass free — 14 days left"), Alliances' grammar, "Which
 *      chore is oldest?" with an "Open it" link, and "Summarise this" leading
 *      with the numbers and one next step, not a repeat of "Explain";
 *   3. Pilot docked at the right on a computer, the screen moved over for it;
 *   4. the level-up: confetti behind the card, "Your chore was accepted" for one;
 *   5. what the trial's boost has given so far, on the Elite card and in the
 *      last-days heads-up (Parent Mode only, no price);
 *   6. polish: the door's strip agrees with its demo phone, "Nothing leaves
 *      this device", the last-days banner without its pitch line, the
 *      Sunday Market card padded.
 */
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const DAY = 86400000
const HOUR = 3600000
const now = Date.now()
const HERE = 'https://rankup.example/'

const { updatePilot } = await import('../src/lib/pilotGate.js')
const rankup = await import('../src/pilot/pilotRankUp.js')
const { config, chips } = rankup._test
const answers = await import('../src/pilot/pilotAnswers.js')
const { createInitialState, TIERS, TRIAL_DAYS } = await import('../src/state/initialState.js')
const { reducer } = await import('../src/state/reducer.js')
const { buildDemoFamily } = await import('../src/lib/demoFamily.js')

// The core's chat window, run in Node as its own tests do (tests/js/pilot.test.js).
const sandbox = { window: {}, document: {}, URL }
vm.runInNewContext(read('public/pilot/pilot-panel.js'), sandbox)
const Panel = sandbox.window.PilotPanel

const at = (state, route) => updatePilot({ state, route, dispatch: () => {} }, true)
const withPilot = (ready, n, fn) => {
  globalThis.window = { Pilot: { ready: () => ready, store: { loadChat: () => Array.from({ length: n }, () => ({ role: 'user', text: 'hi' })) } } }
  try { return fn() } finally { delete globalThis.window }
}

/* A family with a trial, two children, chores waiting and accepted. */
function family({ trialDays = 6, tier = 'starter' } = {}) {
  const s = createInitialState()
  return {
    ...s,
    onboarded: true,
    family: { ...s.family, name: 'The Rivera Family', parentName: 'Sam', tier, trialTier: 'elite', trialEndsAt: now + trialDays * DAY - HOUR },
    kids: [{ id: 'k1', name: 'Mia', xp: 400 }, { id: 'k2', name: 'Noah', xp: 120 }],
    quests: [
      { id: 'q1', kidId: 'k1', title: 'Feed the cat', status: 'submitted' },
      { id: 'q2', kidId: 'k2', title: 'Make your bed', status: 'submitted' },
      { id: 'q3', kidId: 'k1', title: 'Tidy up', status: 'approved' },
    ],
    submissions: [
      { id: 's1', questId: 'q1', kidId: 'k1', status: 'pending', submittedAt: now - 3 * HOUR },
      { id: 's2', questId: 'q2', kidId: 'k2', status: 'pending', submittedAt: now - HOUR },
      { id: 's3', questId: 'q3', kidId: 'k1', status: 'approved', submittedAt: now - DAY, decidedAt: now - DAY,
        awarded: { xp: 45, lines: [{ label: 'Medium', value: 30 }, { label: '1.5× XP boost', value: 15 }] } },
    ],
    rewards: [], redemptions: [],
  }
}

console.log('\n=== 0. Pilot core 1.4.2 ===')
const CORE = readdirSync('public/pilot').filter((f) => /\.(js|css)$/.test(f))
ok('all thirteen core files say "Pilot core 1.4.2" (fingerprints in tests/fixes28.mjs)', CORE.length === 13
  && CORE.every((f) => read(`public/pilot/${f}`).split('\n')[0].includes(`Pilot core 1.4.2 · ${f}`)))
ok('the core has screenChip, matchTyped and the handle', typeof Panel.screenChip === 'function' && typeof Panel.matchTyped === 'function'
  && /function restHandle/.test(read('public/pilot/pilot-mascot.js')))
const rk = code('src/pilot/pilotRankUp.js')
ok('0.32.0\'s workaround is gone: no catching the core\'s chip, no writing into its chat', !/isSummaryChip|watchSummary|SUMMARY_CHIP|withAnswer|addEventListener\('click'|saveChat/.test(rk))
const chipNoKey = withPilot(false, 1, () => config.screenChip)
const chipKey = withPilot(true, 1, () => config.screenChip)
ok('config.screenChip, no key: RankUp\'s own "Summarise this", an answer', chipNoKey?.label === 'Summarise this' && typeof chipNoKey.answer === 'function')
ok('with a key: left to the core (its own "Summarise this", for the AI)', chipKey === undefined)
const viaCore = typeof Panel.screenChip === 'function' ? Panel.screenChip(chipNoKey, false, HERE) : null
ok('through the core: shown with no key, as an answer (no key settings)', viaCore && viaCore.label === 'Summarise this' && typeof viaCore.answer === 'function' && !viaCore.prompt)
ok('and with a key the core\'s own, which asks the AI about the screen', typeof Panel.screenChip === 'function' && Panel.screenChip(chipKey, true, HERE)?.prompt === Panel.SCREEN_CHIP.prompt)
ok('the handle is on (only off Parent Mode does it ever show: in Parent Mode the robot is in its slot)', config.handle !== false && config.matchTyped !== false)
ok('the welcome\'s four answers carry `match` words', config.welcomePills.filter((p) => p.answer || p.link).every((p) => Array.isArray(p.match) && p.match.length >= 4))

// Typed questions with no key, through the core's own matching.
const demo = buildDemoFamily()
const typed = (route, text, n = 1) => {
  at(demo, route)
  const items = withPilot(false, n, () => Panel.ownPills(config.welcomePills, HERE).concat(Panel.cleanChips(chips(), HERE)))
  return typeof Panel.matchTyped === 'function' ? Panel.matchTyped(text, items)?.label || null : null
}
const HITS = [
  ['/parent', 'Is anything waiting for review?', "What's waiting for me?"],
  ['/parent', 'How do I add a chore?', 'Add a chore for…'],
  ['/parent', 'How are my kids doing this week?', 'How is my kid doing?'],
  ['/parent', 'What can I do here?', 'Explain this screen'],
  ['/parent/approvals', 'Which chore is oldest?', 'Which chore is oldest?'],
  ['/parent/assign', 'Show me the quest packs', 'Where are the quest packs?'],
  ['/parent/assign', 'How do I add a chore?', 'Add a chore for…'],
  ['/parent/settings', 'How do I add a reward?', 'Add a reward'],
  ['/parent/plan', 'What does Elite Pass add?', 'What does Elite Pass add?'],
  ['/parent/pair', "How do I link my child's phone?", "Link my child's phone"],
]
for (const [route, text, want] of HITS) ok(`typed on ${route}: "${text}" gets "${want}"`, typed(route, text) === want, String(typed(route, text)))
const MISSES = [['/parent', 'Write me a poem about dragons'], ['/parent', 'How do I reset my password?'], ['/parent/plan', 'Can I get a refund?'], ['/parent', 'Is it ok?']]
for (const [route, text] of MISSES) ok(`typed on ${route}: "${text}" gets nothing (the key flow, as before)`, typed(route, text) === null, String(typed(route, text)))
ok('no key, once chatting: a suggestion the pills already make is left out, so no typed question is tied between two (core issue 9)',
  (() => { at(demo, '/parent'); return withPilot(false, 2, () => chips()).length === 0 })())
ok('with a key, the whole list once chatting', (() => { at(demo, '/parent'); return withPilot(true, 2, () => chips()).length === 3 })())

// The tab bar's slot (a phone) and the sidebar's (a computer), with core 1.4.2.
const fakeDoc = (left) => ({ documentElement: { dataset: { pilotTabs: 'on' } }, defaultView: { innerWidth: 1440 },
  querySelector: () => ({ getBoundingClientRect: () => ({ left, width: 80 }) }) })
ok('the sidebar\'s slot on a computer: the bottom left corner, never tucked, never hidden', JSON.stringify(rankup.dockedPlace(fakeDoc(12))) === JSON.stringify({ corner: 'bl', peek: false, typing: false }))
ok('the tab bar\'s slot on a phone: the bottom right corner', rankup.dockedPlace(fakeDoc(1350))?.corner === 'br')
const loader = read('public/pilot/pilot.js')
ok('core 1.4.2 still asks placement through window.PilotMascot.placeNow, which RankUp answers first in the slot', /M\(\)\.placeNow\(/.test(loader) && /mascot\.placeNow = \(opts\) =>/.test(rk))
ok('and the handle shows only when placement says "hide" (never in the slot, which never does)', /handle\.update\(Boolean\(place\.hide/.test(loader) && !/hide: true/.test(rk))
ok('no RankUp style moves the tucked robot by --pilot-keep-d (1.4.2 measures --pilot-keep-dy)', !/--pilot-keep-d\b/.test(read('src/styles/index.css')))

console.log('\n=== 1. Recent activity has words for everything it logs ===')
// (Before 0.33.0 these words were inside the dashboard, with no quests_returned.)
const { describeEvent = () => '• Something happened', EVENT_TYPES = [] } = await import('../src/lib/eventWords.js').catch(() => ({}))
const reducerSrc = read('src/state/reducer.js')
const logged = [...new Set([...reducerSrc.matchAll(/logEvent\([\s\S]{0,200}?type:\s*'([a-z_]+)'/g)].map((m) => m[1]))]
const kid = { id: 'k1', name: 'Mia' }
const missing = logged.filter((t) => /Something happened/.test(describeEvent({ type: t, meta: {} }, kid)))
ok(`every event type the reducer logs (${logged.length}) has words of its own`, logged.length >= 15 && missing.length === 0, missing.join(', '))
ok('and is in the list of types with words', logged.every((t) => EVENT_TYPES.includes(t)), logged.filter((t) => !EVENT_TYPES.includes(t)).join())
ok('"quests_returned" is one of them', logged.includes('quests_returned'))
ok('every type on that list has words (the ones logged through a variable too: theme_changed, alliance_joined)', EVENT_TYPES.every((t) => !/Something happened/.test(describeEvent({ type: t, meta: {} }, kid))))
ok('"🔁 3 daily chores are back for today"', describeEvent({ type: 'quests_returned', meta: { count: 3, daily: true } }) === '🔁 3 daily chores are back for today')
ok('"🔁 1 daily chore is back for today"', describeEvent({ type: 'quests_returned', meta: { count: 1, daily: true } }) === '🔁 1 daily chore is back for today')
ok('weekly ones in the mix (or an older log): "repeating chores"', describeEvent({ type: 'quests_returned', meta: { count: 2 } }) === '🔁 2 repeating chores are back for today')
{
  const day = '2026-11-22'
  const base = { ...createInitialState(), onboarded: true, kids: [{ id: 'k1', name: 'Mia' }],
    quests: [{ id: 'a', kidId: 'k1', title: 'Make your bed', status: 'approved', recurrence: 'daily', lastResetOn: '2026-11-21' },
      { id: 'b', kidId: 'k1', title: 'Feed the cat', status: 'approved', recurrence: 'daily', lastResetOn: '2026-11-21' }] }
  const after = reducer(base, { type: 'RETURN_RECURRING', today: day })
  const ev = after.events[after.events.length - 1]
  ok('the reducer logs whether they were all daily', ev?.type === 'quests_returned' && ev.meta.count === 2 && ev.meta.daily === true, JSON.stringify(ev?.meta))
  ok('and the feed reads "🔁 2 daily chores are back for today"', describeEvent(ev) === '🔁 2 daily chores are back for today')
}
ok('the dashboard uses these words (and no list of its own)', /import \{ describeEvent \} from '\.\.\/\.\.\/lib\/eventWords\.js'/.test(read('src/screens/parent/ParentDashboard.jsx'))
  && !/function describeEvent/.test(read('src/screens/parent/ParentDashboard.jsx')))

console.log('\n=== 2. Pilot\'s answers ===')
const fam = family()
const planNow = answers.explainAnswer('/parent/plan', fam, { now })
ok('Plans, during a trial: "you\'re trying Elite Pass free — 6 days left"', /Right now: you're trying Elite Pass free — 6 days left, 2 children/.test(planNow), planNow)
ok('never "you pay for" a plan beside a free trial of it', !/you pay for/.test(planNow) && !/left of the free/.test(planNow))
const planWords = answers.planWords || (() => '')
ok('a paying family: "you pay for Standard"', planWords({ family: { tier: 'standard' } }, now) === 'you pay for Standard')
ok('a family on the free plan: "you\'re on Starter, the free plan"', planWords({ family: { tier: 'starter' } }, now) === "you're on Starter, the free plan")
ok('the demo: on Elite Pass, and nothing is charged', /^you're on Elite Pass in the demo \(nothing is charged\)$/.test(planWords(demo, now)))
ok('Elite paid and a trial of Elite on top: what they pay for, no trial', planWords({ family: { tier: 'elite', trialTier: 'elite', trialEndsAt: now + 5 * DAY } }, now) === 'you pay for Elite Pass')
const ally = (n) => answers.explainAnswer('/parent/alliance', { ...fam, submissions: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, kidId: 'k1', status: 'approved', decidedAt: now - HOUR, awarded: { xp: 10 } })) }, { now })
ok('Alliances: "6 chores accepted in the last 7 days count toward your family\'s total"', /6 chores accepted in the last 7 days count toward your family's total\./.test(ally(6)), ally(6))
ok('and "1 chore … counts"', /1 chore accepted in the last 7 days counts toward your family's total\./.test(ally(1)), ally(1))
at(fam, '/parent/approvals')
const oldestChip = withPilot(false, 1, () => chips()).find((c) => /oldest/i.test(c.label)) || {}
ok('Review, no key: "Which chore is oldest?" (not "Accept the oldest one", which it can\'t do)', oldestChip.label === 'Which chore is oldest?' && typeof oldestChip.answer === 'function')
const oldest = oldestChip.answer ? oldestChip.answer({}) : ''
ok('which chore, how long it waited, and an "Open it" link to Review', /\*\*Feed the cat\*\*, sent 3 hours ago/.test(oldest) && /\[Open it\]\(\/#\/parent\/approvals\)/.test(oldest), oldest)
ok('with a key, "Accept the oldest one" for the AI', withPilot(true, 1, () => chips()).some((c) => c.label === 'Accept the oldest one' && c.prompt))
const sumReview = answers.summaryAnswer('/parent/approvals', fam, { now })
const expReview = answers.explainAnswer('/parent/approvals', fam, { now })
ok('"Summarise this" leads with the numbers', /^\*\*Review, in short:\*\*\n\n- 2 chores waiting for review\n- The oldest sent 3 hours ago/.test(sumReview), sumReview)
ok('and ends on one next step', /\n\n\*\*Next:\*\* Accept \*\*Feed the cat\*\*, at the top: it has waited longest\.$/.test(sumReview), sumReview)
ok('not a repeat of "Explain this screen" (none of its sentences)', !expReview.split('\n\n')[0].split(/(?<=\.)\s/).some((s) => s.length > 20 && sumReview.includes(s.replace(/\*\*/g, ''))))
const parentRoutes = Object.keys(rankup._test.SCREENS).filter((r) => r.startsWith('/parent'))
const withNext = parentRoutes.filter((r) => /\*\*Next:\*\*/.test(answers.summaryAnswer(r, fam, { now })))
ok(`a next step on the screens a parent acts on (${withNext.length} of ${parentRoutes.length})`, withNext.length >= 14, parentRoutes.filter((r) => !withNext.includes(r)).join())
const sumHome = answers.summaryAnswer('/parent', fam, { now, scrub: (t) => t.replace(/Mia/g, '[name]') })
ok('Home\'s next step: open Review and accept the oldest', /\*\*Next:\*\* \[Open Review\]\(\/#\/parent\/approvals\) and accept the oldest, \*\*Feed the cat\*\*\./.test(sumHome), sumHome)
const allSums = parentRoutes.map((r) => answers.summaryAnswer(r, fam, { now })).join('\n')
ok('no child\'s or family\'s name in any summary', !/\b(Mia|Noah|Rivera|Sam)\b/.test(allSums))
ok('Pilot passes its name scrubber to the summary', /summaryAnswer\(fullRoute\(\), state\(\), \{ scrub \}\)/.test(rk))

console.log('\n=== 3. Pilot docked at the right on a computer ===')
const css = read('src/styles/index.css')
const desk = css.slice(css.indexOf('@media (min-width: 1100px)'))
ok('from 1100px, the chat is a panel down the right edge, the whole height', /html\[data-area='parent'\]\[data-pilot-tabs='on'\] \.pilot-root\.rk-pilot \.pilot-panel \{\s*left: auto; right: 16px; top: 16px; bottom: 16px; width: var\(--rk-dock\); height: auto;/.test(desk))
ok('while it is open the screen moves over by its width', /\[data-pilot-open='on'\] body \{ padding-right: calc\(var\(--rk-dock\) \+ 32px\); \}/.test(desk))
ok('the plans one to a row while it is open below 1400px', /@media \(min-width: 1100px\) and \(max-width: 1399px\) \{\s*html\[data-area='parent'\]\[data-pilot-tabs='on'\]\[data-pilot-open='on'\] \.plan-cards \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css)
  && /className="plan-cards /.test(read('src/screens/parent/ParentPlan.jsx')))
ok('RankUp marks the page while Pilot\'s chat is open (data-pilot-open), from the core\'s own class', /root\.classList\.contains\('pilot-open'\)/.test(rk) && /html\.dataset\.pilotOpen = 'on'/.test(rk) && /syncOpen\(null\)/.test(rk))
ok('the dashboard keeps two columns while it is open only from 1400px', /const desk = wide && \(!pilotOpen \|\| roomy\)/.test(code('src/screens/parent/ParentDashboard.jsx'))
  && /useRootFlag\('pilotOpen'\)/.test(read('src/screens/parent/ParentDashboard.jsx')))
ok('core 1.4.2 fades the chat\'s top edge when scrolled (no half-cut chips under the header)', /\.pilot-scroll\.pilot-scrolled \{[^}]*mask-image/.test(read('public/pilot/pilot-panel.css')))

console.log('\n=== 4. The level-up ===')
const lcss = read('src/styles/levelup.css')
ok('the card above the confetti: the pieces fall behind the words and the button', /\.levelup-card \{[^}]*z-index: 1;/.test(lcss) && /\.levelup-confetti \{[^}]*z-index: 0;/.test(lcss))
const { levelNews, choresBehind = () => -1, levelKey } = await import('../src/lib/kidLevel.js')
const { totalXpForLevel } = await import('../src/lib/xp.js')
{
  const lv3 = totalXpForLevel(3)
  const lv4 = totalXpForLevel(4)
  const one = { id: 'k', xp: lv4 + 5 }
  const subs = [{ id: 'x', kidId: 'k', status: 'approved', decidedAt: now - HOUR, awarded: { xp: 40 } }]
  ok('one chore took them up: 1', choresBehind({ submissions: subs }, one, 3) === 1)
  const two = { id: 'k', xp: lv4 + 2 }
  const subs2 = [{ id: 'a', kidId: 'k', status: 'approved', decidedAt: now - 2 * HOUR, awarded: { xp: 10 } },
    { id: 'b', kidId: 'k', status: 'approved', decidedAt: now - HOUR, awarded: { xp: 1 } }, { id: 'c', kidId: 'k', status: 'approved', decidedAt: now - 3 * HOUR, awarded: { xp: 400 } }]
  ok('two chores took them up: 2', choresBehind({ submissions: subs2 }, two, 3) === 2)
  ok('XP from elsewhere: 0 ("chores")', choresBehind({ submissions: [] }, one, 3) === 0)
  const news = levelNews({ seen: { [levelKey('k', 3)]: 1 }, submissions: subs }, one, now).news
  ok('the news carries it', news && news.from === 3 && news.to === 4 && news.chores === 1, JSON.stringify(news))
  ok('(level 3 starts where it should)', lv3 < lv4)
}
const overlay = code('src/components/LevelUpOverlay.jsx')
ok('"Your chore was accepted" for one, "Your chores were accepted" otherwise', /levelUp\.chores === 1 \? 'Your chore was accepted' : 'Your chores were accepted'/.test(overlay))

console.log('\n=== 5. What the trial\'s boost has given so far ===')
const { trialBoostSoFar = () => null, trialHeadsUp, trialStart = () => null } = await import('../src/lib/trialHeadsUp.js')
const f5 = family({ trialDays: 2 })
ok('the trial began its length before it ends', trialStart(f5.family) === f5.family.trialEndsAt - TRIAL_DAYS * DAY)
ok('"Mia +15 XP": the boost on the chores accepted in the trial', trialBoostSoFar(f5, TIERS.elite, TIERS.starter, now) === 'Mia +15 XP', String(trialBoostSoFar(f5, TIERS.elite, TIERS.starter, now)))
const before = { ...f5, submissions: f5.submissions.map((s) => (s.id === 's3' ? { ...s, decidedAt: trialStart(f5.family) - DAY } : s)) }
ok('a chore accepted before the trial does not count', trialBoostSoFar(before, TIERS.elite, TIERS.starter, now) === null)
ok('nothing when the plan they pay for has the same boost', trialBoostSoFar(f5, TIERS.elite, TIERS.elite, now) === null)
const heads = trialHeadsUp(f5, TIERS.elite, TIERS.starter, 2, now)
ok('the heads-up says it: "The boost so far: Mia +15 XP."', /On Starter, Mia and Noah's 1\.5× boost and the Elite tools stop\. The boost so far: Mia \+15 XP\. Everything your children have earned stays theirs\.$/.test(heads), heads)
ok('no price in it', !/\$\d|\/mo|price/i.test(heads))
const plan = code('src/screens/parent/ParentPlan.jsx')
ok('the Elite card on Plans says it during the trial', /tier\.id === trialTier && soFar && \(/.test(plan) && /Your trial's \{tier\.xpMultiplier\}× boost so far: <span data-pilot-private="">\{soFar\}<\/span>/.test(plan))
const kidFiles = readdirSync('src/screens/kid').map((f) => code(`src/screens/kid/${f}`)).join('\n')
ok('never on a child\'s screen', !/trialBoostSoFar|boost so far|plan-trial-boost/.test(kidFiles))

console.log('\n=== 6. Polish ===')
const strip = code('src/components/DoorStrip.jsx')
const loop = code('src/components/LoopPreview.jsx')
ok('the door\'s demo phone rests at Noah level 3, ✨ 47', /Level \{won \? 4 : 3\}/.test(loop) && /✨ \{won \? 62 : 47\}/.test(loop))
ok('and the strip below says the same (it said level 4, ✨ 62)', /Level 3 · Pegasus Horizon · ✨ 47/.test(strip) && /Noah has ✨ 47/.test(strip) && !/Level 4|✨ 62/.test(strip))
ok('the rewards\' bars from ✨ 47 (78%, 52%, 19% of 60, 90, 250)', /60, 78\].*90, 52\].*250, 19\]/.test(strip) && /\.ds-bar-78 > span \{ width: 78%; \}/.test(read('src/styles/doorstrip.css')))
ok('Share: "Nothing leaves this device until you press Share or Copy."', /Nothing leaves this device until you press Share or Copy\./.test(read('src/components/ThisWeek.jsx')) && !/leaves this phone/.test(read('src/components/ThisWeek.jsx')))
const banner = code('src/components/TrialBanner.jsx')
ok('the last-days banner leaves out its pitch line while the heads-up shows', /const words = headsUp \? room : \(/.test(banner) && /gives you/.test(banner))
ok('the heads-up comes first, then "Compare plans"', banner.indexOf('trial-heads-up') < banner.indexOf('Compare plans</button>') || banner.indexOf('data-testid="trial-heads-up"') < banner.indexOf('data-testid="trial-words"'))
const home = read('src/screens/kid/KidHome.jsx')
ok('the Sunday Market card is padded like the rows above it', /className="card w-full mb-3 p-3 flex items-center gap-3 text-left[^"]*"\s*style=\{\{ borderColor: 'var\(--accent\)' \}\}\s*data-testid="open-market"/.test(home)
  && /<span className="text-2xl shrink-0" aria-hidden="true">🛍️<\/span>/.test(home))

console.log('\n=== Kept as they were ===')
const gate = read('src/lib/pilotGate.js')
ok('Pilot\'s gate is unchanged in this release (front door, before role, world picker, kid screens and phones)', gate.length > 1000)
ok('no price or plan name on a child\'s Home', !/priceTag|\$\d|\/mo\b|Elite Pass|Starter|Standard/.test(code('src/screens/kid/KidHome.jsx')))
const touched = ['src/pilot/pilotRankUp.js', 'src/pilot/pilotAnswers.js', 'src/lib/eventWords.js', 'src/lib/trialHeadsUp.js', 'src/lib/thisWeek.js', 'src/lib/kidLevel.js',
  'src/lib/useMedia.js', 'src/components/TrialBanner.jsx', 'src/components/LevelUpOverlay.jsx', 'src/components/DoorStrip.jsx', 'src/screens/parent/ParentPlan.jsx',
  'src/screens/parent/ParentDashboard.jsx', 'src/screens/kid/KidHome.jsx', 'src/styles/index.css', 'src/styles/levelup.css']
const banned = /claude-[a-z0-9-]*\d|gpt-[0-9]|gemini-[0-9]|sk-[A-Za-z0-9]{12}|dangerouslySetInnerHTML|<script/i
ok('no model names, keys or inline scripts in any file changed', touched.every((f) => !banned.test(read(f))), touched.filter((f) => banned.test(read(f))).join())
ok('no new inline style in the changed screens\' new lines (the new pieces use classes)', !/data-testid="plan-trial-boost"[^>]*style=/.test(read('src/screens/parent/ParentPlan.jsx')))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
