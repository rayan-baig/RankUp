import { useEffect, useState } from 'react'
import { formatDuration } from '../../lib/dates.js'
import { Card } from '../../components/ui.jsx'

/**
 * What the kid sees when a parent has triggered a Dimension Lockout or a Red
 * Security Lockdown through the System Override Protocol.
 *
 * It states the reason and the real-world consequence the parent wrote, because
 * a lockout the kid does not understand just becomes a fight about the app.
 */
export default function LockoutScreen({ lockout, kidName }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const red = lockout.type === 'red'
  const remaining = lockout.until ? lockout.until - Date.now() : null

  return (
    <div className="shell min-h-screen flex items-center justify-center px-5">
      <Card className="w-full text-center" style={{ borderColor: red ? 'var(--bad)' : 'var(--warn)' }}>
        <div className="text-5xl mb-3" aria-hidden="true">{red ? '🛑' : '⏸️'}</div>
        <h1 className="font-display text-2xl font-extrabold mb-1" style={{ color: red ? 'var(--bad)' : 'var(--warn)' }}>
          {red ? 'Red Security Lockdown' : 'Dimension Lockout'}
        </h1>
        <p className="text-sm text-muted mb-4">
          {red
            ? `${kidName}, your parent has locked the app. It stays locked until they lift it.`
            : `${kidName}, the app is paused.`}
        </p>

        {!red && remaining > 0 && (
          <div className="card-flat py-4 mb-4">
            <div className="font-display text-3xl font-extrabold" style={{ color: 'var(--warn)' }}>
              {formatDuration(remaining)}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted mt-1">remaining</div>
          </div>
        )}

        {lockout.reason && (
          <div className="card-flat p-3 text-left mb-3">
            <div className="label mb-1">Reason</div>
            <p className="text-sm">{lockout.reason}</p>
          </div>
        )}
        {lockout.consequence && (
          <div className="card-flat p-3 text-left">
            <div className="label mb-1">What happens in the real world</div>
            <p className="text-sm">{lockout.consequence}</p>
          </div>
        )}

        <p className="text-xs text-muted mt-4">Your XP, currency and streak are safe. Nothing is deleted.</p>
      </Card>
    </div>
  )
}
