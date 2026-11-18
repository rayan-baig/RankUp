import { useApp } from '../state/AppContext.jsx'
import { Card } from './ui.jsx'
import { navigate, navigateThen } from '../lib/router.js'

/*
 * The look-around, best parts first.
 *
 * A visitor lands on a dashboard of numbers about somebody else's children,
 * and the parts that sell RankUp were each a few taps away in different
 * directions: accepting a chore and watching it pay, the child's own world,
 * the arcade the chores unlock. This puts them at the top, in that order,
 * one tap each. Only in the demo; a real family never sees it.
 */
export default function DemoTour() {
  const { state, dispatch } = useApp()
  if (!state.demo) return null
  const kid = state.kids.find((k) => k.name === 'Ava') || state.kids[0]
  if (!kid) return null

  const waiting = state.submissions.find((s) => s.status === 'pending' && s.kidId === kid.id)
  const chore = waiting && state.quests.find((q) => q.id === waiting.questId)
  const asKid = (to) => () => navigateThen(to, () => dispatch({ type: 'SET_ROLE', role: 'kid', kidId: kid.id }))

  const steps = [
    {
      icon: '✅',
      title: waiting ? `Accept ${kid.name}'s ${chore ? `“${chore.title}”` : 'chore'}` : 'Accepted. That is the whole loop.',
      line: waiting ? 'She tapped “I did it!”. Accept it and watch her level up.' : `${kid.name} has her XP. Now see it from her side.`,
      go: waiting ? () => navigate('/parent/approvals') : null,
    },
    { icon: '🌍', title: `See ${kid.name}'s world`, line: 'Her avatar, her level, and a new battle to watch.', go: asKid('/kid') },
    { icon: '🎮', title: 'Play the arcade', line: 'Finished chores earn game tokens. Here they never run out.', go: asKid('/kid/arcade') },
  ]

  const more = [
    { icon: '🎁', label: 'Rewards', go: asKid('/kid/shop') },
    { icon: '🏆', label: 'League', go: asKid('/kid/leaderboards') },
    { icon: '📜', label: 'History', go: () => navigate('/parent/history') },
  ]

  return (
    <Card className="mb-3 tour-card" data-testid="demo-tour">
      <h2 className="font-display font-bold">Start here</h2>
      <p className="text-xs text-muted mb-2">The best of RankUp, in three taps.</p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className="text-xl shrink-0" aria-hidden="true">{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">{i + 1}. {s.title}</span>
                <span className="block text-xs text-muted">{s.line}</span>
              </span>
              {s.go && <span className="text-muted shrink-0" aria-hidden="true">›</span>}
            </>
          )
          return (
            <li key={i}>
              {s.go ? (
                <button type="button" onClick={s.go} className="card-flat w-full px-3 py-2.5 flex items-center gap-3 text-left transition-transform active:scale-[0.98]">
                  {body}
                </button>
              ) : (
                <div className="card-flat px-3 py-2.5 flex items-center gap-3">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
      {/* The rest of what a family uses, one tap each: what a child spends
          on, the league they race in, and the record a parent keeps. */}
      <p className="text-xs text-muted mt-2.5 mb-1">More to see</p>
      <div className="flex flex-wrap gap-1.5" data-testid="demo-more">
        {more.map((m) => (
          <button key={m.label} type="button" onClick={m.go} className="chip tour-more text-xs">
            <span aria-hidden="true">{m.icon}</span> {m.label}
          </button>
        ))}
      </div>
    </Card>
  )
}
