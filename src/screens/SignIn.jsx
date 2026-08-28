import { useState } from 'react'
import { transport } from '../lib/sync/transport.js'
import { Button, Card, Field, TextInput, Banner } from '../components/ui.jsx'

/**
 * The parent account.
 *
 * Only shown when a sync backend is configured — without one there is nothing
 * to sign in to, and the app runs entirely on the device. A kid's phone never
 * sees this screen: it has no account and joins the parent's with a pairing code.
 */
export default function SignIn({ onDone, onBack }) {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!email.trim() || password.length < 8) return
    setBusy(true)
    setError('')
    try {
      const session =
        mode === 'signup'
          ? await transport.signUp(email.trim(), password)
          : await transport.signIn(email.trim(), password)

      if (!session?.access_token) {
        setError('Check your email for a confirmation link, then sign in.')
        setMode('signin')
        setBusy(false)
        return
      }
      onDone(session)
    } catch (err) {
      setError(err.message || 'That did not work. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="shell px-5 py-8 min-h-screen flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2" aria-hidden="true">🔐</div>
        <h1 className="font-display text-2xl font-extrabold">
          {mode === 'signup' ? 'Create your parent account' : 'Sign in'}
        </h1>
        <p className="text-sm text-muted mt-1">
          This is the account your kids' devices connect to.
        </p>
      </div>

      <Card>
        <Field label="Email">
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <TextInput
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}

        <Button className="w-full" disabled={busy || !email.trim() || password.length < 8} onClick={submit}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>

        <button
          type="button"
          className="w-full text-xs underline text-muted mt-3"
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError('') }}
        >
          {mode === 'signup' ? 'I already have an account' : 'I need to create an account'}
        </button>
      </Card>

      <div className="mt-4">
        <Banner tone="info" icon="🔒" title="This is a grown-up's account">
          Kids never make one. Their phone joins yours with a six-digit code, and you stay in
          control of it.
        </Banner>
      </div>

      <Button variant="ghost" className="w-full mt-4" onClick={onBack}>Back</Button>
    </div>
  )
}
