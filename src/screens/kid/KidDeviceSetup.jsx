import { useState } from 'react'
import { KID_THEMES } from '../../data/kidThemes.js'
import { Button, Card, Field, TextInput, ProgressBar, Banner } from '../../components/ui.jsx'
import ThemePicker from '../../components/ThemePicker.jsx'
import KidPairing from './KidPairing.jsx'

/**
 * Setting up a child's own phone.
 *
 * Three steps and no account: first name, theme, code. The child never types an
 * email or a password — the parent's account is the account, and this device
 * joins it by pairing code.
 */
const STEPS = ['Your name', 'Pick a world', 'Connect']

export default function KidDeviceSetup({ onBack }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [themeId, setThemeId] = useState(KID_THEMES[0].id)

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
            This changes the background, your character and what your coins are called. You can only
            change it later with a grown-up's help — so pick the one you like most.
          </p>
          <ThemePicker value={themeId} onChange={setThemeId} />
        </div>
      )}

      <div className="flex gap-2 mt-6 sticky bottom-3">
        <Button variant="ghost" onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))}>
          Back
        </Button>
        <Button className="flex-1" disabled={step === 0 && !name.trim()} onClick={() => setStep((s) => s + 1)}>
          {step === 1 ? 'Get my code' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
