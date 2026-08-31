/**
 * The arcade.
 *
 * THE RULE THAT KEEPS THIS FROM WRECKING THE APP: a minigame is never a way to
 * earn. Chores are. You get one play token for each chore a parent approves, a
 * game pays a handful of currency at most, and the day's winnings are capped
 * well below what a single chore is worth. So the arcade pulls a child toward
 * the chore list rather than away from it — which is the whole point of putting
 * it behind an approval in the first place.
 *
 * Every game reports a single 0–100 score, so one payout rule covers all three
 * and the database can check the sum without knowing how any game is played.
 */

export const MAX_TOKENS = 5
export const DAILY_COIN_CAP = 15

export const MINIGAMES = [
  {
    id: 'tap',
    name: 'Quick Tap',
    icon: '👆',
    blurb: 'Targets appear. Hit them before they vanish.',
    howTo: 'Twenty seconds. Tap every target you can — they get faster.',
  },
  {
    id: 'stack',
    name: 'Stacker',
    icon: '🧱',
    blurb: 'Time your tap. Stack the tower. Do not wobble.',
    howTo: 'Tap when the moving block lines up. Miss badly and the run ends.',
  },
  {
    id: 'memory',
    name: 'Memory Match',
    icon: '🃏',
    blurb: 'Flip the cards, find the pairs, beat your time.',
    howTo: 'Eight pairs. Fewer flips and less time means a better score.',
  },
]

export function findGame(id) {
  return MINIGAMES.find((g) => g.id === id) || null
}

/**
 * What a 0–100 score is worth.
 *
 * Mirrored exactly in play_minigame() in supabase/schema.sql — the database is
 * the authority, this copy exists so the app still works with no server and so
 * the child can be shown the number straight away. If you change one, change
 * both; supabase/test/09-minigames.sql checks they agree.
 */
export function coinsForScore(score) {
  const s = Math.max(0, Math.min(100, Math.round(score || 0)))
  return Math.max(1, Math.min(5, Math.round(s / 20)))
}

/** Clamped to whatever is left of today's cap. */
export function payout(score, earnedToday) {
  const wanted = coinsForScore(score)
  return Math.max(0, Math.min(wanted, DAILY_COIN_CAP - (earnedToday || 0)))
}
