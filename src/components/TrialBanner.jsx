import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { trialDaysLeft, onTrial, planOf } from '../state/reducer.js'
import { TIERS } from '../state/initialState.js'
import PlanCompare from './PlanCompare.jsx'
import { Button } from './ui.jsx'
import { navigate } from '../lib/router.js'
import { newFamily } from '../lib/firstWeek.js'
import { trialHeadsUp } from '../lib/trialHeadsUp.js'

/**
 * What the free fortnight is, and what the plan gives.
 *
 * It used to list what the family would lose ("XP would drop back from
 * 1.5×", a child's profile "put on hold"): loss-fear, inside a children's
 * app. Now it says what the plan on trial gives, in a line, and that
 * everything the children earn stays whatever happens. The one fact a parent
 * needs before the trial ends, that a second child's profile rests on the free
 * plan, is said plainly and once, without a threat.
 *
 * Deliberately not a modal and not dismissable-forever: it sits at the top of
 * the parent's own screen and disappears the moment they either pay or the
 * trial ends. Never on a child's screen.
 *
 * For a new family (lib/firstWeek.js, newFamily) with more than three days
 * left it is one line, the days and "See plans", with what the plan gives
 * folded under "What you get": a parent who has just signed up came for
 * their child's first chore, not for the plan. In the last three days it is
 * the full banner again, for everyone.
 *
 * "What you get" (and "Compare plans" on the full banner) opens a one-screen
 * comparison of the three plans, in words (0.29.0), across the banner's whole
 * width with a Close button of its own (0.30.0). It starts closed every time.
 *
 * In the last three days (0.30.0) the full banner also gives a gentle
 * heads-up: which of the trial's extras stop when it ends, by name (the
 * children's 1.5× boost, the Elite tools), on the plan they pay for, and
 * that nothing earned goes. Parent Mode only, never a price.
 */
export default function TrialBanner() {
  const { state } = useApp()
  const [more, setMore] = useState(false)
  if (!onTrial(state)) return null

  const days = trialDaysLeft(state.family)
  const plan = planOf(state)
  const paid = TIERS[state.family.tier] || TIERS.starter

  // More children than the plan they pay for has room for (0.32.0: only
  // then is "room for every child" something the trial gives them).
  const extra = state.kids.length > paid.limits.maxKids
  const gives = []
  if (plan.xpMultiplier > paid.xpMultiplier) gives.push(`${plan.xpMultiplier}× XP on every accepted chore`)
  if (extra && plan.limits.maxKids > paid.limits.maxKids) gives.push('room for every child')
  if (plan.limits.blueprints && !paid.limits.blueprints) gives.push('weekly charts of what got done')
  const compact = days > 3 && newFamily(state)
  /* The heads-up (last three days) ends on "Everything your children have
     earned stays theirs.", so the words above it leave that sentence out:
     said once, not twice (0.32.0). */
  const headsUp = days <= 3 ? trialHeadsUp(state, plan, paid, days) : null
  /* While the heads-up shows, the pitch line ("Elite Pass gives you…") is
     left out (0.33.0): the heads-up already names what the trial gives, so
     the banner is the title, the heads-up and "Compare plans". */
  const room = extra ? `On the free plan, ${paid.limits.maxKids === 1 ? 'one child plays' : `${paid.limits.maxKids} children play`} at a time.` : ''
  const words = headsUp ? room : (
    <>
      {gives.length > 0 ? `${plan.name} gives you ${gives.slice(0, 2).join(' and ')}.` : 'You are on the full product with no card on file.'}
      {' Everything your children earn is theirs to keep, whatever you choose.'}
      {room && ` ${room}`}
    </>
  )

  const compare = more && <PlanCompare trialTier={plan.id} onClose={() => setMore(false)} />

  if (compact) {
    return (
      <div className="card-flat trial-slim mb-3 px-3 py-2" data-testid="trial-banner" data-compact="">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true">✨</span>
          <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2.5">
            <span className="font-semibold text-sm trial-slim-title">{days} days of {plan.name} free</span>
            <button type="button" className="tap-link underline text-xs text-muted" aria-expanded={more} onClick={() => setMore((m) => !m)}>
              What you get
            </button>
          </span>
          <Button className="px-3 py-1.5 min-h-0 text-xs shrink-0" onClick={() => navigate('/parent/plan')}>
            See plans
          </Button>
        </div>
        {more && <p className="text-xs text-muted mt-1">{words}</p>}
        {compare}
      </div>
    )
  }

  /* The days and "See plans" on one line, then the words, the heads-up and
     the comparison across the banner's whole width (0.30.0): beside the
     button, on a phone, the words were a narrow column of eight lines. */
  return (
    <div className="card-flat trial-full mb-3 p-3" data-testid="trial-banner">
      <div className="flex gap-2.5 items-center">
        <span className="text-lg leading-none" aria-hidden="true">✨</span>
        <div className="min-w-0 flex-1 font-semibold text-sm trial-slim-title">
          {days === 1 ? `Last day of your free ${plan.name} trial` : `${days} days left of ${plan.name}, free`}
        </div>
        <Button className="px-3 py-2 min-h-0 text-sm shrink-0" onClick={() => navigate('/parent/plan')}>
          See plans
        </Button>
      </div>
      {headsUp && <p className="trial-heads-up" data-testid="trial-heads-up" data-pilot-private="">{headsUp}</p>}
      <p className={`text-sm text-muted trial-words ${headsUp ? 'mt-2' : 'mt-1.5'}`} data-testid="trial-words">
        {words}
        {words ? ' ' : ''}
        <button type="button" className="tap-inline underline font-semibold" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          Compare plans
        </button>
      </p>
      {compare}
    </div>
  )
}
