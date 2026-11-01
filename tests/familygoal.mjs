/**
 * A family goal counts the XP earned towards it, not every XP ever earned.
 *
 * The bar added up the children's lifetime XP, so a family that had played
 * for a month and then set "Aquarium trip at 2,000 XP" saw it already full on
 * the day they set it. The goal now remembers where everybody was when it was
 * set, and counts from there.
 */
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { reducer, familyGoalProgress } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const s0 = createInitialState()
let state = { ...s0, kids: [{ ...s0.kids?.[0], id: 'a', name: 'Ava', xp: 1500 }, { id: 'b', name: 'Jo', xp: 900 }] }

console.log('\n=== A new goal starts empty ===')
state = reducer(state, { type: 'SET_FAMILY_GOAL', goal: { name: 'Aquarium trip', targetXp: 2000 } })
ok('a goal set today is not already met by last month\'s XP', familyGoalProgress(state) === 0, String(familyGoalProgress(state)))
state = { ...state, kids: state.kids.map((k) => (k.id === 'a' ? { ...k, xp: k.xp + 120 } : k)) }
ok('XP earned after it was set counts', familyGoalProgress(state) === 120, String(familyGoalProgress(state)))

console.log('\n=== Editing the goal keeps the progress ===')
state = reducer(state, { type: 'SET_FAMILY_GOAL', goal: { name: 'Aquarium trip', targetXp: 2500 } })
ok('raising the target of the same goal keeps what was earned', familyGoalProgress(state) === 120, String(familyGoalProgress(state)))
state = reducer(state, { type: 'SET_FAMILY_GOAL', goal: { name: 'Pizza night', targetXp: 500 } })
ok('a different goal starts again', familyGoalProgress(state) === 0, String(familyGoalProgress(state)))
state = reducer(state, { type: 'SET_FAMILY_GOAL', goal: null })
ok('clearing it clears it', state.familyGoal === null && familyGoalProgress(state) === 0)

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
