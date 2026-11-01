/**
 * The review screen's "If you accept +N XP" must be what accepting pays.
 *
 * It worked the number out with calcReward alone, which leaves out the bonus
 * for a test score. A parent was told "+30 XP" for a practice test scored at
 * 95% and the child was then paid 60. The screen and the reducer now share
 * submissionReward; this checks the screen's source uses it and that it agrees
 * with what the reducer actually pays, case by case.
 */
import { readFileSync } from 'node:fs'

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { reducer, isElite } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')
const { submissionReward, liveStreak } = await import('../src/lib/xp.js')
const { dayKey } = await import('../src/lib/dates.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const AVA = 'kid-ava'
const paid = (quest, sub, { tier = 'standard', streak = 0 } = {}) => {
  const s = createInitialState()
  let state = {
    ...s,
    family: { ...s.family, id: 'fam', tier },
    kids: [{ ...s.kids?.[0], id: AVA, name: 'Ava', xp: 0, coins: 0, bestTimes: {},
      streak: { count: streak, lastDay: dayKey(), freezeTokens: 0 } }],
    quests: [{ id: 'q', kidId: AVA, status: 'submitted', ...quest }],
    submissions: [{ id: 's', questId: 'q', kidId: AVA, status: 'pending', submittedAt: Date.now(), ...sub }],
  }
  // Worked out as the screen does, from the state before the tap.
  const shown = submissionReward(state.quests[0], state.submissions[0], { elite: isElite(state), streak: liveStreak(state.kids[0].streak) })
  state = reducer(state, { type: 'APPROVE_SUBMISSION', submissionId: 's' })
  return { paid: state.submissions[0].awarded, shown }
}

console.log('\n=== The review screen shows what accepting pays ===')
const cases = [
  ['a plain chore', { xp: 30, difficulty: 'medium' }, {}],
  ['a practice test scored 95%', { xp: 55, testScore: true }, { testScore: 95 }],
  ['a practice test scored 82%', { xp: 30, testScore: true }, { testScore: 82 }],
  ['a practice test scored 60%', { xp: 30, testScore: true }, { testScore: 60 }],
  ['a timed chore finished late', { xp: 30, timerSeconds: 600 }, { onTime: false }],
  ['a double-XP test on Elite with a streak', { xp: 55, testScore: true, doubleXp: true }, { testScore: 91 }, { tier: 'elite', streak: 7 }],
]
for (const [label, quest, sub, opts] of cases) {
  const { paid: p, shown } = paid(quest, sub, opts)
  ok(label, p.xp === shown.xp && p.coins === shown.coins, `shown ${shown.xp}/${shown.coins}, paid ${p.xp}/${p.coins}`)
}

const screen = readFileSync(new URL('../src/screens/parent/ParentApprovals.jsx', import.meta.url), 'utf8')
ok('the review screen works its number out with submissionReward', /submissionReward\(/.test(screen))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
