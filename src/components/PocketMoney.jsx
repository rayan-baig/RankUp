import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { potFor } from '../state/reducer.js'
import { fetchAllowance, mergeFrom } from '../lib/allowance.js'
import { formatMoney, parseMoney, symbolFor } from '../lib/money.js'
import { Card, Button, TextInput, Banner, Modal } from './ui.jsx'
import { CountUp } from './Motion.jsx'

/**
 * What each child is owed, and the button that settles it.
 *
 * This is the argument the money causes — "you still owe me for the car" —
 * and the whole feature is just having an answer to it that both sides can
 * read. So the lines are on screen, not hidden behind a link: a total on its
 * own is a number to disagree with, and a list is a thing to read out.
 *
 * RankUp never holds a penny and says so. The parent hands the money over
 * however they already do; this records that they did.
 */
export default function PocketMoney({ kidId = null }) {
  const { state, dispatch } = useApp()
  const [paying, setPaying] = useState(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const currency = state.family.currency || 'GBP'
  const kids = kidId ? state.kids.filter((k) => k.id === kidId) : state.kids

  useEffect(() => {
    // The moment the request goes out, not the moment it lands — see
    // MERGE_ALLOWANCE. A line written while this is in flight is still in
    // flight and must not be thrown away.
    const at = Date.now()
    let alive = true
    fetchAllowance().then((summary) => {
      if (alive && summary) dispatch(mergeFrom(summary, at))
    })
    return () => { alive = false }
  }, [dispatch])

  // A family that has never priced a chore should not be shown a money screen
  // at all. Nothing here nags anybody into starting.
  const anyPaid = state.quests.some((q) => (q.pence || 0) > 0)
  const anyOwed = kids.some((k) => potFor(state, k.id) !== 0)
  if (!anyPaid && !anyOwed) return null

  const openPay = (kid) => {
    setPaying(kid)
    setAmount('')
    setError('')
  }

  const confirm = () => {
    const pence = parseMoney(amount, currency)
    if (!pence) { setError('That is not an amount — try 2 or 2.50.'); return }
    if (pence > potFor(state, paying.id)) {
      setError(`That is more than ${paying.name} is owed.`)
      return
    }
    dispatch({ type: 'RECORD_MONEY', kidId: paying.id, pence, kind: 'paid', note: '' })
    setPaying(null)
  }

  const recent = (state.allowance || [])
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, 6)

  return (
    <Card className="mb-4">
      <h2 className="font-display font-extrabold text-base mb-1">Pocket money</h2>
      <p className="text-sm text-muted mb-3">
        What each of them has earned and not been paid yet. RankUp never holds
        the money — you pay however you already do, then tap Paid.
      </p>

      {kids.map((kid) => {
        const pot = potFor(state, kid.id)
        return (
          <div key={kid.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 font-semibold text-sm">{kid.name}</span>
            <CountUp
              value={pot}
              format={(p) => formatMoney(p, currency)}
              className="font-display font-extrabold text-[17px]"
            />
            {pot > 0 && (
              <Button variant="soft" onClick={() => openPay(kid)}>Paid</Button>
            )}
          </div>
        )
      })}

      {recent.length > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
          {recent.map((e) => {
            const kid = state.kids.find((k) => k.id === e.kidId)
            return (
              <div key={e.id} className="flex items-baseline gap-2 py-0.5">
                <span className="text-xs text-muted min-w-0 flex-1 truncate">
                  {kid?.name}
                  {e.note ? ` · ${e.note}` : ''}
                  {!e.note && e.kind === 'paid' ? ' · paid out' : ''}
                  {!e.note && e.kind === 'gift' ? ' · added' : ''}
                </span>
                <span
                  className="text-xs font-display font-bold"
                  style={{ color: e.pence < 0 ? 'var(--ink-muted)' : 'var(--good)' }}
                >
                  {e.pence < 0 ? '−' : '+'}{formatMoney(Math.abs(e.pence), currency)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title={paying ? `Paid ${paying.name}` : ''}
      >
        <p className="text-sm text-muted mb-3">
          {paying && `${paying.name} is owed ${formatMoney(potFor(state, paying.id), currency)}.`}
          {' '}How much did you hand over?
        </p>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-display font-bold" style={{ color: 'var(--ink-muted)' }}>
            {symbolFor(currency)}
          </span>
          <TextInput
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount paid"
            autoFocus
          />
          <Button
            variant="ghost"
            onClick={() => setAmount(String(potFor(state, paying.id) / 100))}
          >
            All
          </Button>
        </div>
        {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }}>{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setPaying(null)}>Cancel</Button>
          <Button className="flex-1" onClick={confirm}>Record it</Button>
        </div>
      </Modal>

      {!anyPaid && anyOwed && (
        <Banner tone="info" icon="💷" className="mt-3">
          No chore has a price on it at the moment, so nothing new is being
          added. Put an amount on a quest when you assign it.
        </Banner>
      )}
    </Card>
  )
}
