import { useApp } from '../state/AppContext.jsx'
import { showHowItWorks } from '../lib/firstWeek.js'
import { Card, Button } from './ui.jsx'

/*
 * The loop, in three cards, for a parent who has just finished setup.
 *
 * Shown on the dashboard until "Got it", and remembered on this phone after
 * that (lib/firstWeek.js says exactly when). Not a modal: the parent can
 * start assigning with it still on screen, which is how most people learn
 * an app anyway.
 */
const CARDS = [
  { icon: '📋', title: 'You assign chores', line: 'A ready-made pack, or your own.' },
  { icon: '✅', title: 'They tap “I did it!”', line: 'On their phone, or on yours.' },
  { icon: '⭐', title: 'You accept', line: 'Only then do XP and coins land.' },
]

export default function HowItWorks() {
  const { state, dispatch } = useApp()
  if (!showHowItWorks(state)) return null
  const done = () => dispatch({ type: 'UPDATE_SETTINGS', patch: { howItWorksSeen: true } })

  return (
    <Card className="mb-3" data-testid="how-it-works">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2 className="font-display font-bold">How RankUp works</h2>
        <Button variant="soft" className="shrink-0 px-3 py-1.5 min-h-0 text-xs" onClick={done}>Got it</Button>
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {CARDS.map((c, i) => (
          <li key={c.title} className="card-flat px-2 py-2.5 text-center">
            <span className="block text-xl mb-1" aria-hidden="true">{c.icon}</span>
            <span className="block font-semibold text-xs leading-snug">{i + 1}. {c.title}</span>
            <span className="block text-[11px] text-muted leading-snug mt-0.5">{c.line}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
