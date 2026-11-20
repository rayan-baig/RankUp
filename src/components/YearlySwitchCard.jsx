import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Card, Button } from './ui.jsx'
import { yearlyOffer } from '../lib/upgradeNudge.js'
import { billingLive, openBillingPortal, billingError, fetchBillingStatus } from '../lib/billing.js'
import { SWITCH_AFTER_MONTHS } from '../lib/deals.js'

/**
 * "Switch to yearly — save about 30%", in Settings, for a parent paying
 * monthly. The saving is the real difference between the plan list's two
 * prices. Stripe's own confirm page (the billing portal) shows the yearly
 * price and anything charged today before the parent agrees. Parent Mode
 * only; never on a child's phone.
 */
export default function YearlySwitchCard() {
  const { state } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const offer = yearlyOffer(state, { live: billingLive() })
  /*
   * After two paid months (0.23.0): "switch to yearly and keep what you've
   * paid". Stripe's plan-change page credits what is left of the month
   * already paid against the year (the plan-change portal configuration's
   * proration, docs/PAYMENTS.md), and shows it before anything is charged.
   */
  const [paid, setPaid] = useState(0)
  useEffect(() => {
    if (!offer) return undefined
    let stop = false
    fetchBillingStatus().then((s) => { if (!stop) setPaid(Number(s?.paid_months) || 0) })
    return () => { stop = true }
  }, [Boolean(offer)])
  if (!offer) return null
  const keep = paid >= SWITCH_AFTER_MONTHS

  const go = async () => {
    setBusy(true)
    setError('')
    const result = await openBillingPortal('yearly')
    if (!result.ok) { setError(billingError(result.reason)); setBusy(false) }
  }

  return (
    <Card flat className="mb-3" data-testid="yearly-offer">
      <div className="flex gap-3 items-start">
        <span className="text-2xl" aria-hidden="true">📅</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{keep ? 'Switch to yearly and keep what you have paid' : offer.title}</p>
          <p className="text-xs text-muted mt-0.5">{offer.body}</p>
          {keep && (
            <p className="text-xs text-muted mt-1" data-testid="yearly-keep">
              You have paid for {paid} months. What is left of this month comes off the year, so nothing you paid is lost.
            </p>
          )}
        </div>
      </div>
      {error && <p className="text-sm mt-2 text-bad" role="alert">{error}</p>}
      <Button variant="soft" className="w-full mt-3 py-2 min-h-0 text-sm" disabled={busy} onClick={go} data-testid="yearly-switch">
        {busy ? 'Opening Stripe…' : 'Switch to yearly'}
      </Button>
    </Card>
  )
}
