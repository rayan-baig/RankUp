import { Screen, Card, Button, Banner } from './ui.jsx'
import { ELITE_KID_PERKS, ELITE_PARENT_PERKS, TIERS } from '../state/initialState.js'
import { billingLive } from '../lib/billing.js'
import { navigate } from '../lib/router.js'

/**
 * Shown in place of an Elite-only screen when the family is on Standard.
 *
 * `perk` is the id of the feature this gate is standing in front of, and it is
 * left out of the list below. Without it every gate showed the same wall of
 * every Elite feature — including, at the top of the list, the one the parent
 * had just tapped and was already reading about. Three screens, one identical
 * pitch, re-selling the thing in front of you.
 */
export default function EliteGate({ icon, title, body, perk }) {
  const others = ELITE_PARENT_PERKS.filter((p) => p.id !== perk)

  return (
    <Screen>
      <Card className="text-center mb-4" style={{ borderColor: 'var(--accent-2)' }}>
        <div className="text-4xl mb-2" aria-hidden="true">{icon}</div>
        <h1 className="font-display text-xl font-extrabold mb-1">{title}</h1>
        <p className="text-sm text-muted mb-3">{body}</p>
        <span className="chip" style={{ borderColor: 'var(--accent-2)', color: 'var(--accent-2)' }}>
          Elite Pass · ${TIERS.elite.price}/mo
        </span>
      </Card>

      <Button className="w-full" onClick={() => navigate('/parent/plan')}>
        See the plans
      </Button>

      {!billingLive() && (
        <Banner tone="info" icon="💳" className="mt-3" title="Payments are switched off">
          You can turn Elite on and try it. Nothing is charged and no card is asked for.
        </Banner>
      )}

      <h2 className="section-title mt-5">Also included with Elite</h2>
      {others.map((p) => (
        <PerkRow key={p.title} perk={p} />
      ))}

      <h2 className="section-title mt-4">And for your kids</h2>
      {ELITE_KID_PERKS.map((p) => (
        <PerkRow key={p.title} perk={p} />
      ))}
    </Screen>
  )
}

function PerkRow({ perk }) {
  return (
    <Card flat className="mb-2 flex gap-3">
      <span className="text-xl" aria-hidden="true">{perk.icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm">{perk.title}</span>
        <span className="block text-xs text-muted">{perk.body}</span>
      </span>
    </Card>
  )
}
