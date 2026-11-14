import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { Screen, Card, Button, Field, TextInput, Banner } from '../../components/ui.jsx'
import { transport } from '../../lib/sync/transport.js'
import { redeemGift } from '../../lib/billing.js'
import { navigate } from '../../lib/router.js'
import { TIERS } from '../../state/initialState.js'
import {
  formatGiftCode, looksLikeGiftCode, giftError, giftLine, giftDate, GIFT_MONTHS, GIFT_ERRORS, GIFT_REMINDER_DAYS,
} from '../../lib/giftRules.js'

/** A paid plan that will charge the card again: the gift waits for it (redeem_gift_code). */
const renews = (family) => ['active', 'trialing', 'past_due'].includes(family?.subscriptionStatus)
  && !(family?.subscriptionEndsAt && Date.parse(family.subscriptionEndsAt) > Date.now())

/**
 * Redeem a gift, in Parent Mode only (the route guard keeps it there, and a
 * child's own phone has no parent side at all). The server checks who is
 * asking and how often (api/redeem-gift.js); this only formats the code as
 * it is typed and says what came back.
 */
export default function ParentRedeem() {
  const { state, syncNow } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const live = transport.isConfigured() && !state.demo
  const line = giftLine(state.family)

  const redeem = async () => {
    if (!looksLikeGiftCode(code)) { setError(GIFT_ERRORS.bad_request); return }
    setBusy(true)
    setError('')
    const result = await redeemGift(code)
    setBusy(false)
    if (!result.ok) { setError(giftError(result.reason)); return }
    setDone(result)
    setCode('')
    // The family row carries the gift to every phone in the family.
    syncNow?.()
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Redeem a gift</h1>
      <p className="text-sm text-muted mb-3">
        Somebody gave your family a year of RankUp? Type the code from the email or the gift card.
      </p>

      {line && (
        <Card flat className="mb-3" data-testid="redeem-gift-line">
          <p className="font-semibold text-sm">🎁 {line}</p>
          <p className="text-xs text-muted mt-0.5">Another code adds {GIFT_MONTHS} more months to the end.</p>
        </Card>
      )}

      {done && (
        <div className="mb-3" data-testid="redeem-done">
          <Banner tone="good" icon="🎉" title={`${TIERS[done.tier]?.name || 'Your plan'} is yours until ${giftDate(Date.parse(done.until))}`}>
            {Date.parse(done.starts_at) > Date.now() + 60000
              ? `It starts on ${giftDate(Date.parse(done.starts_at))}, the day your paid plan ends, so you never pay for the same time twice.`
              : done.stacked
                ? `Added to the end of the gift you already had. Nothing is charged.`
                : `It starts today. Nothing is charged and no card is needed.`}
          </Banner>
        </div>
      )}

      {!live && (
        <div className="mb-3">
          <Banner tone="info" icon="📱" title="Needs an account">
            {state.demo
              ? 'This is the look-around family, so there is nothing to redeem a gift for. Set up your own family to use one.'
              : 'Gifts belong to a family account. Connect the sync service to redeem one.'}
          </Banner>
        </div>
      )}

      {renews(state.family) && (
        <div className="mb-3" data-testid="redeem-renews">
          <Banner tone="info" icon="💳" title="You pay for a plan that renews">
            Turn renewal off first, in “Manage billing, cancel, or update card” on the plan screen. Your plan runs to the end of
            what you paid for, then your gift year starts, so you are never charged for time the gift covers.
          </Banner>
        </div>
      )}

      <Card>
        <Field label="Gift code" hint="12 letters and numbers, like ABCD-EFGH-JKMN. Dashes and spaces do not matter.">
          <TextInput
            value={code}
            onChange={(e) => { setCode(formatGiftCode(e.target.value)); setError('') }}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="field font-mono tracking-[0.08em] text-lg"
            data-testid="redeem-code"
            aria-label="Gift code"
          />
        </Field>
        {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert" data-testid="redeem-error">{error}</p>}
        <Button className="w-full" disabled={busy || !live} onClick={redeem} data-testid="redeem-submit">
          {busy ? 'Checking…' : 'Redeem'}
        </Button>
      </Card>

      <Card flat className="mt-3">
        <p className="text-sm font-semibold mb-1">How a gift works</p>
        <ul className="text-xs text-muted space-y-1 list-disc pl-4">
          <li>The plan on the gift, free for {GIFT_MONTHS} months from the day you redeem it. No card needed.</li>
          <li>One gift at a time: another one adds {GIFT_MONTHS} months to the end.</li>
          <li>If you pay for a plan, the gift starts when your paid plan ends.</li>
          <li>When it ends you go back to the plan you pay for, or Starter. We remind you here {GIFT_REMINDER_DAYS} days before. Nothing your kids earned is ever taken away.</li>
        </ul>
      </Card>

      <Button variant="ghost" className="w-full mt-3" onClick={() => navigate('/parent/plan')}>See plans</Button>
    </Screen>
  )
}
