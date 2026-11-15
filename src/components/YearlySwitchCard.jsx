import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Card, Button } from './ui.jsx'
import { yearlyOffer } from '../lib/upgradeNudge.js'
import { billingLive, openBillingPortal, billingError } from '../lib/billing.js'

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
  if (!offer) return null

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
          <p className="font-semibold text-sm">{offer.title}</p>
          <p className="text-xs text-muted mt-0.5">{offer.body}</p>
        </div>
      </div>
      {error && <p className="text-sm mt-2 text-bad" role="alert">{error}</p>}
      <Button variant="soft" className="w-full mt-3 py-2 min-h-0 text-sm" disabled={busy} onClick={go} data-testid="yearly-switch">
        {busy ? 'Opening Stripe…' : 'Switch to yearly'}
      </Button>
    </Card>
  )
}
