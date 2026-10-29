import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { navigate } from '../lib/router.js'
import { transport } from '../lib/sync/transport.js'
import {
  schools, schoolError, schoolPrice, dollars, monthLabel,
  SCHOOL_PRICES, SCHOOL_TRIAL_DAYS, demoOverview, DEMO_LEAGUE,
} from '../lib/schools.js'
import { Screen, Card, Button, SectionTitle, Banner, Field, TextInput, Modal, Chip, DemoTag } from '../components/ui.jsx'
import { SchoolHeadline, LeagueTable, RivalryList, StarList } from '../components/SchoolParts.jsx'
import SignIn from './SignIn.jsx'
import { billingLive, billingError, startSchoolCheckout, openSchoolBillingPortal } from '../lib/billing.js'

/**
 * The School League, for a school.
 *
 * Reachable without a family: a principal following a link should see what
 * it is and what it costs before anything else, and should never be walked
 * through setting up a household. From here they make an account, sign the
 * school up and hand parents a code. A second teacher joins with the staff
 * code instead.
 */
export default function SchoolPortal() {
  const { state } = useApp()
  const demo = Boolean(state.demo)
  const [step, setStep] = useState('loading')
  const [school, setSchool] = useState(null)
  const [league, setLeague] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (demo) {
      setSchool(demoOverview().school)
      setLeague(DEMO_LEAGUE)
      setStep('dashboard')
      return
    }
    if (!transport.isConfigured() || !transport.currentUserId()) { setStep('landing'); return }
    const res = await schools.overview()
    if (!res.ok) { setError(schoolError(res.reason)); setStep('landing'); return }
    if (!res.school) { setStep('register'); return }
    setSchool(res.school)
    setStep('dashboard')
    const l = await schools.league()
    if (l.ok) setLeague(l)
  }, [demo])

  useEffect(() => { load() }, [load])

  if (step === 'account') {
    return <SignIn who="school" onDone={() => { setStep('loading'); load() }} onBack={() => setStep('landing')} />
  }

  return (
    <Screen>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">RankUp for schools</p>
          <h1 className="font-display text-2xl font-extrabold">The School League</h1>
        </div>
        <button type="button" className="text-xs underline text-muted mt-1 shrink-0"
                onClick={() => navigate(state.onboarded ? (demo ? '/parent' : '/switch') : '/welcome')}>
          ← Back
        </button>
      </header>

      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {step === 'loading' && <Card><p className="text-sm text-muted">Loading…</p></Card>}
      {step === 'landing' && <Landing onStart={() => setStep(transport.currentUserId() ? 'register' : 'account')} />}
      {step === 'register' && <Register onDone={load} />}
      {step === 'dashboard' && school && (
        <Dashboard school={school} league={league} demo={demo} onChange={load} />
      )}
    </Screen>
  )
}

// ----------------------------------------------------------------- landing

function Landing({ onStart }) {
  const [students, setStudents] = useState('')
  const quote = schoolPrice(students)
  return (
    <>
      <Card className="mb-3">
        <p className="text-sm">
          Students earn points for their school by doing their chores at home. Each month the
          best school in the district is crowned <strong>District Champion</strong>, schools
          take on their <strong>rivals</strong> head to head, and each school’s top ten are its
          <strong> School Stars</strong>.
        </p>
      </Card>

      <SectionTitle>How it works</SectionTitle>
      <div className="grid gap-2 mb-3">
        {[
          ['📝', 'Sign your school up', `A principal or teacher does it in two minutes. ${SCHOOL_TRIAL_DAYS} days free.`],
          ['🔑', 'Send parents the code', 'Parents add their own children. The school never adds anyone.'],
          ['🏆', 'Compete every month', 'Points are averaged per student, so small schools can beat big ones.'],
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

      <SectionTitle>Price, by school size</SectionTitle>
      <Card className="mb-3">
        <Field label="How many students?" hint="Your whole school, not just the ones who will join.">
          <TextInput type="number" inputMode="numeric" min={1} max={20000} value={students}
                     onChange={(e) => setStudents(e.target.value)} placeholder="e.g. 420" />
        </Field>
        {quote ? (
          <p className="text-sm">
            <strong>{quote.label}</strong>: {dollars(quote.monthlyCents)} a month, or{' '}
            {dollars(quote.yearlyCents)} a year (two months free). First {quote.trialDays} days free.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {SCHOOL_PRICES.map((p, i) => (
              <div key={p.band} className="card-flat p-2 text-center">
                <div className="font-display font-extrabold">{dollars(p.monthlyCents)}<span className="text-xs text-muted">/mo</span></div>
                <div className="text-[11px] text-muted">
                  {i === 0 ? `Up to ${p.upTo}` : i === SCHOOL_PRICES.length - 1
                    ? `${SCHOOL_PRICES[i - 1].upTo + 1}+` : `${SCHOOL_PRICES[i - 1].upTo + 1}–${p.upTo}`} students
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card flat className="mb-3">
        <p className="text-sm font-semibold mb-1">Safe by design</p>
        <p className="text-xs text-muted">
          A school sees how many students joined and its top ten each month, with a first name
          only where a parent agreed. No lists of children, no chores, no photos, no messages.
          We check every school is real before it joins a league.
        </p>
      </Card>

      {!transport.isConfigured() && (
        <Banner tone="info" icon="🕒" title="Opening soon" className="mb-3">
          School sign-up opens when RankUp launches. Prices above are what you will pay.
        </Banner>
      )}
      <Button className="w-full" disabled={!transport.isConfigured()} onClick={onStart}>
        Sign your school up
      </Button>
    </>
  )
}

// ---------------------------------------------------------------- register

function Register({ onDone }) {
  const [form, setForm] = useState({ name: '', district: '', city: '', students: '', yourName: '' })
  const [staffCode, setStaffCode] = useState('')
  const [asStaff, setAsStaff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const quote = schoolPrice(form.students)

  const submit = async () => {
    setBusy(true)
    const res = asStaff ? await schools.joinStaff(staffCode, form.yourName) : await schools.register(form)
    setBusy(false)
    if (!res.ok) { setError(schoolError(res.reason)); return }
    onDone()
  }

  return (
    <Card>
      <div className="flex gap-1 p-1 card-flat mb-3" role="tablist">
        {[[false, 'New school'], [true, 'I have a staff code']].map(([v, label]) => (
          <button key={label} type="button" role="tab" aria-selected={asStaff === v}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: asStaff === v ? 'var(--accent)' : 'transparent', color: asStaff === v ? 'var(--on-accent, #fff)' : 'inherit' }}
                  onClick={() => { setAsStaff(v); setError('') }}>
            {label}
          </button>
        ))}
      </div>

      <Field label="Your name" hint="As parents and other staff will see it, e.g. Ms Lane.">
        <TextInput value={form.yourName} onChange={set('yourName')} maxLength={60} />
      </Field>

      {asStaff ? (
        <Field label="Staff code" hint="Your school’s admin can find it on their page.">
          <TextInput value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} maxLength={8}
                     style={{ letterSpacing: '0.25em', textTransform: 'uppercase' }} />
        </Field>
      ) : (
        <>
          <Field label="School name"><TextInput value={form.name} onChange={set('name')} maxLength={80} /></Field>
          <Field label="School district" hint="Schools in the same district compete with each other.">
            <TextInput value={form.district} onChange={set('district')} maxLength={80} />
          </Field>
          <Field label="Town or city"><TextInput value={form.city} onChange={set('city')} maxLength={60} /></Field>
          <Field label="Number of students">
            <TextInput type="number" inputMode="numeric" min={1} max={20000} value={form.students} onChange={set('students')} />
          </Field>
          {quote && (
            <p className="text-sm mb-3">
              {quote.label}: <strong>{dollars(quote.monthlyCents)}/month</strong> after a {quote.trialDays}-day free trial.
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm mb-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
      <Button className="w-full" disabled={busy} onClick={submit}>
        {busy ? 'Working…' : asStaff ? 'Join my school' : 'Sign the school up'}
      </Button>
    </Card>
  )
}

// --------------------------------------------------------------- dashboard

function Dashboard({ school, league, demo, onChange }) {
  const admin = school.role === 'admin'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [leaveOut, setLeaveOut] = useState([])
  const [finding, setFinding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [resizing, setResizing] = useState(false)
  const [size, setSize] = useState(String(school.student_count || ''))
  const [query, setQuery] = useState('')
  const [found, setFound] = useState([])

  const act = async (fn, done) => {
    if (demo) { setNotice('This is a sample school, so nothing changes. A real one would.'); return }
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(schoolError(res.reason)); return }
    setError('')
    if (done) setNotice(done)
    onChange()
  }

  // Off to Stripe's own page. Card details never come near RankUp.
  const pay = async (start) => {
    if (demo) { setNotice('This is a sample school, so there is nothing to pay. A real school goes to Stripe here.'); return }
    setBusy(true)
    const res = await start()
    setBusy(false)
    if (!res.ok) setError(billingError(res.reason))
  }

  const search = async (q) => {
    setQuery(q)
    if (demo) {
      setFound(DEMO_LEAGUE.schools.filter((s) => !s.you && s.name.toLowerCase().includes(q.toLowerCase()))
        .map((s, i) => ({ id: `demo-${i}`, name: s.name, city: s.city })))
      return
    }
    const res = await schools.districtSchools(q)
    if (res.ok) setFound(res.schools)
  }

  const justPaid = typeof window !== 'undefined' && window.location.hash.includes('checkout=success')
  const trialDays = school.status === 'trial'
    ? Math.max(0, Math.ceil((new Date(school.trial_ends_at) - Date.now()) / 86400000)) : null
  const unpublished = (school.stars || []).some((s) => !s.published)

  return (
    <>
      {demo && (
        <Banner tone="info" icon="👀" title="A sample school" className="mb-3">
          This is what a principal sees. Nothing here is a real school.
        </Banner>
      )}
      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {notice && <Banner tone="good" icon="✅" title="Done" className="mb-3">{notice}</Banner>}
      {justPaid && (
        <Banner tone="good" icon="🎉" title="Thank you" className="mb-3">
          Your plan starts as soon as Stripe confirms it, usually within a minute.
        </Banner>
      )}

      <SchoolHeadline school={school} demo={demo} />

      <Card className="mb-3">
        <SectionTitle>Codes</SectionTitle>
        <p className="text-xs text-muted mb-1">For parents: they enter it in RankUp to add their child.</p>
        <p className="font-mono text-2xl font-bold tracking-[0.3em] text-center py-1">{school.join_code}</p>
        {admin && school.staff_code && (
          <>
            <p className="text-xs text-muted mt-2 mb-1">For other teachers, so they can see this page.</p>
            <p className="font-mono text-lg font-bold tracking-[0.25em] text-center">{school.staff_code}</p>
            <button type="button" className="w-full text-xs underline text-muted mt-2" disabled={busy}
                    onClick={() => act(() => schools.rotateCodes(), 'New codes made. The old ones no longer work.')}>
              A code got out? Make new ones
            </button>
          </>
        )}
        <p className="text-xs text-muted mt-3">
          {school.students} students joined · {school.sharing_names} with a parent’s yes to show a first name.
        </p>
      </Card>

      {league && <LeagueTable league={league} demo={demo} />}

      <RivalryList
        rivalries={school.rivalries}
        actions={(r) => admin && (
          <div className="flex gap-2 mt-3">
            {r.status === 'pending' && !r.asked_by_us && (
              <>
                <Button className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                        onClick={() => act(() => schools.answer(r.id, true), `You are now rivals with ${r.rival.name}.`)}>Accept</Button>
                <Button variant="ghost" className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                        onClick={() => act(() => schools.answer(r.id, false))}>Decline</Button>
              </>
            )}
            {(r.status === 'active' || r.asked_by_us) && (
              <Button variant="ghost" className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                      onClick={() => act(() => schools.endRivalry(r.id))}>
                {r.status === 'active' ? 'End rivalry' : 'Cancel challenge'}
              </Button>
            )}
          </div>
        )}
      />
      {admin && (
        <Button variant="soft" className="w-full mb-3" disabled={!school.verified && !demo}
                onClick={() => { setFinding(true); search('') }}>
          ⚔️ Challenge a rival school
        </Button>
      )}

      <StarList stars={school.stars} monthKey={school.stars_month} staff
                leaveOut={leaveOut}
                onToggle={admin ? (rank) => setLeaveOut((l) => (l.includes(rank) ? l.filter((x) => x !== rank) : [...l, rank])) : null}
                onRemove={admin ? setRemoving : null} />
      {admin && unpublished && (
        <Button className="w-full mb-3" disabled={busy}
                onClick={() => act(() => schools.publishStars(school.stars_month, leaveOut), 'Families can now see this month’s Stars.')}>
          Share {monthLabel(school.stars_month)}’s Stars with families
        </Button>
      )}
      <p className="text-xs text-muted mb-3">
        Stars get a badge in the app. Many schools add a certificate or a shout-out in assembly.
        A student shows as “A student” unless their parent agreed to share their first name.
      </p>

      <Card className="mb-3">
        <SectionTitle>Plan</SectionTitle>
        <p className="text-sm">
          {school.price?.label}, {dollars(school.price?.monthly_cents || 0)} a month
          {trialDays !== null && <> · <Chip tone="var(--accent)">{trialDays} days of free trial left</Chip></>}
          {school.status === 'active' && <> · <Chip tone="var(--good)">Paid</Chip></>}
          {school.status === 'lapsed' && <> · <Chip tone="var(--warn)">Ended</Chip></>}
        </p>
        <p className="text-xs text-muted mt-1">
          Priced for {school.student_count} students. Paying for the year costs ten months.
          The District Champion’s next month is free.
          {admin && !(school.status === 'active' && school.has_customer) && (
            <>
              {' '}
              <button type="button" className="underline" onClick={() => { setSize(String(school.student_count)); setResizing(true) }}>
                Wrong number of students?
              </button>
            </>
          )}
        </p>
        {admin && (demo || billingLive()) && (
          school.status === 'active' && school.has_customer ? (
            <Button variant="soft" className="w-full mt-3" disabled={busy}
                    onClick={() => pay(() => openSchoolBillingPortal())}>
              Card, invoices and cancelling
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button className="py-2 min-h-0 text-sm" disabled={busy} onClick={() => pay(() => startSchoolCheckout('month'))}>
                  {dollars(school.price?.monthly_cents || 0)} a month
                </Button>
                <Button variant="soft" className="py-2 min-h-0 text-sm" disabled={busy} onClick={() => pay(() => startSchoolCheckout('year'))}>
                  {dollars(school.price?.yearly_cents || 0)} a year
                </Button>
              </div>
              {trialDays > 0 && (
                <p className="text-xs text-muted mt-2">
                  Nothing is charged until your free trial ends, in {trialDays} days.
                </p>
              )}
            </>
          )
        )}
      </Card>

      <Card flat className="mb-3">
        <SectionTitle>Staff</SectionTitle>
        {(school.staff || []).map((s, i) => (
          <div key={`${s.name}-${i}`} className="flex items-center justify-between text-sm py-1">
            <span>{s.name}{s.you ? ' (you)' : ''}</span>
            <span className="text-xs text-muted flex items-center gap-2">
              {s.role === 'admin' ? 'Admin' : 'Teacher'}
              {admin && !s.you && (s.ref || demo) && (
                <button type="button" className="underline" style={{ color: 'var(--bad)' }} disabled={busy}
                        onClick={() => {
                          if (demo || window.confirm(`Remove ${s.name} from the staff? If the staff code got out, make new codes too.`)) {
                            act(() => schools.removeStaff(s.ref), `${s.name} is no longer on the staff.`)
                          }
                        }}>
                  Remove
                </button>
              )}
            </span>
          </div>
        ))}
        <button type="button" className="w-full text-xs underline text-muted mt-2" disabled={busy}
                onClick={() => {
                  const message = admin
                    ? 'Leave this school’s staff? The teacher who has been here longest becomes the admin.'
                    : 'Leave this school’s staff?'
                  if (demo || window.confirm(message)) act(() => schools.leaveStaff(), 'You have left the school’s staff.')
                }}>
          Leave this school’s staff
        </button>
      </Card>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this student?"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRemoving(null)}>Keep them</Button>
            <Button variant="danger" className="flex-1" disabled={busy}
                    onClick={() => { const s = removing; setRemoving(null); act(() => schools.removeStar(school.stars_month, s.rank), 'Removed from the school.') }}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Place {removing?.rank} ({removing?.name}, {removing?.score} points) will be taken out of your
          school and off every Stars list. Do this only if they are not one of your students.
        </p>
        <p className="text-xs text-muted mt-2">
          Their family can join again with your parents’ code. If the code has got out, make new codes too.
        </p>
      </Modal>

      <Modal
        open={resizing}
        onClose={() => setResizing(false)}
        title="Number of students"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setResizing(false)}>Cancel</Button>
            <Button className="flex-1" disabled={busy || !schoolPrice(size)}
                    onClick={() => { setResizing(false); act(() => schools.updateSize(size), 'School size updated.') }}>
              Save
            </Button>
          </>
        }
      >
        <TextInput type="number" inputMode="numeric" min={1} max={20000} value={size}
                   onChange={(e) => setSize(e.target.value)} aria-label="Number of students" />
        {schoolPrice(size) && (
          <p className="text-sm mt-2">
            {schoolPrice(size).label}: {dollars(schoolPrice(size).monthlyCents)} a month.
          </p>
        )}
        <p className="text-xs text-muted mt-2">Your whole school, not just the students who have joined.</p>
      </Modal>

      <Modal
        open={finding}
        onClose={() => setFinding(false)}
        title="Challenge a school"
        footer={<Button variant="ghost" className="flex-1" onClick={() => setFinding(false)}>Close</Button>}
      >
        <TextInput value={query} onChange={(e) => search(e.target.value)} placeholder="Search your district" autoFocus />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {found.length === 0 && <p className="text-sm text-muted py-2">No schools match.</p>}
          {found.map((s) => (
            <button key={s.id} type="button" className="w-full flex justify-between items-center py-2 text-left"
                    style={{ borderBottom: '1px solid var(--line)' }}
                    onClick={() => { setFinding(false); act(() => schools.challenge(s.id), `Challenge sent to ${s.name}.`) }}>
              <span className="text-sm font-semibold">{s.name}</span>
              <span className="text-xs text-muted">{s.city} ›</span>
            </button>
          ))}
        </div>
        {demo && <p className="text-xs text-muted mt-2"><DemoTag /> Sample schools.</p>}
      </Modal>
    </>
  )
}
