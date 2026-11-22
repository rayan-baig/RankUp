/**
 * 0.32.0, in plain Node: the fixes from the round-8 strict review.
 * tests/fixes32ui.mjs walks the same in a real browser.
 *
 *   1. the level-up as big as the other celebrations: confetti, a burst, a
 *      bigger number, about five and a half seconds or until tapped, its
 *      own chime (Sounds), words only under reduce motion;
 *   2. Pilot on its own: "Summarise this" and every parent screen's own
 *      suggestion answer with no AI key; with a key the AI still does what
 *      takes the AI;
 *   3. "Explain this screen": each parent screen its own words and its own
 *      "Right now" counts (Rewards: rewards and costs; Plans: the plan and
 *      the days left), never the generic line;
 *   4. what the boost gave, in XP, from the chores accepted, and the week
 *      as a few lines to share, sent nowhere until the parent says;
 *   5. the trial banner: "stays theirs" once, and "room for every child"
 *      only for a family with more children than its plan has room for;
 *   6. a computer: a strip of real screens under the front door (no Block
 *      Craft), and one dashboard column when two cannot be balanced.
 */
import { readFileSync, existsSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const DAY = 86400000
const now = Date.now()

const moments = await import('../src/lib/moments.js')
const { pilotSnapshot, updatePilot } = await import('../src/lib/pilotGate.js')
const rankup = await import('../src/pilot/pilotRankUp.js')
const { config, chips, SCREENS } = rankup._test
const answers = await import('../src/pilot/pilotAnswers.js')
const week = await import('../src/lib/thisWeek.js')
const { createInitialState, TIERS } = await import('../src/state/initialState.js')

console.log('\n=== 1. The level-up, as big as the other celebrations ===')
ok('it stays about five and a half seconds (a new world six and a half), not 2.5', moments.LEVEL_UP_MS >= 5000 && moments.NEW_WORLD_MS > moments.LEVEL_UP_MS
  && moments.NEW_WORLD_MS <= moments.LEVEL_UP_MAX_MS, `${moments.LEVEL_UP_MS} / ${moments.NEW_WORLD_MS}`)
ok('a tap in its first moment does not close it (a double tap on Accept)', moments.LEVEL_UP_GRACE_MS >= 300 && moments.LEVEL_UP_GRACE_MS < 1000)
const overlay = code('src/components/LevelUpOverlay.jsx')
const lcss = read('src/styles/levelup.css')
ok('confetti down the screen and a burst behind the avatar, never under reduce motion',
  /\{!still && <Confetti \/>\}/.test(overlay) && /\{!still && <span className="levelup-rays"/.test(overlay) && /\{!still && \(\s*<span className="levelup-stars"/.test(overlay)
  && /\.levelup-confetti \{ position: fixed; inset: 0;[^}]*pointer-events: none; \}/.test(lcss))
ok('reduce motion: RankUp\'s own setting or the device\'s', /const still = deviceStill \|\| Boolean\(state\?\.settings\?\.reduceMotion\)/.test(overlay))
ok('the number counts up, and under reduce motion simply shows', /\{still \? levelUp\.to : <CountUp value=\{levelUp\.to\} from=\{levelUp\.from\}/.test(overlay))
const px = (sel, media = false) => {
  const body = media ? lcss.slice(lcss.indexOf('@media (min-width: 1024px)')) : lcss.slice(0, lcss.indexOf('@media'))
  const m = new RegExp(`\\${sel} \\{[^}]*font-size: (\\d+)px`).exec(body)
  return m ? Number(m[1]) : 0
}
ok(`a bigger number: ${px('.levelup-number')}px on a phone (was 36), ${px('.levelup-number', true)}px on a computer`, px('.levelup-number') >= 72 && px('.levelup-number', true) >= 110)
ok('a bigger avatar and card on a computer', /size=\{wide \? 184 : 140\}/.test(overlay) && /useMedia\('\(min-width: 1024px\)'\)/.test(overlay))
ok('it stays until tapped: its own button ("Awesome!" for a child, "Carry on" for a parent) or anywhere',
  /\{forChild \? 'Awesome!' : 'Carry on'\}/.test(overlay) && /data-testid="level-up-ok" onClick=\{tap\}/.test(overlay) && /Or tap anywhere/.test(overlay))
ok('its chime plays as it opens, on every screen it shows on, through chime() (Sounds)', /useEffect\(\(\) => \{ chime\(state, 'level'\) \}, \[\]\)/.test(overlay)
  && !/chime\(state, 'level'\)/.test(code('src/screens/kid/KidHome.jsx')))
const { chime } = await import('../src/lib/chime.js')
ok('and stays quiet with Sounds off', chime({ settings: { soundOn: false } }, 'level') === false)
ok('it comes with its own stylesheet, never in the first load', /import '\.\.\/styles\/levelup\.css'/.test(read('src/components/LevelUpOverlay.jsx'))
  && /lazyLoad\(\(\) => import\('\.\/components\/LevelUpOverlay\.jsx'\)\)/.test(read('src/App.jsx')))
ok('no price or plan name in it (a child sees it)', !Object.values(TIERS).some((t) => overlay.includes(t.name)) && !/\$\d/.test(overlay))
ok('Pilot still steps back for it', /data-testid="level-up" data-pilot-modal=""/.test(overlay))

console.log('\n=== 2 and 3. Pilot on its own: every screen explained, every suggestion answered ===')
const family = {
  ...createInitialState(),
  onboarded: true,
  session: { role: 'parent', parentUnlocked: true },
  family: { ...createInitialState().family, id: 'f1', name: 'The Rivera Family', parentName: 'Maria Rivera', tier: 'starter', trialTier: 'elite', trialEndsAt: now + 5 * DAY + 3600000 },
  kids: [{ id: 'k1', name: 'Ava', xp: 300, coins: 40, pairedDeviceAt: now - DAY }, { id: 'k2', name: 'Noah', xp: 90, coins: 12 }],
  rewards: [{ id: 'r1', name: "Pick Friday's film", cost: 60 }, { id: 'r2', name: 'Ava picks dinner', cost: 90 }, { id: 'r3', name: 'Day out', cost: 250 }],
  redemptions: [{ id: 'd1', kidId: 'k1', status: 'requested', name: 'Ava picks dinner' }],
  quests: [
    { id: 'q1', kidId: 'k1', title: 'Feed the cat', status: 'submitted' },
    { id: 'q2', kidId: 'k2', title: 'Help Ava with the bins', status: 'submitted' },
    { id: 'q4', kidId: 'k2', title: 'Make your bed', status: 'assigned', recurrence: 'daily' },
    { id: 'q5', kidId: 'k1', title: 'Dishes', status: 'approved' },
  ],
  submissions: [
    { id: 's1', kidId: 'k1', questId: 'q1', status: 'pending', submittedAt: now - 3 * 3600000 },
    { id: 's2', kidId: 'k2', questId: 'q2', status: 'pending', submittedAt: now - 3600000 },
    { id: 's4', kidId: 'k1', questId: 'q5', status: 'approved', decidedAt: now - 3600000, awarded: { xp: 45, lines: [{ label: 'Base quest XP', value: 30 }, { label: '1.5× XP boost', value: 15 }] } },
    { id: 's5', kidId: 'k2', questId: 'q5', status: 'approved', decidedAt: now - DAY, awarded: { xp: 30 } },
  ],
}
const NAMES = /\b(Ava|Noah|Rivera|Maria)\b/
const GENERIC = /a RankUp screen for grown-ups/
const at = (route, state = family) => { updatePilot({ state, route, dispatch: () => {} }); return pilotSnapshot()?.route === route }
const withPilot = (ready, n, fn) => {
  globalThis.window = { Pilot: { ready: () => ready, store: { loadChat: () => Array.from({ length: n }, () => ({ role: 'user', text: 'hi' })) } } }
  try { return fn() } finally { delete globalThis.window }
}
const run = (item, ctx = { ready: false }) => (typeof item.answer === 'function' ? item.answer(ctx) : item.answer)

const parentScreens = Object.keys(SCREENS).filter((r) => r.startsWith('/parent'))
const generic = parentScreens.filter((r) => GENERIC.test(answers.explainAnswer(r, family)))
ok(`every parent screen (${parentScreens.length}) has its own words, never "a RankUp screen for grown-ups"`, parentScreens.length >= 19 && generic.length === 0, generic.join())
ok('no answer anywhere says it any more', !GENERIC.test(code('src/pilot/pilotAnswers.js')))
const rewardsText = answers.explainAnswer('/parent/rewards', family)
ok('Rewards: what the rewards are for, and right now the rewards and what they cost',
  /\*\*Rewards\*\*/.test(rewardsText) && /Right now: 3 rewards, costing 60 to 250 coins, 1 waiting to be handed over\./.test(rewardsText), rewardsText)
ok('Settings opened at its rewards is Rewards too', answers.explainAnswer('/parent/settings?open=rewards', family) === rewardsText)
ok('and #/parent/rewards is a real screen (Settings, opened at the rewards)', /route === '\/parent\/rewards'\) return <ParentSettings open="rewards" \/>/.test(read('src/App.jsx')))
const planText = answers.explainAnswer('/parent/plan', family)
// 0.33.0: "you're trying Elite Pass free — 6 days left", not "you pay for Starter, 6 days left of the free … trial".
ok('Plans: right now the plan tried and the trial\'s days left', /Right now: you're trying Elite Pass free — 6 days left, 2 children, and Starter has room for 1\./.test(planText), planText)
const reviewText = answers.explainAnswer('/parent/approvals', family, { now })
ok('Review: right now how many wait, and the oldest', /Right now: 2 chores waiting for review, the oldest sent 3 hours ago\./.test(reviewText), reviewText)
const facts = parentScreens.map((r) => (answers.explainAnswer(r, family).split('Right now: ')[1] || ''))
ok('the counts fit each screen: not the same three on every screen', new Set(facts.filter(Boolean)).size >= 12, `${new Set(facts.filter(Boolean)).size} different`)
ok('a page that is not one of RankUp\'s says so, with a way Home', /not one of RankUp's screens/.test(answers.explainAnswer('/parent/nowhere', family)) && /\[Home\]/.test(answers.explainAnswer('/parent/nowhere', family)))
ok('the Pilot screen list knows Rewards', /Rewards/.test(SCREENS['/parent/rewards'] || ''))

const summary = answers.summaryAnswer('/parent/rewards', family)
ok('"Summarise this", with no key: a few short points about the screen, from the phone', /^\*\*Rewards, in short:\*\*\n\n- /.test(summary) && summary.split('\n- ').length >= 3, summary)
ok('every screen has its summary, never the generic line', parentScreens.every((r) => /in short:/.test(answers.summaryAnswer(r, family))))
// 0.33.0: the tap-catching workaround is gone; core 1.4.2's config.screenChip
// puts RankUp's own "Summarise this" in the core's place (tests/fixes33.mjs).
ok('the 0.32.0 workaround is gone: RankUp\'s summary is config.screenChip now', !/isSummaryChip|watchSummary|addEventListener\('click'/.test(code('src/pilot/pilotRankUp.js'))
  && /get screenChip\(\)/.test(code('src/pilot/pilotRankUp.js')))

const noKey = []
for (const r of parentScreens) {
  at(r)
  for (const c of withPilot(false, 1, () => chips())) noKey.push([r, c])
}
const prompts = noKey.filter(([, c]) => c.answer === undefined && !c.link)
ok(`with no key, every parent screen's suggestions answer or open a screen (${noKey.length}): none asks for a key`, noKey.length >= 6 && prompts.length === 0,
  prompts.map(([r, c]) => `${r} ${c.label}`).slice(0, 4).join(' | '))
at('/parent/approvals')
// 0.33.0: with no key it is "Which chore is oldest?" (the pills it repeats left out), with an "Open it" link.
const oldest = run(withPilot(false, 1, () => chips()).find((c) => c.label === 'Which chore is oldest?') || {})
ok('Review\'s "Which chore is oldest?": which chore, how long it waited, and Review', /The oldest chore waiting is \*\*Feed the cat\*\*, sent 3 hours ago/.test(oldest) && /\[Open it\]\(/.test(oldest), oldest)
ok('with a key it is the AI\'s again (it can accept it)', withPilot(true, 1, () => chips())[2].prompt === 'Accept the oldest chore that is waiting.')
at('/parent/assign')
ok('Assign\'s "Add 3 starter chores": where the packs are, with no key ("Where are the quest packs?" since 0.33.0); the AI with one', /Quest packs/.test(run(withPilot(false, 1, () => chips()).find((c) => c.label === 'Where are the quest packs?') || {}))
  && withPilot(true, 1, () => chips())[2].prompt === 'Add the 3 starter chores.')
for (const r of ['/gift', '/school']) {
  at(r, { ...createInitialState(), onboarded: false })
  ok(`${r}: its suggestions are answered at once too`, withPilot(false, 1, () => chips()).every((c) => typeof c.answer === 'string' && c.answer.length > 60))
}
const said = noKey.map(([r, c]) => { at(r); return [r, c.label, c.answer === undefined ? '' : run(c)] }).concat(parentScreens.map((r) => [r, 'summary', answers.summaryAnswer(r, family)]))
const named = said.filter(([, , t]) => NAMES.test(t))
ok(`no child's, family's or grown-up's name in any of these answers (${said.length})`, named.length === 0, named.map(([r, l, t]) => `${r} ${l}: ${t.slice(0, 80)}`).slice(0, 3).join(' | '))
ok('a chore title naming a child is still "[name]"', /\[name\]/.test(answers.oldestAnswer({ ...family, submissions: [family.submissions[1]] }, { scrub: (t) => rankup.withoutNames(t, rankup.privateNames(family)) })))

console.log('\n=== 4. What the boost gave, and the week to share ===')
ok('the boost\'s XP from a chore\'s own breakdown', week.boostOf({ awarded: { xp: 45, lines: [{ label: 'Base quest XP', value: 30 }, { label: '1.5× XP boost', value: 15 }] } }) === 15)
ok('a chore with no breakdown (accepted on another phone): worked back from its XP while the plan has a boost', week.boostOf({ awarded: { xp: 45 } }, { multiplier: 1.5 }) === 15
  && week.boostOf({ awarded: { xp: 45 } }, { multiplier: 1 }) === 0)
ok('a chore paid with no boost adds nothing', week.boostOf({ awarded: { xp: 30, lines: [{ label: 'Base quest XP', value: 30 }] } }, { multiplier: 1.5 }) === 0)
const kids = week.kidsThisWeek(family, now, 1.5)
ok('each child\'s week: chores, XP and the boost\'s share', JSON.stringify(kids.map((k) => [k.name, k.chores, k.xp, k.boost])) === JSON.stringify([['Ava', 1, 45, 15], ['Noah', 1, 30, 10]]), JSON.stringify(kids))
ok('in words: "The 1.5× XP boost gave Ava 15 extra XP and Noah 10 this week."', week.boostWords(kids, 1.5) === 'The 1.5× XP boost gave Ava 15 extra XP and Noah 10 this week.', week.boostWords(kids, 1.5))
ok('nothing from the boost: no line', week.boostWords(week.kidsThisWeek(family, now, 1).map((k) => ({ ...k, boost: 0 })), 1) === null)
const share = week.weekShareText(family, now, 1.5)
ok('the week to share: numbers against last week, each child, the boost', /^Our week on RankUp \(/.test(share) && /- 2 chores done \(new this week\)/.test(share)
  && /- 75 XP earned/.test(share) && /Ava: 1 chore, 45 XP\. Noah: 1 chore, 30 XP\./.test(share) && /boost gave Ava 15/.test(share), share)
ok('no family name, surname or grown-up in it', !/Rivera|Maria|family/i.test(share.replace('Our week on RankUp', '')))
const tw = code('src/components/ThisWeek.jsx')
ok('This week shows the boost line, parent-only, names marked private for Pilot', /data-testid="week-boost"/.test(tw) && /<span data-pilot-private="">\{boost\}<\/span>/.test(tw))
ok('nothing leaves the phone until Share or Copy is pressed (both only in their handlers)',
  /const share = async \(\) => \{\s*try \{\s*await navigator\.share/.test(tw) && /const copy = async \(\) => \{\s*try \{\s*await navigator\.clipboard\.writeText\(text\)/.test(tw)
  && (tw.match(/navigator\.share\(/g) || []).length === 1 && (tw.match(/clipboard\.writeText\(/g) || []).length === 1 && /This is what would be sent\. Nothing leaves this device until you press Share or Copy\./.test(tw))
ok('the plan screen says it too', /data-testid="plan-boost"/.test(read('src/screens/parent/ParentPlan.jsx')))
ok('children never see it: This week and the plan screen are parent screens only', !/ThisWeek|weekShareText|boostWords/.test(read('src/screens/kid/KidHome.jsx') + read('src/screens/kid/KidProfile.jsx')))

console.log('\n=== 5. The trial banner ===')
const banner = code('src/components/TrialBanner.jsx')
ok('"room for every child" only when the family has more children than its plan has room for',
  /if \(extra && plan\.limits\.maxKids > paid\.limits\.maxKids\) gives\.push\('room for every child'\)/.test(banner))
ok('with the heads-up showing, "theirs to keep" is not said again above it', /const words = headsUp \? room : \(/.test(banner) && /\{' Everything your children earn is theirs to keep, whatever you choose\.'\}/.test(banner))
const { trialHeadsUp } = await import('../src/lib/trialHeadsUp.js')
ok('the heads-up keeps its one "stays theirs" sentence', /Everything your children have earned stays theirs\.$/.test(trialHeadsUp(family, TIERS.elite, TIERS.starter, 2) || ''))

console.log('\n=== 6. On a computer ===')
const door = read('src/screens/Welcome.jsx')
ok('the front door fetches its strip of screens only on a computer window, after loading', /lazyLoad\(\(\) => import\('\.\.\/components\/DoorStrip\.jsx'\)\)/.test(door)
  && /min-width: 960px\) and \(min-height: 700px\)/.test(door) && /\{strip && <Suspense fallback=\{null\}><DoorStrip \/><\/Suspense>\}/.test(door))
const strip = read('src/components/DoorStrip.jsx')
ok('four of the app\'s real screens: Review, a child\'s world, Rewards, This week', (strip.match(/<figure className="door-tile">/g) || []).length === 4
  && /Accept/.test(strip) && /Do this next/.test(strip) && /Rewards/.test(strip) && /This week/.test(strip))
ok('no Block Craft picture: RankUp\'s own drawing of Pegasus Horizon only', !/block|craft|assets\/art/i.test(code('src/components/DoorStrip.jsx')) && /drawn\/avatar-pegasus\.svg/.test(strip)
  && existsSync('public/drawn/avatar-pegasus.svg'))
ok('its look is its own stylesheet, fetched with it', /import '\.\.\/styles\/doorstrip\.css'/.test(strip) && !/\.door-strip \{/.test(read('src/styles/index.css')))
ok('decoration only: hidden from screen readers (the four steps say the same)', /aria-hidden="true" data-testid="door-strip"/.test(strip))
ok('a bigger title on a computer', /\.door \.door-head h1 \{ font-size: 3\.4rem; \}/.test(read('src/styles/desk.css')))
const dash = code('src/screens/parent/ParentDashboard.jsx')
ok('the dashboard measures its two columns and goes to one when they cannot be balanced', /export const ONE_COLUMN_BELOW = 0\.7\d/.test(read('src/screens/parent/ParentDashboard.jsx'))
  && /Math\.min\(a, b\) \/ Math\.max\(a, b\) < ONE_COLUMN_BELOW/.test(dash) && /data-cols=\{twoCols \? '2' : '1'\}/.test(dash))
ok('one column: the phone\'s order, as wide as a card reads well', /\.dash-cols\[data-cols='1'\] \{ display: block; \}/.test(read('src/styles/desk.css'))
  && /\.shell\.dash-wide\.dash-one \{ max-width: 48rem; \}/.test(read('src/styles/desk.css')) && /\{!twoCols && stats\}/.test(dash))

console.log('\n=== Pilot core 1.4.1 (1.4.2 since 0.33.0) ===')
ok('the core is 1.4.1 or later (fingerprints in tests/fixes28.mjs, its own tests in tests/js/pilot.test.js)', /const VERSION = "1\.4\.[1-9]"/.test(read('public/pilot/pilot.js')))
ok('an answer of RankUp\'s own never goes to the AI company (the core\'s stand-in)', /LOCAL_STANDIN/.test(read('public/pilot/pilot-engine.js')))
const sets = rankup.PICTURE_SETS || {}
ok('a crisp robot on phones: the four picture sets on Pilot\'s script tag, each file there', Object.keys(sets).join() === 'robotSet,restBodySet,restHeadSet,restEyesSet'
  && Object.values(sets).flat().every(([f]) => existsSync(`public/${f}`)) && /tag\.dataset\[key\] = list\.map/.test(read('src/pilot/pilotRankUp.js')))
ok('the resting robot\'s layers left out under reduce motion, like the moving robot', /if \(still && key !== 'robotSet'\) continue/.test(read('src/pilot/pilotRankUp.js')))
ok('the one-line key note stays (core 1.4.1 shows it for the whole chat, with More)', config.keyNoteShort === 'AI keys are for grown-ups (18+).')
ok('the "Want more?" line: once per chat (core 1.4.1), RankUp\'s summary follows the same rule', /once per chat/.test(read('public/pilot/pilot-panel.js')))

console.log('\n=== Kept as they were ===')
ok('no Pilot on the front door or its strip', !/pilot/i.test(code('src/components/DoorStrip.jsx')) && !/pilot/i.test(code('src/screens/Welcome.jsx')))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
