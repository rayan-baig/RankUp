import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { transport } from '../lib/sync/transport.js'
import { Button, Field, TextInput, Modal } from './ui.jsx'
import {
  pinResetAvailability, proveParent, validPin, lockedForMinutes, PIN_RESET_ERRORS,
} from '../lib/pinReset.js'

/** "s•••@example.com": enough to recognise, not enough to read over a shoulder. */
function masked(email) {
  const [name, domain] = String(email || '').split('@')
  if (!domain) return ''
  return `${name.slice(0, 1)}•••@${domain}`
}

/**
 * "Forgot your PIN?" on the profile switcher.
 *
 * Two steps: the parent signs in again with their account's password (the
 * account this phone is signed in with), then chooses a new PIN. See
 * lib/pinReset.js for who can and cannot.
 */
export default function PinReset({ open, onClose, onDone }) {
  const { state, dispatch } = useApp()
  const [step, setStep] = useState('prove')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const why = pinResetAvailability(state)

  const close = () => {
    setStep('prove'); setPassword(''); setPin(''); setAgain(''); setError(''); setBusy(false)
    onClose()
  }

  const prove = async () => {
    if (!password || busy) return
    setBusy(true)
    setError('')
    const result = await proveParent(state, password)
    setPassword('')
    setBusy(false)
    if (result.ok) setStep('choose')
    else setError(PIN_RESET_ERRORS[result.reason] || PIN_RESET_ERRORS.offline)
  }

  const save = () => {
    if (!validPin(pin) || pin !== again) return
    dispatch({ type: 'UPDATE_FAMILY', patch: { pin } })
    close()
    onDone?.()
  }

  const locked = lockedForMinutes()

  return (
    <Modal open={open} onClose={close} title="Reset the parent PIN">
      {why !== 'ok' ? (
        <p className="text-sm" data-testid="pin-reset-unavailable">{PIN_RESET_ERRORS[why]}</p>
      ) : step === 'prove' ? (
        <>
          <p className="text-sm mb-3">
            Sign in again to show it is you. Use the password for{' '}
            <strong>{masked(transport.currentEmail())}</strong>, the account this phone is signed in with.
          </p>
          <Field label="Your account password">
            <TextInput
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && prove()}
              aria-label="Your account password"
              disabled={Boolean(locked)}
            />
          </Field>
          {(error || locked > 0) && (
            <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert">
              {error || PIN_RESET_ERRORS.locked}
            </p>
          )}
          <Button className="w-full" disabled={!password || busy || Boolean(locked)} onClick={prove}>
            {busy ? 'Checking…' : 'Check my password'}
          </Button>
          <p className="text-xs text-muted mt-3">
            Forgotten the password too? Write to us at the address in the privacy policy, and
            we will send a reset link to your account&apos;s email.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm mb-3">That is you. Choose a new PIN of 4 to 8 digits.</p>
          <Field label="New PIN">
            <TextInput
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              aria-label="New PIN"
            />
          </Field>
          <Field label="The new PIN again">
            <TextInput
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={again}
              onChange={(e) => setAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              aria-label="The new PIN again"
            />
          </Field>
          {again.length >= 4 && pin !== again && (
            <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert">The two PINs are not the same.</p>
          )}
          <Button className="w-full" disabled={!validPin(pin) || pin !== again} onClick={save}>
            Save the new PIN
          </Button>
        </>
      )}
    </Modal>
  )
}
