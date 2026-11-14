/**
 * The activity feed behind "Chores completed", "XP this week" and the
 * Behaviour Blueprint: chores come from the synced submissions, so every phone
 * counts the same chores; the phone's own log still supplies everything else,
 * and remembers chores whose quest has since been deleted.
 */
const { activityFeed } = await import('../src/lib/activity.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== Chores come from the submissions ===')
const synced = activityFeed({
  quests: [{ id: 'q1', title: 'Feed the cat', category: 'kitchen' }],
  submissions: [
    { id: 's1', questId: 'q1', kidId: 'k', status: 'approved', submittedAt: 1, decidedAt: 2, awarded: { xp: 30 } },
    { id: 's0', questId: 'q1', kidId: 'k', status: 'rejected', submittedAt: 0.5, decidedAt: 0.7 },
  ],
  events: [],
})
ok('an approval made on another phone counts here', synced.filter((e) => e.type === 'quest_approved').length === 1)
ok('with what it paid', synced.find((e) => e.type === 'quest_approved')?.meta.xp === 30)
ok('a send-back counts too', synced.filter((e) => e.type === 'quest_rejected').length === 1)

console.log('\n=== The phone\'s own log fills the gaps ===')
const mixed = activityFeed({
  quests: [{ id: 'q2', title: 'B' }],
  submissions: [{ id: 's2', questId: 'q2', kidId: 'k', status: 'approved', submittedAt: 1, decidedAt: 2, awarded: { xp: 30 } }],
  events: [
    { id: 'e1', type: 'quest_approved', kidId: 'k', at: 1, meta: { questId: 'q-deleted', xp: 15 } },
    { id: 'e2', type: 'quest_approved', kidId: 'k', at: 2, meta: { questId: 'q2', xp: 30 } },
    { id: 'e3', type: 'reward_redeemed', kidId: 'k', at: 3, meta: {} },
  ],
})
ok('a chore whose quest was deleted is still remembered', mixed.some((e) => e.id === 'e1'))
ok('a chore in both is counted once', mixed.filter((e) => e.type === 'quest_approved').length === 2)
ok('everything else still comes from the log', mixed.some((e) => e.id === 'e3'))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
