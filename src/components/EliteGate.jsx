import { Screen, Card, Button, Banner } from './ui.jsx'
import { ELITE_KID_PERKS, ELITE_PARENT_PERKS, TIERS } from '../state/initialState.js'
import { navigate } from '../lib/router.js'

/** Shown in place of an Elite-only screen when the family is on Standard. */
export default function EliteGate({ icon, title, body }) {
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

      <Banner tone="warn" icon="💳" title="No real payments yet">
        Switching plans in this build changes the feature flags only. Nothing is charged. See docs/PAYMENTS.md.
      </Banner>

      <h2 className="section-title mt-4">Elite adds for parents</h2>
      {ELITE_PARENT_PERKS.map((p) => (
        <Card key={p.title} flat className="mb-2 flex gap-3">
          <span className="text-xl" aria-hidden="true">{p.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{p.title}</span>
            <span className="block text-xs text-muted">{p.body}</span>
          </span>
        </Card>
      ))}

      <h2 className="section-title mt-4">Elite adds for kids</h2>
      {ELITE_KID_PERKS.map((p) => (
        <Card key={p.title} flat className="mb-2 flex gap-3">
          <span className="text-xl" aria-hidden="true">{p.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{p.title}</span>
            <span className="block text-xs text-muted">{p.body}</span>
          </span>
        </Card>
      ))}

      <Button className="w-full mt-4" onClick={() => navigate('/parent/plan')}>
        Go to plans
      </Button>
    </Screen>
  )
}
