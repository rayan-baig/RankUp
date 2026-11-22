/**
 * The fixes from the strict review at 84% (0.30.0), in plain Node: the rules,
 * and the files that carry them. tests/fixes30ui.mjs walks the same fixes in
 * a real browser.
 *
 *   1. bigger celebrations for a child: the bonus's coins fly into the coin
 *      tile and its number ticks up; the weekly goal rains confetti and fills
 *      a ring; a level-up the child sees on their own Home; words only under
 *      reduce motion, sound only while Sounds is on;
 *   2. the parent's dashboard balanced by what is in it, on a computer;
 *   3. the plans compared across the banner's whole width, "Any number",
 *      a Close button, tidy lines, readable words on a computer;
 *   4. "This week": chores, XP and days in a row beside last week's;
 *   5. the front door's phone shows a child's world screen (Pegasus, never
 *      Block Craft) with the XP bar filling and "Level up!";
 *   6. polish: Pilot steps back for the level-up, a solid child's tab bar,
 *      "Phone: shared with a grown-up";
 *   7. a gentle heads-up, in Parent Mode, of what the trial's end stops.
 */
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const css = read('src/styles/index.css').replace(/\/\*[\s\S]*?\*\//g, '')
const day = 86400000

console.log('\n=== 1. Bigger celebrations for a child ===')
const cheers = read('src/components/KidCheers.jsx')
const home = read('src/screens/kid/KidHome.jsx')
ok('the coins fly for about 1.4s (FLY_MS)', /export const FLY_MS = 1400/.test(cheers))
ok('a coin flight from Claim to the tile, its points set as CSS properties (no style attribute)',
  /export function CoinFlight\(\{ from, to, icon, count = 6 \}\)/.test(cheers) && /el\.style\.setProperty\('--tx'/.test(cheers) && !/style=\{/.test(code('src/components/KidCheers.jsx')))
const coinRule = css.match(/\.coin-flight > span \{([^}]*)\}/)?.[1] || ''
const sizes = [...css.matchAll(/\.coin-flight > span:nth-child\(\d\) \{[^}]*font-size: (\d+)px/g)].map((m) => Number(m[1]))
ok('each coin is 28–32px', /font-size: 30px/.test(coinRule) && sizes.length === 6 && sizes.every((n) => n >= 28 && n <= 32), sizes.join(','))
const coinMs = Number(coinRule.match(/rankup-coin-fly (\d+)ms/)?.[1] || 0)
const lastDelay = Math.max(...[...css.matchAll(/\.coin-flight > span:nth-child\(\d\) \{[^}]*animation-delay: (\d+)ms/g)].map((m) => Number(m[1])))
ok('the last coin lands about 1.4s after the tap', coinMs + lastDelay >= 1300 && coinMs + lastDelay <= 1500, `${coinMs}+${lastDelay}`)
ok('toward the coin tile, which waits for them, then ticks up', /data-testid="coin-tile"/.test(home)
  && /<CountUp value=\{Math\.max\(0, kid\.coins - held\)\}/.test(home) && /setHeld\(5\)/.test(home) && /setTimeout\(\(\) => \{ setHeld\(0\); setFlight\(null\) \}, FLY_MS\)/.test(home))
ok('the coin tile sits just under the bonus, so the coins land in view',
  home.lastIndexOf('data-testid="coin-tile"') > home.indexOf('<ClaimMoment') && home.lastIndexOf('data-testid="coin-tile"') < home.indexOf('{newChapter && ('))
ok('under reduce motion (RankUp\'s or the device\'s): no flight, no burst, words only',
  /const still = deviceStill \|\| Boolean\(state\.settings\?\.reduceMotion\)/.test(home) && /if \(still \|\| !tile\) return/.test(home)
  && /\{!still && <Burst icon=\{currency\.icon\} \/>\}/.test(cheers))
ok('the weekly goal: confetti across the screen for a moment, not under reduce motion',
  /export function GoalConfetti/.test(cheers) && /\.goal-confetti \{ position: fixed; inset: 0;[^}]*pointer-events: none; \}/.test(css)
  && /if \(!still\) setConfetti\(true\)/.test(home) && /\{confetti && <GoalConfetti onDone=\{endConfetti\} \/>\}/.test(home))
ok('and a ring round the trophy, filling (simply full when still)', /function GoalRing\(\{ still \}\)/.test(cheers)
  && /@keyframes rankup-ring-fill \{ from \{ stroke-dashoffset: 100; \} to \{ stroke-dashoffset: 0; \} \}/.test(css) && /\.goal-ring\[data-still\] \.goal-ring-fill \{ animation: none; \}/.test(css))
ok('the goal waits for a level-up on screen to finish', /const cheerGoal = goalMoment && !levelUp && !showingMine && !news/.test(home))
const chime = read('src/lib/chime.js')
ok('a level-up has its own chime, through chime() (which follows Sounds)', /level: \[[\d., ]+\]/.test(chime) && /chime\(state, 'level'\)/.test(home))
const { chime: play } = await import('../src/lib/chime.js')
ok('no sound with Sounds off', play({ settings: { soundOn: false } }, 'level') === false)

const { levelNews, levelKey, lastSeenLevel } = await import('../src/lib/kidLevel.js')
const { totalXpForLevel } = await import('../src/lib/xp.js')
const now = Date.now()
const kid = { id: 'k1', xp: totalXpForLevel(5) + 1 }
ok('a phone that never showed this child a level starts from now: nothing to celebrate', levelNews({ seen: {}, events: [] }, kid, now).news === null)
ok('unless this phone logged a level-up for them in the last days: that one is shown',
  JSON.stringify(levelNews({ seen: {}, events: [{ type: 'level_up', kidId: 'k1', at: now - day, meta: { from: 3, to: 5 } }] }, kid, now).news) === JSON.stringify({ kidId: 'k1', from: 3, to: 5 }))
ok('an old one is not news', levelNews({ seen: {}, events: [{ type: 'level_up', kidId: 'k1', at: now - 10 * day, meta: { from: 3, to: 5 } }] }, kid, now).news === null)
ok('nor, in the demo, its own history (a day old)', levelNews({ demo: true, seen: {}, events: [{ type: 'level_up', kidId: 'k1', at: now - day, meta: { from: 3, to: 5 } }] }, kid, now).news === null)
ok('a level above the last one shown on this phone is news, from that level',
  JSON.stringify(levelNews({ seen: { [levelKey('k1', 4)]: 1, [levelKey('k1', 2)]: 1 } }, kid, now).news) === JSON.stringify({ kidId: 'k1', from: 4, to: 5 }))
ok('the same level is not', levelNews({ seen: { [levelKey('k1', 5)]: 1 } }, kid, now).news === null && lastSeenLevel({ seen: { [levelKey('k1', 5)]: 1, 'kid-level:k2:9': 1 } }, 'k1') === 5)
ok('Home shows it (the level-up moment, speaking to the child), and remembers it at once',
  /<LevelUpOverlay levelUp=\{levelUp\} kid=\{kid\} theme=\{theme\} away onClose=\{\(\) => setLevelUp\(null\)\} \/>/.test(home)
  && /dispatch\(\{ type: 'SEE_MOMENT', key: levelKey\(kid\.id, levelNow\) \}\)/.test(home))
const overlay = read('src/components/LevelUpOverlay.jsx')
ok('"Your chores were accepted. You went from level …"', /Your chores were accepted\. You went from level \$\{levelUp\.from\} to \$\{levelUp\.to\}!/.test(overlay))
const app = read('src/App.jsx')
ok('a level-up that came by sync, seen in the child\'s half, is not shown again on Home',
  /if \(isKidArea\) dispatch\(\{ type: 'SEE_MOMENT', key: levelKey\(state\.pendingLevelUp\.kidId, state\.pendingLevelUp\.to\) \}\)/.test(app))

console.log('\n=== 2. The dashboard balanced by what is in it ===')
const dash = read('src/screens/parent/ParentDashboard.jsx')
ok('the cards that can go either side are placed in order, each in the shorter column so far',
  /if \(rightH <= leftH\) \{ right\.push\(c\); rightH \+= c\.h \} else \{ left\.push\(c\); leftH \+= c\.h \}/.test(dash))
ok('the left column\'s length counts the kids, the checklist, Review and the starter rewards',
  /let leftH = 44 \+ Math\.max\(1, state\.kids\.length\) \* 140/.test(dash) && /showFirstWeek\(state\) \? 380 : 0/.test(dash) && /pending\.length \? 92 : 0/.test(dash))
ok('the numbers still head the right-hand column, and on a phone the order is as before',
  /<div className="dash-side">\s*\{desk && \(\s*<>\s*\{stats\}/.test(dash) && /\} else \{\s*right\.push\(\.\.\.floating\)\s*\}/.test(dash))
ok('each card drawn once (activity, tools, school League)', (dash.match(/Recent activity/g) || []).length === 1 && (dash.match(/School League/g) || []).length === 1)

console.log('\n=== 3. The plans compared, across the banner ===')
const trial = read('src/components/TrialBanner.jsx')
const pc = read('src/components/PlanCompare.jsx')
ok('the comparison follows the banner\'s words, outside their column: the whole width', /<\/p>\s*\{headsUp && [^\n]*\n\s*\{compare\}\s*<\/div>/.test(trial) && !/<Banner/.test(code('src/components/TrialBanner.jsx')))
ok('"Any number", not "Unlimited", for children', /v === 'Unlimited' \? 'Any number'/.test(pc))
const { PLAN_COMPARISON, TIERS } = await import('../src/state/initialState.js')
ok('(the plan screen\'s own table is unchanged: no terms changed)', PLAN_COMPARISON[0].value(TIERS.elite) === 'Unlimited')
ok('a Close button of its own, 40px', /aria-label="Close the comparison"/.test(pc) && /onClick=\{onClose\}/.test(pc) && /\.plan-compare-close \{[^}]*width: 40px;\s*height: 40px;/.test(css))
ok('it starts closed every time (no remembered open state)', /const \[more, setMore\] = useState\(false\)/.test(trial))
ok('the words are 12px on a phone and 13.5px on a computer', /\.plan-compare table, \.plan-compare-title \{ font-size: 12px; \}/.test(css)
  && /@media \(min-width: 1024px\) \{\s*\.plan-compare table, \.plan-compare-title, \.plan-compare-note \{ font-size: 13\.5px; \}/.test(css)
  && !/text-\[11px\]/.test(pc))
ok('"Compare plans" no longer stretches its line (tap area by padding, not a 40px box)', /className="tap-inline underline font-semibold"/.test(trial) && /\.tap-inline \{ padding: 10px 2px; margin: -10px 0; \}/.test(css))

console.log('\n=== 4. "This week" ===')
const { weekCompare, changeWords } = await import('../src/lib/thisWeek.js')
const at = (d, xp = 10) => ({ status: 'approved', decidedAt: now - d * day, awarded: { xp } })
const w = weekCompare({ submissions: [at(0), at(1), at(2), at(5), at(8, 20), at(9, 20), { status: 'rejected', decidedAt: now }, { status: 'pending' }] }, now)
ok('chores and XP in the last 7 days against the 7 before', w.now.chores === 4 && w.now.xp === 40 && w.before.chores === 2 && w.before.xp === 40, JSON.stringify(w))
ok('days in a row: the longest run inside each week', w.now.streak === 3 && w.before.streak === 2)
ok('nothing accepted ever: nothing to show', weekCompare({ submissions: [] }, now).any === false)
ok('changes in words, a quieter week said plainly', changeWords(4, 2).words === '▲ 2 on last week' && changeWords(1, 3).words === '▼ 2 on last week'
  && changeWords(2, 2).words === 'Same as last week' && changeWords(3, 0).words === 'New this week')
ok('on the dashboard', /import ThisWeek from '\.\.\/\.\.\/components\/ThisWeek\.jsx'/.test(dash) && /<ThisWeek \/>/.test(dash))
const { buildDemoFamily, DEMO_VERSION } = await import('../src/lib/demoFamily.js')
const demoWeek = weekCompare(buildDemoFamily())
ok('and in the demo, with a week before to compare with (demo rebuilt: version 7)', DEMO_VERSION === 7 && demoWeek.now.chores > 0 && demoWeek.before.chores > 0, JSON.stringify(demoWeek))
ok('the card shows no price and no plan', !/price|\$\d|Elite|Starter|Standard/.test(code('src/components/ThisWeek.jsx')))

console.log('\n=== 5. The front door\'s phone: a child\'s world ===')
const loop = read('src/components/LoopPreview.jsx')
const loopCode = code('src/components/LoopPreview.jsx')
ok('Pegasus Horizon\'s own drawing, lazily, from public/drawn (never in the first file)', /drawn\/avatar-pegasus\.svg/.test(loop) && /loading="lazy"/.test(loop) && !/import [^\n]*\.(svg|png|jpe?g)'/.test(loop))
ok('never Block Craft', !/blockcraft|Block Craft/i.test(loopCode))
ok('the XP bar fills and "Level up!" on the last beat', /loop-bar-won/.test(loop) && />Level up!</.test(loop) && /@keyframes rankup-loop-fill \{ from \{ width: 64%; \} to \{ width: 100%; \} \}/.test(css))
ok('no inline style left in it: its look is the stylesheet\'s', !/style=\{/.test(loopCode))

console.log('\n=== 6. Polish ===')
ok('the level-up marks itself a pop-up Pilot steps back for', /data-testid="level-up" data-pilot-modal=""/.test(overlay)
  && /modals: \['\[data-pilot-modal\]'\]/.test(read('src/pilot/pilotRankUp.js')))
ok('a child\'s tab bar is close to solid', /html\[data-area='kid'\] \.tabbar \{\s*background: var\(--surface\);\s*background: color-mix\(in srgb, var\(--surface\) 95%, var\(--bg\)\);/.test(css))
const { firstWeekSteps } = await import('../src/lib/firstWeek.js')
const zed = { kids: [{ id: 'z', name: 'Zed' }], quests: [], submissions: [], settings: { sharedPhone: true } }
const pair = firstWeekSteps(zed).find((s) => s.id === 'pair')
ok('"We share one phone": the step reads "Phone: shared with a grown-up", done, not crossed out',
  pair.label === 'Phone: shared with a grown-up' && pair.done && pair.plain && /s\.done && !s\.plain \? 'line-through/.test(read('src/components/FirstWeek.jsx')))
ok('a linked phone still reads "Link Zed\'s phone", ticked', firstWeekSteps({ ...zed, kids: [{ id: 'z', name: 'Zed', pairedDeviceAt: 1 }], settings: {} }).find((s) => s.id === 'pair').label === "Link Zed's phone")

console.log('\n=== 7. A gentle heads-up before the trial ends ===')
const { trialHeadsUp } = await import('../src/lib/trialHeadsUp.js')
const headsUpSrc = code('src/lib/trialHeadsUp.js')
ok('in the last three days', /const headsUp = days <= 3 \? trialHeadsUp\(state, plan, paid, days\) : null/.test(trial))
ok('names the child\'s boost and the Elite tools, on the plan they pay for, and that nothing earned goes',
  /\$\{whose\} \$\{plan\.xpMultiplier\}× boost/.test(headsUpSrc) && /the Elite tools/.test(headsUpSrc) && /On \$\{paid\.name\}/.test(headsUpSrc) && /Everything your children have earned stays theirs\./.test(headsUpSrc))
ok('gently: no price, no "lose", no warning colour', !/\$\d|price|\blos(e|ing)\b|warn/i.test(headsUpSrc))
{
  const words = trialHeadsUp({ kids: [{ name: 'Ava' }] }, TIERS.elite, TIERS.starter, 2)
  ok('"Heads-up: the trial ends in 2 days. On Starter, Ava\'s 1.5× boost and the Elite tools stop…"', /^Heads-up: the trial ends in 2 days\. On Starter, Ava's 1\.5× boost and the Elite tools stop\./.test(words), words)
  ok('nothing to say when the plan they pay for has it all', trialHeadsUp({ kids: [] }, TIERS.elite, TIERS.elite, 2) === null)
}
const kidImports = ['KidHome', 'KidQuests', 'KidProfile', 'KidShop', 'KidArcade'].filter((f) => /TrialBanner/.test(read(`src/screens/kid/${f}.jsx`)))
ok('Parent Mode only: no child\'s screen brings it', kidImports.length === 0, kidImports.join(', '))

console.log('\n=== Strict rules on everything touched ===')
const touched = ['src/components/KidCheers.jsx', 'src/components/ThisWeek.jsx', 'src/components/LoopPreview.jsx', 'src/components/PlanCompare.jsx',
  'src/components/TrialBanner.jsx', 'src/lib/trialHeadsUp.js', 'src/lib/kidLevel.js', 'src/lib/thisWeek.js', 'src/screens/kid/KidHome.jsx', 'src/screens/parent/ParentDashboard.jsx']
const banned = /claude-[a-z0-9-]*\d|gpt-[0-9]|gemini-[0-9]|sk-[A-Za-z0-9]{12}|dangerouslySetInnerHTML|<script/i
const hit = touched.filter((f) => banned.test(read(f)))
ok('no model names, keys or inline scripts in any file changed', hit.length === 0, hit.join(', '))
ok('no price on a child\'s Home', !/priceTag|\$\d|\/mo\b|Elite Pass|Starter|Standard/.test(code('src/screens/kid/KidHome.jsx') + code('src/components/KidCheers.jsx')))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
