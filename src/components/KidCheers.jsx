import { useEffect, useLayoutEffect, useRef } from 'react'
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
 * Bigger in 0.30.0: on Claim the coins fly from the button into the coin
 * tile, whose number ticks up as they land (CoinFlight); the weekly goal
 * rains confetti across the screen for a moment and fills a ring round the
 * trophy (GoalConfetti, GoalRing).
 *
 * The motion is the stylesheet's (.cheer-*, .coin-flight, .goal-*,
 * index.css). Under reduce motion (RankUp's own or the device's) each of
 * these is given `still` and draws words only: no burst, no flight, no
 * confetti, the ring simply full. The sound is lib/chime.js, and follows
 * the Sounds setting.
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
export function ClaimMoment({ coins, currency, onDone, still = false }) {
  useEffect(() => {
    const t = setTimeout(onDone, CLAIM_MS)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="cheer-card mb-3" role="status" data-testid="claim-moment">
      <span className="cheer-medal">
        {!still && <Burst icon={currency.icon} />}
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
export function WeeklyGoalMoment({ done, goal, onSeen, still = false }) {
  return (
    <div className="cheer-card cheer-goal mb-3" role="status" data-testid="weekly-goal-moment">
      <GoalRing still={still} />
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

/** How long the coins take to fly into the coin tile, about. */
export const FLY_MS = 1400

/**
 * The bonus's coins flying from the Claim button into the coin tile
 * (0.30.0). `from` and `to` are points in the window; each coin is 28–32px,
 * lifts, spreads a little and lands, the last about 1.4s after Claim. The
 * points are set as CSS properties from here, so there is no style
 * attribute in the page. Never drawn under reduce motion.
 */
export function CoinFlight({ from, to, icon, count = 6 }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--sx', `${Math.round(from.x)}px`)
    el.style.setProperty('--sy', `${Math.round(from.y)}px`)
    el.style.setProperty('--tx', `${Math.round(to.x - from.x)}px`)
    el.style.setProperty('--ty', `${Math.round(to.y - from.y)}px`)
  }, [from.x, from.y, to.x, to.y])
  return (
    <span ref={ref} className="coin-flight" aria-hidden="true" data-testid="coin-flight">
      {Array.from({ length: count }, (_, i) => <span key={i}>{icon}</span>)}
    </span>
  )
}

/** How long the weekly goal's confetti stays on the screen. */
export const CONFETTI_MS = 2300

/**
 * Confetti across the whole screen for a moment when the weekly goal is
 * reached (0.30.0). It takes no taps, and goes by itself.
 */
export function GoalConfetti({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, CONFETTI_MS)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <span className="goal-confetti" aria-hidden="true" data-testid="goal-confetti">
      {Array.from({ length: 28 }, (_, i) => <span key={i} />)}
    </span>
  )
}

/** The goal as a ring round the trophy, filling to full (still: just full). */
function GoalRing({ still }) {
  return (
    <span className="cheer-medal goal-ring" data-testid="goal-ring" data-still={still ? '' : undefined}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="goal-ring-track" cx="24" cy="24" r="21" pathLength="100" />
        <circle className="goal-ring-fill" cx="24" cy="24" r="21" pathLength="100" />
      </svg>
      <span className="cheer-pop goal-ring-cup" aria-hidden="true">🏆</span>
    </span>
  )
}
