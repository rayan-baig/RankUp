import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { trialDaysLeft, onTrial, planOf } from '../state/reducer.js'
import { TIERS } from '../state/initialState.js'
import { Banner, Button } from './ui.jsx'
import { navigate } from '../lib/router.js'
import { newFamily } from '../lib/firstWeek.js'

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
 */
export default function TrialBanner() {
  const { state } = useApp()
  const [more, setMore] = useState(false)
  if (!onTrial(state)) return null

  const days = trialDaysLeft(state.family)
  const plan = planOf(state)
  const paid = TIERS[state.family.tier] || TIERS.starter

  const gives = []
  if (plan.xpMultiplier > paid.xpMultiplier) gives.push(`${plan.xpMultiplier}× XP on every accepted chore`)
  if (plan.limits.maxKids > paid.limits.maxKids) gives.push('room for every child')
  if (plan.limits.blueprints && !paid.limits.blueprints) gives.push('weekly charts of what got done')
  const extra = state.kids.length > paid.limits.maxKids
  const compact = days > 3 && newFamily(state)
  const words = (
    <>
      {gives.length > 0 ? `${plan.name} gives you ${gives.slice(0, 2).join(' and ')}.` : 'You are on the full product with no card on file.'}
      {' '}Everything your children earn is theirs to keep, whatever you choose.
      {extra && ` On the free plan, ${paid.limits.maxKids === 1 ? 'one child plays' : `${paid.limits.maxKids} children play`} at a time.`}
    </>
  )

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
      </div>
    )
  }

  return (
    <div data-testid="trial-banner">
    <Banner
      className="mb-3"
      tone="info"
      icon="✨"
      title={days === 1 ? `Last day of your free ${plan.name} trial` : `${days} days left of ${plan.name}, free`}
      action={
        <Button className="px-3 py-2 min-h-0 text-sm" onClick={() => navigate('/parent/plan')}>
          See plans
        </Button>
      }
    >
      {words}
    </Banner>
    </div>
  )
}
