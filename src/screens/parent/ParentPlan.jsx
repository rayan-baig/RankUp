import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { TIERS, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../../state/initialState.js'
import { Screen, Card, Button, SectionTitle, Banner, Chip, Modal } from '../../components/ui.jsx'

export default function ParentPlan() {
  const { state, dispatch } = useApp()
  const current = state.family.tier
  const [confirm, setConfirm] = useState(null)

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Plans</h1>
      <p className="text-sm text-muted mb-3">You are on {TIERS[current].name}.</p>

      <Banner tone="warn" icon="💳" title="No real payments in this build">
        Switching here flips feature flags so you can test both tiers. No card is taken and nothing
        is charged. Connecting Stripe (or Apple/Google in-app purchase) is a separate job — see
        docs/PAYMENTS.md.
      </Banner>

      <div className="mt-3 space-y-3">
        {Object.values(TIERS).map((tier) => {
          const active = tier.id === current
          return (
            <Card
              key={tier.id}
              style={{ borderColor: active ? 'var(--accent)' : tier.id === 'elite' ? 'var(--accent-2)' : 'var(--line)' }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="font-display font-extrabold text-lg">{tier.name}</h2>
                <span className="font-display font-extrabold text-xl">
                  ${tier.price}
                  <span className="text-xs font-normal text-muted">/mo</span>
                </span>
              </div>
              {active && <Chip tone="var(--accent)">Current plan</Chip>}

              <ul className="mt-3 space-y-1.5">
                {tier.features.map((f) => (
                  <li key={f} className="text-sm flex gap-2">
                    <span style={{ color: 'var(--good)' }} aria-hidden="true">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {!active && (
                <Button
                  variant={tier.id === 'elite' ? 'primary' : 'soft'}
                  className="w-full mt-3"
                  onClick={() => setConfirm(tier)}
                >
                  {tier.id === 'elite' ? 'Upgrade to Elite Pass' : 'Switch to Standard'}
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      <SectionTitle>What Elite adds for kids</SectionTitle>
      {ELITE_KID_PERKS.map((p) => (
        <Card key={p.title} flat className="mb-2 flex gap-3">
          <span className="text-xl" aria-hidden="true">{p.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{p.title}</span>
            <span className="block text-xs text-muted">{p.body}</span>
          </span>
        </Card>
      ))}

      <SectionTitle>What Elite adds for parents</SectionTitle>
      {ELITE_PARENT_PERKS.map((p) => (
        <Card key={p.title} flat className="mb-2 flex gap-3">
          <span className="text-xl" aria-hidden="true">{p.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{p.title}</span>
            <span className="block text-xs text-muted">{p.body}</span>
          </span>
        </Card>
      ))}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Switch to ${confirm?.name}?`}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={() => {
                dispatch({ type: 'SET_TIER', tier: confirm.id })
                setConfirm(null)
              }}
            >
              Switch
            </Button>
          </>
        }
      >
        <p className="text-sm mb-2">
          {confirm?.id === 'elite'
            ? 'Elite tools unlock immediately and kids get the permanent 1.5× XP boost and 10-slot guilds.'
            : 'Elite tools lock again. Guilds go back to 5 slots and the XP boost stops. Nothing already earned is removed.'}
        </p>
        <p className="text-xs text-muted">No payment is taken — this build has no billing connected.</p>
      </Modal>
    </Screen>
  )
}
