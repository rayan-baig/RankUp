import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { effectiveTier, onTrial, trialDaysLeft } from '../../state/reducer.js'
import { TIERS, TIER_LADDER, PLAN_COMPARISON, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../../state/initialState.js'
import { billingLive, startCheckout, openBillingPortal, fetchBillingStatus, billingError, billingNotice } from '../../lib/billing.js'
import { Screen, Card, Button, SectionTitle, Banner, Chip, Modal } from '../../components/ui.jsx'
import { guildsEnabled } from '../../lib/guilds.js'
import { usd, toCents, priceTag, priceWords, annualSaving, yearlyNote, yearlyOffered, planLines, upgradeReason } from '../../lib/plans.js'

/*
 * What each plan gives, the answer to "why would I pay more than the tier
 * below", and every price are worked out from the plan list and its limits
 * (lib/plans.js), so this screen cannot say something the app does not do.
 * Guilds are only mentioned when this app has them switched on.
 */
const PLAN_OPTS = { guilds: guildsEnabled() }

export default function ParentPlan() {
  const { state, dispatch } = useApp()
  const current = TIERS[state.family.tier] ? state.family.tier : 'starter'
  const trialTier = onTrial(state) ? effectiveTier(state.family) : null
  const trialDays = trialTier ? trialDaysLeft(state.family) : null
  const [confirm, setConfirm] = useState(null)
  /*
   * Monthly or annual. Monthly is the default deliberately: annual is the
   * better deal and the better business, but defaulting somebody into the
   * larger charge is the kind of thing that gets refunded and remembered.
   */
  const [cycle, setCycle] = useState('month')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const live = billingLive()

  useEffect(() => {
    // Nothing is asked of the server during the look-around. There is no
    // account for it to answer about, and a visitor browsing the plans should
    // not be generating traffic on somebody else's behalf.
    if (state.demo) return undefined
    fetchBillingStatus().then(setStatus)
    // Coming back from Stripe's checkout, the webhook may still be in flight.
    if (window.location.hash.includes('checkout=success')) {
      const t = setTimeout(() => fetchBillingStatus().then(setStatus), 4000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [state.demo])

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
    const result = await startCheckout(tier.id, cycle)
    if (!result.ok) {
      setError(billingError(result.reason))
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Plans</h1>
      {/*
        A new family is on a free trial of Elite. This said "You are on
        Starter" with Starter marked as the current plan, beside a dashboard
        saying fourteen days of Elite were left: both were true, and together
        they read as a mistake.
      */}
      <p className="text-sm text-muted mb-3">
        {trialDays
          ? `You are trying ${TIERS[trialTier].name} free for ${trialDays} more ${trialDays === 1 ? 'day' : 'days'}. After that you are on ${TIERS[current].name} unless you choose a plan.`
          : `You are on ${TIERS[current].name}.`}
      </p>

      {live ? (
        <>
          {window.location.hash.includes('checkout=success') && (
            <Banner tone="good" icon="🎉" title="Payment received">
              Stripe is confirming it now. Your plan updates within a few seconds.
            </Banner>
          )}
          {/* Why a paid plan stopped (a failed renewal, a refund), in words. */}
          {billingNotice(status) && (
            <Banner tone={billingNotice(status).tone} icon={billingNotice(status).icon} title={billingNotice(status).title}>
              {billingNotice(status).body}
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
        <Banner tone="info" icon="💳" title="Payments are switched off">
          Switch between the plans and try any of them. No card is asked for and nothing is charged.
        </Banner>
      )}

      {error && <p className="text-sm mt-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}

      {/*
        Two months free is the whole pitch for annual, so it is stated on the
        control rather than hidden inside the cards a tap away.
      */}
      {yearlyOffered() && (
      <div className="flex gap-1.5 p-1 rounded-xl mt-3" style={{ background: 'var(--surface-2)' }} role="tablist" aria-label="Billing period">
        {[
          { id: 'month', label: 'Monthly' },
          { id: 'year', label: 'Yearly', note: yearlyNote() },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={cycle === option.id}
            onClick={() => setCycle(option.id)}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors"
            style={cycle === option.id
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--ink-muted)' }}
          >
            {option.label}
            {option.note && (
              <span className="block text-[11px] font-normal opacity-80">{option.note}</span>
            )}
          </button>
        ))}
      </div>
      )}

      <div className="mt-3 space-y-3">
        {TIER_LADDER.map((tier, i) => {
          const active = tier.id === current
          const below = TIER_LADDER[i - 1]
          const saving = annualSaving(tier)
          const yearly = cycle === 'year' && saving
          return (
            <Card
              key={tier.id}
              style={{ borderColor: active ? 'var(--accent)' : tier.id === 'elite' ? 'var(--accent-2)' : 'var(--line)' }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="font-display font-extrabold text-lg">{tier.name}</h2>
                <span className="font-display font-extrabold text-xl">
                  {tier.price === 0
                    ? 'Free'
                    : yearly
                      ? <>${usd(tier.yearPrice)}<span className="text-xs font-normal text-muted">/yr</span></>
                      : <>${usd(tier.price)}<span className="text-xs font-normal text-muted">/mo</span></>}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {active && <Chip tone="var(--accent)">{trialTier ? 'Your plan after the trial' : 'Current plan'}</Chip>}
                {tier.id === trialTier && (
                  <Chip tone="var(--good)">Free trial · {trialDays} {trialDays === 1 ? 'day' : 'days'} left</Chip>
                )}
                <Chip>
                  {tier.price === 0
                    ? 'Free forever · no card'
                    : yearly
                      ? 'Billed yearly · cancel any time'
                      : 'Billed monthly · cancel any time'}
                </Chip>
                {yearly && (
                  <Chip tone="var(--good)" data-testid={`saving-${tier.id}`}>
                    ${saving.saved} saved a year
                  </Chip>
                )}
              </div>
              {yearly && (
                <p className="text-xs text-muted mt-1.5">
                  Twelve months at ${usd(tier.price)} is ${usd((saving.savedCents + toCents(tier.yearPrice)) / 100)}.
                  {saving.monthsFree
                    ? ` A year is ${12 - saving.monthsFree} months' money, so ${saving.monthsFree} ${saving.monthsFree === 1 ? 'month is' : 'months are'} free.`
                    : ` A year saves ${saving.percent}%.`}
                </p>
              )}
              {below && (
                <p className="text-sm mt-2">
                  <strong>
                    {below.price === 0
                      ? priceWords(tier)
                      : `$${usd((toCents(tier.price) - toCents(below.price)) / 100)} more than ${below.name}`}
                  </strong>
                  {' — '}{upgradeReason(tier, PLAN_OPTS)}
                </p>
              )}

              <ul className="mt-3 space-y-1.5" data-testid={`plan-lines-${tier.id}`}>
                {planLines(tier, PLAN_OPTS).map((f) => (
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
                    : tier.price === 0
                      ? `Stay on ${tier.name}`
                      : `${live ? 'Subscribe to' : 'Switch to'} ${tier.name} · `
                        + priceTag(tier, yearly ? 'year' : 'month')}
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
                    {priceTag(t)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.filter((row) => !row.needs || PLAN_OPTS[row.needs]).map((row) => (
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
      {ELITE_KID_PERKS.filter((p) => !p.needs || PLAN_OPTS[p.needs]).map((p) => (
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
          {confirm && upgradeReason(confirm, PLAN_OPTS)
            ? `On ${confirm.name}: ${upgradeReason(confirm, PLAN_OPTS)}`
            : `${planLines(TIER_LADDER[0], PLAN_OPTS)[0]}, free.`}
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
