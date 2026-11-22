import { useMemo } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { weekCompare, changeWords } from '../lib/thisWeek.js'
import { formatXp } from '../lib/xp.js'

/*
 * "This week" (0.30.0): chores done, the XP they paid and the best run of
 * days in a row, each beside last week's, on the parent's dashboard (and in
 * the demo). Nothing to compare yet (no chore ever accepted): not shown.
 */
export default function ThisWeek() {
  const { state } = useApp()
  const week = useMemo(() => weekCompare(state), [state.submissions])
  if (!week.any) return null
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
    </section>
  )
}
