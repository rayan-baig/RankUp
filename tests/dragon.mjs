/**
 * The dragon fight, as arithmetic.
 *
 * Prevents: a child's chores not counting against the dragon, the dragon
 * striking for no reason, a fight that two devices disagree about, a world
 * that should be secret being named early, and a knockout that takes away
 * something the child earned.
 *
 * Every expected number here is written out by hand rather than recomputed
 * the way the code does it; a test that repeats the code's own sums agrees
 * with whatever the code does.
 *
 *   node tests/dragon.mjs
 */
import { dragonFight, storyProgress, DRAGON_LEVEL, IDLE_MS } from '../src/lib/dragonFight.js'
import { totalXpForLevel } from '../src/lib/xp.js'
import { resolveKidTheme, nextEvolution } from '../src/data/kidThemes.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const HOUR = 3600 * 1000
const T0 = Date.UTC(2027, 0, 4, 9) // a Monday morning; the fight starts here
const threshold = totalXpForLevel(DRAGON_LEVEL)

/**
 * A family whose child reached the dragon at T0 with a hard chore, then had
 * the chores in `after` decided. Each entry: [hoursAfterT0, status, difficulty].
 */
function family(after, { themeId = 'blockcraft', reached = true } = {}) {
  const quests = []
  const submissions = []
  let xp = reached ? threshold - 10 : 500
  const add = (at, status, difficulty, awardedXp) => {
    const id = `q${quests.length}`
    quests.push({ id, kidId: 'k1', title: `${difficulty} chore`, difficulty })
    submissions.push({ id: `s${id}`, questId: id, kidId: 'k1', status, decidedAt: at, awarded: status === 'approved' ? { xp: awardedXp } : null })
    if (status === 'approved') xp += awardedXp
  }
  add(T0, 'approved', 'hard', 55) // the one that carried them past level 399
  for (const [h, status, difficulty] of after) add(T0 + h * HOUR, status, difficulty, 30)
  const kid = { id: 'k1', themeId, xp, themeChosenAt: T0 - 1000 * HOUR }
  return { state: { quests, submissions, kids: [kid] }, kid }
}

console.log('\n=== Who is fighting ===')
{
  const { state, kid } = family([], { reached: false })
  ok('a child below the dragon is not fighting', dragonFight(state, kid, T0).active === false)
  const other = family([], { themeId: 'apex' })
  ok('a child on another theme is not fighting', dragonFight(other.state, other.kid, T0).active === false)
  const { state: s2, kid: k2 } = family([])
  const f = dragonFight(s2, k2, T0 + HOUR)
  ok('a child who just reached it is fighting', f.active === true)
  ok('the chore that got them there does not count as a hit', f.dragon === 1000, String(f.dragon))
  ok('both start full', f.hero === 100)
}

console.log('\n=== Chores hit the dragon by difficulty ===')
{
  const { state, kid } = family([[1, 'approved', 'easy'], [2, 'approved', 'medium'], [3, 'approved', 'hard'], [4, 'approved', 'boss']])
  const f = dragonFight(state, kid, T0 + 5 * HOUR)
  // 1000 - 40 - 80 - 150 - 300
  ok('easy 40, medium 80, hard 150, boss 300', f.dragon === 430, String(f.dragon))
  ok('hits do not hurt the child', f.hero === 100, String(f.hero))
}

console.log('\n=== The dragon strikes back ===')
{
  const { state, kid } = family([[1, 'rejected', 'medium'], [2, 'rejected', 'medium']])
  const f = dragonFight(state, kid, T0 + 3 * HOUR)
  ok('each chore sent back costs 15', f.hero === 70, String(f.hero))
  ok('a pending chore does nothing', dragonFight(family([[1, 'pending', 'hard']]).state, kid, T0 + 2 * HOUR).hero === 100)
}

// Counted as dives rather than read off the health bar: past the first
// midday a special attack may also have landed, and that is a different rule.
const dives = (f) => f.events.filter((e) => e.kind === 'idle')

console.log('\n=== 48 hours with nothing done ===')
{
  const { state, kid } = family([])
  ok('47 hours is fine', dives(dragonFight(state, kid, T0 + 47 * HOUR)).length === 0)
  const one = dives(dragonFight(state, kid, T0 + 48 * HOUR + 1))
  ok('48 hours is one dive, 25', one.length === 1 && one[0].dmg === 25)
  ok('96 hours is two', dives(dragonFight(state, kid, T0 + 96 * HOUR + 1)).length === 2)
  const busy = family([[40, 'approved', 'easy'], [80, 'approved', 'easy']])
  ok('a chore every 40 hours keeps it away', dives(dragonFight(busy.state, busy.kid, T0 + 100 * HOUR)).length === 0)
}

console.log('\n=== Knocked out, never robbed ===')
{
  // Seven sent back (105) knocks the child out once; the dragon heals 100 but
  // was hit for 150 first, so it ends 950. An eighth then lands on full health.
  const rows = [[1, 'approved', 'hard']]
  for (let i = 0; i < 8; i++) rows.push([2 + i, 'rejected', 'medium'])
  const { state, kid } = family(rows)
  const xpBefore = kid.xp
  const f = dragonFight(state, kid, T0 + 10 * HOUR)
  ok('one knockout', f.knockouts === 1, String(f.knockouts))
  ok('health refills, then the eighth lands: 100 - 15', f.hero === 85, String(f.hero))
  ok('the dragon gets 100 back: 1000 - 150 + 100', f.dragon === 950, String(f.dragon))
  ok('no XP is taken', kid.xp === xpBefore)
  ok('the dragon never heals past full', dragonFight(family(Array.from({ length: 14 }, (_, i) => [1 + i, 'rejected', 'easy'])).state, kid, T0 + 20 * HOUR).dragon === 1000)
}

console.log('\n=== Beating it ===')
{
  const rows = [[1, 'approved', 'boss'], [2, 'approved', 'boss'], [3, 'approved', 'boss'], [4, 'approved', 'boss'], [5, 'rejected', 'easy']]
  const { state, kid } = family(rows)
  const f = dragonFight(state, kid, T0 + 6 * HOUR)
  ok('four boss chores bring it down', f.dragon === 0 && f.defeatedAt === T0 + 4 * HOUR, `${f.dragon} ${f.defeatedAt}`)
  ok('nothing after the win counts against the child', f.hero === 100, String(f.hero))
  ok('it stays beaten long after', dragonFight(state, kid, T0 + 30 * 24 * HOUR).defeatedAt === T0 + 4 * HOUR)
  ok("Hero's Return opens", storyProgress(state, kid, T0 + 6 * HOUR)?.dragonDefeated === true)
  const open = resolveKidTheme('blockcraft', 400, { dragonDefeated: true })
  ok('the theme becomes the last world', open.evolution?.label === "Hero's Return", open.evolution?.label)
  ok('without the win it stays the dragon', resolveKidTheme('blockcraft', 400).evolution?.label === 'The Dragon')
}

console.log('\n=== Specials are the same on every device ===')
{
  const { state, kid } = family([])
  const later = T0 + 20 * 24 * HOUR
  const a = dragonFight(state, kid, later).events.filter((e) => e.kind === 'special')
  const b = dragonFight(JSON.parse(JSON.stringify(state)), { ...kid }, later).events.filter((e) => e.kind === 'special')
  ok('the same specials, at the same moments', JSON.stringify(a) === JSON.stringify(b))
  ok('twenty days bring some specials, not one a day', a.length > 0 && a.length < 15, String(a.length))
  ok('a special is at midday', a.every((e) => new Date(e.at).getUTCHours() === 12))
}

console.log('\n=== Secret worlds ===')
{
  const next = nextEvolution('blockcraft', 2)
  ok('the next world is known to the code', next?.level === 125)
  const atDragon = nextEvolution('blockcraft', 400)
  ok('at the dragon, the next world is the one beating it opens', atDragon?.requires === 'dragonDefeated')
  ok('after the win there is nothing left', nextEvolution('blockcraft', 400, { dragonDefeated: true }) === null)
}

console.log('\n=== Idle gaps are measured from the last chore, not from the start ===')
{
  // An approval at 30h resets the clock: the first dive is at 78h, not 48h.
  const { state, kid } = family([[30, 'approved', 'easy']])
  ok('no dive at 50 hours', dives(dragonFight(state, kid, T0 + 50 * HOUR)).length === 0)
  const d = dives(dragonFight(state, kid, T0 + 78 * HOUR + 1))
  ok('a dive at 78 hours', d.length === 1 && d[0].at === T0 + 78 * HOUR, d.map((e) => (e.at - T0) / HOUR).join())
  ok('IDLE_MS is two days', IDLE_MS === 48 * HOUR)
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
