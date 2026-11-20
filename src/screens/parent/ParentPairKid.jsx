import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { syncAdapter, canSyncAcrossDevices } from '../../lib/sync/index.js'
import { claimErrorMessage, isCompleteCode, MAX_ATTEMPTS, CODE_TTL_MS, formatCode, makeCodeError } from '../../lib/pairing.js'
import { formatDuration } from '../../lib/dates.js'
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
  const waitingKids = state.kids.filter((k) => !k.pairedDeviceAt)
  /*
   * A code this phone made for one child (0.22.0): { kidId, code, expiresAt }.
   * The child's phone types only these six digits, so it never types a name
   * or picks a world: no second profile from a misspelt name, and the world
   * is the one chosen here.
   */
  const [made, setMade] = useState(null)
  const [making, setMaking] = useState(null)
  const [makeError, setMakeError] = useState('')
  const [, tick] = useState(0)
  const madeKid = made && state.kids.find((k) => k.id === made.kidId)

  const makeCode = async (kid) => {
    if (making) return
    setMaking(kid.id)
    setMakeError('')
    const r = await syncAdapter.makeChildCode({
      kidId: kid.id, kidName: kid.name, themeId: kid.themeId, familyName: state.family.name || 'your family',
    })
    setMaking(null)
    if (!r.ok) { setMakeError(makeCodeError(r.reason)); return }
    setMade({ kidId: kid.id, code: r.code, expiresAt: r.expiresAt })
  }

  // The countdown, and hearing that the phone has joined: through the sync
  // (the child's row now has a phone) or, with no server, the code's record.
  useEffect(() => {
    if (!made) return undefined
    const t = setInterval(() => tick((n) => n + 1), 1000)
    const stop = syncAdapter.watchChildCode(made.code, (record) => {
      if (record?.usedAt && madeKid) {
        dispatch({ type: 'ADOPT_PAIRED_KID', kid: { id: madeKid.id, name: madeKid.name, themeId: madeKid.themeId }, byId: true })
      }
    })
    return () => { clearInterval(t); stop() }
  }, [made, madeKid, dispatch])

  useEffect(() => {
    if (made && madeKid?.pairedDeviceAt) {
      setLinked({ ...madeKid, namesake: false })
      setMade(null)
    }
  }, [made, madeKid])

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
    // If this family already has a profile with that name, pairing joins it
    // rather than making a second one, and the kid's device needs to hear
    // which profile it landed on.
    //
    // With a server, the server has already decided, and its answer is the
    // one the child's phone uses: it joins a same-name profile only if that
    // profile has no phone yet. Swapping in a local name match here sent
    // "Assign a quest" to a profile the new phone cannot see.
    const existing = syncAdapter.isReal ? null : state.kids.find(
      (k) => k.name.trim().toLowerCase() === result.kid.name.trim().toLowerCase(),
    )
    const kid = { ...result.kid, id: existing?.id || result.kid.id }
    await syncAdapter.attachKid?.(value, kid.id)

    // Another profile of the same name kept its own phone, so this phone got
    // a profile of its own. Said on the confirmation, not discovered later.
    const namesake = state.kids.find(
      (k) => k.id !== kid.id && k.name.trim().toLowerCase() === kid.name.trim().toLowerCase(),
    )
    dispatch({ type: 'ADOPT_PAIRED_KID', kid, byId: syncAdapter.isReal })
    setLinked({ ...kid, namesake: Boolean(namesake) })
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
          {linked.namesake && (
            <div className="text-left mb-6">
              <Banner tone="warn" icon="📱" title={`This is a new profile for ${linked.name}`}>
                {linked.name} already has a profile on another phone, which keeps its XP and
                quests; this phone has a new one. To move a child to a new phone, unlink the old
                phone on this screen first, then link the new one.
              </Banner>
            </div>
          )}
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
      <button type="button" onClick={() => navigate('/parent/settings')} className="tap-link text-sm text-muted mb-1 -ml-1">
        ← Settings
      </button>

      <h1 className="font-display text-2xl font-extrabold mb-1">Link a kid's device</h1>

      {/* First: a code made here for one child. */}
      {waitingKids.length > 0 && (
        <Card className="mb-4" data-testid="make-code-card">
          <SectionTitle>Make a code for your child</SectionTitle>
          {made && madeKid ? (
            <div className="text-center" data-testid="made-code">
              <p className="text-sm text-muted">On {madeKid.name}&apos;s phone, open RankUp, tap <strong>“I&apos;m a kid”</strong> and type:</p>
              <div className="font-mono font-extrabold tracking-[0.12em] text-4xl py-3 text-accent"
                   aria-label={`The code is ${made.code.split('').join(' ')}`}>
                {formatCode(made.code)}
              </div>
              {made.expiresAt > Date.now() ? (
                <p className="text-xs text-muted">Waiting for {madeKid.name}&apos;s phone · runs out in {formatDuration(made.expiresAt - Date.now())}</p>
              ) : (
                <p className="text-xs text-muted">This code has run out. Make a new one.</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button variant="soft" className="flex-1" onClick={() => makeCode(madeKid)} disabled={Boolean(making)}>New code</Button>
                <Button variant="ghost" className="flex-1" onClick={() => setMade(null)}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted mb-2">
                Pick the child. Their phone then types only the code: no name to spell, no world to pick.
              </p>
              <div className="flex flex-wrap gap-2">
                {waitingKids.map((k) => (
                  <Button key={k.id} variant="soft" className="py-2 min-h-0 text-sm" disabled={Boolean(making)}
                    onClick={() => makeCode(k)} data-testid={`make-code-${k.name}`}>
                    {making === k.id ? 'Making…' : `Code for ${k.name}`}
                  </Button>
                ))}
              </div>
            </>
          )}
          {makeError && <p className="text-sm mt-2 text-bad" role="alert">{makeError}</p>}
        </Card>
      )}

      <SectionTitle>Or type the code from their phone</SectionTitle>
      {/*
        * Three steps, each one thing to tap or type, in the words on the
        * child's screen. It used to be one sentence, and a parent finding
        * their child's name already on this phone had no way to know the
        * new phone would join that profile rather than start a second one.
        */}
      <ol className="text-sm text-muted mb-4 space-y-1.5 list-decimal list-inside" data-testid="pair-steps">
        <li>On your child's phone, open RankUp, tap <strong>“I'm a kid”</strong>, then <strong>“No code? Make one on this phone instead”</strong>.</li>
        <li>
          They type their first name, pick a world and tap <strong>“Get my code”</strong>.
          {state.kids.some((k) => !k.pairedDeviceAt) && (
            <> Use the name you gave them here, and the phone joins that profile, quests and XP included.</>
          )}
        </li>
        <li>Type the six numbers on their screen below.</li>
      </ol>

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

      {/* A family with one phone needs none of this, and should be told so
          rather than wonder what they are missing. */}
      {linkedKids.length === 0 && !state.settings?.sharedPhone && (
        <Card flat className="mb-3 flex items-start gap-3" data-testid="shared-phone-card">
          <span className="text-xl shrink-0" aria-hidden="true">🤝</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">Sharing one phone?</div>
            <p className="text-xs text-muted">
              You can skip this. Use “Hand to a kid” on the dashboard; your PIN keeps Parent Mode yours.
            </p>
            <button type="button" className="tap-link -ml-1 text-xs underline text-muted"
              onClick={() => { dispatch({ type: 'UPDATE_SETTINGS', patch: { sharedPhone: true } }); navigate('/parent') }}>
              We share one phone
            </button>
          </div>
        </Card>
      )}

      <Banner tone="info" icon="⏱️" title="Codes are short-lived on purpose">
        A code lasts {CODE_TTL_MS / 60000} minutes, stops working after {MAX_ATTEMPTS} wrong guesses, and can
        only be used once. If it stops working, tap “New code” on their phone.
      </Banner>

      {!canSyncAcrossDevices && (
        <div className="mt-3">
          <Banner tone="warn" icon="⚠️" title="Testing on one computer?">
            Real device-to-device pairing needs the backend. For now, open{' '}
            <code className="font-mono text-xs">?device=kid</code> in another tab — that tab gets its
            own separate storage and can act as the kid's phone.
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
