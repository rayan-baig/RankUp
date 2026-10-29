import { useCallback, useEffect, useState } from 'react'
import { Screen, Card, Button, SectionTitle, Banner, Field, TextInput, Chip } from '../components/ui.jsx'
import { districtLabel } from '../lib/schools.js'

/**
 * The operator's page for checking schools are real.
 *
 * Not linked from anywhere in the app: whoever runs RankUp opens /#/operator
 * and types the OPERATOR_SECRET. The key is kept for this browser tab only
 * (sessionStorage), so closing the tab signs out. Every decision is made by
 * api/operator-schools.js, which checks the key on each request; this page
 * only shows what it returns.
 */

const OPERATOR_URL = import.meta.env?.VITE_OPERATOR_URL || '/api/operator-schools'
const KEY = 'rankup.operator'

function readKey() {
  try { return sessionStorage.getItem(KEY) || '' } catch { return '' }
}

async function call(key, body) {
  try {
    const res = await fetch(OPERATOR_URL, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, status: res.status, error: data.error }
    return data
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

const STATUS_TONE = { trial: 'var(--accent)', active: 'var(--good)', lapsed: 'var(--warn)', suspended: 'var(--bad)' }

export default function OperatorSchools() {
  const [key, setKey] = useState(readKey)
  const [typed, setTyped] = useState('')
  const [schools, setSchools] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async (k) => {
    const res = await call(k)
    if (!res.ok) {
      if (res.status === 401) {
        try { sessionStorage.removeItem(KEY) } catch { /* private window */ }
        setKey('')
        setError('That key is not right.')
      } else {
        setError(res.error === 'not_configured' ? 'OPERATOR_SECRET is not set on the server.' : 'Could not load the schools.')
      }
      return
    }
    setError('')
    setSchools(res.schools || [])
  }, [])

  useEffect(() => { if (key) load(key) }, [key, load])

  const signIn = () => {
    try { sessionStorage.setItem(KEY, typed) } catch { /* private window: kept in memory only */ }
    setKey(typed)
    setTyped('')
  }

  const act = async (school, action) => {
    setBusy(school.id + action)
    const res = await call(key, { action, school_id: school.id })
    setBusy('')
    if (!res.ok) { setError(`Could not ${action} ${school.name}.`); return }
    setError('')
    setSchools(res.schools || [])
  }

  if (!key) {
    return (
      <Screen>
        <header className="mb-3">
          <p className="text-xs uppercase tracking-widest text-muted">RankUp operator</p>
          <h1 className="font-display text-2xl font-extrabold">Check schools</h1>
        </header>
        {error && <Banner tone="warn" icon="⚠️" title="Not signed in" className="mb-3">{error}</Banner>}
        <Card>
          <Field label="Operator key" hint="The OPERATOR_SECRET from your server settings. Kept for this tab only.">
            <TextInput type="password" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
                       onKeyDown={(e) => { if (e.key === 'Enter' && typed) signIn() }} />
          </Field>
          <Button className="w-full" disabled={!typed} onClick={signIn}>Open</Button>
        </Card>
      </Screen>
    )
  }

  const waiting = (schools || []).filter((s) => !s.verified && s.status !== 'suspended')
  const rest = (schools || []).filter((s) => s.verified || s.status === 'suspended')

  const row = (s) => (
    <Card key={s.id} className="mb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm">{s.name}</p>
          <p className="text-xs text-muted">
            {[s.city, districtLabel(s.district)].filter(Boolean).join(' · ')} · {s.student_count} students ({s.size_band})
          </p>
        </div>
        <Chip tone={STATUS_TONE[s.status]}>{s.status}{s.paying ? ' · paying' : ''}</Chip>
      </div>
      <div className="mt-2 text-xs">
        {(s.staff || []).map((st) => (
          <div key={`${st.email}-${st.role}`} className="flex justify-between gap-2">
            <span className="truncate">{st.name} · {st.role}</span>
            <span className="text-muted truncate">{st.email || 'no email'}</span>
          </div>
        ))}
        <p className="text-muted mt-1">
          Signed up {new Date(s.created_at).toLocaleDateString()} · {s.students_joined} {s.students_joined === 1 ? 'child' : 'children'} joined
        </p>
      </div>
      <div className="flex gap-2 mt-3">
        {!s.verified && s.status !== 'suspended' && (
          <Button className="flex-1 py-2 min-h-0 text-sm" disabled={Boolean(busy)} onClick={() => act(s, 'verify')}>
            It is real: verify
          </Button>
        )}
        {s.verified && (
          <Button variant="ghost" className="flex-1 py-2 min-h-0 text-sm" disabled={Boolean(busy)} onClick={() => act(s, 'unverify')}>
            Un-verify
          </Button>
        )}
        {s.status === 'suspended' ? (
          <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" disabled={Boolean(busy)} onClick={() => act(s, 'unsuspend')}>
            Lift suspension
          </Button>
        ) : (
          <Button variant="danger" className="flex-1 py-2 min-h-0 text-sm" disabled={Boolean(busy)} onClick={() => act(s, 'suspend')}>
            Suspend
          </Button>
        )}
      </div>
    </Card>
  )

  return (
    <Screen>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">RankUp operator</p>
          <h1 className="font-display text-2xl font-extrabold">Check schools</h1>
        </div>
        <button type="button" className="text-xs underline text-muted mt-1"
                onClick={() => { try { sessionStorage.removeItem(KEY) } catch { /* fine */ } setKey(''); setSchools(null) }}>
          Sign out
        </button>
      </header>
      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {!schools && !error && <Card><p className="text-sm text-muted">Loading…</p></Card>}

      {schools && (
        <>
          <Card flat className="mb-3">
            <p className="text-xs text-muted">
              Before verifying, check the school exists and that the person works there: a school email
              address, the school’s website, or a call to its office. A verified school is ranked, can
              challenge rivals, and sees the first names parents agreed to share.
            </p>
          </Card>
          <SectionTitle>Waiting to be checked ({waiting.length})</SectionTitle>
          {waiting.length === 0 && <p className="text-sm text-muted mb-3">Nothing waiting.</p>}
          {waiting.map(row)}
          <SectionTitle>Checked or suspended ({rest.length})</SectionTitle>
          {rest.map(row)}
        </>
      )}
    </Screen>
  )
}
