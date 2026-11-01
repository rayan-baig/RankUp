/**
 * What happened to each chore, read from the submissions themselves.
 *
 * The activity log in state (`state.events`) is written by the reducer on the
 * device where something was tapped, and it never leaves that device. With two
 * phones that is most of the story missing: a child submits on their phone and
 * a parent accepts on theirs, so the child's profile counted no completed
 * chores at all, and a parent's "XP this week" and Behaviour Blueprint charts
 * missed everything a co-parent accepted and every "I did it!" from the
 * child's phone.
 *
 * Submissions do travel between devices, and each one already carries when it
 * was sent, whether it was accepted or sent back, when, and what it paid. So
 * the chore-related entries are rebuilt from those, in the same shape as the
 * log, and every phone in the family sees the same numbers.
 */
import { dayKey } from './dates.js'

/** The log entries this replaces. Anything else still comes from the local log. */
export const CHORE_EVENT_TYPES = new Set(['quest_submitted', 'quest_approved', 'quest_rejected'])

export function choreEvents(state) {
  const quests = new Map((state.quests || []).map((q) => [q.id, q]))
  const out = []
  for (const s of state.submissions || []) {
    const quest = quests.get(s.questId)
    if (s.submittedAt) {
      out.push({
        id: `${s.id}:submitted`,
        type: 'quest_submitted',
        kidId: s.kidId,
        at: s.submittedAt,
        day: dayKey(new Date(s.submittedAt)),
        meta: { questId: s.questId, title: quest?.title },
      })
    }
    if ((s.status === 'approved' || s.status === 'rejected') && s.decidedAt) {
      out.push({
        id: `${s.id}:${s.status}`,
        type: s.status === 'approved' ? 'quest_approved' : 'quest_rejected',
        kidId: s.kidId,
        at: s.decidedAt,
        day: dayKey(new Date(s.decidedAt)),
        meta: {
          questId: s.questId,
          title: quest?.title,
          xp: s.awarded?.xp || 0,
          coins: s.awarded?.coins || 0,
          category: quest?.category,
          difficulty: quest?.difficulty,
          adaptive: Boolean(quest?.adaptive),
          reason: s.parentNote || '',
        },
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * The whole activity feed: chores from the submissions, everything else
 * (rewards, overrides, themes...) from this device's own log. Oldest first.
 */
export function activityFeed(state) {
  return [
    ...(state.events || []).filter((e) => !CHORE_EVENT_TYPES.has(e.type)),
    ...choreEvents(state),
  ].sort((a, b) => a.at - b.at)
}
