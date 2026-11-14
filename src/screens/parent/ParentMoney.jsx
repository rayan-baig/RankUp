import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { potFor } from '../../state/reducer.js'
import { fetchAllowance, mergeFrom, allowanceRecord } from '../../lib/allowance.js'
import { formatMoney } from '../../lib/money.js'
import { navigate } from '../../lib/router.js'
import { Screen, Card, Button, EmptyState } from '../../components/ui.jsx'

/**
 * The pocket money record, one child at a time: what they are owed, what
 * they have earned and been paid over all time, when they were last paid,
 * and every line with the date, who recorded it and the balance after it.
 *
 * The answer to "you never paid me for the car", read out from the same
 * numbers as the pot on the Kids screen (allowanceRecord), so the two can
 * never say different things. RankUp never holds the money; this is the
 * record of what a parent handed over.
 */
export default function ParentMoney({ initialKidId = null }) {
  const { state, dispatch } = useApp()
  const [kidId, setKidId] = useState(
    state.kids.some((k) => k.id === initialKidId) ? initialKidId : state.kids[0]?.id || null)
  const currency = state.family.currency || 'GBP'
  const money = (p) => formatMoney(p, currency)

  useEffect(() => {
    const at = Date.now()
    let alive = true
    fetchAllowance().then((summary) => { if (alive && summary) dispatch(mergeFrom(summary, at)) })
    return () => { alive = false }
  }, [dispatch])

  const kid = state.kids.find((k) => k.id === kidId)
  if (!kid) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Pocket money record</h1>
        <EmptyState icon="💷" title="No children yet" body="Add a child, then put a price on a chore when you assign it." />
      </Screen>
    )
  }
  const record = allowanceRecord(state, kid.id, potFor)

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Pocket money record</h1>
      <p className="text-sm text-muted mb-3">What was earned, what was paid, and when.</p>

      {state.kids.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Which child">
          {state.kids.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={k.id === kid.id}
              onClick={() => setKidId(k.id)}
              className="chip text-xs py-1.5"
              style={k.id === kid.id ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--surface-2)' } : undefined}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      <Card className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{kid.name} is owed</span>
          <span className="font-display font-extrabold text-xl">{money(record.pot)}</span>
        </div>
        <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
          <Total label="Earned" value={money(record.totals.earned)} />
          <Total label="Added" value={money(record.totals.added)} />
          <Total label="Paid" value={money(record.totals.paid)} />
        </dl>
        <p className="text-xs text-muted mt-3">
          {record.totals.lastPaidAt
            ? `Last paid ${new Date(record.totals.lastPaidAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}.`
            : 'Not paid anything yet.'}
          {' '}Earned and added, less paid, is what {kid.name} is owed.
        </p>
      </Card>

      {record.lines.length === 0 ? (
        <EmptyState icon="💷" title="Nothing yet" body="Put a price on a chore when you assign it, and what it earns is listed here." />
      ) : (
        <Card className="p-0 mb-3">
          <ul>
            {record.lines.map((e, i) => (
              <li key={e.id} className="px-3 py-2.5 flex items-start gap-2" style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">
                    {e.words}{e.note ? ` · ${e.note}` : ''}
                  </span>
                  <span className="block text-xs text-muted">
                    {new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {e.by ? ` · by ${e.by}` : ''}
                    {' · '}balance {money(e.balanceAfter)}
                  </span>
                </span>
                <span className="text-sm font-display font-bold shrink-0"
                      style={{ color: e.pence < 0 ? 'var(--ink-muted)' : 'var(--good)' }}>
                  {e.pence < 0 ? '−' : '+'}{money(Math.abs(e.pence))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!record.complete && (
        <p className="text-xs text-muted mb-3">The latest 200 lines are listed. The totals above include every one.</p>
      )}

      <Button variant="soft" className="w-full" onClick={() => navigate('/parent/kids')}>Pay or add money on the Kids screen</Button>
    </Screen>
  )
}

function Total({ label, value }) {
  return (
    <div className="card-flat p-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-display font-bold text-sm">{value}</dd>
    </div>
  )
}
