import { EMPTY_STATES } from '../data/emptyStates.js'
import { EmptyState, Button } from './ui.jsx'
import { navigate } from '../lib/router.js'

/**
 * An empty screen with its one next step (data/emptyStates.js).
 *
 * `onAction` replaces the link when the step can be done right here, and
 * `body` replaces the line when the screen knows better (a filter that
 * matches nothing is not the same as nothing at all).
 */
export default function EmptyNext({ which, onAction, body, noAction = false }) {
  const e = EMPTY_STATES[which]
  if (!e) return null
  const go = onAction || (() => navigate(e.action.to))
  return (
    <div data-testid={`empty-${which}`}>
      <EmptyState
        icon={e.icon}
        title={e.title}
        body={body || e.body}
        action={e.action && !noAction ? <Button className="min-h-[44px]" onClick={go}>{e.action.label}</Button> : null}
      />
    </div>
  )
}
