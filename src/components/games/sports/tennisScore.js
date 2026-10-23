/**
 * Tennis scoring, which is the first thing that makes tennis feel like
 * tennis rather than like keeping a ball in play.
 *
 * Fifteen, thirty, forty, deuce, advantage — and crucially you cannot win
 * a game by one point from forty-forty. A child who has watched tennis
 * knows all of this, and a game that says "you win 40–40" has told them it
 * is not really tennis.
 *
 * Kept out of the component so it can be tested properly: the deuce rules
 * are fiddly and completely invisible until somebody reaches them.
 */

export const CALLS = ['love', '15', '30', '40']

/** The umpire's call for a score, server's points first. */
export function callScore(me, them) {
  if (me >= 3 && them >= 3) {
    if (me === them) return 'deuce'
    return me > them ? 'advantage you' : 'advantage them'
  }
  return `${CALLS[me]}–${CALLS[them]}`
}

/** Has somebody won the game? Four points, and two clear. */
export function gameWonBy(me, them) {
  if (me >= 4 && me - them >= 2) return 'me'
  if (them >= 4 && them - me >= 2) return 'them'
  return null
}
