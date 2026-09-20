/**
 * The badge shelf.
 *
 * A level is a number. A shelf is a collection, and children respond to
 * collections in a way they never respond to numbers — a level does not have a
 * name, or a picture, or a day you remember earning it.
 *
 * THE ONE RULE THAT SHAPES ALL OF THESE: a badge is computed only from state
 * that SYNCS. The activity log does not — `events` is not in ENTITIES and never
 * leaves the device that wrote it — so a badge counted from events would exist
 * on the phone where the chore was approved and be missing on the other one.
 * A child seeing a badge disappear when they pick up the family tablet is worse
 * than never having it. So everything here is derived from kids, quests and
 * submissions, which do travel.
 *
 * They are also all derived, never stored. Nothing to migrate, nothing to get
 * out of step, and a badge earned on an old version appears the moment the app
 * updates.
 */

import { levelFromXp } from '../lib/xp.js'
import { CATEGORIES } from './questTemplates.js'

/** The finished work this child has actually had approved. */
function approvedFor(state, kidId) {
  return (state.submissions || []).filter((s) => s.kidId === kidId && s.status === 'approved')
}

function questsById(state) {
  return new Map((state.quests || []).map((q) => [q.id, q]))
}

/**
 * Each badge says what it is, and answers "have I got it, and how close am I?".
 *
 * `progress` returns { have, need }. A shelf that only showed what you already
 * had would be a trophy case; showing the next one two chores away is what
 * makes a child do the next chore.
 */
export const BADGES = [
  {
    id: 'first',
    emoji: '🌱',
    name: 'First one done',
    blurb: 'Finish your very first chore.',
    progress: (state, kid) => ({ have: approvedFor(state, kid.id).length, need: 1 }),
  },
  {
    id: 'ten',
    emoji: '🔟',
    name: 'Ten under your belt',
    blurb: 'Ten chores approved.',
    progress: (state, kid) => ({ have: approvedFor(state, kid.id).length, need: 10 }),
  },
  {
    id: 'fifty',
    emoji: '🏅',
    name: 'Fifty strong',
    blurb: 'Fifty chores approved.',
    progress: (state, kid) => ({ have: approvedFor(state, kid.id).length, need: 50 }),
  },
  {
    id: 'century',
    emoji: '💯',
    name: 'The hundred',
    blurb: 'A hundred chores. That is a habit, not a phase.',
    progress: (state, kid) => ({ have: approvedFor(state, kid.id).length, need: 100 }),
  },
  {
    id: 'streak3',
    emoji: '🔥',
    name: 'Three in a row',
    blurb: 'Three days on the trot.',
    progress: (state, kid) => ({ have: kid.streak?.count || 0, need: 3 }),
  },
  {
    id: 'streak7',
    emoji: '🗓️',
    name: 'A full week',
    blurb: 'Seven days without missing one.',
    progress: (state, kid) => ({ have: kid.streak?.count || 0, need: 7 }),
  },
  {
    id: 'streak30',
    emoji: '🌍',
    name: 'A whole month',
    blurb: 'Thirty days. Almost nobody gets here.',
    progress: (state, kid) => ({ have: kid.streak?.count || 0, need: 30 }),
  },
  {
    id: 'level5',
    emoji: '⭐',
    name: 'Level five',
    blurb: 'Reach level five.',
    progress: (state, kid) => ({ have: levelFromXp(kid.xp).level, need: 5 }),
  },
  {
    id: 'level20',
    emoji: '🌟',
    name: 'Level twenty',
    blurb: 'Reach level twenty.',
    progress: (state, kid) => ({ have: levelFromXp(kid.xp).level, need: 20 }),
  },
  {
    id: 'allrounder',
    emoji: '🧭',
    name: 'All-rounder',
    blurb: 'Finish a chore in five different parts of the house.',
    progress: (state, kid) => {
      const quests = questsById(state)
      const seen = new Set(
        approvedFor(state, kid.id)
          .map((s) => quests.get(s.questId)?.category)
          .filter(Boolean),
      )
      return { have: Math.min(seen.size, CATEGORIES.length), need: 5 }
    },
  },
  {
    id: 'clockbeater',
    emoji: '⏱️',
    name: 'Clock beater',
    blurb: 'Beat the timer on five timed chores.',
    progress: (state, kid) => {
      const quests = questsById(state)
      const have = approvedFor(state, kid.id).filter(
        (s) => (quests.get(s.questId)?.timerSeconds || 0) > 0 && s.onTime !== false,
      ).length
      return { have, need: 5 }
    },
  },
  {
    id: 'bossslayer',
    emoji: '🐉',
    name: 'Boss slayer',
    blurb: 'Finish three Boss-difficulty chores.',
    progress: (state, kid) => {
      const quests = questsById(state)
      const have = approvedFor(state, kid.id).filter(
        (s) => quests.get(s.questId)?.difficulty === 'boss',
      ).length
      return { have, need: 3 }
    },
  },
  {
    id: 'scholar',
    emoji: '📈',
    name: 'Scholar',
    blurb: 'Score 90% or better on a test chore.',
    progress: (state, kid) => {
      const best = approvedFor(state, kid.id).reduce(
        (top, s) => Math.max(top, typeof s.testScore === 'number' ? s.testScore : 0), 0,
      )
      return { have: best, need: 90 }
    },
  },
  {
    id: 'firsttime',
    emoji: '✅',
    name: 'Nothing sent back',
    blurb: 'Ten chores approved in a row without one being sent back.',
    progress: (state, kid) => {
      // Counted off the quests themselves, because a redo count is kept there
      // and survives the submission being decided.
      const quests = questsById(state)
      const clean = approvedFor(state, kid.id).filter((s) => !(quests.get(s.questId)?.redoCount > 0)).length
      return { have: clean, need: 10 }
    },
  },
  {
    id: 'saver',
    emoji: '🏦',
    name: 'Saver',
    blurb: 'Hold 200 of your currency at once.',
    progress: (state, kid) => ({ have: kid.coins || 0, need: 200 }),
  },
  {
    id: 'spender',
    emoji: '🎁',
    name: 'Cashed in',
    blurb: 'Swap your currency for a real reward.',
    progress: (state, kid) => ({
      have: (state.redemptions || []).filter((r) => r.kidId === kid.id).length,
      need: 1,
    }),
  },
]

/** Every badge, with whether it is earned and how close the rest are. */
export function badgeState(state, kid) {
  if (!kid) return []
  return BADGES.map((badge) => {
    const { have, need } = badge.progress(state, kid)
    return { ...badge, have, need, earned: have >= need, fraction: Math.min(1, have / need) }
  })
}

export function earnedBadgeIds(state, kid) {
  return badgeState(state, kid).filter((b) => b.earned).map((b) => b.id)
}
