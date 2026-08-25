import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { syncAdapter, canSyncAcrossDevices } from '../../lib/sync/index.js'
import { claimErrorMessage, isCompleteCode, MAX_ATTEMPTS } from '../../lib/pairing.js'
import { Screen, Card, Button, Banner, SectionTitle, Chip } from '../../components/ui.jsx'
import CodeInput from '../../components/CodeInput.jsx'
import { navigate } from '../../lib/router.js'

/**
 * The parent's side of pairing: type in the six digits from the kid's device.
 *
 * This is the moment consent actually happens. Until a parent does this, the
 * child's device is holding nothing and doing nothing.
 */
export default function ParentPairKid() {
  const { state, dispatch } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linked, setLinked] = useState(null)

  const linkedKids = state.kids.filter((k) => k.pairedDeviceAt)

  const submit = async (value = code) => {
    if (!isCompleteCode(value) || busy) return
    setBusy(true)
    setError('')
    const result = await syncAdapter.claimCode(value, {
      familyId: state.family.id,
      familyName: state.family.name || 'your family',
    })
    setBusy(false)

    if (!result.ok) {
      setError(claimErrorMessage(result.reason))
      setCode('')
      return
    }
    dispatch({ type: 'ADOPT_PAIRED_KID', kid: result.kid })
    setLinked(result.kid)
    setCode('')
  }

  if (linked) {
    return (
      <Screen>
        <div className="text-center py-10">
          <div className="text-5xl mb-3 anim-pop" aria-hidden="true">🔗</div>
          <h1 className="font-display text-2xl font-extrabold mb-1">{linked.name} is linked</h1>
          <p className="text-sm text-muted mb-6">
            Their device is now part of {state.family.name || 'your family'}. Quests you assign will
            show up there.
          </p>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setLinked(null)}>
              Link another
            </Button>
            <Button className="flex-1" onClick={() => navigate(`/parent/assign?kid=${linked.id}`)}>
              Assign a quest
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <button type="button" onClick={() => navigate('/parent/settings')} className="text-sm text-muted mb-2">
        ← Settings
      </button>

      <h1 className="font-display text-2xl font-extrabold mb-1">Link a kid's device</h1>
      <p className="text-sm text-muted mb-4">
        On their phone, they choose <strong>"I'm a kid"</strong> and get a six-digit code. Type it in
        below.
      </p>

      <Card className="mb-3">
        <CodeInput
          value={code}
          onChange={(v) => { setCode(v); setError('') }}
          onComplete={submit}
          disabled={busy}
          invalid={Boolean(error)}
        />

        {error && (
          <p className="text-sm mt-3 text-center" style={{ color: 'var(--bad)' }} role="alert">
            {error}
          </p>
        )}

        <Button className="w-full mt-4" disabled={!isCompleteCode(code) || busy} onClick={() => submit()}>
          {busy ? 'Checking…' : 'Link device'}
        </Button>
      </Card>

      <Banner tone="info" icon="⏱️" title="Codes are short-lived on purpose">
        A code lasts 10 minutes, stops working after {MAX_ATTEMPTS} wrong guesses, and can only be
        used once. If it stops working, ask them to tap "New code".
      </Banner>

      {!canSyncAcrossDevices && (
        <div className="mt-3">
          <Banner tone="warn" icon="⚠️" title="Testing on one computer?">
            Real device-to-device pairing needs the backend. For now, open{' '}
            <code className="font-mono text-xs">?device=kid</code> in another tab — that tab gets its
            own separate storage and can act as the kid's phone. See docs/SYNC.md.
          </Banner>
        </div>
      )}

      {linkedKids.length > 0 && (
        <>
          <SectionTitle>Linked devices</SectionTitle>
          {linkedKids.map((kid) => (
            <Card key={kid.id} flat className="mb-2 flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">📱</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{kid.name}</div>
                <div className="text-xs text-muted">
                  Linked {new Date(kid.pairedDeviceAt).toLocaleDateString()}
                </div>
              </div>
              <Chip tone="var(--good)">Active</Chip>
              <button
                type="button"
                className="text-xs underline text-muted px-1"
                onClick={() => dispatch({ type: 'UNLINK_KID_DEVICE', kidId: kid.id })}
              >
                Unlink
              </button>
            </Card>
          ))}
          <p className="text-xs text-muted">
            Unlinking removes the device's access. {linkedKids.length === 1 ? "The kid's" : 'Their'}{' '}
            profile, XP and currency stay in your family.
          </p>
        </>
      )}
    </Screen>
  )
}
