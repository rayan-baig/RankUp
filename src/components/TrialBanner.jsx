import { useApp } from '../state/AppContext.jsx'
import { trialDaysLeft, onTrial, planOf } from '../state/reducer.js'
import { TIERS } from '../state/initialState.js'
import { Banner, Button } from './ui.jsx'
import { navigate } from '../lib/router.js'

/**
 * What the free fortnight is doing, and what stops when it ends.
 *
 * A countdown on its own is a threat. The thing that makes somebody decide is
 * knowing precisely what they would lose, in the words of the family they
 * actually have — "Noah's profile" reads differently from "unlimited
 * children", and "the check on Ava's photos" differently from "AI photo
 * verification". So the list is built from their own data.
 *
 * Deliberately not a modal and not dismissable-forever: it sits at the top of
 * the parent's own screen, where it is read by someone already using the app,
 * and it disappears the moment they either pay or the trial ends. Nagging a
 * child's parent inside a children's app is a line worth not crossing.
 */
export default function TrialBanner() {
  const { state } = useApp()
  if (!onTrial(state)) return null

  const days = trialDaysLeft(state.family)
  const plan = planOf(state)
  const paid = TIERS[state.family.tier] || TIERS.starter

  // Only what they would actually notice going, and only if they have it.
  const losing = []
  if (state.kids.length > paid.limits.maxKids) {
    const extra = state.kids.slice(paid.limits.maxKids).map((k) => k.name)
    losing.push(extra.length === 1
      ? `${extra[0]}'s profile would be put on hold`
      : `${extra.length} of your children's profiles would be put on hold`)
  }
  if (plan.limits.aiPhotoCheck && !paid.limits.aiPhotoCheck) {
    losing.push('photos would come to you unchecked')
  }
  /*
   * There is deliberately no line about guilds here.
   *
   * The first draft had one, guarded on `state.guild?.id` — which is set
   * unconditionally in createInitialState, so it was true for every family
   * that had ever opened the app. Every parent on a trial was being told their
   * guild would close, including the overwhelming majority who have never
   * touched one. A sales message that makes a claim about somebody's own
   * family had better be true of that family.
   *
   * It cannot be fixed by checking harder, either: real guild membership is
   * fetched from the server by the guild screen and never enters app state, so
   * this component genuinely does not know. Saying nothing beats guessing.
   */
  if (plan.xpMultiplier > paid.xpMultiplier) {
    losing.push(`XP would drop back from ${plan.xpMultiplier}×`)
  }

  const urgent = days <= 3

  return (
    <Banner
      tone={urgent ? 'warn' : 'info'}
      icon={urgent ? '⏳' : '✨'}
      title={days === 1 ? 'Last day of your free trial' : `${days} days left of ${plan.name}, free`}
      action={
        <Button className="px-3 py-2 min-h-0 text-sm" onClick={() => navigate('/parent/plan')}>
          Keep it
        </Button>
      }
    >
      {losing.length > 0 ? (
        <>
          When it ends, {losing.slice(0, 2).join(' and ')}. Everything your children have
          earned stays exactly where it is.
        </>
      ) : (
        <>
          You are on the full product with no card on file. Everything your children earn is
          yours to keep either way.
        </>
      )}
    </Banner>
  )
}
