/**
 * The fixes from the strict review at 83% (0.29.0), in plain Node: the rules,
 * and the files that carry them. tests/fixes29ui.mjs walks the same fixes in
 * a real browser.
 *
 *   1. Parent Mode on a computer: the tab bar is a sidebar down the left
 *      edge from 1100px, never over a card, with Pilot's robot in its slot
 *      at the foot; the dashboard's columns about the same length;
 *   2. Pilot core 1.3.0 (tests/fixes28.mjs holds its fingerprints): RankUp's
 *      own key pill means the welcome asks for the key once, with a one-line
 *      grown-ups note;
 *   3. "Getting started" finishes for a one-phone family: two buttons, and
 *      the phone step ticks itself once a chore is accepted with no child's
 *      phone linked;
 *   4. a shorter sign-up: the consent notice folded under its headings
 *      (every word unchanged), and six worlds with "See all 15";
 *   5. a child's celebrations: the bonus claimed, the weekly goal reached,
 *      with a chime that follows Sounds and motion that follows reduce motion;
 *   6. a computer: the front door centred with a bigger demo phone, and the
 *      child's world beside their frame;
 *   7. what each plan gives, in words, inside the trial banner, and a plain
 *      line that Pilot is optional and runs on the parent's own AI key.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const css = read('src/styles/index.css')
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '')
const desk = read('src/styles/desk.css').replace(/\/\*[\s\S]*?\*\//g, '')

console.log('\n=== 1. Parent Mode on a computer: a sidebar, never over a card ===')
const nav = read('src/components/NavBar.jsx')
ok('the tab bar carries no inline style: its look and place are the stylesheet\'s', !/style=\{\{\s*\n?\s*\/\*[\s\S]*?bottom:/.test(nav) && !/bottom: 'calc/.test(nav) && /className="tabbar"/.test(nav))
ok('the bar\'s look moved to .tabbar (fixed, inset, blurred)', /\.tabbar \{\s*position: fixed;[\s\S]*?bottom: calc\(var\(--safe-bottom\) \+ 8px\);[\s\S]*?backdrop-filter: blur\(18px\) saturate\(1\.3\);/.test(cssRules))
const side = cssRules.match(/@media \(min-width: 1100px\) \{\s*html\[data-area='parent'\] body \{ padding-left: 104px; \}([\s\S]*?)\n\}/)?.[1] || ''
ok('from 1100px every parent screen moves over 104px for it', Boolean(side))
ok('and the bar is a sidebar down the left edge, top to bottom, 104px wide', /top: 0;\s*bottom: 0;\s*left: 0;\s*right: auto;\s*width: 104px;/.test(side))
ok('its tabs stacked, one under another', /\.tabbar \.tabs \{ flex-direction: column;/.test(side) && /\.tabbar \.tab \{ flex: 0 0 auto;/.test(side))
ok('on Plans too (whose wider bar rule would otherwise win)', /html\[data-area='parent'\]:has\(\.shell\.lg\\:max-w-5xl\) \.tabbar \{/.test(side))
ok('Pilot\'s robot has a slot at its foot, and sits in it bottom left', /\.tabbar \.tabbar-dock \{ display: block; flex: 0 0 104px; margin-top: auto; \}/.test(side)
  && /\.pilot-root\.rk-pilot\.pilot-at-bl \{ left: 8px; bottom: 12px; \}/.test(side))
ok('a child\'s bar is untouched (no sidebar rule for data-area="kid")', !/data-area='kid'\][^{]*\.tabbar \{[^}]*flex-direction/.test(cssRules))
const { dockedPlace } = await import('../src/pilot/pilotRankUp.js')
const docAt = (left, width = 1440) => ({
  documentElement: { dataset: { pilotTabs: 'on' } },
  defaultView: { innerWidth: width },
  querySelector: () => ({ getBoundingClientRect: () => ({ left, width: 80 }) }),
})
ok('the slot on the left half of the window: the robot\'s corner is bottom left', JSON.stringify(dockedPlace(docAt(12))) === JSON.stringify({ corner: 'bl', peek: false, typing: false }))
ok('on the right (a phone\'s bar): bottom right, as before', dockedPlace(docAt(300, 375)).corner === 'br')
const dash = read('src/screens/parent/ParentDashboard.jsx')
ok('the dashboard knows when it is two columns (useMedia, 1100px)', /const desk = useMedia\('\(min-width: 1100px\)'\)/.test(dash))
const mainCol = dash.slice(dash.indexOf('className="dash-main"'), dash.indexOf('className="dash-side"'))
const sideCol = dash.slice(dash.indexOf('className="dash-side"'))
ok('on a phone the numbers and "How RankUp works" stay where they were', /\{!desk && <HowItWorks \/>\}/.test(mainCol) && /\{!desk && stats\}/.test(mainCol))
ok('on a computer they head the right-hand column, balancing it', /\{desk && \(\s*<>\s*\{stats\}\s*<HowItWorks \/>/.test(sideCol))
ok('each is drawn in one place only (no copy hidden by a style)', (dash.match(/<HowItWorks \/>/g) || []).length === 2 && !/dash-stats/.test(dash))

console.log('\n=== 2. Pilot core 1.3.0: the welcome asks for the key once ===')
// (The thirteen files' fingerprints are in tests/fixes28.mjs.)
const vm = await import('node:vm')
const box2 = { window: {}, document: {} }
vm.runInNewContext(read('public/pilot/pilot-panel.js'), box2)
const Panel = box2.window.PilotPanel
const { config: pilotConfig } = (await import('../src/pilot/pilotRankUp.js'))._test
ok('the core is 1.3.0 or later (1.4.0 since 0.31.0)', /^1\.([3-9]|\d\d)\.\d+$/.test(Panel.VERSION) && /const VERSION = "1\.([3-9]|\d\d)\.\d+"/.test(read('public/pilot/pilot.js')))
ok('RankUp\'s own "Add my AI key" pill means no key card under the pills as well (core 1.3.0)', Panel.keyPillGiven(pilotConfig.welcomePills) === true)
ok('and the key words are a website\'s: "AI key", not the design\'s "Bring Your Own API Key"', Panel.keyWords(pilotConfig.welcomePills).title === 'Your own AI key')
ok('on the welcome the grown-ups note is one line (keyNoteShort); the whole note stays in settings and help',
  pilotConfig.keyNoteShort === 'AI keys are for grown-ups (18+).' && /AI keys are for grown-ups \(the AI companies require 18\+\)/.test(pilotConfig.keyNote))

console.log('\n=== 3. "Getting started" finishes for a one-phone family ===')
const { firstWeekSteps, showFirstWeek } = await import('../src/lib/firstWeek.js')
const { createInitialState } = await import('../src/state/initialState.js')
const base = { ...createInitialState(), onboarded: true, kids: [{ id: 'k', name: 'Mo' }], quests: [{ id: 'q', kidId: 'k' }] }
const pair = (st) => firstWeekSteps(st).find((s) => s.id === 'pair')
ok('nothing accepted, no phone linked: the step waits, offering both ways', !pair({ ...base, submissions: [] }).done && pair({ ...base, submissions: [] }).skip === 'We share one phone')
const oneChore = { ...base, submissions: [{ id: 's', kidId: 'k', status: 'approved' }] }
ok('a chore accepted with no child\'s phone linked ticks it: the family shares one', pair(oneChore).done && !pair(oneChore).skip)
ok('and the list finishes, with nothing tapped', !showFirstWeek(oneChore))
ok('a chore only sent in does not', !pair({ ...base, submissions: [{ id: 's', kidId: 'k', status: 'pending' }] }).done)
ok('a linked phone still ticks it too', pair({ ...base, kids: [{ id: 'k', name: 'Mo', pairedDeviceAt: 1 }], submissions: [] }).done)
const fw = read('src/components/FirstWeek.jsx')
ok('"We share one phone" is a button the size of "Link a phone", side by side', /data-testid="link-phone"/.test(fw) && /data-testid="shared-phone"/.test(fw)
  && /<div className="grid grid-cols-2 gap-2 w-full">/.test(fw)
  && (fw.match(/className="py-2 px-2\.5 min-h-\[44px\] text-\[13px\] leading-tight"/g) || []).length === 2)
ok('no longer a small underlined link', !/data-testid="shared-phone" className="tap-link/.test(fw))

console.log('\n=== 4. A shorter sign-up ===')
const consent = read('src/screens/ParentalConsent.jsx')
const { CONSENT_NOTICE, CONSENT_VERSION } = await import('../src/data/legalText.js')
// The notice's words at 0.28.1. Folding them must not change one of them
// (the database keeps the same text as the record of what was agreed).
const noticeHash = createHash('sha256').update(JSON.stringify(CONSENT_NOTICE)).digest('hex').slice(0, 16)
ok('the consent notice\'s words are unchanged (same text, same version)', noticeHash === 'c2be3737eeb5e653', `${noticeHash} ${CONSENT_VERSION}`)
ok('each part folds under its heading: a button that says whether it is open', /aria-expanded=\{shown\}/.test(consent) && /aria-controls=\{`consent-part-\$\{n\}`\}/.test(consent))
ok('all folded to start, "Open all" opens the lot', /const \[open, setOpen\] = useState\(\{\}\)/.test(consent) && /data-testid="consent-all"/.test(consent) && /\{allOpen \? 'Fold all' : 'Open all'\}/.test(consent))
ok('every heading and every line still comes from the notice', /CONSENT_NOTICE\.sections\.map\(\(section, n\)/.test(consent) && /section\.body\.map\(\(line, i\)/.test(consent))
ok('the tick, the signature and "I agree" are not folded', /CONSENT_NOTICE\.affirmation/.test(consent) && /placeholder="e\.g\. Samira Rivera"/.test(consent) && !/shown && \([\s\S]{0,400}affirmation/.test(consent))
const picker = read('src/components/ThemePicker.jsx')
ok('the world picker has a short form: six worlds, then "See all 15"', /const SHORT_LIST = 6/.test(picker) && /See all \{KID_THEMES\.length\} worlds/.test(picker) && /data-testid="see-all-worlds"/.test(picker))
ok('the short form drops the big card repeating the world picked', /\{!short && \(\s*<Card className="mb-3 relative overflow-hidden"/.test(picker))
ok('the world picked always shows, ticked', /firstSix\.some\(\(t\) => t\.id === value\)/.test(picker) && /\{short && isSelected && <span className="pick-tick"/.test(picker) && /\.pick-tick \{/.test(cssRules))
ok('sign-up uses it; a child changing world later still sees all fifteen', /<ThemePicker value=\{themeId\} onChange=\{setThemeId\} short \/>/.test(read('src/screens/Onboarding.jsx'))
  && !/ short/.test(read('src/screens/kid/KidProfile.jsx').match(/<ThemePicker[^>]*>/)?.[0] || ''))

console.log('\n=== 5. A child\'s celebrations ===')
const { chime, soundsOn } = await import('../src/lib/chime.js')
ok('Sounds is on unless someone switched it off (the setting every phone already has)', soundsOn({ settings: { soundOn: true } }) && soundsOn({ settings: {} }) && !soundsOn({ settings: { soundOn: false } }))
ok('the setting was already in every saved state, on', createInitialState().settings.soundOn === true)
let notes = 0
globalThis.window = { AudioContext: class {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {} }
  createOscillator() { notes += 1; return { frequency: {}, connect() {}, start() {}, stop() {} } }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
  resume() { return Promise.resolve() }
} }
ok('Sounds off: no chime at all', chime({ settings: { soundOn: false } }, 'coin') === false && notes === 0)
ok('Sounds on: two notes for a bonus, four for the weekly goal', chime({ settings: { soundOn: true } }, 'coin') === true && notes === 2
  && chime({ settings: {} }, 'goal') === true && notes === 6)
globalThis.window = {}
ok('no audio in the browser: quiet, never an error', chime({ settings: {} }, 'coin') === false)
delete globalThis.window
const { weeklyGoalMomentKey } = await import('../src/lib/weeklyGoal.js')
const monday = new Date(2026, 10, 16, 12).getTime()
const sunday = new Date(2026, 10, 22, 12).getTime()
const nextMonday = new Date(2026, 10, 23, 12).getTime()
ok('the weekly goal moment is once a week for each child', weeklyGoalMomentKey({}, 'k', monday) === weeklyGoalMomentKey({}, 'k', sunday)
  && weeklyGoalMomentKey({}, 'k', sunday) !== weeklyGoalMomentKey({}, 'k', nextMonday) && weeklyGoalMomentKey({}, 'j', monday) !== weeklyGoalMomentKey({}, 'k', monday))
const home = read('src/screens/kid/KidHome.jsx')
// 0.30.0 adds the coins' flight and words-only under reduce motion (tests/fixes30.mjs).
ok('Claim: the bonus, then its moment and the chime', /dispatch\(\{ type: 'CLAIM_LOGIN_BONUS', kidId: kid\.id \}\)\s*setClaimed\(\{ coins: 5 \}\)\s*chime\(state, 'coin'\)/.test(home)
  && /\{claimed && <ClaimMoment coins=\{claimed\.coins\} currency=\{theme\.currency\} onDone=\{endClaim\} still=\{still\} \/>\}/.test(home))
ok('the weekly goal: shown when it is met and not yet seen on this phone, tapped away for the week', /weeklyGoalProgress\(state, kid\.id\)\.met && !state\.seen\?\.\[goalKey\]/.test(home)
  && /dispatch\(\{ type: 'SEE_MOMENT', key: goalKey \}\)/.test(home) && /if \(cheerGoal\) \{\s*chime\(state, 'goal'\)/.test(home))
const cheers = read('src/components/KidCheers.jsx')
ok('the moments say so in words', /Bonus claimed\. Nice work today\./.test(cheers) && /You hit your weekly goal!/.test(cheers) && /role="status"/.test(cheers))
ok('the coins burst from the stylesheet, each animation filling "both" (reduce motion jumps to the end: the coins gone)',
  /\.cheer-burst > span \{[\s\S]*?animation: rankup-sparkle 900ms [^;]* both;/.test(cssRules) && /\.cheer-pop \{[\s\S]*?animation: rankup-burst [^;]* both;/.test(cssRules)
  && /@keyframes rankup-sparkle \{.*100% \{[^}]*opacity: 0/.test(cssRules))
ok('and no inline style in the moments', !/style=/.test(cheers))
ok('a child can switch Sounds on their You screen, a parent in Settings', /data-testid="kid-sounds"/.test(read('src/screens/kid/KidProfile.jsx')) && /patch: \{ soundOn: v \}/.test(read('src/screens/kid/KidProfile.jsx'))
  && /label="Sounds"/.test(read('src/screens/parent/ParentSettings.jsx')) && /patch: \{ soundOn: v \}/.test(read('src/screens/parent/ParentSettings.jsx')))
ok('no sound file and nothing in the first file (chime is imported by Home, not App)', !/chime/.test(code('src/App.jsx')) && /import \{ chime \} from '\.\.\/\.\.\/lib\/chime\.js'/.test(home))

console.log('\n=== 6. A computer: the front door and a child\'s world ===')
ok('the front door is centred up and down whatever the window\'s height', /\.shell\.door \{\s*max-width: 68rem;\s*padding: 40px;\s*justify-content: center;\s*\}/.test(desk) && /\.door-grid \{ margin-top: auto; margin-bottom: auto; \}/.test(desk))
ok('a bigger demo phone from 1280px, scaled by zoom, with room for the steps', /@media \(min-width: 1280px\) \{\s*\.shell\.door \{ max-width: 76rem; \}\s*\.door-demo > :first-child \{ zoom: 1\.3; \}/.test(desk))
ok('still no transform or filter in desk.css', !/transform|backdrop-filter|(^|[^-])filter:/.test(desk))
const art = read('src/components/KidWorldArt.jsx')
ok('the child\'s world beside the frame: fetched with the child\'s screens, never in the first file', /const KidWorldArt = lazyLoad\(\(\) => import\('\.\/components\/KidWorldArt\.jsx'\)\)/.test(read('src/App.jsx'))
  && /\{isKidArea && activeKid && <Suspense fallback=\{null\}><KidWorldArt theme=\{kidTheme\}/.test(read('src/App.jsx')))
ok('only at 1280px and wider; on a phone nothing is drawn or fetched', /useMedia\('\(min-width: 1280px\)'\)/.test(art) && /if \(!wide \|\| !theme\) return null/.test(art))
ok('decoration only: hidden from screen readers, takes no taps', /aria-hidden="true"/.test(art) && /\.world-art \{ position: fixed; inset: 0; z-index: 0; pointer-events: none; \}/.test(cssRules))
ok('the child\'s own character at their form (the owner\'s Block Craft pictures where they are the child\'s)', /picture\(`avatar-\$\{theme\.id\}-\$\{tiersFor\(theme\)\[tier - 1\]\}`, `avatar-\$\{theme\.id\}`\)/.test(art))

console.log('\n=== 7. What each plan gives, inside the trial banner ===')
const trial = read('src/components/TrialBanner.jsx')
ok('"What you get" (and "Compare plans" on the full banner) opens the comparison', /const compare = more && <PlanCompare trialTier=\{plan\.id\} onClose=\{\(\) => setMore\(false\)\} \/>/.test(trial) && />\s*Compare plans\s*</.test(trial))
// Its own file (components/PlanCompare.jsx): the banner itself makes no
// claim about guilds (tests/trialbanner.mjs).
const pc = read('src/components/PlanCompare.jsx')
const pcCode = code('src/components/PlanCompare.jsx')
ok('in a file of its own, brought by the banner', /import PlanCompare from '\.\/PlanCompare\.jsx'/.test(trial) && /export default function PlanCompare\(\{ trialTier, onClose \}\)/.test(pc))
ok('its rows are the plan screen\'s own table, only the ones that differ', /PLAN_COMPARISON\s*\.filter\(\(row\) => !row\.needs \|\| \(row\.needs === 'guilds' && guildsEnabled\(\)\)\)\s*\.filter\(\(row\) => new Set\(TIER_LADDER\.map/.test(pc))
ok('words only: no price, no "$", no priceTag', !/\$\d|price|priceTag|yearPrice/i.test(pcCode))
ok('a plain line: Pilot is optional and uses the parent\'s own AI key', /Pilot, the AI helper for grown-ups, is optional on every plan\. It uses your own AI key, so RankUp never charges for it\./.test(pc))
const { TIER_LADDER, PLAN_COMPARISON } = await import('../src/state/initialState.js')
const differ = PLAN_COMPARISON.filter((r) => !r.needs).filter((r) => new Set(TIER_LADDER.map((t) => String(r.value(t) || false))).size > 1).map((r) => r.label)
ok('the rows a parent sees (guilds off): children, XP rate and the five Elite things', JSON.stringify(differ) === JSON.stringify(['Children', 'XP rate', 'Overdrive visuals', 'Profile frames', 'Pause and limits', 'Behaviour Blueprints', 'Parent Alliances']), differ.join(' | '))
const importers = ['src/App.jsx', ...['KidHome', 'KidQuests', 'KidProfile', 'KidShop', 'KidArcade'].map((f) => `src/screens/kid/${f}.jsx`)].filter((f) => /TrialBanner/.test(read(f)))
ok('parent-only: no child\'s screen brings the banner', importers.length === 0 && /import TrialBanner/.test(dash), importers.join(', '))

console.log('\n=== Nothing that should not be there ===')
const touched = ['src/components/PlanCompare.jsx', 'src/components/KidCheers.jsx', 'src/components/KidWorldArt.jsx', 'src/lib/chime.js', 'src/lib/useMedia.js', 'src/components/TrialBanner.jsx', 'src/components/FirstWeek.jsx', 'src/screens/ParentalConsent.jsx', 'src/components/ThemePicker.jsx', 'src/components/NavBar.jsx']
const models = touched.filter((f) => /\b(gpt-|claude-|gemini-|opus|sonnet|haiku|llama)/i.test(read(f)))
ok('no AI model names in the new and changed files', models.length === 0, models.join(', '))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
