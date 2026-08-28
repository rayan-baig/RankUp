import { useSync } from '../state/AppContext.jsx'
import { SYNC_STATUS } from '../lib/sync/syncEngine.js'

/**
 * A one-line answer to "is what I'm looking at up to date?"
 *
 * Worth the space because the failure it warns about is silent otherwise: a
 * parent approving chores on a train sees everything work perfectly, and has no
 * way to know none of it has left the phone. Saying "3 waiting to send" turns a
 * mystery into a fact.
 */
export default function SyncBadge({ className = '' }) {
  const { status, pending, error, syncNow, configured } = useSync()

  if (!configured) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] ${className}`}
        style={{ color: 'var(--ink-muted)' }}
        title="No sync service is configured, so this device keeps its own data. See docs/SYNC.md"
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink-muted)' }} aria-hidden="true" />
        This device only
      </span>
    )
  }

  const look = {
    [SYNC_STATUS.IDLE]: { dot: 'var(--good)', text: pending ? `${pending} waiting to send` : 'Up to date' },
    [SYNC_STATUS.SYNCING]: { dot: 'var(--accent)', text: 'Syncing…' },
    [SYNC_STATUS.OFFLINE]: { dot: 'var(--warn)', text: pending ? `Offline · ${pending} waiting` : 'Offline' },
    [SYNC_STATUS.ERROR]: { dot: 'var(--bad)', text: 'Sync problem' },
  }[status] || { dot: 'var(--ink-muted)', text: '' }

  return (
    <button
      type="button"
      onClick={syncNow}
      className={`inline-flex items-center gap-1.5 text-[11px] ${className}`}
      style={{ color: 'var(--ink-muted)' }}
      title={error || 'Tap to sync now'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === SYNC_STATUS.SYNCING ? 'anim-pulse' : ''}`}
        style={{ background: look.dot }}
        aria-hidden="true"
      />
      {look.text}
    </button>
  )
}
