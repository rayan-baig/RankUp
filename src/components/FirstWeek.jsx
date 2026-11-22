import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { firstWeekSteps, showFirstWeek, starterChores } from '../lib/firstWeek.js'
import { Button, Card, ProgressBar } from './ui.jsx'
import { navigate } from '../lib/router.js'
import { plural } from '../lib/plural.js'

/*
 * Getting started, as four things to do.
 *
 * Every tick comes from the family's real state (lib/firstWeek.js), never
 * from tapping the row, and the card goes for good once all four are done.
 * Two steps can be done from right here: three starter chores in one tap,
 * and "We share one phone" for a family that will never link a second one
 * (a list that can never finish should not sit on their dashboard): a
 * button beside "Link a phone", and ticked by itself once a chore is
 * accepted with no child's phone linked. "Hide this list" puts it away for
 * anyone who would rather not have it.
 */
export default function FirstWeek() {
  const { state, dispatch } = useApp()
  const [added, setAdded] = useState('')
  if (!showFirstWeek(state)) return null
  const steps = firstWeekSteps(state)
  const done = steps.filter((s) => s.done).length

  const addStarter = (kid) => {
    const quests = starterChores(kid)
    if (!quests.length) return
    dispatch({ type: 'ADD_QUESTS', quests })
    setAdded(`${plural(quests.length, 'chore')} added for ${kid.name}: ${quests.map((q) => q.title).join(', ')}.`)
  }

  return (
    <Card className="mb-3" data-testid="first-week">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-display font-bold">Getting started</h2>
        <span className="text-xs text-muted">{done} of {steps.length} done</span>
      </div>
      <ProgressBar value={done} max={steps.length} height={6} label="Getting started progress" />
      <ul className="mt-2.5 space-y-1">
        {steps.map((s) => {
          const body = (
            <>
              <span
                className={`w-5 h-5 rounded-full grid place-items-center shrink-0 text-[11px] font-bold mt-0.5 ${s.done ? 'step-tick-done' : 'step-tick-todo'}`}
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
                <button type="button" data-testid="step-go" onClick={() => navigate(s.to)}
                  className="w-full flex items-start gap-2.5 text-left py-2 min-h-[44px]">
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2.5 py-2">{body}</div>
              )}
              {!s.done && (s.starter || s.skip) && (
                <div className="pl-7 pb-1 flex flex-wrap items-center gap-2">
                  {s.starter && (
                    <Button variant="soft" className="py-2 min-h-[40px] text-sm" data-testid="starter-chores"
                      onClick={() => addStarter(s.starter)}>
                      ✨ Add 3 starter chores for {s.starter.name}
                    </Button>
                  )}
                  {/* Two ways through, as two buttons of the same size: a
                      second phone to link, or one phone for the family (it
                      used to be a small link under the step, easily missed,
                      and the list never finished for a one-phone family). */}
                  {s.skip && (
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <Button variant="soft" className="py-2 px-2.5 min-h-[44px] text-[13px] leading-tight" data-testid="link-phone"
                        onClick={() => navigate(s.to)}>
                        📱 Link a phone
                      </Button>
                      <Button variant="soft" className="py-2 px-2.5 min-h-[44px] text-[13px] leading-tight" data-testid="shared-phone"
                        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { sharedPhone: true } })}>
                        🤝 {s.skip}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {added && <p role="status" className="text-xs mt-1" data-testid="starter-added">✅ {added}</p>}
      <button
        type="button"
        className="tap-link text-xs underline text-muted"
        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { firstWeekHidden: true } })}
      >
        Hide this list
      </button>
    </Card>
  )
}
