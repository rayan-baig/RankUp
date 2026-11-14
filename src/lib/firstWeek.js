/**
 * A new family's first week, read from what has actually happened.
 *
 * Nothing here is ticked by tapping it. Each step is worked out from the
 * family's own synced state, so a chore accepted on a co-parent's phone, or a
 * child's phone linked from another one, ticks it on every parent's phone, and
 * the list cannot claim something is done that is not.
 */

/** How many chores "assign a few" means. */
export const FIRST_WEEK_CHORES = 3

export function firstWeekSteps(state) {
  const kids = state.kids || []
  const quests = state.quests || []
  const subs = state.submissions || []
  const firstKid = kids[0]?.name || 'your child'
  const pending = subs.some((s) => s.status === 'pending')
  const assigned = Math.min(quests.length, FIRST_WEEK_CHORES)

  return [
    {
      id: 'kid',
      label: 'Add a child',
      done: kids.length > 0,
      to: '/parent/kids',
    },
    {
      id: 'pair',
      label: 'Pair a phone',
      line: `On ${firstKid}'s phone, tap “I'm a kid” for a code.`,
      done: kids.some((k) => k.pairedDeviceAt),
      to: '/parent/pair',
    },
    {
      id: 'assign',
      label: `Assign ${FIRST_WEEK_CHORES} chores`,
      line: assigned ? `${assigned} of ${FIRST_WEEK_CHORES} so far.` : 'A ready-made pack does it in one tap.',
      done: quests.length >= FIRST_WEEK_CHORES,
      to: '/parent/assign',
    },
    {
      id: 'accept',
      label: 'Accept a finished chore',
      line: pending
        ? 'One is waiting for you.'
        : `When ${firstKid} taps “I did it!”, it lands in Review.`,
      done: subs.some((s) => s.status === 'approved'),
      to: pending ? '/parent/approvals' : null,
    },
  ]
}

/** On the dashboard until every step is done, or the parent hides it. */
export function showFirstWeek(state) {
  if (state.demo || state.settings?.firstWeekHidden) return false
  return firstWeekSteps(state).some((s) => !s.done)
}

/**
 * "How it works", once.
 *
 * Until the parent taps "Got it". A family that has already accepted a chore
 * has seen the loop for real, so it is not shown to them at all: that is
 * every family that was using RankUp before this card existed.
 */
export function showHowItWorks(state) {
  if (state.demo || state.settings?.howItWorksSeen) return false
  return !(state.submissions || []).some((s) => s.status === 'approved')
}
