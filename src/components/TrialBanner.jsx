import { useApp } from '../state/AppContext.jsx'
import { trialDaysLeft, onTrial, planOf } from '../state/reducer.js'
import { TIERS } from '../state/initialState.js'
import { Banner, Button } from './ui.jsx'
import { navigate } from '../lib/router.js'

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
 */
export default function TrialBanner() {
  const { state } = useApp()
  if (!onTrial(state)) return null

  const days = trialDaysLeft(state.family)
  const plan = planOf(state)
  const paid = TIERS[state.family.tier] || TIERS.starter

  const gives = []
  if (plan.xpMultiplier > paid.xpMultiplier) gives.push(`${plan.xpMultiplier}× XP on every accepted chore`)
  if (plan.limits.maxKids > paid.limits.maxKids) gives.push('room for every child')
  if (plan.limits.blueprints && !paid.limits.blueprints) gives.push('weekly charts of what got done')
  const extra = state.kids.length > paid.limits.maxKids

  return (
    <Banner
      tone="info"
      icon="✨"
      title={days === 1 ? `Last day of your free ${plan.name} trial` : `${days} days left of ${plan.name}, free`}
      action={
        <Button className="px-3 py-2 min-h-0 text-sm" onClick={() => navigate('/parent/plan')}>
          See plans
        </Button>
      }
    >
      {gives.length > 0 ? `${plan.name} gives you ${gives.slice(0, 2).join(' and ')}.` : 'You are on the full product with no card on file.'}
      {' '}Everything your children earn is theirs to keep, whatever you choose.
      {extra && ` On the free plan, ${paid.limits.maxKids === 1 ? 'one child plays' : `${paid.limits.maxKids} children play`} at a time.`}
    </Banner>
  )
}
