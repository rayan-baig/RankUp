import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Card, Button } from './ui.jsx'
import { nudgeDue, nudgeWords, inParentMode } from '../lib/upgradeNudge.js'
import { billingLive, startCheckout, openBillingPortal, billingError } from '../lib/billing.js'
import { navigate } from '../lib/router.js'

/**
 * The Elite nudge, on the parent's dashboard: short, at a moment it is true
 * (lib/upgradeNudge.js says when), at most once a fortnight on this phone,
 * and gone for good with "Not now". Parent Mode only.
 *
 * It upgrades the way the plan screen does: a family already paying moves
 * to Elite on Stripe's own confirm page (the billing portal), and one that
 * is not starts a checkout at the plan list's price.
 */
export default function UpgradeNudge() {
  const { state, dispatch } = useApp()
  // Held for this visit once shown, so it does not vanish the moment it is
  // marked as shown; the next visit within a fortnight does not get it.
  const [reason, setReason] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seen = state.settings?.upgradeNudge || {}

  useEffect(() => {
    if (reason) return
    const now = Date.now()
    const due = nudgeDue(state, now)
    if (!due) return
    setReason(due)
    dispatch({ type: 'UPDATE_SETTINGS', patch: { upgradeNudge: { ...seen, shownAt: now, shownFor: due.kind } } })
  }, [state.family, state.submissions, state.session, state.guild, reason])

  if (!reason || !inParentMode(state)) return null
  const words = nudgeWords(reason)

  const upgrade = async () => {
    if (!billingLive()) { navigate('/parent/plan'); return }
    setBusy(true)
    setError('')
    const paying = ['active', 'trialing'].includes(state.family.subscriptionStatus)
    const result = paying ? await openBillingPortal('upgrade') : await startCheckout('elite', 'month')
    if (!result.ok) { setError(billingError(result.reason)); setBusy(false) }
  }
  const dismiss = () => {
    dispatch({ type: 'UPDATE_SETTINGS', patch: { upgradeNudge: { ...seen, dismissedAt: Date.now() } } })
    setReason(null)
  }

  return (
    <Card className="mb-3 border-accent2" data-testid="upgrade-nudge">
      <div className="flex gap-3 items-start">
        <span className="text-2xl" aria-hidden="true">⚡</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{words.title}</p>
          <p className="text-sm text-muted mt-0.5">{words.body}</p>
        </div>
      </div>
      {error && <p className="text-sm mt-2 text-bad" role="alert">{error}</p>}
      <div className="flex gap-2 mt-3">
        <Button className="flex-1 py-2 min-h-0 text-sm" disabled={busy} onClick={upgrade} data-testid="nudge-upgrade">
          {busy ? 'Opening Stripe…' : words.button}
        </Button>
        <Button variant="ghost" className="py-2 min-h-0 text-sm" onClick={dismiss} data-testid="nudge-dismiss">
          Not now
        </Button>
      </div>
    </Card>
  )
}
