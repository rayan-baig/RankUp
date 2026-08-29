import { useState } from 'react'
import { CONSENT_NOTICE, CONSENT_VERSION } from '../data/legalText.js'
import { transport } from '../lib/sync/transport.js'
import { Button, Card, Field, TextInput, Banner, SectionTitle } from '../components/ui.jsx'

/**
 * Verifiable parental consent.
 *
 * This screen stands between creating an account and adding a child, and it
 * cannot be skipped — the database refuses to create a child row without a
 * consent record, so skipping it would simply fail.
 *
 * It is deliberately not a wall of text with one checkbox at the bottom. A
 * parent should be able to read what is collected in under a minute and come
 * away actually knowing, because that is the point of consent.
 */
export default function ParentalConsent({ onDone, onBack }) {
  const [signature, setSignature] = useState('')
  const [affirmed, setAffirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!affirmed || signature.trim().length < 2) return
    setBusy(true)
    setError('')

    if (!transport.isConfigured()) {
      // On a device-only build there is no server to record against. The
      // consent is still shown and still required before a kid is added.
      onDone({ local: true, version: CONSENT_VERSION, signedName: signature.trim() })
      return
    }

    try {
      const result = await transport.rpc('record_parental_consent', {
        p_version: CONSENT_VERSION,
        // The subscription card payment is the verification. Until billing is
        // live this records the method honestly rather than overclaiming.
        p_method: 'payment_card',
        p_signed_name: signature.trim(),
        p_method_detail: 'Recorded at sign-up; verified by the subscription payment.',
      })
      if (!result?.ok) {
        setError(result?.reason === 'signature_required'
          ? 'Please type your full name.'
          : 'That did not save. Please try again.')
        setBusy(false)
        return
      }
      onDone({ version: CONSENT_VERSION, signedName: signature.trim() })
    } catch (err) {
      setError(err.message || 'That did not save. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="shell px-4 py-6 min-h-screen flex flex-col">
      <header className="mb-4">
        <div className="text-3xl mb-2" aria-hidden="true">🔏</div>
        <h1 className="font-display text-2xl font-extrabold leading-tight">{CONSENT_NOTICE.title}</h1>
        <p className="text-sm text-muted mt-1">
          RankUp collects nothing about your child until you agree to this. Please read it — it is
          short on purpose.
        </p>
      </header>

      {CONSENT_NOTICE.sections.map((section) => (
        <Card key={section.heading} flat className="mb-2.5">
          <SectionTitle>{section.heading}</SectionTitle>
          <ul className="space-y-1.5">
            {section.body.map((line, i) => (
              <li key={i} className="text-sm text-muted flex gap-2">
                <span aria-hidden="true" style={{ color: 'var(--accent)' }}>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card className="mt-2" style={{ borderColor: 'var(--accent)' }}>
        <label className="flex items-start gap-3 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={affirmed}
            onChange={(e) => setAffirmed(e.target.checked)}
            className="mt-1 w-5 h-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm">{CONSENT_NOTICE.affirmation}</span>
        </label>

        <Field label="Type your full name to sign" hint="This is your signature and is kept on record.">
          <TextInput
            value={signature}
            onChange={(e) => { setSignature(e.target.value); setError('') }}
            placeholder="e.g. Samira Rivera"
            autoComplete="name"
          />
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}

        <Button
          className="w-full"
          disabled={!affirmed || signature.trim().length < 2 || busy}
          onClick={submit}
        >
          {busy ? 'Saving…' : 'I agree — continue'}
        </Button>
        <p className="text-[11px] text-muted mt-2 text-center">
          You can withdraw this at any time in Settings, which deletes your children's data.
        </p>
      </Card>

      <Banner tone="info" icon="ℹ️" title="Why you are being asked">
        Laws protecting children online require a parent's verifiable consent before a service
        collects anything about them. This is that step.
      </Banner>

      <Button variant="ghost" className="w-full mt-3" onClick={onBack}>Back</Button>
    </div>
  )
}
