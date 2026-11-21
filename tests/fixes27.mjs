/**
 * The fixes from the strict review at 80% (0.27.0), in plain Node: the rules,
 * and the files that carry them. tests/fixes27ui.mjs walks the same fixes in
 * a real browser.
 *
 *   1. Pilot's opening screen: RankUp's own suggestions under the five pills
 *      (before any chat and before a key), and no "Image generation" or
 *      "Video generation" in RankUp's Pilot settings; the core untouched;
 *   2. a computer gets a computer's layout: the parent dashboard in two
 *      columns from 1100px, the front door with the demo beside the ways in,
 *      a child's column in a frame; all of it in styles/desk.css, which comes
 *      with those screens, never in the first file;
 *   3. no Pilot on sign-up's step 2, where a child may be picking a world;
 *   4. the daily chore bonus right under "Do this next";
 *   5. Campfire Cozy's coins are Berries (the theme's id is unchanged);
 *   6. a new family's trial banner is one line, and its Elite tools one row.
 */
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => readFileSync(f, 'utf8')
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n=== 1. Pilot\'s opening screen speaks RankUp ===')
const rankup = await import('../src/pilot/pilotRankUp.js')
const { pilotSnapshot } = await import('../src/lib/pilotGate.js')
ok('there is a row of RankUp suggestions for the welcome (starterRow)', typeof rankup.starterRow === 'function')

// A small stand-in for the document: enough for the row to be built.
function fakeDoc() {
  const make = (tag) => {
    const node = {
      tag, children: [], dataset: {}, attrs: {}, listeners: {}, className: '', textContent: '', type: '',
      setAttribute(k, v) { this.attrs[k] = v },
      replaceChildren(...kids) { this.children = kids },
      addEventListener(ev, fn) { this.listeners[ev] = fn },
    }
    return node
  }
  return { createElement: make }
}
const { updatePilot, markParentScreen } = await import('../src/lib/pilotGate.js')
const { createInitialState } = await import('../src/state/initialState.js')
const parent = { ...createInitialState(), onboarded: true, session: { role: 'parent', parentUnlocked: true }, kids: [{ id: 'k', name: 'Mo' }] }
updatePilot({ state: parent, route: '/parent', dispatch: () => {} })
ok('(the gate sees Parent Mode)', pilotSnapshot()?.route === '/parent')
const starterRow = typeof rankup.starterRow === 'function' ? rankup.starterRow : () => ({ children: [{}, {}, {}], attrs: {} })
const row = starterRow(fakeDoc())
const labels = row.children.map((b) => b.textContent)
ok('before any chat and with no key, the welcome offers RankUp\'s own suggestions first',
  labels[0] === "What's waiting for me?" && labels[1] === 'Add a chore for…' && labels.length === 3, JSON.stringify(labels))
ok('in the core\'s own chip style, as buttons', row.children.every((b) => b.className === 'pilot-chip' && b.type === 'button'))
ok('marked as a group for a screen reader', row.attrs.role === 'group' && /RankUp/.test(row.attrs['aria-label']))
updatePilot({ state: parent, route: '/parent/approvals', dispatch: () => {} })
ok('the third follows the screen (Review: "Accept the oldest one")', starterRow(fakeDoc()).children[2].textContent === 'Accept the oldest one')
markParentScreen(0)
const src = read('src/pilot/pilotRankUp.js')
ok('the row is put back after the core redraws its welcome, between the pills and the key card',
  /pills\.after\(row\)/.test(src) && /observe\(welcome, \{ childList: true \}\)/.test(src))
ok('a tap fills the message box; it is sent only with a key, and never when the question ends on a gap',
  /input\.value = prompt/.test(src) && /window\.Pilot\?\.ready\?\.\(\) && !\/\\s\$\/\.test\(prompt\)/.test(src))
ok('the five pills stay (the core draws them; RankUp only finds where they end)', !/pilot-pill(?!s)/.test(code('src/pilot/pilotRankUp.js')) && !/pills\.(remove|replace)/.test(src))

const css = read('src/styles/index.css')
ok('"Image generation" and "Video generation" are hidden, only in RankUp\'s Pilot and only those sections',
  /\.pilot-root\.rk-pilot \.pilot-settings-view > details\.pilot-section \{ display: none; \}/.test(css))
const panel = read('public/pilot/pilot-panel.js')
const sections = [...panel.matchAll(/el\("details", \{ class: "pilot-section"/g)].length
ok('in the core those are the settings\' only <details class="pilot-section"> (so nothing else is hidden)',
  sections === 1 && /mediaSection\("image", "Image generation"/.test(panel) && /mediaSection\("video", "Video generation"/.test(panel))
ok('RankUp\'s Pilot carries the class that rule needs (themeClass rk-pilot)', /themeClass: 'rk-pilot'/.test(src))
ok('the core is 1.1.1, unchanged by this', /const VERSION = "1\.1\.1"/.test(read('public/pilot/pilot.js')))

console.log('\n=== 2. A computer\'s layout, kept out of the first file ===')
const desk = (() => { try { return read('src/styles/desk.css') } catch { return '' } })()
const deskRules = desk.replace(/\/\*[\s\S]*?\*\//g, '')
ok('the dashboard is two columns from 1100px', /@media \(min-width: 1100px\)[\s\S]*\.dash-cols \{[\s\S]*grid-template-columns: minmax\(0, 1\.15fr\) minmax\(0, 0\.85fr\)/.test(deskRules))
ok('the front door is two columns from 960px, the demo beside the ways in',
  /@media \(min-width: 960px\)[\s\S]*grid-template-areas: 'head demo' 'ways demo'/.test(deskRules))
ok('a child\'s column sits in a frame from 1100px, the tab bar as wide as its cards',
  /html\[data-area='kid'\] body \.shell \{[\s\S]*border-radius: 32px 32px 0 0/.test(deskRules) && /html\[data-area='kid'\] \.tabbar \{ max-width: calc\(34rem - 44px\); \}/.test(deskRules))
ok('nothing on a phone but the hidden step list: every other rule is inside a min-width query',
  deskRules.replace(/@media[^{]+\{([^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/\s+/g, ' ').trim() === '.door-steps { display: none; }',
  deskRules.replace(/@media[^{]+\{([^{}]*\{[^{}]*\})*[^{}]*\}/g, '').trim())
ok('no transform, filter or backdrop-filter on a column (fixed moments stay pinned to the window)', !/transform|backdrop-filter|(^|[^-])filter:/.test(deskRules))
const dash = read('src/screens/parent/ParentDashboard.jsx')
ok('the dashboard brings desk.css with it, and splits into a main and a side column',
  /import '\.\.\/\.\.\/styles\/desk\.css'/.test(dash) && /<Screen className="dash-wide">/.test(dash) && /className="dash-cols"/.test(dash) && /className="dash-main"/.test(dash) && /className="dash-side"/.test(dash))
const main = dash.slice(dash.indexOf('className="dash-main"'), dash.indexOf('className="dash-side"'))
const side = dash.slice(dash.indexOf('className="dash-side"'))
ok('Review and the kids on the main side', /waiting-card/.test(main) && />\s*Kids\s*<\/SectionTitle>/.test(main) && /<StarterRewards \/>/.test(main))
ok('the activity, the family goal and the tools on the other', /Recent activity/.test(side) && /familyGoal/.test(side) && /EliteTools/.test(side))
ok('the front door brings desk.css, with the four steps beside the demo',
  /import '\.\.\/styles\/desk\.css'/.test(read('src/screens/Welcome.jsx')) && /className="door-steps"/.test(read('src/screens/Welcome.jsx')) && /BEATS\.map/.test(read('src/screens/Welcome.jsx')))
const kidScreens = ['KidHome', 'KidQuests', 'QuestDetail', 'KidGuild', 'KidShop', 'KidMarket', 'KidArcade', 'KidProfile', 'KidStory', 'KidDragon', 'KidSchool', 'KidLeaderboards', 'ThemeGenesis']
const missing = kidScreens.filter((f) => !/import '\.\.\/\.\.\/styles\/desk\.css'/.test(read(`src/screens/kid/${f}.jsx`)))
ok('every child\'s screen brings desk.css with it', missing.length === 0, missing.join(', '))
const app = read('src/App.jsx')
ok('the first file never imports it (App.jsx, main.jsx)', !/desk\.css/.test(code('src/App.jsx')) && !/desk\.css/.test(read('src/main.jsx')))
ok('the app says which half is showing: data-area is "kid" on a child\'s screens', /dataset\.area = isParentArea \? 'parent' : isKidArea \? 'kid' : ''/.test(app))
ok('room for that in the first file: the level-up and streak moments are fetched when one is due',
  !/^import LevelUpOverlay/m.test(app) && /const LevelUpOverlay = lazyLoad\(\(\) => import\('\.\/components\/LevelUpOverlay\.jsx'\)\)/.test(app)
  && /const StreakMoment = lazyLoad\(/.test(app) && /<Suspense fallback=\{null\}>/.test(app))

console.log('\n=== 3. No Pilot where a child may be picking a world ===')
const onboarding = read('src/screens/Onboarding.jsx')
ok('sign-up\'s step 2 (after consent) is the world picker', /const worldPicker = step === 1 && consented/.test(onboarding))
ok('and the parent\'s set-up mark is off there, so Pilot goes', /useParentHere\(mode === 'parent' && !worldPicker\)/.test(onboarding))
ok('the hook comes after consent is known (no use before it is declared)',
  onboarding.indexOf('const [consented, setConsented]') < onboarding.indexOf('const worldPicker'))
// The gate itself, as the hook drives it: the mark off is no Pilot on the door's route.
const { pilotShows } = await import('../src/lib/pilotGate.js')
const visitor = createInitialState()
markParentScreen(1)
updatePilot({ state: visitor, route: '/welcome', dispatch: () => {} })
const onStep1 = pilotShows()
markParentScreen(-1)
ok('step 1 (the family): Pilot; step 2 (the world): none', onStep1 && !pilotShows())

console.log('\n=== 4. The daily bonus where it can be seen ===')
const kidHome = read('src/screens/kid/KidHome.jsx')
const at = (s) => kidHome.indexOf(s)
ok('the bonus card comes right after "Do this next" and before the story and the leaderboards',
  at('data-testid="next-up"') < at('data-testid="chore-bonus"') && at('data-testid="chore-bonus"') < at('{/* The story:') && at('data-testid="chore-bonus"') < at('data-testid="open-leaderboards"'))
ok('and no longer after the three small cards', at('data-testid="chore-bonus"') < at('data-testid="weekly-goal"'))
ok('lit by a class, not an inline style', /kid-bonus/.test(kidHome) && /\.kid-bonus \{ border-color: var\(--accent\); \}/.test(css))

console.log('\n=== 5. Campfire Cozy\'s coins ===')
const { KID_THEMES, themeById } = await import('../src/data/kidThemes.js')
const campfire = (KID_THEMES || []).find((t) => t.id === 'campfire') || themeById?.('campfire')
ok('Campfire Cozy keeps its id', campfire && campfire.name === 'Campfire Cozy')
ok('its coins are Berries (🍒), not "Berberries"', campfire?.currency?.name === 'Berries' && campfire.currency.icon === '🍒', JSON.stringify(campfire?.currency))
ok('the word is gone from the app', !/Berberr/i.test(read('src/data/kidThemes.js')))

console.log('\n=== 6. A new family\'s dashboard is not crowded ===')
const newFamily = (await import('../src/lib/firstWeek.js')).newFamily || (() => null)
const fresh = { ...createInitialState(), onboarded: true, kids: [{ id: 'k', name: 'Mo' }], submissions: [] }
const going = { ...fresh, quests: [{ id: 'q' }], kids: [{ id: 'k', name: 'Mo', pairedDeviceAt: 1 }], submissions: [{ status: 'approved' }] }
ok('a family with no chore accepted yet is new', newFamily(fresh) === true)
ok('one going (a chore accepted, the list done) is not', newFamily(going) === false)
ok('the demo never is', newFamily({ ...fresh, demo: true }) === false)
const trial = read('src/components/TrialBanner.jsx')
ok('the trial banner is one line for a new family with more than three days left',
  /const compact = days > 3 && newFamily\(state\)/.test(trial) && /data-compact=""/.test(trial))
ok('what the plan gives is folded under "What you get", not dropped', /aria-expanded=\{more\}.*\n\s*What you get\n/.test(trial) && /\{more && <p[^>]*>\{words\}<\/p>\}/.test(trial))
ok('the Elite tools fold into one row for a new family, the three tiles inside',
  /newFamily\(state\) \? \(\s*<EliteToolsFold elite=\{elite\} \/>/.test(dash) && /aria-expanded=\{open\}/.test(dash) && /\{open && <div[^>]*><EliteTools elite=\{elite\} \/><\/div>\}/.test(dash))
ok('a closed fold holds nothing on the page (a button, not <details>, whose hidden content still has boxes)', !/<details/.test(code('src/screens/parent/ParentDashboard.jsx')) && !/<details/.test(code('src/components/TrialBanner.jsx')))
ok('no inline style left on the tool tiles', !/opacity: elite \? 1 : 0\.65/.test(dash))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
