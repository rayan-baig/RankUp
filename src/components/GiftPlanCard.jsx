import { useApp } from '../state/AppContext.jsx'
import { Card } from './ui.jsx'
import { navigate } from '../lib/router.js'
import { giftLine, giftState } from '../lib/giftRules.js'

/**
 * A family's gift plan, and the two ways in: redeem a code, or give a year
 * to somebody else. In Settings and on the plan screen, both in Parent Mode;
 * never on a child's screen.
 *
 * "Gift plan: Elite Pass until 14 November 2027" comes from the synced
 * family row, so every parent's phone says the same.
 */
export default function GiftPlanCard({ compact = false }) {
  const { state } = useApp()
  const gift = giftState(state.family)
  const line = giftLine(state.family)
  const row = 'w-full flex items-center gap-3 text-left'
  return (
    <Card flat className="mb-3" data-testid={compact ? 'gift-card-plan' : 'gift-card-settings'}>
      {line && (
        <div className="mb-3 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <p className="font-semibold text-sm" data-testid="gift-plan-line">🎁 {line}</p>
          <p className="text-xs text-muted mt-0.5">
            {gift?.pending
              ? 'It starts the day your paid plan ends, so you never pay for the same time twice.'
              : 'Somebody gave your family a year of RankUp. Nothing is charged for it.'}
          </p>
        </div>
      )}
      <button type="button" className={row} onClick={() => navigate('/parent/redeem')} data-testid="redeem-link">
        <span className="text-2xl" aria-hidden="true">🎟️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-sm">Redeem a gift</span>
          <span className="block text-xs text-muted">Got a gift code? Type it here.</span>
        </span>
        <span aria-hidden="true" className="text-muted">›</span>
      </button>
      <button type="button" className={`${row} mt-3 pt-3`} style={{ borderTop: '1px solid var(--line)' }}
        onClick={() => navigate('/gift')} data-testid="give-link-parent">
        <span className="text-2xl" aria-hidden="true">🎁</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-sm">Give RankUp as a gift</span>
          <span className="block text-xs text-muted">A year for another family. They need no card.</span>
        </span>
        <span aria-hidden="true" className="text-muted">›</span>
      </button>
    </Card>
  )
}
