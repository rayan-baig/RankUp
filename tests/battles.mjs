/**
 * The Block Craft battle scenes and the chapters of the story.
 *
 * Prevents: a scene that throws halfway and leaves a black box, a fight the
 * hero never wins, a hero who walks off the edge of the screen, a dragon
 * replay whose health bars end on different numbers from the real fight,
 * and a chapter of the story being listed before the child has reached it.
 *
 * The scenes are drawn on a pretend canvas that accepts every drawing call
 * and draws nothing; what is checked is where everyone is and what the bars
 * say, which is the part that can be wrong.
 *
 *   node tests/battles.mjs
 */
import { createBattle, SCENES } from '../src/lib/battleEngine.js'
import { dragonFight, DRAGON_LEVEL } from '../src/lib/dragonFight.js'
import { totalXpForLevel } from '../src/lib/xp.js'
import { storyChapters } from '../src/data/kidThemes.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** A 2D context that takes any call and any property, and does nothing. */
function fakeContext() {
  const noop = () => fake
  const gradient = { addColorStop() {} }
  const fake = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' ? () => gradient : noop),
    set: (t, k, v) => { t[k] = v; return true },
  })
  return fake
}
const fakeCanvas = () => { const ctx = fakeContext(); return { width: 0, height: 0, getContext: () => ctx } }

/** Run a scene for `seconds` at 30 frames a second, watching the hero. */
function run(chapter, seconds, extra = {}) {
  let wonAt = null
  const events = []
  let t = 0
  const b = createBattle(fakeCanvas(), {
    chapter, manual: true, makeBuffer: fakeCanvas,
    onWon: () => { if (wonAt === null) wonAt = t },
    onEvent: (e) => events.push(e),
    ...extra,
  })
  let minX = Infinity
  let maxX = -Infinity
  for (; t < seconds; t += 1 / 30) {
    b.step(1 / 30)
    const s = b.snapshot()
    if (t > 3) { minX = Math.min(minX, s.heroX); maxX = Math.max(maxX, s.heroX) }
  }
  return { wonAt, events, minX, maxX, end: b.snapshot() }
}

console.log('\n=== Every chapter plays and is won ===')
for (const chapter of ['raid', 'portal', 'rise', 'end', 'home']) {
  let r
  try { r = run(chapter, 25) } catch (e) { ok(`${chapter} plays without an error`, false, e.message); continue }
  ok(`${chapter}: the hero wins`, r.wonAt !== null && r.wonAt < 20, String(r.wonAt))
  // Fully in view: the sprite is about 12 wide at double size, the sword more.
  ok(`${chapter}: the hero stays on screen`, r.minX >= 8 && r.maxX <= 256 - 24, `${r.minX.toFixed(0)}..${r.maxX.toFixed(0)}`)
}
ok('every chapter in the story has a scene', ['raid', 'portal', 'rise', 'end', 'dragon', 'home'].every((c) => SCENES[c]))

/* The same family as tests/dragon.mjs: a child who reached the dragon at T0. */
const HOUR = 3600 * 1000
const T0 = Date.UTC(2027, 0, 4, 9)
function family(after) {
  const quests = []
  const submissions = []
  let xp = totalXpForLevel(DRAGON_LEVEL) - 10
  const add = (at, status, difficulty, gain) => {
    const id = `q${quests.length}`
    quests.push({ id, kidId: 'k1', title: `A ${difficulty} chore`, difficulty })
    submissions.push({ id: `s${id}`, questId: id, kidId: 'k1', status, decidedAt: at, awarded: status === 'approved' ? { xp: gain } : null })
    if (status === 'approved') xp += gain
  }
  add(T0, 'approved', 'hard', 55)
  for (const [h, status, difficulty] of after) add(T0 + h * HOUR, status, difficulty, 30)
  const kid = { id: 'k1', themeId: 'blockcraft', xp, themeChosenAt: T0 - 1000 * HOUR }
  return { state: { quests, submissions }, kid }
}

console.log('\n=== The dragon replay ends on the real numbers ===')
{
  // Hits, a chore sent back, then eight more sent back: one knockout on the way.
  const rows = [[1, 'approved', 'hard'], [2, 'approved', 'medium'], [3, 'rejected', 'easy']]
  for (let i = 0; i < 7; i++) rows.push([4 + i, 'rejected', 'easy'])
  const { state, kid } = family(rows)
  const fight = dragonFight(state, kid, T0 + 12 * HOUR)
  const r = run('dragon', 30, { fight: { from: { dragon: 1000, hero: 100 }, events: fight.events } })
  ok('the bars end where the fight says', r.end.dragon === fight.dragon && r.end.hero === fight.hero,
    `scene ${r.end.dragon}/${r.end.hero}, fight ${fight.dragon}/${fight.hero}`)
  ok('every move was played', r.events.length === fight.events.length && r.end.queued === 0, `${r.events.length} of ${fight.events.length}`)
  ok('the fight went on: the dragon is still there', r.end.dragonGone === false)
  ok('it had a knockout in it', fight.knockouts === 1, String(fight.knockouts))
}
{
  const { state, kid } = family([[1, 'approved', 'boss'], [2, 'approved', 'boss'], [3, 'approved', 'boss'], [4, 'approved', 'boss']])
  const fight = dragonFight(state, kid, T0 + 5 * HOUR)
  // Only the last two, from where the fight stood after the second.
  const last = fight.events.slice(-2)
  const before = fight.events[fight.events.length - 3]
  const r = run('dragon', 20, { fight: { from: { dragon: before.dragon, hero: before.hero }, events: last, defeated: true } })
  ok('a part replay starts where the fight stood', r.events.length === 2 && r.end.dragon === 0)
  ok('the final hit brings it down', r.end.dragonGone === true && r.wonAt !== null)
  const after = run('dragon', 3, { fight: { from: { dragon: 0, hero: 100 }, events: [], defeated: true } })
  ok('opened again later, the dragon is simply gone', after.end.dragonGone === true && after.end.dragon === 0)
}
{
  const { state, kid } = family([[1, 'approved', 'easy'], [2, 'rejected', 'easy']])
  const fight = dragonFight(state, kid, T0 + 3 * HOUR)
  let won = false
  const b = createBattle(fakeCanvas(), {
    chapter: 'dragon', makeBuffer: fakeCanvas, reducedMotion: true,
    fight: { from: { dragon: 1000, hero: 100 }, events: fight.events },
    onWon: () => { won = true },
  })
  const s = b.snapshot()
  ok('with reduced motion it lands at once on the same numbers', won && s.dragon === fight.dragon && s.hero === fight.hero,
    `${s.dragon}/${s.hero} vs ${fight.dragon}/${fight.hero}`)
}

console.log('\n=== Chapters are only ever the ones reached ===')
{
  const names = (level, progress) => storyChapters('blockcraft', level, progress).map((c) => c.chapter).join(',')
  ok('level 1: just the raid', names(1) === 'raid', names(1))
  ok('level 124: still just the raid', names(124) === 'raid')
  ok('level 125: the portal opens', names(125) === 'raid,portal')
  ok('level 400: up to the dragon, not past it', names(400) === 'raid,portal,rise,end,dragon', names(400))
  ok('the dragon beaten: the way home', names(400, { dragonDefeated: true }).endsWith(',dragon,home'))
  ok('the glitch chapters are the portal and the End',
    storyChapters('blockcraft', 400).filter((c) => c.glitch).map((c) => c.chapter).join() === 'portal,end')
  ok('a theme with no story has no chapters', storyChapters('apex', 400).length === 0)
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
