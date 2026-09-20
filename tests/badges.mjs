/**
 * The badge shelf, and the one rule that shapes it.
 *
 * A badge must be computed only from state that SYNCS. The activity log does
 * not — `events` never leaves the device that wrote it — so a badge counted
 * from events would exist on the phone where the chore was approved and be
 * missing on the family tablet. A child watching a badge disappear is worse
 * than never having earned it.
 *
 * This is a pure-function test: no browser, no database, just the real
 * badgeState against states built by hand.
 */
import { badgeState, earnedBadgeIds, BADGES } from '../src/data/badges.js'
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const kid = (over = {}) => ({ id: 'k1', name: 'Ava', xp: 0, coins: 0, streak: { count: 0 }, ...over })
const approved = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, kidId: 'k1', questId: `q${i}`, status: 'approved', ...over,
  }))

console.log('\n=== A brand new child has nothing, and is told what is closest ===')
const fresh = badgeState({ submissions: [], quests: [], redemptions: [] }, kid())
ok('no badges yet', fresh.every((b) => !b.earned))
// Not `have === 0`: a child starts at level 1, so the level badges legitimately
// begin with one of the five they need. What matters is that none is complete
// and every one has a target to move towards.
ok('every one still says what it needs',
  fresh.every((b) => b.need > 0 && b.have < b.need && b.fraction < 1))

console.log('\n=== The first chore earns the first badge ===')
const one = badgeState({ submissions: approved(1), quests: [], redemptions: [] }, kid())
ok('"First one done" is earned', one.find((b) => b.id === 'first').earned)
ok('but "Ten under your belt" is not', !one.find((b) => b.id === 'ten').earned)
ok('and it is nine tenths of the way from being shown as hopeless',
  one.find((b) => b.id === 'ten').fraction === 0.1)

console.log('\n=== Only approved work counts ===')
const pendingOnly = badgeState(
  { submissions: [{ id: 's', kidId: 'k1', questId: 'q', status: 'pending' }], quests: [], redemptions: [] },
  kid(),
)
ok('a chore waiting for a parent earns nothing', !pendingOnly.find((b) => b.id === 'first').earned)

console.log('\n=== And only this child’s work ===')
const sibling = badgeState(
  { submissions: [{ id: 's', kidId: 'other', questId: 'q', status: 'approved' }], quests: [], redemptions: [] },
  kid(),
)
ok('a sibling’s chore does not earn it for them', !sibling.find((b) => b.id === 'first').earned)

console.log('\n=== The ones that read other rows ===')
const state = {
  submissions: [
    { id: 'a', kidId: 'k1', questId: 'q1', status: 'approved' },
    { id: 'b', kidId: 'k1', questId: 'q2', status: 'approved' },
    { id: 'c', kidId: 'k1', questId: 'q3', status: 'approved' },
    { id: 'd', kidId: 'k1', questId: 'q4', status: 'approved' },
    { id: 'e', kidId: 'k1', questId: 'q5', status: 'approved' },
  ],
  quests: [
    { id: 'q1', category: 'bedroom', difficulty: 'boss' },
    { id: 'q2', category: 'kitchen', difficulty: 'boss' },
    { id: 'q3', category: 'bathroom', difficulty: 'boss' },
    { id: 'q4', category: 'laundry', difficulty: 'easy' },
    { id: 'q5', category: 'outdoor', difficulty: 'easy' },
  ],
  redemptions: [],
}
const mixed = badgeState(state, kid())
ok('five different rooms earns All-rounder', mixed.find((b) => b.id === 'allrounder').earned)
ok('three Boss chores earns Boss slayer', mixed.find((b) => b.id === 'bossslayer').earned)

console.log('\n=== Nothing is counted from the activity log ===')
// The load-bearing check. `events` does not sync, so a badge that read it would
// appear on one phone and not the other.
const source = readFileSync('src/data/badges.js', 'utf8')
ok('badges.js never touches state.events', !/state\.events|\bevents\b\s*\|\|/.test(source))

console.log('\n=== Two devices holding the same synced rows agree ===')
// Same submissions and quests, different local-only extras. The shelf must not
// move: this is the whole promise.
const deviceA = { ...state, events: [{ type: 'quest_approved' }], photos: {} }
const deviceB = { ...state, events: [] }
ok('the same rows give the same badges on both',
  JSON.stringify(earnedBadgeIds(deviceA, kid())) === JSON.stringify(earnedBadgeIds(deviceB, kid())))

console.log('\n=== Every badge is reachable and described ===')
ok('all have an emoji, a name and a blurb',
  BADGES.every((b) => b.emoji && b.name && b.blurb && typeof b.progress === 'function'))
ok('ids are unique', new Set(BADGES.map((b) => b.id)).size === BADGES.length)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
