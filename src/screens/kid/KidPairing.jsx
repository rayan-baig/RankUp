import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { syncAdapter, canSyncAcrossDevices } from '../../lib/sync/index.js'
import { generateCode, formatCode, newPairingRecord, pairingStatus, msRemaining, PAIRING_STATUS } from '../../lib/pairing.js'
import { uid } from '../../lib/id.js'
import { formatDuration } from '../../lib/dates.js'
import { Card, Button, Banner, SectionTitle } from '../../components/ui.jsx'

/**
 * The kid's device, waiting to be linked.
 *
 * It shows a 6-digit code and watches for a parent to claim it. Nothing about
 * this child is stored anywhere until that happens: no quests, no photos, no
 * XP. A children's app must not start collecting before a parent has said yes,
 * and this screen is where that yes arrives.
 */
export default function KidPairing({ name, themeId, onCancel }) {
  const { state, dispatch } = useApp()
  const [record, setRecord] = useState(state.pendingPairing)
  const [status, setStatus] = useState('waiting') // waiting | claimed | error
  const [error, setError] = useState('')
  const [, tick] = useState(0)
  const issuing = useRef(false)

  const issue = useCallback(async () => {
    if (issuing.current) return
    issuing.current = true
    setError('')
    // A collision means that code is already live for another device; roll again.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const fresh = newPairingRecord({ code: generateCode(), kidId: uid('kid'), kidName: name, themeId })
      // eslint-disable-next-line no-await-in-loop
      const result = await syncAdapter.publishCode(fresh)
      if (result.ok) {
        const stored = { ...fresh, kidId: result.kidId || fresh.kidId }
        setRecord(stored)
        setStatus('waiting')
        dispatch({ type: 'START_PAIRING', record: stored })
        issuing.current = false
        return
      }
      if (result.reason !== 'collision') {
        setStatus('error')
        setError('Could not reach the sync service. Check your connection and try again.')
        issuing.current = false
        return
      }
    }
    setStatus('error')
    setError('Could not create a code. Please try again.')
    issuing.current = false
  }, [name, themeId, dispatch])

  // Get a code on first open.
  useEffect(() => {
    if (!record) issue()
  }, [record, issue])

  // Watch for a parent claiming it.
  useEffect(() => {
    if (!record) return undefined
    return syncAdapter.watchCode(record.code, (latest) => {
      if (!latest) return
      setRecord(latest)
      if (latest.claimedAt) {
        setStatus('claimed')
        // Small pause so the kid sees the confirmation before the app changes.
        setTimeout(() => {
          dispatch({ type: 'PAIRING_CLAIMED', familyName: latest.claimedByFamilyName })
        }, 1400)
      }
    })
    // Intentionally keyed on the code alone: re-watching on every record
    // change would tear down and rebuild the subscription each poll.
  }, [record?.code, dispatch])

  // Re-render every second so the countdown moves.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const state_ = record ? pairingStatus(record) : null
  const remaining = record ? msRemaining(record) : 0
  const stale = state_ && state_ !== PAIRING_STATUS.ACTIVE && state_ !== PAIRING_STATUS.CLAIMED

  if (status === 'claimed') {
    return (
      <div className="shell px-5 py-8 min-h-screen flex flex-col items-center justify-center text-center">
        <div className="text-6xl mb-4 anim-pop" aria-hidden="true">🎉</div>
        <h1 className="font-display text-2xl font-extrabold mb-2">You're connected!</h1>
        <p className="text-muted">
          {record?.claimedByFamilyName
            ? `Linked to ${record.claimedByFamilyName}.`
            : 'Linked to your parent.'}{' '}
          Loading your quests…
        </p>
      </div>
    )
  }

  return (
    <div className="shell px-5 py-6 min-h-screen flex flex-col">
      <header className="text-center mb-5">
        <div className="text-4xl mb-2" aria-hidden="true">🔗</div>
        <h1 className="font-display text-2xl font-extrabold">Show this to your grown-up</h1>
        <p className="text-sm text-muted mt-1">
          They type these six numbers into their own phone to connect you.
        </p>
      </header>

      <Card className="text-center mb-4" style={{ borderColor: stale ? 'var(--warn)' : 'var(--accent)' }}>
        {status === 'error' ? (
          <>
            <p className="text-sm mb-3" style={{ color: 'var(--bad)' }}>{error}</p>
            <Button onClick={issue}>Try again</Button>
          </>
        ) : !record ? (
          <p className="py-8 text-muted">Getting your code…</p>
        ) : (
          <>
            <div
              className="font-mono font-extrabold tracking-[0.12em] py-4 select-all"
              style={{ fontSize: 'clamp(2.25rem, 13vw, 3.25rem)', color: stale ? 'var(--ink-muted)' : 'var(--accent)' }}
              aria-label={`Your code is ${record.code.split('').join(' ')}`}
            >
              {formatCode(record.code)}
            </div>

            {stale ? (
              <>
                <p className="text-sm mb-3" style={{ color: 'var(--warn)' }}>
                  {state_ === PAIRING_STATUS.BLOCKED
                    ? 'Too many wrong tries. Get a new code.'
                    : 'This code has expired.'}
                </p>
                <Button className="w-full" onClick={issue}>New code</Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted">
                  Expires in {formatDuration(remaining)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted">
                  <span
                    className="w-2 h-2 rounded-full anim-pulse"
                    style={{ background: 'var(--accent)' }}
                    aria-hidden="true"
                  />
                  Waiting for your grown-up…
                </div>
                <Button variant="soft" className="w-full mt-4" onClick={issue}>
                  New code
                </Button>
              </>
            )}
          </>
        )}
      </Card>

      <SectionTitle>What happens next</SectionTitle>
      <Card flat className="mb-4">
        <ol className="text-sm text-muted space-y-2 list-decimal list-inside">
          <li>Your grown-up opens RankUp on their phone.</li>
          <li>They go to <strong>Settings → Link a kid's device</strong>.</li>
          <li>They type in the six numbers above.</li>
          <li>Your quests appear here.</li>
        </ol>
      </Card>

      {!canSyncAcrossDevices && (
        <Banner tone="warn" icon="⚠️" title="Not connected to a real server yet">
          Pairing currently works only between two tabs of this same browser. Linking a real phone
          to a real phone needs the backend — see docs/SYNC.md.
        </Banner>
      )}

      <Banner tone="info" icon="🔒" title="Nothing is saved yet">
        Until a grown-up links this device, RankUp stores only your first name and the theme you
        picked. No quests, no photos, no account.
      </Banner>

      <Button variant="ghost" className="w-full mt-4" onClick={() => {
        if (record) syncAdapter.revokeCode(record.code)
        dispatch({ type: 'CANCEL_PAIRING' })
        onCancel?.()
      }}>
        Back
      </Button>
    </div>
  )
}
