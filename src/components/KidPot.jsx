import { useEffect } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { potFor } from '../state/reducer.js'
import { fetchAllowance, mergeFrom } from '../lib/allowance.js'
import { formatMoney } from '../lib/money.js'
import { Card } from './ui.jsx'

/**
 * What a child is owed, on their own phone.
 *
 * This is the half of the feature that makes it worth building. A parent
 * having a tidy record changes very little; a child being able to check what
 * they are owed without asking — and seeing it go up the moment a chore is
 * approved — is what stops the arguing and what makes them do the next one.
 *
 * Deliberately says "owed", never "balance". There is no money in here. It is
 * a promise from a parent, and calling it a balance would be the first step
 * towards a child thinking this app holds their savings.
 */
export default function KidPot({ kidId }) {
  const { state, dispatch } = useApp()
  const currency = state.family.currency || 'GBP'

  useEffect(() => {
    const at = Date.now()
    let alive = true
    fetchAllowance().then((summary) => {
      if (alive && summary) dispatch(mergeFrom(summary, at))
    })
    return () => { alive = false }
  }, [dispatch])

  const pot = potFor(state, kidId)
  const mine = (state.allowance || [])
    .filter((e) => e.kidId === kidId)
    .sort((a, b) => b.at - a.at)
    .slice(0, 4)

  // A family that does not do pocket money never sees this. Showing a child a
  // pot of zero would invent an expectation their parents never set.
  const anyPaid = state.quests.some((q) => q.kidId === kidId && (q.pence || 0) > 0)
  if (!anyPaid && pot === 0) return null

  return (
    <Card className="mb-3">
      <div className="flex items-baseline gap-2">
        <span className="section-title mb-0">You're owed</span>
        <span className="ml-auto font-display font-extrabold" style={{ fontSize: 26 }}>
          {formatMoney(pot, currency)}
        </span>
      </div>

      {mine.length > 0 && (
        <div className="mt-2">
          {mine.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 py-0.5">
              <span className="text-xs text-muted min-w-0 flex-1 truncate">
                {e.note || (e.pence < 0 ? 'Paid to you' : 'Added')}
              </span>
              <span
                className="text-xs font-display font-bold"
                style={{ color: e.pence < 0 ? 'var(--ink-muted)' : 'var(--good)' }}
              >
                {e.pence < 0 ? '−' : '+'}{formatMoney(Math.abs(e.pence), currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted mt-2">
        Your grown-up pays this however you both agreed — RankUp is just
        keeping count.
      </p>
    </Card>
  )
}
