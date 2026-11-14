import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { navigate } from '../lib/router.js'
import { transport } from '../lib/sync/transport.js'
import {
  SCHOOL_PRICES, DISTRICT_DISCOUNTS, DISTRICT_MIN_SCHOOLS, DISTRICT_MAX_SCHOOLS, DISTRICT_INVITE_DAYS,
  SCHOOL_MIN_STUDENTS, districtPrice, dollars, monthLabel, schoolPrice,
} from '../lib/schools.js'
import {
  districts, districtError, demoDistrict, schoolCover, districtBillingNotice, asQuote, sendQuote, quoteError,
} from '../lib/districts.js'
import { QUOTE_LIMITS } from '../lib/quoteRules.js'
import { Screen, Card, Button, SectionTitle, Banner, Field, TextInput, TextArea, Modal, Chip, DemoTag, Tabs } from '../components/ui.jsx'
import { humanError } from '../lib/errors.js'
import { billingLive, billingError, sendDistrictInvoice, updateDistrictPlan, openDistrictBillingPortal, planDate } from '../lib/billing.js'

/**
 * RankUp for school districts: one plan, by invoice, for many schools.
 *
 * Reachable without a family, like the School League's own page: someone at
 * a district office sees what it is and what it costs first, then signs the
 * district up, adds its schools and sends each principal an invite. What the
 * district then sees is totals only (supabase/schools.sql, "School
 * districts"): never a child, and nothing for a school with too few students
 * taking part for a total to be anything but one family's number.
 */
export default function DistrictPortal() {
  const { state } = useApp()
  const demo = Boolean(state.demo)
  const [step, setStep] = useState('loading')
  const [district, setDistrict] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (demo) { setDistrict(demoDistrict().district); setStep('dashboard'); return }
    if (!transport.isConfigured() || !transport.currentUserId()) { setStep('landing'); return }
    const res = await districts.overview()
    if (!res.ok) { setError(districtError(res.reason)); setStep('landing'); return }
    if (!res.district) { setStep('register'); return }
    setDistrict(res.district)
    setStep('dashboard')
  }, [demo])

  useEffect(() => { load() }, [load])

  return (
    <Screen>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">RankUp for school districts</p>
          <h1 className="font-display text-2xl font-extrabold">
            {step === 'dashboard' && district ? district.name : step === 'quote' ? 'Get a quote' : 'One plan, all your schools'}
          </h1>
        </div>
        <button type="button" className="text-xs underline text-muted mt-1 shrink-0"
                onClick={() => (step === 'quote' ? setStep(district ? 'dashboard' : 'landing') : navigate('/school'))}>
          ← Back
        </button>
      </header>

      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {step === 'loading' && <Card><p className="text-sm text-muted">Loading…</p></Card>}
      {step === 'landing' && <Landing onStart={() => setStep('register')} onQuote={() => setStep('quote')} />}
      {step === 'register' && <Register onDone={load} onBack={() => setStep('landing')} />}
      {step === 'quote' && <QuoteForm districtName={district?.name || ''} />}
      {step === 'dashboard' && district && (
        <Dashboard district={district} demo={demo} onChange={load} onQuote={() => setStep('quote')} />
      )}
    </Screen>
  )
}

// ----------------------------------------------------------------- the ladder

/** "1st–9th school: 10% off each", from DISTRICT_DISCOUNTS. */
function ladderLines() {
  return DISTRICT_DISCOUNTS.map((step, i) => {
    const next = DISTRICT_DISCOUNTS[i + 1]
    const places = next ? `Schools ${step.from} to ${next.from - 1}` : `School ${step.from} and every one after`
    return { places, pct: step.pct }
  })
}

const BAND_LABELS = SCHOOL_PRICES.map((p, i) => ({
  band: p.band,
  label: p.label,
  range: i === 0 ? `up to ${p.upTo}` : i === SCHOOL_PRICES.length - 1
    ? `${(SCHOOL_PRICES[i - 1].upTo + 1).toLocaleString('en-US')}+` : `${SCHOOL_PRICES[i - 1].upTo + 1}–${p.upTo.toLocaleString('en-US')}`,
  // A typical size for the band, so the calculator can price "3 medium schools".
  sample: p.upTo,
}))

function QuoteLines({ quote }) {
  if (!quote?.ok) return null
  return (
    <div className="grid gap-1 text-sm" data-testid="district-quote">
      {quote.lines.map((l) => (
        <div key={`${l.band}-${l.pct}`} className="flex justify-between gap-2">
          <span>{l.quantity} × {l.label}, {l.pct}% off</span>
          <span className="font-semibold">{dollars(l.yearly_cents)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t border-line pt-1 mt-1">
        <span className="font-semibold">{quote.schools} schools, one year</span>
        <span className="font-display font-extrabold">{dollars(quote.yearly_cents)}</span>
      </div>
      <p className="text-xs text-muted">
        {dollars(quote.saving_cents)} less than {quote.schools} schools paying for themselves.
      </p>
    </div>
  )
}

function Landing({ onStart, onQuote }) {
  const [counts, setCounts] = useState({ small: '', medium: '4', large: '1', xl: '' })
  const sizes = BAND_LABELS.flatMap((b) => Array(Math.min(DISTRICT_MAX_SCHOOLS + 1, Math.max(0, Math.floor(Number(counts[b.band]) || 0)))).fill(b.sample))
  const price = districtPrice(sizes)
  const configured = transport.isConfigured()
  return (
    <>
      <Card className="mb-3">
        <p className="text-sm">
          Buy the School League for every school in your district at once. Each school gets its own
          league page and its own monthly score; you get one invoice a year and the
          <strong> district picture</strong>: how every school is taking part, in totals.
        </p>
      </Card>

      <SectionTitle>How it works</SectionTitle>
      <div className="grid gap-2 mb-3">
        {[
          ['🏛️', 'Sign the district up', 'Someone at the district office does it, in a minute.'],
          ['🏫', 'Add your schools', `Each principal gets an invite to run their school’s page. It lasts ${DISTRICT_INVITE_DAYS} days.`],
          ['📊', 'See the district picture', 'Students taking part, chores done and how many joined in, for each school and the district.'],
        ].map(([icon, title, body]) => (
          <Card flat key={title} className="flex gap-3 items-start">
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <span>
              <span className="block font-semibold text-sm">{title}</span>
              <span className="block text-xs text-muted">{body}</span>
            </span>
          </Card>
        ))}
      </div>

      <SectionTitle>Price: more schools, bigger discount</SectionTitle>
      <Card className="mb-3" data-testid="district-ladder">
        <p className="text-xs text-muted mb-2">
          Each school is priced by its size at the School League’s yearly price, then:
        </p>
        <div className="grid gap-1 mb-3">
          {ladderLines().map((l) => (
            <div key={l.pct} className="flex justify-between text-sm">
              <span>{l.places}</span>
              <span className="font-semibold">{l.pct}% off each</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mb-3">
          Biggest schools first. Adding a school never lowers your total, and the plan is for {DISTRICT_MIN_SCHOOLS} to {DISTRICT_MAX_SCHOOLS} schools.
        </p>
        <p className="text-sm font-semibold mb-2">Your schools</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {BAND_LABELS.map((b) => (
            <Field key={b.band} label={b.label} hint={`${b.range} students`}>
              <TextInput type="number" inputMode="numeric" min={0} max={DISTRICT_MAX_SCHOOLS} value={counts[b.band]}
                         onChange={(e) => setCounts((c) => ({ ...c, [b.band]: e.target.value }))} placeholder="0" />
            </Field>
          ))}
        </div>
        {price ? <QuoteLines quote={asQuote(price)} /> : (
          <p className="text-sm text-muted">
            {sizes.length > DISTRICT_MAX_SCHOOLS ? 'More than a plan here holds: get a quote below.' : `Add at least ${DISTRICT_MIN_SCHOOLS} schools to see the price.`}
          </p>
        )}
      </Card>

      <Card flat className="mb-3">
        <p className="text-sm font-semibold mb-1">Safe by design</p>
        <p className="text-xs text-muted">
          The district sees totals for each school and for the district. Never a child’s name, never one
          child’s numbers, nothing anyone typed. A school with fewer than {SCHOOL_MIN_STUDENTS} students
          taking part shows no numbers at all. Each school keeps its own privacy rules, and we check every
          school is real before it joins a league.
        </p>
      </Card>

      {!configured && (
        <Banner tone="info" icon="🕒" title="Opening soon" className="mb-3">
          District plans open when RankUp launches. The prices above are what you will pay.
        </Banner>
      )}
      <Button className="w-full" disabled={!configured} onClick={onStart}>Set up your district</Button>
      <Button variant="soft" className="w-full mt-2" onClick={onQuote}>
        More than {DISTRICT_MAX_SCHOOLS} schools, or another way to pay? Get a quote
      </Button>
    </>
  )
}

// ---------------------------------------------------------------- register

function Register({ onDone, onBack }) {
  const signedIn = Boolean(transport.currentUserId())
  const [form, setForm] = useState({ name: '', yourName: '' })
  const [account, setAccount] = useState({ email: '', password: '' })
  const [haveAccount, setHaveAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const accountReady = signedIn || (account.email.trim() && account.password.length >= 8)

  const submit = async () => {
    setBusy(true)
    setError('')
    if (!transport.currentUserId()) {
      try {
        const email = account.email.trim()
        const session = haveAccount ? await transport.signIn(email, account.password) : await transport.signUp(email, account.password)
        if (!session?.access_token) {
          setHaveAccount(true)
          setError('Check your email for a confirmation link, then tap the button again. Everything here is kept.')
          setBusy(false)
          return
        }
      } catch (err) {
        setError(humanError(err, 'That did not work. Please try again.'))
        setBusy(false)
        return
      }
    }
    const res = await districts.register(form)
    setBusy(false)
    if (!res.ok) { setError(districtError(res.reason)); return }
    onDone()
  }

  return (
    <Card>
      {!signedIn && (
        <div data-testid="district-account">
          <p className="text-xs text-muted mb-2">
            {haveAccount ? 'Sign in with your district account.' : 'Your account: use your work email.'}
          </p>
          <Field label="Email">
            <TextInput type="email" inputMode="email" autoComplete="email" value={account.email}
                       onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))} placeholder="you@yourdistrict.org" />
          </Field>
          <Field label="Password" hint={haveAccount ? null : 'At least 8 characters.'}>
            <TextInput type="password" autoComplete={haveAccount ? 'current-password' : 'new-password'} value={account.password}
                       onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))} />
          </Field>
          <button type="button" className="text-xs underline text-muted mb-3" onClick={() => { setHaveAccount((h) => !h); setError('') }}>
            {haveAccount ? 'I need to create an account' : 'I already have an account'}
          </button>
        </div>
      )}
      <Field label="Your name" hint="As your schools will see it, e.g. Dr Ames.">
        <TextInput value={form.yourName} onChange={(e) => setForm((f) => ({ ...f, yourName: e.target.value }))} maxLength={60} />
      </Field>
      <Field label="District name" hint="Schools you add play in this district’s league.">
        <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={80} />
      </Field>
      {error && <p className="text-sm mb-3 text-bad" role="alert">{error}</p>}
      <Button className="w-full" disabled={busy || !accountReady} onClick={submit}>
        {busy ? 'Working…' : 'Sign the district up'}
      </Button>
      <button type="button" className="w-full text-xs underline text-muted mt-3" onClick={onBack}>Back</button>
    </Card>
  )
}

// --------------------------------------------------------------- dashboard

function Numbers({ month, min }) {
  if (!month?.shown) {
    return (
      <p className="text-xs text-muted">
        {month?.students || 0} taking part. Numbers show once {min} or more students take part.
      </p>
    )
  }
  const share = month.students ? Math.round((month.active / month.students) * 100) : 0
  return (
    <div className="grid grid-cols-4 gap-1 text-center">
      {[[month.students, 'taking part'], [`${share}%`, 'did a chore'], [month.chores, 'chores'], [month.score, 'average']].map(([v, l]) => (
        <div key={l} className="card-flat py-1">
          <div className="font-display font-extrabold text-sm">{v}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted">{l}</div>
        </div>
      ))}
    </div>
  )
}

function Totals({ district }) {
  const [which, setWhich] = useState('this')
  const t = which === 'this' ? district.totals : district.last_totals
  const label = monthLabel(which === 'this' ? district.month : district.last_month)
  const share = t.students ? Math.round((t.active / t.students) * 100) : 0
  return (
    <Card className="mb-3" data-testid="district-totals">
      <SectionTitle>The district picture</SectionTitle>
      <Tabs tabs={[{ id: 'this', label: 'This month' }, { id: 'last', label: 'Last month' }]} value={which} onChange={setWhich} />
      <div className="grid grid-cols-2 gap-2 mb-2">
        {[
          [t.schools, 'schools'],
          [t.students, 'students taking part'],
          [`${share}%`, 'did a chore'],
          [t.chores, 'chores done'],
        ].map(([v, l]) => (
          <div key={l} className="card-flat px-3 py-2">
            <div className="font-display font-extrabold text-lg">{v}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted">{l}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        {label}. Totals only, never a child. {t.shown < t.schools
          ? `${t.schools - t.shown} of your schools ${t.schools - t.shown === 1 ? 'has' : 'have'} fewer than ${district.min_students} students taking part, so ${t.schools - t.shown === 1 ? 'it is' : 'they are'} left out of these numbers.`
          : 'Every school is counted.'}
      </p>
    </Card>
  )
}

function Dashboard({ district, demo, onChange, onQuote }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(null)
  const [form, setForm] = useState({ name: '', city: '', students: '' })
  const [invoiceTo, setInvoiceTo] = useState('')
  const [month, setMonth] = useState('this')

  const act = async (fn, done) => {
    if (demo) { setNotice('This is a sample district, so nothing changes. A real one would.'); return null }
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(districtError(res.reason)); return null }
    setError('')
    if (done) setNotice(done)
    onChange()
    return res
  }

  const pay = async (start, done) => {
    if (demo) { setNotice('This is a sample district, so nothing is invoiced. A real one gets its invoice from Stripe by email.'); return }
    setBusy(true)
    const res = await start()
    setBusy(false)
    if (!res.ok) { setError(billingError(res.reason === 'already_paying' ? 'district_already_paying' : res.reason)); return }
    setError('')
    if (done) setNotice(done(res))
    onChange()
  }

  const addSchool = async () => {
    if (demo) { setAdding(false); setAdded({ name: form.name || 'Your new school', invite: 'SAMPLE7KQ2' }); return }
    const res = await act(() => districts.addSchool(form))
    if (res) {
      setAdding(false)
      setAdded({ name: form.name, invite: res.invite })
      setForm({ name: '', city: '', students: '' })
    }
  }

  const quote = district.quote
  const uncovered = district.schools.filter((s) => !s.covered && s.status !== 'suspended').length
  const notice2 = districtBillingNotice(district)
  const live = demo || billingLive()

  return (
    <>
      {demo && (
        <Banner tone="info" icon="👀" title="A sample district" className="mb-3">
          This is what a district office sees. None of these schools is real.
        </Banner>
      )}
      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {notice && <Banner tone="good" icon="✅" title="Done" className="mb-3">{notice}</Banner>}

      <p className="text-sm text-muted mb-3">
        Run by {district.you}. {district.status === 'active'
          ? <Chip className="text-good border-good">Plan active</Chip>
          : district.status === 'lapsed' ? <Chip className="text-warn border-warn">Plan ended</Chip>
            : <Chip>No plan yet</Chip>}
      </p>

      <Totals district={district} />

      <SectionTitle
        action={(
          <button type="button" className="text-xs underline text-muted" onClick={() => setMonth((m) => (m === 'this' ? 'last' : 'this'))}>
            {month === 'this' ? 'Show last month' : 'Show this month'}
          </button>
        )}
      >
        Your schools ({district.schools.length})
      </SectionTitle>
      {district.schools.length === 0 && (
        <Card flat className="mb-3"><p className="text-sm text-muted">No schools yet. Add your first below.</p></Card>
      )}
      <div className="grid gap-2 mb-3" data-testid="district-schools">
        {district.schools.map((s) => {
          const cover = schoolCover(s)
          return (
            <Card flat key={s.ref} className="grid gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.city ? `${s.city} · ` : ''}{schoolPrice(s.student_count)?.label || s.size_band} · {s.verified ? 'checked' : 'being checked'}
                  </p>
                </div>
                <Chip className={cover.tone === 'var(--good)' ? 'text-good border-good shrink-0' : cover.tone === 'var(--warn)' ? 'text-warn border-warn shrink-0' : 'shrink-0'}>
                  {cover.label}
                </Chip>
              </div>
              <Numbers month={month === 'this' ? s.this_month : s.last_month} min={district.min_students} />
              {s.has_admin ? (
                <p className="text-xs text-muted">Principal signed up · {s.staff} staff</p>
              ) : s.invite ? (
                <p className="text-xs">
                  Invite for the principal: <span className="font-mono font-bold tracking-widest">{s.invite}</span>
                  <span className="text-muted"> · until {planDate(s.invite_expires_at)}</span>
                </p>
              ) : (
                <button type="button" className="text-xs underline text-left" disabled={busy}
                        onClick={() => act(() => districts.newInvite(s.ref), `A new invite for ${s.name} is on its card.`)}>
                  The invite ran out. Make a new one
                </button>
              )}
              <button type="button" className="text-xs underline text-muted text-left" disabled={busy}
                      onClick={() => {
                        if (demo || window.confirm(`Take ${s.name} out of the district? It carries on by itself, on its own plan, its trial or the free level.`)) {
                          act(() => districts.removeSchool(s.ref), `${s.name} is no longer part of the district.`)
                        }
                      }}>
                Take out of the district
              </button>
            </Card>
          )
        })}
      </div>
      <Button className="w-full mb-3" disabled={busy || district.schools.length >= district.max_schools}
              onClick={() => setAdding(true)}>
        Add a school
      </Button>

      <Card flat className="mb-3">
        <SectionTitle>A school already on RankUp?</SectionTitle>
        <p className="text-xs text-muted mb-1">Its admin types this code on the school’s page, under Plan, to join your district.</p>
        <p className="font-mono text-xl font-bold tracking-[0.25em] text-center py-1" data-testid="district-code">{district.link_code}</p>
        <button type="button" className="w-full text-xs underline text-muted mt-1" disabled={busy}
                onClick={() => act(() => districts.rotateCode(), 'New code made. The old one no longer works.')}>
          The code got out? Make a new one
        </button>
      </Card>

      <Card className="mb-3" data-testid="district-plan">
        <SectionTitle>Plan</SectionTitle>
        {notice2 && <Banner tone={notice2.tone} icon={notice2.icon} title={notice2.title} className="mb-2">{notice2.body}</Banner>}
        {quote?.ok ? <QuoteLines quote={quote} /> : (
          <p className="text-sm text-muted">
            {quote?.reason === 'too_many_schools'
              ? `More than ${district.max_schools} schools: get a quote and we will set your plan up with you.`
              : `Add at least ${district.min_schools} schools to see your price.`}
          </p>
        )}
        {district.paying && district.billing_period_end && !district.billing_ends_at && (
          <p className="text-xs text-muted mt-2">Renews on {planDate(district.billing_period_end)}, with a new invoice.</p>
        )}
        {live && quote?.ok && !district.paying && (
          <div className="mt-3">
            <Field label="Send the invoice to" hint="Your finance team’s email, or yours.">
              <TextInput type="email" inputMode="email" value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)}
                         placeholder="accounts@yourdistrict.org" />
            </Field>
            <Button className="w-full" disabled={busy || (!demo && !invoiceTo.trim())}
                    onClick={() => pay(() => sendDistrictInvoice(invoiceTo), (r) => `Stripe is emailing the invoice to ${r.sent_to}. Your schools are covered from today.`)}>
              Send me the invoice for {dollars(quote.yearly_cents)}
            </Button>
            <p className="text-xs text-muted mt-2">
              One invoice a year, paid by card or bank transfer by the date on it. It renews each year with a new invoice.
            </p>
          </div>
        )}
        {live && district.paying && (
          <div className="grid gap-2 mt-3">
            {uncovered > 0 && quote?.ok && (
              <Button disabled={busy}
                      onClick={() => pay(() => updateDistrictPlan(), () => 'Your plan now covers every school. Stripe sends an invoice for the rest of the year.')}>
                Update the plan to cover {uncovered} more {uncovered === 1 ? 'school' : 'schools'}
              </Button>
            )}
            <Button variant="soft" disabled={busy} onClick={() => pay(() => openDistrictBillingPortal())}>
              Invoices and cancelling
            </Button>
          </div>
        )}
        <p className="text-xs text-muted mt-3">
          If the district stops paying, each school goes back to its own plan, its free trial or the free
          level. Nothing is deleted, and every school keeps its points.
        </p>
      </Card>

      <button type="button" className="w-full text-sm underline text-muted mb-3" onClick={onQuote}>
        More schools, or another way to pay? Get a quote
      </button>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a school"
        footer={(
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setAdding(false)}>Cancel</Button>
            <Button className="flex-1" disabled={busy || form.name.trim().length < 2 || !schoolPrice(form.students)} onClick={addSchool}>
              Add it
            </Button>
          </>
        )}
      >
        <Field label="School name"><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={80} /></Field>
        <Field label="Town or city" hint="Optional. It helps us check the school is real.">
          <TextInput value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} maxLength={60} />
        </Field>
        <Field label="Number of students" hint="The whole school, not just the ones who will join.">
          <TextInput type="number" inputMode="numeric" min={1} max={20000} value={form.students}
                     onChange={(e) => setForm((f) => ({ ...f, students: e.target.value }))} />
        </Field>
        {schoolPrice(form.students) && <p className="text-sm">{schoolPrice(form.students).label}.</p>}
      </Modal>

      <Modal
        open={Boolean(added)}
        onClose={() => setAdded(null)}
        title={`${added?.name || 'The school'} is added`}
        footer={<Button className="flex-1" onClick={() => setAdded(null)}>Done</Button>}
      >
        <p className="text-sm mb-2">Give this invite to the school’s principal:</p>
        <p className="font-mono text-2xl font-bold tracking-[0.25em] text-center py-2" data-testid="district-invite">{added?.invite}</p>
        <p className="text-xs text-muted">
          They open RankUp’s page for schools, choose “I have a code” and type it. They become the school’s
          admin and send parents their own code. It works once, for {DISTRICT_INVITE_DAYS} days. It is on the
          school’s card until it is used.
        </p>
        {demo && <p className="text-xs text-muted mt-2"><DemoTag /> A sample invite.</p>}
      </Modal>
    </>
  )
}

// ------------------------------------------------------------------- quote

function QuoteForm({ districtName }) {
  const [form, setForm] = useState({ district: districtName, name: '', role: '', email: '', schools: '', students: '', message: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const configured = transport.isConfigured()

  const submit = async () => {
    setBusy(true)
    setError('')
    const res = await sendQuote(form)
    setBusy(false)
    if (res.ok) { setSent(true); return }
    if (res.reason === 'invalid') { setErrors(res.errors); return }
    setErrors({})
    setError(quoteError(res.reason))
  }

  if (sent) {
    return (
      <Card data-testid="quote-sent">
        <p className="font-semibold mb-1">Thank you. Your request is on its way.</p>
        <p className="text-sm text-muted">A person reads it and replies to {form.email.trim()}. Nothing you typed is kept on this site.</p>
      </Card>
    )
  }

  const hint = (k, fallback) => (errors[k] ? <span className="text-bad">{errors[k]}</span> : fallback)
  return (
    <Card data-testid="quote-form">
      <p className="text-sm mb-3">
        For a district with more schools than a plan here holds, or one that needs to pay another way.
        Tell us a little and a person will reply by email.
      </p>
      <Field label="District" hint={hint('district')}><TextInput value={form.district} onChange={set('district')} maxLength={QUOTE_LIMITS.district} /></Field>
      <Field label="Your name" hint={hint('name')}><TextInput value={form.name} onChange={set('name')} maxLength={QUOTE_LIMITS.name} /></Field>
      <Field label="Your role" hint={hint('role', 'Optional.')}><TextInput value={form.role} onChange={set('role')} maxLength={QUOTE_LIMITS.role} /></Field>
      <Field label="Work email" hint={hint('email', 'We reply here.')}>
        <TextInput type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} maxLength={QUOTE_LIMITS.email} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Schools" hint={hint('schools')}>
          <TextInput type="number" inputMode="numeric" min={1} value={form.schools} onChange={set('schools')} />
        </Field>
        <Field label="Students, about" hint={hint('students', 'Optional.')}>
          <TextInput type="number" inputMode="numeric" min={0} value={form.students} onChange={set('students')} />
        </Field>
      </div>
      <Field label="Anything else" hint={hint('message', `Optional. ${QUOTE_LIMITS.message} characters at most.`)}>
        <TextArea rows={3} value={form.message} onChange={set('message')} maxLength={QUOTE_LIMITS.message} />
      </Field>
      {error && <p className="text-sm mb-3 text-bad" role="alert">{error}</p>}
      <Button className="w-full" disabled={busy || !configured} onClick={submit}>{busy ? 'Sending…' : 'Send the request'}</Button>
      <p className="text-xs text-muted mt-2">
        {configured ? 'What you type goes to us by email and is not kept on this site.' : 'Quotes open when RankUp launches.'}
      </p>
    </Card>
  )
}
