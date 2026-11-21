/**
 * A new family's first steps, read from what has actually happened.
 *
 * Nothing here is ticked by tapping it. Each step is worked out from the
 * family's own synced state, so a chore accepted on a co-parent's phone, or a
 * child's phone linked from another one, ticks it on every parent's phone, and
 * the list cannot claim something is done that is not. The one exception is
 * "we share one phone", which is a choice, not something that happens: it
 * stands in for linking a phone that does not exist.
 */
import { QUEST_PACKS } from '../data/questTemplates.js'
import { DIFFICULTY } from './xp.js'

/** How many chores "assign a few" means. Kept for the starter set's size. */
export const FIRST_WEEK_CHORES = 3

/*
 * Three chores to start with, one tap: one easy thing every day, one with no
 * proof to show, and one that helps the house. From the age 6–11 pack, or
 * the adaptive pack for a child whose profile asks for it. tests/packs.mjs
 * already holds both packs to their rules, so these follow them too.
 */
const STARTER_TITLES = {
  kid: ['Make your bed', 'Read for 20 minutes', 'Load the dishwasher'],
}

/** The starter chores for one child, ready for ADD_QUESTS. */
export function starterChores(kid) {
  if (!kid) return []
  const adaptive = Boolean(kid.accessibility?.hasNeeds)
  const pack = QUEST_PACKS.find((p) => p.id === (adaptive ? 'adaptive' : 'kid'))
  if (!pack) return []
  const picked = adaptive
    ? pack.quests.slice(0, FIRST_WEEK_CHORES)
    : STARTER_TITLES.kid.map((t) => pack.quests.find((q) => q.title === t)).filter(Boolean)
  return picked.map((q) => ({
    ...q,
    kidId: kid.id,
    xp: DIFFICULTY[q.difficulty]?.xp ?? DIFFICULTY.medium.xp,
    supports: q.supports || kid.accessibility?.supports || [],
    doubleXp: false,
  }))
}

/*
 * Three rewards to start with, one tap. The same three the demo family has:
 * small, real things a parent can say yes to, priced so the first one is
 * about two days of chores away.
 */
export const STARTER_REWARDS = Object.freeze([
  { name: "Pick Friday's film", cost: 60, icon: '🎬', description: 'Whatever you want, nobody argues.' },
  { name: 'An hour later bedtime', cost: 90, icon: '🌙', description: 'One night, your choice.', weeklyLimit: 2 },
  { name: 'Day out, you choose', cost: 250, icon: '🎢', description: 'Anywhere within reason.' },
])

export function firstWeekSteps(state) {
  const kids = state.kids || []
  const quests = state.quests || []
  const subs = state.submissions || []
  const firstKid = kids[0]?.name || 'your child'
  const pending = subs.some((s) => s.status === 'pending')
  const paired = kids.some((k) => k.pairedDeviceAt)
  const sharedPhone = Boolean(state.settings?.sharedPhone)

  return [
    {
      id: 'kid',
      label: 'Add a child',
      done: kids.length > 0,
      to: '/parent/kids',
    },
    {
      id: 'pair',
      label: `Link ${kids[0] ? `${firstKid}'s` : 'their'} phone`,
      // The code is made on the parent's phone for one child, and typed on
      // the child's: the way linking works since 0.22.0.
      line: `In Settings, Link a kid's device, tap “Code for ${firstKid}”.`,
      done: paired || sharedPhone,
      to: '/parent/pair',
      // One phone for the whole family is fine: this step then counts as done.
      skip: !paired && !sharedPhone && kids.length > 0 ? 'We share one phone' : null,
    },
    {
      id: 'assign',
      label: 'Add a first chore',
      line: quests.length ? null : 'Start with three ready-made ones, or write your own.',
      done: quests.length > 0,
      to: '/parent/assign',
      // One tap: three starter chores for the first child.
      starter: quests.length === 0 && kids[0] ? kids[0] : null,
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
