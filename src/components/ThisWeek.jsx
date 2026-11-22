import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { planOf, onTrial } from '../state/reducer.js'
import { weekCompare, changeWords, kidsThisWeek, boostWords, weekShareText } from '../lib/thisWeek.js'
import { formatXp } from '../lib/xp.js'
import { Button } from './ui.jsx'

/*
 * "This week" (0.30.0): chores done, the XP they paid and the best run of
 * days in a row, each beside last week's, on the parent's dashboard (and in
 * the demo). Nothing to compare yet (no chore ever accepted): not shown.
 *
 * Since 0.32.0 it also says what the plan's boost gave, in XP and by child
 * ("The 1.5× XP boost gave Ava 60 extra XP this week"), worked out from the
 * chores actually accepted (lib/thisWeek.js, kidsThisWeek), and offers the
 * week as a few lines to send to the other grown-ups: "Share this week"
 * shows exactly what would be sent, and nothing leaves the phone until the
 * parent presses Share or Copy. Parent Mode only, like the whole card.
 */
export default function ThisWeek() {
  const { state } = useApp()
  const [sharing, setSharing] = useState(false)
  const [said, setSaid] = useState('')
  const week = useMemo(() => weekCompare(state), [state.submissions])
  const multiplier = planOf(state).xpMultiplier || 1
  const kids = useMemo(() => kidsThisWeek(state, Date.now(), multiplier), [state.submissions, state.kids, multiplier])
  if (!week.any) return null
  const boost = boostWords(kids, multiplier)
  const trial = boost && onTrial(state)
  const text = sharing ? weekShareText(state, Date.now(), multiplier) : ''
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = async () => {
    try {
      await navigator.share({ title: 'Our week on RankUp', text })
      setSaid('Shared.')
    } catch (e) {
      if (e?.name !== 'AbortError') setSaid('This phone could not share it. Copy it instead.')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setSaid('Copied. Paste it wherever you like.')
    } catch {
      setSaid('This browser would not copy it. Select the words above and copy them.')
    }
  }

  const rows = [
    { key: 'chores', label: 'Chores done', value: week.now.chores, before: week.before.chores, show: (n) => n.toLocaleString() },
    { key: 'xp', label: 'XP earned', value: week.now.xp, before: week.before.xp, show: formatXp },
    { key: 'streak', label: 'Days in a row', value: week.now.streak, before: week.before.streak, show: (n) => n.toLocaleString() },
  ]
  return (
    <section className="card mb-3 p-4" data-testid="this-week" aria-labelledby="this-week-title">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h2 id="this-week-title" className="font-display font-bold">This week</h2>
        <span className="text-[11px] text-muted">Last 7 days, against the 7 before</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => {
          const change = changeWords(r.value, r.before)
          return (
            <div key={r.key} className="week-cell" data-week={r.key}>
              <div className="font-display font-extrabold text-xl leading-none">{r.show(r.value)}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted mt-1">{r.label}</div>
              <div className={`week-change week-${change.dir}`}>{change.words}</div>
            </div>
          )
        })}
      </div>
      {boost && (
        <p className="week-boost" data-testid="week-boost">
          <span aria-hidden="true">⚡</span>{' '}
          <span data-pilot-private="">{boost}</span>
          {trial && <span className="text-muted"> Part of your {planOf(state).name} trial.</span>}
        </p>
      )}
      {!sharing ? (
        <Button variant="soft" className="mt-3 px-3.5 py-2 min-h-0 text-xs" data-testid="week-share-open"
                onClick={() => { setSaid(''); setSharing(true) }}>
          <span aria-hidden="true">📤</span> Share this week
        </Button>
      ) : (
        <div className="week-share" data-testid="week-share">
          <p className="text-[11px] text-muted mb-1.5">This is what would be sent. Nothing leaves this phone until you press Share or Copy.</p>
          <p className="week-share-text" data-pilot-private="" data-testid="week-share-text">{text}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {canShare && <Button className="px-4 py-2 min-h-0 text-sm" onClick={share}>Share…</Button>}
            <Button variant={canShare ? 'soft' : 'primary'} className="px-4 py-2 min-h-0 text-sm" data-testid="week-share-copy" onClick={copy}>Copy</Button>
            <Button variant="ghost" className="px-3 py-2 min-h-0 text-sm" onClick={() => setSharing(false)}>Close</Button>
          </div>
          {said && <p className="text-xs text-muted mt-1.5" role="status" data-testid="week-share-said">{said}</p>}
        </div>
      )}
    </section>
  )
}
