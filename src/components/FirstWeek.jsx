import { useApp } from '../state/AppContext.jsx'
import { firstWeekSteps, showFirstWeek } from '../lib/firstWeek.js'
import { Card, ProgressBar } from './ui.jsx'
import { navigate } from '../lib/router.js'

/*
 * The first week, as four things to do.
 *
 * Every tick comes from the family's real state (lib/firstWeek.js), never
 * from tapping the row, and the card goes for good once all four are done.
 * "Hide" is there for a family that shares one phone and will never pair a
 * second: a list that can never finish should not sit on their dashboard.
 */
export default function FirstWeek() {
  const { state, dispatch } = useApp()
  if (!showFirstWeek(state)) return null
  const steps = firstWeekSteps(state)
  const done = steps.filter((s) => s.done).length

  return (
    <Card className="mb-3" data-testid="first-week">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-display font-bold">Your first week</h2>
        <span className="text-xs text-muted">{done} of {steps.length} done</span>
      </div>
      <ProgressBar value={done} max={steps.length} height={6} label="First week progress" />
      <ul className="mt-2.5 space-y-1">
        {steps.map((s) => {
          const body = (
            <>
              <span
                className="w-5 h-5 rounded-full grid place-items-center shrink-0 text-[11px] font-bold mt-0.5"
                style={s.done
                  ? { background: 'var(--good)', color: 'var(--bg)' }
                  : { border: '2px solid var(--line)' }}
                aria-hidden="true"
              >
                {s.done ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${s.done ? 'line-through text-muted' : ''}`}>
                  {s.label}
                </span>
                {!s.done && s.line && <span className="block text-xs text-muted">{s.line}</span>}
              </span>
              {!s.done && s.to && <span className="text-muted shrink-0" aria-hidden="true">›</span>}
            </>
          )
          return (
            <li key={s.id} data-step={s.id} data-done={s.done ? 'true' : 'false'}>
              {!s.done && s.to ? (
                <button type="button" onClick={() => navigate(s.to)} className="w-full flex items-start gap-2.5 text-left py-1.5">
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2.5 py-1.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="text-xs underline text-muted mt-1"
        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { firstWeekHidden: true } })}
      >
        Hide this list
      </button>
    </Card>
  )
}
