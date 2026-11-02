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

console.log('\n=== The goal is the family\'s, not this phone\'s ===')
state = reducer({ ...state, syncQueue: [] }, { type: 'SET_FAMILY_GOAL', goal: { name: ' Zoo day ', targetXp: 800 } })
const call = state.syncQueue.at(-1)
ok('setting it asks the server to set it for the family',
  call?.fn === 'set_family_goal' && call.args.p_name === 'Zoo day' && call.args.p_target_xp === 800, JSON.stringify(call))
state = reducer({ ...state, syncQueue: [] }, { type: 'SET_FAMILY_GOAL', goal: null })
ok('and clearing it does too', state.syncQueue.at(-1)?.fn === 'set_family_goal' && state.syncQueue.at(-1).args.p_name === null)

const row = { family_id: 'f', name: 'Zoo day', target_xp: 800, start_xp: 2520, created_at: new Date().toISOString(), rev: 50, progress: 70 }
state = reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: { family_goals: [row] } })
ok('a goal set on another phone arrives', state.familyGoal?.name === 'Zoo day' && state.familyGoal.targetXp === 800)
ok('counting from where the server says it started', familyGoalProgress(state) === 0, String(familyGoalProgress(state)))
const kidPhone = { ...state, device: { role: 'kid', linkedKidId: 'a' }, kids: [state.kids[0]] }
ok('a child\'s phone, which sees only its own child, shows the family\'s progress',
  familyGoalProgress(kidPhone) === 70, String(familyGoalProgress(kidPhone)))

let held = reducer(state, { type: 'MERGE_SNAPSHOT', pending: ['family_goals'], snapshot: { family_goals: [{ ...row, name: 'Old', rev: 40 }] } })
ok('a goal waiting to go is not put back by an older copy', held.familyGoal?.name === 'Zoo day')

held = reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: { deletions: [{ table_name: 'family_goals', row_id: 'f', rev: 60 }] } })
ok('cleared on another phone, it is cleared here', held.familyGoal === null)
held = reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: { deletions: [{ table_name: 'family_goals', row_id: 'f', rev: 30 }] } })
ok('an older clear does not take away a newer goal', held.familyGoal?.name === 'Zoo day')
held = reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: {
  family_goals: [{ ...row, name: 'Cinema', rev: 70 }], deletions: [{ table_name: 'family_goals', row_id: 'f', rev: 65 }] } })
ok('cleared and set again since: the new goal stands', held.familyGoal?.name === 'Cinema')

console.log('\n=== A child removed does not take the family\'s progress ===')
let two = { ...state, familyGoal: { name: 'Zoo day', targetXp: 800, startXp: 2400, shared: true } }
ok('the bar starts where it was', familyGoalProgress(two) === 120, String(familyGoalProgress(two)))
two = reducer(two, { type: 'REMOVE_KID', kidId: 'b' })
ok('and stays there when a child is removed', familyGoalProgress(two) === 120, String(familyGoalProgress(two)))

console.log('\n=== A goal from before goals were shared goes up once ===')
let legacy = { ...state, syncQueue: [], familyGoal: { name: 'Aquarium trip', targetXp: 2000, startXp: 1200 } }
legacy = reducer(legacy, { type: 'SHARE_FAMILY_GOAL' })
const up = legacy.syncQueue.at(-1)
ok('it is sent with where it started', up?.fn === 'set_family_goal' && up.args.p_start_xp === 1200, JSON.stringify(up))
ok('only once', reducer(legacy, { type: 'SHARE_FAMILY_GOAL' }).syncQueue.length === 1)

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
