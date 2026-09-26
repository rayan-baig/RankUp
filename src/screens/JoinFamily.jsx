import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { adults, adultError, normalizeCode } from '../lib/coparents.js'
import { Button, Card, Field, TextInput, Banner } from '../components/ui.jsx'
import { Wordmark } from '../components/Logo.jsx'
import { navigate } from '../lib/router.js'

/**
 * The second parent's way in.
 *
 * Short on purpose. Everything about this family already exists — the
 * children, the chores, the consent on file — and the sync layer fetches all
 * of it the moment they are through. The only things genuinely needed here are
 * who they are and a PIN for their own phone.
 *
 * The PIN is per device, not shared. Two parents in two houses wanting the
 * same four digits would be a strange thing to insist on, and a PIN that
 * travels between phones is a PIN a child overhears once and has forever.
 */
export default function JoinFamily({ onBack }) {
  const { dispatch } = useApp()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = name.trim() && code.length === 6 && pin.length >= 4

  const join = async () => {
    setBusy(true)
    setError('')
    const res = await adults.join(code, name)
    setBusy(false)
    if (!res?.ok) { setError(adultError(res?.reason)); return }
    dispatch({
      type: 'JOIN_FAMILY',
      familyId: res.family_id,
      familyName: res.family_name,
      parentName: name.trim(),
      pin,
    })
    navigate('/parent')
  }

  return (
    <div className="shell px-4 py-6 min-h-screen flex flex-col">
      <div className="text-center mb-6">
        <Wordmark size={48} />
      </div>

      <h1 className="font-display text-2xl font-extrabold mb-1">Join your family</h1>
      <p className="text-muted text-sm mb-4">
        The other grown-up has a six-character code in their Settings, under
        Grown-ups.
      </p>

      <Field label="Your name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          autoFocus
        />
      </Field>

      <Field label="Invitation code">
        <TextInput
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="HJ4K2P"
          aria-label="Invitation code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="field tracking-[0.2em] uppercase"
        />
      </Field>

      <Field label="Parent PIN" hint="4+ digits, for this phone. It does not have to match theirs.">
        <TextInput
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          placeholder="••••"
        />
      </Field>

      {error && (
        <Banner tone="bad" icon="⚠️" title="That did not work" className="mb-3">
          {error}
        </Banner>
      )}

      <Card className="text-sm text-muted">
        You will see the same children, chores and photos they do, and you can
        approve anything they can. Nothing about their phone changes.
      </Card>

      <div className="flex-1" />
      <div className="flex gap-2 pt-4">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button className="flex-1" disabled={!ready || busy} onClick={join}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
      </div>
    </div>
  )
}
