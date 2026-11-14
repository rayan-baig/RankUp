/**
 * The starter chore packs, held to the rules written at the top of
 * src/data/questTemplates.js.
 *
 * A pack is the first thing most families put on a child's list, so its
 * numbers are the ones a new family learns the game from. These found, and
 * now keep out: vacuuming the living room filed under Outdoor and paid as a
 * Hard job; reading raced against a timer, so the least reading paid the most;
 * daily homework for a six-year-old priced like a Hard job; three Boss chores
 * a week in the teen pack; and "done" that asked for a photo RankUp no longer
 * takes.
 */
import { QUEST_PACKS, CATEGORIES } from '../src/data/questTemplates.js'
import { DIFFICULTY } from '../src/lib/xp.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); fails += 1 }
}

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))
const xpOf = (q) => DIFFICULTY[q.difficulty]?.xp
const youngest = (pack) => (pack.ages === 'Any' ? 0 : Number.parseInt(pack.ages, 10))
const all = QUEST_PACKS.flatMap((p) => p.quests.map((q) => ({ ...q, pack: p })))

console.log('\n=== Every chore is complete ===')
for (const q of all) {
  const missing = ['title', 'category', 'difficulty', 'doneMeans', 'why'].filter((k) => !q[k])
  ok(`${q.pack.label}: "${q.title}" has everything`, missing.length === 0 && CATEGORY_IDS.has(q.category) && xpOf(q),
    missing.length ? `missing ${missing.join(', ')}` : `category ${q.category}, difficulty ${q.difficulty}`)
}

console.log('\n=== Ages ===')
for (const pack of QUEST_PACKS) {
  ok(`${pack.label} says who it is for (${pack.ages})`, pack.ages === 'Any' || /^\d+(–\d+|\+)$/.test(pack.ages))
}
const kidPack = QUEST_PACKS.find((p) => p.id === 'kid')
const teenPack = QUEST_PACKS.find((p) => p.id === 'teen')
ok('the kid and teen packs meet without a gap', Number.parseInt(kidPack.ages.split('–')[1], 10) + 1 === youngest(teenPack))

console.log('\n=== XP follows the size of the job ===')
for (const q of all.filter((x) => x.difficulty === 'boss')) {
  ok(`Boss "${q.title}" is a teenager's job`, youngest(q.pack) >= 12, `in ${q.pack.label}, ages ${q.pack.ages}`)
}
for (const pack of QUEST_PACKS) {
  const bosses = pack.quests.filter((q) => q.difficulty === 'boss').length
  ok(`${pack.label} has at most one Boss chore`, bosses <= 1, `${bosses}`)
  if (youngest(pack) < 12) {
    const hardDaily = pack.quests.filter((q) => ['daily', 'weekdays'].includes(q.recurrence) && ['hard', 'boss'].includes(q.difficulty))
    ok(`${pack.label}: nothing a young child does every day is priced as Hard`, hardDaily.length === 0,
      hardDaily.map((q) => q.title).join(', '))
  }
  if (pack.adaptive) {
    ok(`${pack.label}: nothing above Medium`, pack.quests.every((q) => ['easy', 'medium'].includes(q.difficulty)))
  }
  // The level curve is tuned for about 150 XP a day (docs/GAME-DESIGN.md).
  const perDay = pack.quests
    .filter((q) => ['daily', 'weekdays'].includes(q.recurrence))
    .reduce((n, q) => n + xpOf(q), 0)
  ok(`${pack.label}: its daily chores pay ${perDay} XP a day, within the ~150 the curve expects`, perDay <= 150)
}

console.log('\n=== Where a chore happens ===')
const INDOORS = /\b(room|desk|bed|bathroom|kitchen|dishwasher|living|sofa|vacuum|hoover)\b/i
for (const q of all.filter((x) => x.category === 'outdoor')) {
  ok(`"${q.title}" really is outdoors`, !INDOORS.test(q.title))
}

console.log('\n=== A timer is a race, so only where faster is better ===')
for (const q of all.filter((x) => x.timerSeconds)) {
  ok(`"${q.title}" is not reading against the clock`, !/\bread/i.test(q.title))
  ok(`"${q.title}" says its timer in words that match it`,
    new RegExp(`${Math.round(q.timerSeconds / 60)}|${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][Math.round(q.timerSeconds / 60)] || '-'}`, 'i')
      .test(`${q.title} ${q.doneMeans}`))
}
ok('no starter chore races a timer longer than 15 minutes', all.every((q) => !q.timerSeconds || q.timerSeconds <= 900))

console.log('\n=== Done never asks for a photo ===')
for (const q of all) {
  ok(`"${q.title}": done is something you can see, not a photo`, !/photo/i.test(q.doneMeans))
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
