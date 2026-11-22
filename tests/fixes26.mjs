/**
 * The fixes from the strict review at 77% (0.26.0), in plain Node: the rules,
 * and the files that carry them. tests/fixes26ui.mjs walks the same fixes in
 * a real browser.
 *
 *   1. Pilot is never on the front door or anything shown before a role is
 *      chosen: only after "I'm a parent", in Parent Mode, and on the gift and
 *      School League pages;
 *   2. Pilot keeps clear of what a parent taps: the "waiting for you" card,
 *      the plan buttons, the rows of Settings, Review's buttons, the header
 *      buttons; in Parent Mode on a phone it sits in the tab bar's own slot;
 *   3. the daily chore bonus only after a parent has accepted a chore that
 *      day, in the app and in the database;
 *   4. Pilot's suggestions lead with RankUp's own, and one plain sentence
 *      says what an AI key is and where a grown-up gets one;
 *   5. a real weekly goal (chores accepted this week, out of a number the
 *      parent sets), and a tab bar as wide as the column;
 *   6. Noah's world in the demo is Pegasus; no plan's name on a child's
 *      screen; room under the story chapter's buttons.
 */
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => readFileSync(f, 'utf8')
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const { pilotRoute, pilotShows, updatePilot, markParentScreen } = await import('../src/lib/pilotGate.js')
const { createInitialState, makeKid } = await import('../src/state/initialState.js')
const { reducer, choreAcceptedToday } = await import('../src/state/reducer.js')
const { buildDemoFamily } = await import('../src/lib/demoFamily.js')
const { weeklyGoalProgress, weekStartOf, weeklyGoalOf, DEFAULT_WEEKLY_GOAL, cleanWeeklyGoal } = await import('../src/lib/weeklyGoal.js')
const { calcReward } = await import('../src/lib/xp.js')

console.log('\n=== 1. No Pilot on the front door ===')
const visitor = createInitialState()
const at = (route) => { updatePilot({ state: visitor, route, dispatch: () => {} }); return pilotShows() }
ok('the front door, for anybody: no Pilot', !at('/welcome') && !at('/'))
ok('the route check alone says no to the door', !pilotRoute('/welcome', visitor) && !pilotRoute('/', visitor))
markParentScreen(1)
ok('after "I\'m a parent": yes, for the grown-up setting up', at('/welcome'))
markParentScreen(-1)
ok('back to choosing a role: no', !at('/welcome'))
ok('the gift and School League pages: yes', ['/gift', '/school', '/district'].every(at))
const onboarding = read('src/screens/Onboarding.jsx')
ok('the parent\'s set-up says so with useParentHere(mode === \'parent\' …)', /useParentHere\(mode === 'parent'( && !worldPicker)?\)/.test(onboarding))
ok('the door (Welcome) knows nothing of Pilot', !/pilot/i.test(code('src/screens/Welcome.jsx')))

console.log('\n=== 2. Pilot keeps clear of what a parent taps ===')
const rankup = read('src/pilot/pilotRankUp.js')
ok('the core is told to avoid [data-pilot-primary] and the demo\'s banner as well as [data-pilot-avoid]', /avoid: \['\[data-pilot-avoid\]', '\[data-pilot-primary\]', '\.demo-bar'\]/.test(rankup))
for (const [file, what] of [
  ['src/screens/parent/ParentDashboard.jsx', 'the "waiting for you" card and "Hand to a kid"'],
  ['src/screens/parent/ParentPlan.jsx', 'the plan buttons ("Move to Starter · free")'],
  ['src/components/ui.jsx', 'every Settings row (Section)'],
  ['src/screens/parent/ParentApprovals.jsx', 'Review\'s Accept and Send back'],
]) ok(`${what} carries data-pilot-primary`, /data-pilot-primary=""/.test(read(file)))
const nav = read('src/components/NavBar.jsx')
ok('the tab bar is avoided and, in Parent Mode, has a slot for the robot', /data-pilot-avoid=""/.test(nav) && /data-pilot-dock=""/.test(nav) && /pilotDock/.test(read('src/App.jsx')))
const css = read('src/styles/index.css')
ok('on a phone the robot sits in that slot, never above the screen\'s content', /\.tabbar-dock \{ display: block; flex: 0 0 56px; \}/.test(css))

// Where the core is told the robot sits while the bar's slot is showing.
const { dockedPlace } = await import('../src/pilot/pilotRankUp.js')
const fakeDoc = (tabs, width = 56) => ({ documentElement: { dataset: { pilotTabs: tabs } },
  querySelector: () => ({ getBoundingClientRect: () => ({ width }) }) })
ok('in Parent Mode with the slot showing: the bottom right corner, not tucked away',
  JSON.stringify(dockedPlace(fakeDoc('on'))) === JSON.stringify({ corner: 'br', peek: false, typing: false }))
ok('slot hidden (a wide screen): the core decides', dockedPlace(fakeDoc('on', 0)) === null)
ok('off Parent Mode: the core decides', dockedPlace(fakeDoc('off')) === null)
ok('the core\'s own placeNow is wrapped, its files untouched', /mascot\.placeNow = \(opts\) =>/.test(rankup))
const core = read('public/pilot/pilot.js')
ok('Pilot core 1.1.1 or later (1.3.0 since 0.29.0), which asks placeNow where to sit', /const VERSION = "1\.(1\.1|[2-9]\.\d+)"/.test(core) && /M\(\)\.placeNow\(/.test(core))

console.log('\n=== 3. The daily chore bonus waits for an acceptance ===')
const kid = { ...makeKid({ name: 'Mo', themeId: 'pegasus' }), id: 'k1', coins: 20 }
const base = { ...createInitialState(), kids: [kid] }
const claim = (subs) => reducer({ ...base, submissions: subs }, { type: 'CLAIM_LOGIN_BONUS', kidId: 'k1' }).kids[0].coins
const now = Date.now()
ok('sent, not looked at: no bonus', claim([{ id: 's', kidId: 'k1', status: 'pending', submittedAt: now }]) === 20)
ok('sent back: no bonus', claim([{ id: 's', kidId: 'k1', status: 'rejected', submittedAt: now, decidedAt: now }]) === 20)
ok('accepted today: the bonus', claim([{ id: 's', kidId: 'k1', status: 'approved', submittedAt: now, decidedAt: now }]) === 25)
ok('choreAcceptedToday is the rule', choreAcceptedToday({ submissions: [{ kidId: 'k1', status: 'approved', decidedAt: now }] }, 'k1'))
const sync = read('supabase/sync.sql')
const claimFn = sync.slice(sync.indexOf('create or replace function claim_login_bonus'), sync.indexOf('create or replace function recurring_quest_due'))
ok('the database asks for an accepted chore on the family\'s day', /status = 'approved'/.test(claimFn) && /family_day_of\(v_kid\.family_id, decided_at, p_tz\) = v_day/.test(claimFn)
  && /'no_chore_accepted'/.test(claimFn) && !/submitted_at > now\(\) - interval '24 hours'/.test(claimFn))
ok('family_day_of is the server\'s alone (revoked from public, anon, authenticated)',
  /revoke execute on function family_day_of\(uuid, timestamptz, text\) from public, anon, authenticated;/.test(sync))
ok('a refused claim is undone on the phone', /fn === 'claim_login_bonus'/.test(read('src/state/reducer.js')))

console.log('\n=== 4. Pilot\'s words for parents ===')
ok('the design\'s five pills are still the core\'s default (RankUp sets its own since 0.28.0, tests/fixes28.mjs)', /\{ icon: "gear", label: "Customize with your API key", action: "settings" \}/.test(read('public/pilot/pilot-panel.js')))
ok('core 1.1.1 puts the suggestions above the conversation once chatting', read('public/pilot/pilot-panel.js').includes('welcome, chips, log, cardBox'))
// Since 0.31.0 (core 1.4.0) the first is answered at once and the second opens Assign.
ok('RankUp\'s chips: "What\'s waiting for me?" and "Add a chore for…"', /label: "What's waiting for me\?"/.test(rankup) && /label: 'Add a chore for…'/.test(rankup))
ok('one plain sentence on what an AI key is and where to get one', /An AI key is a private code a grown-up makes in the "API keys" part of an AI company/.test(rankup))

console.log('\n=== 5. A real weekly goal, a bar as wide as the column ===')
ok(`no goal set: ${DEFAULT_WEEKLY_GOAL} a week`, weeklyGoalOf(base) === DEFAULT_WEEKLY_GOAL)
ok('a goal out of range is not kept', cleanWeeklyGoal(0) === null && cleanWeeklyGoal(51) === null && cleanWeeklyGoal('7') === 7)
const monday = weekStartOf(new Date(2026, 10, 19, 15).getTime())
ok('the week starts on Monday at midnight', new Date(monday).getDay() === 1 && new Date(monday).getHours() === 0)
ok('or on the family\'s weekly day', new Date(weekStartOf(new Date(2026, 10, 19, 15).getTime(), 6)).getDay() === 6)
const week = (subs, goal) => weeklyGoalProgress({ ...base, family: { ...base.family, weeklyChoreGoal: goal }, submissions: subs }, 'k1', now)
ok('counts chores ACCEPTED this week', week([
  { kidId: 'k1', status: 'approved', decidedAt: now },
  { kidId: 'k1', status: 'pending', submittedAt: now },
  { kidId: 'k1', status: 'rejected', decidedAt: now },
  { kidId: 'k2', status: 'approved', decidedAt: now },
  { kidId: 'k1', status: 'approved', decidedAt: now - 9 * 86400000 },
], 3).done === 1)
ok('out of the parent\'s goal', week([], 3).goal === 3 && !week([], 3).met)
const goalSet = reducer(base, { type: 'SET_WEEKLY_CHORE_GOAL', goal: 8 })
ok('Settings sets it, and it goes to the server', goalSet.family.weeklyChoreGoal === 8 && goalSet.syncQueue.some((c) => c.fn === 'set_weekly_chore_goal' && c.args.p_goal === 8))
ok('an out-of-range goal is ignored', reducer(base, { type: 'SET_WEEKLY_CHORE_GOAL', goal: 99 }) === base)
const merged = reducer(base, { type: 'MERGE_SNAPSHOT', snapshot: { families: [{ id: base.family.id, name: 'X', weekly_chore_goal: 6 }] }, pending: [] })
ok('a child\'s phone gets the parent\'s goal from the family row', merged.family.weeklyChoreGoal === 6, String(merged.family.weeklyChoreGoal))
const kidHome = read('src/screens/kid/KidHome.jsx')
ok('the child\'s Home shows done/goal, not sent/open', /weeklyGoalProgress\(state, kid\.id\)/.test(kidHome) && !/waiting\.length\}\/\$\{active\.length \+ waiting\.length\}/.test(kidHome))
ok('the bar is as wide as the cards (28rem, 38rem for a parent on a wide screen)', /\.tabbar \{ width: calc\(100% - 20px\); max-width: 28rem;/.test(css) && /html\[data-area='parent'\] \.tabbar \{ max-width: 38rem; \}/.test(css))

console.log('\n=== 6. The demo, the children\'s words, the story ===')
const demo = buildDemoFamily()
const worlds = demo.kids.map((k) => k.themeId)
ok('one demo child in Block Craft, the other in Pegasus', worlds.includes('blockcraft') && worlds.includes('pegasus'), worlds.join())
ok('Noah is the one in Pegasus', demo.kids.find((k) => k.name === 'Noah').themeId === 'pegasus')
const KID_SCREENS = ['KidHome', 'KidQuests', 'KidShop', 'KidMarket', 'KidArcade', 'KidProfile', 'QuestDetail', 'KidStory', 'KidDragon', 'KidLeaderboards', 'KidSchool']
const named = KID_SCREENS.filter((f) => /['">\s](Elite|Standard|Starter)( Pass)?\b/.test(code(`src/screens/kid/${f}.jsx`)))
ok('no paid plan named in the words of a child\'s screen', named.length === 0, named.join(', '))
const lines = calcReward({ difficulty: 'medium' }, { elite: true, streak: 0 }).lines
ok('the pay breakdown a child sees says "1.5× XP boost", never the plan', lines.some((l) => l.label === '1.5× XP boost') && !lines.some((l) => /Elite|Pass/.test(l.label)))
ok('the story\'s two buttons have room above the list\'s heading', /story-actions flex gap-2 mt-4 mb-7/.test(read('src/screens/kid/KidStory.jsx')))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
