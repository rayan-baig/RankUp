import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { TIERS, TIER_LADDER, PLAN_COMPARISON, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../../state/initialState.js'
import { billingLive, startCheckout, openBillingPortal, fetchBillingStatus, billingError } from '../../lib/billing.js'
import { Screen, Card, Button, SectionTitle, Banner, Chip, Modal } from '../../components/ui.jsx'

/**
 * The single sentence that answers "why would I pay more than the tier below".
 * Kept beside the price so the question is answered where it gets asked.
 */
const UPGRADE_REASON = {
  standard: 'a second child, and the AI checks every photo before you see it.',
  elite: 'every chore pays 1.5× for the rest of your subscription, plus the parent tools.',
}

export default function ParentPlan() {
  const { state, dispatch } = useApp()
  const current = state.family.tier
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const live = billingLive()

  useEffect(() => {
    fetchBillingStatus().then(setStatus)
    // Coming back from Stripe's checkout, the webhook may still be in flight.
    if (window.location.hash.includes('checkout=success')) {
      const t = setTimeout(() => fetchBillingStatus().then(setStatus), 4000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [])

  /**
   * With Stripe live, the only route to Elite is a real payment — the database
   * refuses to let a device set its own tier. Without Stripe, the switch below
   * flips a local flag so both tiers can be tried in development, and says so.
   */
  const choosePlan = async (tier) => {
    if (!live) {
      dispatch({ type: 'SET_TIER', tier: tier.id })
      setConfirm(null)
      return
    }
    setBusy(true)
    setError('')
    const result = await startCheckout(tier.id)
    if (!result.ok) {
      setError(billingError(result.reason))
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Plans</h1>
      <p className="text-sm text-muted mb-3">You are on {TIERS[current].name}.</p>

      {live ? (
        <>
          {window.location.hash.includes('checkout=success') && (
            <Banner tone="good" icon="🎉" title="Payment received">
              Stripe is confirming it now. Your plan updates within a few seconds.
            </Banner>
          )}
          {status?.status === 'past_due' && (
            <Banner tone="bad" icon="⚠️" title="A payment failed">
              Your card was declined, so Elite features are paused. Update your card to restore
              them — nothing your kids have earned has been touched.
            </Banner>
          )}
          {status?.has_customer && (
            <Button variant="soft" className="w-full" disabled={busy} onClick={async () => {
              setBusy(true)
              const r = await openBillingPortal()
              if (!r.ok) { setError(billingError(r.reason)); setBusy(false) }
            }}>
              Manage billing, cancel, or update card
            </Button>
          )}
        </>
      ) : (
        <Banner tone="warn" icon="💳" title="Payments are not switched on here">
          Switching plans flips feature flags so you can try both. No card is taken and nothing is
          charged. See docs/PAYMENTS.md to connect Stripe.
        </Banner>
      )}

      {error && <p className="text-sm mt-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}

      <div className="mt-3 space-y-3">
        {TIER_LADDER.map((tier, i) => {
          const active = tier.id === current
          const below = TIER_LADDER[i - 1]
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
              <div className="flex items-center gap-2 flex-wrap">
                {active && <Chip tone="var(--accent)">Current plan</Chip>}
                <Chip>Billed monthly · cancel any time</Chip>
              </div>
              {below && (
                <p className="text-sm mt-2">
                  <strong>${(tier.price - below.price).toFixed(2)} more than {below.name}</strong>
                  {' — '}{UPGRADE_REASON[tier.id]}
                </p>
              )}

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
                  disabled={busy}
                  onClick={() => (live ? choosePlan(tier) : setConfirm(tier))}
                >
                  {busy
                    ? 'Opening Stripe…'
                    : `${live ? 'Subscribe to' : 'Switch to'} ${tier.name} · $${tier.price}/mo`}
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      <SectionTitle>Side by side</SectionTitle>
      <Card flat className="mb-4 p-0 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '37%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 text-xs text-muted font-semibold">&nbsp;</th>
              {TIER_LADDER.map((t) => (
                <th
                  key={t.id}
                  className="px-1 py-2 text-center align-bottom"
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <span className="block font-display font-extrabold text-[12px] leading-tight">{t.name}</span>
                  <span
                    className="block text-[10px] text-muted leading-tight"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    ${t.price}/mo
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="text-left px-2.5 py-2 font-normal text-[11px] leading-tight"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  {row.label}
                </th>
                {TIER_LADDER.map((t) => {
                  const v = row.value(t)
                  return (
                    <td
                      key={t.id}
                      className="px-1 py-2 text-center text-[11px] leading-tight"
                      style={{
                        borderTop: '1px solid var(--line)',
                        background: t.id === current ? 'var(--surface-2)' : undefined,
                      }}
                    >
                      {v === true && <span style={{ color: 'var(--good)' }} aria-label="Included">✓</span>}
                      {v === false && <span className="text-muted" aria-label="Not included">—</span>}
                      {typeof v === 'string' && <span>{v}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
            <Button className="flex-1" onClick={() => choosePlan(confirm)}>Switch</Button>
          </>
        }
      >
        <p className="text-sm mb-2">
          {confirm && UPGRADE_REASON[confirm.id]
            ? `On ${confirm.name}: ${UPGRADE_REASON[confirm.id]}`
            : 'One child, and you review every photo yourself.'}
        </p>
        <p className="text-sm mb-2">
          Nothing your children have already earned is ever removed by changing plan — XP,
          currency and streaks stay exactly where they are.
        </p>
        <p className="text-xs text-muted">
          No payment is taken — billing is not connected on this deployment.
        </p>
      </Modal>
    </Screen>
  )
}
