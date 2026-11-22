import { useEffect } from 'react'
import { Button } from './ui.jsx'

/*
 * A child's two small celebrations on Home (0.29.0).
 *
 * Claiming the daily chore bonus used to make the card vanish and a number
 * change somewhere below it; reaching the weekly goal changed a 🎯 into a 🏆
 * in a small box. Both are moments a child has worked for, so both now say
 * so: a burst of the world's own coins and the amount, and a card that says
 * "You hit your weekly goal!" until it is tapped away.
 *
 * The motion is the stylesheet's (.cheer-*, index.css), so RankUp's "Reduce
 * motion" and the device's own setting stop it with everything else: the
 * card still shows, nothing flies. The sound is lib/chime.js, and follows the
 * Sounds setting.
 */

/** Ten of the world's coins, flung out from the middle (CSS gives each its way). */
function Burst({ icon }) {
  return (
    <span className="cheer-burst" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <span key={i}>{icon}</span>)}
    </span>
  )
}

/** How long the bonus moment stays before it goes by itself. */
export const CLAIM_MS = 2600

/** In place of the bonus card, just after Claim. */
export function ClaimMoment({ coins, currency, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, CLAIM_MS)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="cheer-card mb-3" role="status" data-testid="claim-moment">
      <span className="cheer-medal">
        <Burst icon={currency.icon} />
        <span className="cheer-pop" aria-hidden="true">{currency.icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-extrabold text-lg leading-tight cheer-amount">+{coins} {currency.name}!</span>
        <span className="block text-xs text-muted">Bonus claimed. Nice work today.</span>
      </span>
    </div>
  )
}

/** The week's goal reached: until the child taps it away, once a week. */
export function WeeklyGoalMoment({ done, goal, onSeen }) {
  return (
    <div className="cheer-card cheer-goal mb-3" role="status" data-testid="weekly-goal-moment">
      <span className="cheer-medal">
        <Burst icon="⭐" />
        <span className="cheer-pop" aria-hidden="true">🏆</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-extrabold text-lg leading-tight">You hit your weekly goal!</span>
        <span className="block text-xs text-muted">
          {done > goal ? `${done} chores accepted this week, and the goal was ${goal}.` : `${done} of ${goal} chores accepted this week.`} Every one from here is extra.
        </span>
      </span>
      <Button className="px-3 py-2 min-h-[44px] shrink-0" onClick={onSeen}>Yay!</Button>
    </div>
  )
}
