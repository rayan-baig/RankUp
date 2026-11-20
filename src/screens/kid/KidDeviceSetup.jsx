import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { KID_THEMES } from '../../data/kidThemes.js'
import { syncAdapter } from '../../lib/sync/index.js'
import { childCodeError, isCompleteCode } from '../../lib/pairing.js'
import { Button, Card, Field, TextInput, ProgressBar, Banner } from '../../components/ui.jsx'
import CodeInput from '../../components/CodeInput.jsx'
import ThemePicker from '../../components/ThemePicker.jsx'
import KidPairing from './KidPairing.jsx'

/**
 * Setting up a child's own phone.
 *
 * First (0.22.0): type the code from the grown-up's phone, and that is all.
 * The parent made the code for this child in Parent Mode, so the phone never
 * types a name or picks a world: no second profile from a misspelt name, and
 * the world is the parent's choice.
 *
 * The older way round is still here, one tap away, for a parent who has not
 * added the child yet: first name, world, and a code for the parent to type.
 * No account either way; the child never types an email or a password.
 */
const STEPS = ['Your name', 'Pick a world', 'Connect']

export default function KidDeviceSetup({ onBack }) {
  const { dispatch } = useApp()
  const [mode, setMode] = useState('code') // code | make
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [themeId, setThemeId] = useState(KID_THEMES[0].id)

  const connect = async (value = code) => {
    if (!isCompleteCode(value) || busy) return
    setBusy(true)
    setError('')
    const result = await syncAdapter.useChildCode(value)
    setBusy(false)
    if (!result.ok) {
      setError(childCodeError(result.reason))
      setCode('')
      return
    }
    dispatch({ type: 'LINKED_BY_CODE', kid: result.kid, familyName: result.familyName, real: syncAdapter.isReal })
  }

  if (mode === 'code') {
    return (
      <div className="shell px-4 py-6 min-h-screen flex flex-col">
        <div className="flex-1 anim-slide-up">
          <div className="text-4xl mb-2" aria-hidden="true">🔗</div>
          <h1 className="font-display text-2xl font-extrabold mb-1">Type your code</h1>
          <p className="text-muted text-sm mb-4">
            Your grown-up makes it on their phone: Parent Mode, Settings, “Link a kid&apos;s device”. Then
            type the six numbers here.
          </p>
          <Card className="mb-3">
            <CodeInput
              value={code}
              onChange={(v) => { setCode(v); setError('') }}
              onComplete={connect}
              disabled={busy}
              invalid={Boolean(error)}
            />
            {error && (
              <p className="text-sm mt-3 text-center text-bad" role="alert" data-testid="kid-code-error">{error}</p>
            )}
            <Button className="w-full mt-4" disabled={!isCompleteCode(code) || busy} onClick={() => connect()} data-testid="kid-code-connect">
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </Card>
          <Banner tone="info" icon="🔒" title="No account, no password">
            You don&apos;t sign up for anything. This phone joins your grown-up&apos;s account, and they stay
            in charge of it.
          </Banner>
          <button
            type="button"
            className="tap-link w-full text-sm underline text-muted mt-4"
            onClick={() => setMode('make')}
            data-testid="kid-make-code"
          >
            No code? Make one on this phone instead
          </button>
        </div>
        <Button variant="ghost" className="mt-6" onClick={onBack}>Back</Button>
      </div>
    )
  }

  if (step === 2) {
    return <KidPairing name={name.trim()} themeId={themeId} onCancel={() => setStep(1)} />
  }

  return (
    <div className="shell px-4 py-6 min-h-screen flex flex-col">
      <div className="mb-5">
        <ProgressBar value={step + 1} max={STEPS.length} label="Setup progress" />
        <p className="text-xs text-muted mt-2">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      {step === 0 && (
        <div className="flex-1 anim-slide-up">
          <h1 className="font-display text-2xl font-extrabold mb-1">What should we call you?</h1>
          <p className="text-muted text-sm mb-4">
            Just your first name. Your grown-up will see it when they connect you.
          </p>
          <Field label="First name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              placeholder="e.g. Ava"
              autoFocus
            />
          </Field>
          <Card flat>
            <Banner tone="info" icon="🔒" title="No account, no password">
              You don't sign up for anything. This phone connects to your grown-up's account with a
              six-digit code, and they stay in charge of it.
            </Banner>
          </Card>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1 anim-slide-up">
          <h1 className="font-display text-2xl font-extrabold mb-1">Pick your world, {name.trim()}</h1>
          <p className="text-muted text-sm mb-4">
            This changes the background, your character and what your coins are called. If your
            grown-up already picked one for you, theirs is the one you get.
          </p>
          <ThemePicker value={themeId} onChange={setThemeId} />
        </div>
      )}

      <div className="flex gap-2 mt-6 sticky bottom-3">
        <Button variant="ghost" onClick={() => (step === 0 ? setMode('code') : setStep((s) => s - 1))}>
          Back
        </Button>
        <Button className="flex-1" disabled={step === 0 && !name.trim()} onClick={() => setStep((s) => s + 1)}>
          {step === 1 ? 'Get my code' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
