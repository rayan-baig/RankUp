/**
 * "Today" on the phone and "today" on the server have to be the same day.
 *
 * The phone offers the daily bonus, resets the arcade's cap and counts a
 * streak by its own local date. The server used UTC, so for a family west of
 * UTC every evening the bonus came back dated tomorrow: the phone offered it
 * again, paid five coins on screen, and the next sync took them away — over
 * and over. supabase/test/27-family-day.sql checks the database half; this
 * checks the phone half:
 *
 *   - every call whose answer depends on the date says which zone the phone
 *     is in, so the server can use the same day;
 *   - a day recorded as later than the phone's today (a zone change, or a
 *     server that used UTC) counts as already done, never as "not yet".
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { reducer } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')
const { dayKey, addDays } = await import('../src/lib/dates.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const today = dayKey()
const tomorrow = dayKey(addDays(new Date(), 1))
const AVA = '00000000-0000-4000-8000-00000000a001'

const base = (kid = {}) => {
  const s = createInitialState()
  return {
    ...s,
    onboarded: true,
    family: { ...s.family, id: '00000000-0000-4000-8000-00000000f001', name: 'Test', tier: 'standard' },
    kids: [{
      ...s.kids?.[0], id: AVA, name: 'Ava', xp: 0, coins: 50, lockout: null, playTokens: 3,
      streak: { count: 4, lastDay: null, freezeTokens: 1 }, bestTimes: {}, ...kid,
    }],
    quests: [], submissions: [], rewards: [], redemptions: [], notes: [], overrides: [],
    syncQueue: [],
  }
}
const call = (state, fn) => (state.syncQueue || []).find((c) => c.fn === fn)

console.log('\n=== Calls that depend on the date say which zone the phone is in ===')
{
  const s = reducer(base(), { type: 'CLAIM_LOGIN_BONUS', kidId: AVA })
  ok('the daily bonus', call(s, 'claim_login_bonus')?.args?.p_tz === zone, JSON.stringify(call(s, 'claim_login_bonus')))
}
{
  const s = reducer(base(), { type: 'FINISH_MINIGAME', kidId: AVA, game: 'memory', score: 80, coins: 4 })
  ok('a finished game', call(s, 'play_minigame')?.args?.p_tz === zone, JSON.stringify(call(s, 'play_minigame')))
}
{
  const s = reducer(base({ streak: { count: 4, lastDay: dayKey(addDays(new Date(), -2)), freezeTokens: 1 } }),
    { type: 'USE_STREAK_FREEZE', kidId: AVA })
  ok('a streak freeze', call(s, 'use_streak_freeze')?.args?.p_tz === zone, JSON.stringify(call(s, 'use_streak_freeze')))
}
{
  let s = base()
  s = { ...s, quests: [{ id: 'q1', kidId: AVA, title: 'Feed the cat', xp: 30, difficulty: 'medium', status: 'submitted' }],
    submissions: [{ id: 's1', questId: 'q1', kidId: AVA, status: 'pending', submittedAt: Date.now() }] }
  s = reducer(s, { type: 'APPROVE_SUBMISSION', submissionId: 's1' })
  ok('an approval, which moves the streak', call(s, 'approve_submission')?.args?.p_tz === zone,
    JSON.stringify(call(s, 'approve_submission')))
}

console.log('\n=== A day recorded as later than today counts as done ===')
{
  const before = base({ lastLoginBonus: tomorrow })
  const s = reducer(before, { type: 'CLAIM_LOGIN_BONUS', kidId: AVA })
  ok('a bonus already dated tomorrow is not paid again on screen', s.kids[0].coins === 50, `coins ${s.kids[0].coins}`)
  ok('and nothing is sent', !call(s, 'claim_login_bonus'))
}
{
  const s = reducer(base({ lastLoginBonus: today }), { type: 'CLAIM_LOGIN_BONUS', kidId: AVA })
  ok('claimed today: not paid twice', s.kids[0].coins === 50)
}
{
  const s = reducer(base({ lastLoginBonus: dayKey(addDays(new Date(), -1)) }), { type: 'CLAIM_LOGIN_BONUS', kidId: AVA })
  ok('claimed yesterday: paid today', s.kids[0].coins === 55)
}
{
  const s = reducer(base({ gameDay: tomorrow, gameCoinsToday: 15 }),
    { type: 'FINISH_MINIGAME', kidId: AVA, game: 'memory', score: 100, coins: 5 })
  ok('a cap used up on a day dated tomorrow still holds', s.kids[0].coins === 50, `coins ${s.kids[0].coins}`)
}
{
  let s = base({ streak: { count: 4, lastDay: tomorrow, freezeTokens: 1 } })
  s = { ...s, quests: [{ id: 'q1', kidId: AVA, title: 'Feed the cat', xp: 30, difficulty: 'medium', status: 'submitted' }],
    submissions: [{ id: 's1', questId: 'q1', kidId: AVA, status: 'pending', submittedAt: Date.now() }] }
  s = reducer(s, { type: 'APPROVE_SUBMISSION', submissionId: 's1' })
  ok('a streak whose last day is dated tomorrow is not broken by an approval', s.kids[0].streak.count === 4,
    `streak ${s.kids[0].streak.count}`)
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
