/**
 * The short celebrations: a level-up, a streak, a badge.
 *
 * Each one is a moment, not a stop. It shows for a couple of seconds, a tap
 * anywhere skips it, and it never stands in the way of the next tap: the tap
 * that skips it also reaches whatever was underneath. A parent accepting five
 * chores in a row keeps accepting; a child heading for the arcade gets there.
 *
 * And there is only ever one of each waiting. A big sync that brings five
 * levels at once is one level-up, from the first level to the last, not five
 * celebrations queued one after another. A streak that moves while a
 * level-up is waiting rides along inside it rather than following it.
 */

/** How long a level-up stays up. */
export const LEVEL_UP_MS = 2500
/** A level-up that opens a new world has a line of story to read. */
export const NEW_WORLD_MS = 3000
/** A streak on its own: a smaller moment, so a shorter one. */
export const STREAK_MS = 2000
/** A badge, or several earned at once, in one toast. */
export const BADGE_MS = 3000

/** The longest any moment may last. tests/moments.mjs holds every one to it. */
export const MOMENT_MAX_MS = 3000

/**
 * The level-up waiting to be shown, with a new one folded in.
 *
 * The same child: from the lower of the two starting levels to the higher of
 * the two ends, so three level-ups in one sync read "level 4 to 7". Another
 * child: the newer one replaces it, because a phone shows one child at a time.
 */
export function foldLevelUp(held, kidId, from, to) {
  if (!(to > from)) return held || null
  const same = held && held.kidId === kidId ? held : null
  return {
    kidId,
    from: same ? Math.min(same.from, from) : from,
    to: same ? Math.max(same.to, to) : to,
  }
}

/**
 * The streak waiting to be shown, if this change is one worth a moment.
 *
 * Only a streak that went up, and only from two days on: day one is not a
 * streak yet. A newer count for the same child replaces the older one.
 */
export function foldStreak(held, kidId, before, after) {
  if (!(after > before) || after < 2) return held || null
  return { kidId, count: after }
}

/** Badge ids waiting in the toast, with newly earned ones added (no repeats). */
export function foldBadges(showing, fresh) {
  if (!fresh?.length) return showing || null
  return [...new Set([...(showing || []), ...fresh])]
}
