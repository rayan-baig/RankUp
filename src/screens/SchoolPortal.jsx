import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { navigate } from '../lib/router.js'
import { transport } from '../lib/sync/transport.js'
import {
  schools, schoolError, schoolPrice, dollars, monthLabel,
  SCHOOL_PRICES, SCHOOL_TRIAL_DAYS, SCHOOL_MIN_STUDENTS, demoOverview, DEMO_LEAGUE,
  SCHOOL_YEAR_MONTHS, schoolBillingNotice, PILOT_DEFAULT_DAYS, PILOT_REMINDER_DAYS, SCHOOL_MAX_GROUPS,
  SCHOOL_GROUP_NAME_MAX, groupWord, requestPilot, pilotRequestError, longDate,
} from '../lib/schools.js'
import { PILOT_REQUEST_LIMITS, formatPilotCode, looksLikePilotCode } from '../lib/pilotRules.js'
import { wordsOk } from '../lib/kidWords.js'
import { Screen, Card, Button, SectionTitle, Banner, Field, TextInput, TextArea, Modal, Chip, DemoTag } from '../components/ui.jsx'
import { SchoolHeadline, LeagueTable, RivalryList, StarList, HouseBoard } from '../components/SchoolParts.jsx'
import { humanError } from '../lib/errors.js'
import { billingLive, billingError, startSchoolCheckout, openSchoolBillingPortal, requestSchoolInvoice } from '../lib/billing.js'

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
  // The size typed on the front page, so the form does not ask for it again.
  const [studentsGuess, setStudentsGuess] = useState('')
  // What happened with a pilot code typed at sign-up, said on the school's page.
  const [flash, setFlash] = useState(null)

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

  return (
    <Screen>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">RankUp for schools</p>
          <h1 className="font-display text-2xl font-extrabold">
            {step === 'pilot' ? 'Request a pilot' : 'The School League'}
          </h1>
        </div>
        <button type="button" className="text-xs underline text-muted mt-1 shrink-0"
                onClick={() => navigate(state.onboarded ? (demo ? '/parent' : '/switch') : '/welcome')}>
          ← Back
        </button>
      </header>

      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {step === 'loading' && <Card><p className="text-sm text-muted">Loading…</p></Card>}
      {step === 'landing' && (
        <Landing onStart={(students) => { setStudentsGuess(students); setStep('register') }}
                 onPilot={() => { setStep('pilot'); window.scrollTo(0, 0) }} />
      )}
      {step === 'pilot' && <PilotRequestForm onBack={() => setStep('landing')} />}
      {step === 'register' && (
        <Register onDone={(note) => { setFlash(note || null); load() }} students={studentsGuess} onBack={() => setStep('landing')} />
      )}
      {step === 'dashboard' && school && (
        <Dashboard school={school} league={league} demo={demo} onChange={load} flash={flash} />
      )}
    </Screen>
  )
}

// ----------------------------------------------------------------- landing

/*
 * The front page, for a head of school or a teacher deciding whether to try
 * it: what RankUp does, what the school sees, what children never do, the
 * prices and how a pilot works, in plain words. Then "Request a pilot" (an
 * email to us, nothing kept) or "Sign your school up".
 */
function Landing({ onStart, onPilot }) {
  const [students, setStudents] = useState('')
  const quote = schoolPrice(students)
  const point = ([icon, title, body]) => (
    <Card flat key={title} className="flex gap-3 items-start">
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <span>
        <span className="block font-semibold text-sm">{title}</span>
        <span className="block text-xs text-muted">{body}</span>
      </span>
    </Card>
  )
  return (
    <div data-testid="for-schools">
      <Card className="mb-3">
        <p className="font-display font-extrabold text-lg leading-snug mb-1">
          Chores at home, turned into a game. A friendly league for your school.
        </p>
        <p className="text-sm">
          Students earn points for their school, and for their class or house, by doing their chores at
          home. A parent says each chore is done. Each month the best school in the district is
          crowned <strong>District Champion</strong>, classes and houses race each other, and each
          school’s top ten are its <strong>School Stars</strong>.
        </p>
        <Button className="w-full mt-3" onClick={onPilot}>Request a free pilot</Button>
      </Card>

      <SectionTitle>What RankUp does</SectionTitle>
      <div className="grid gap-2 mb-3">
        {[
          ['🧹', 'Chores become quests', 'Making the bed, feeding the dog, helping with dinner. Children earn points and level up a character of their own.'],
          ['✅', 'A parent says it is done', 'Every chore is checked by a parent at home. A school never adds, sees or judges a chore.'],
          ['🏠', 'Classes and houses', 'Split your students into houses or classes, and each one’s totals go on your school’s board.'],
          ['🏆', 'Fair for every size', 'Points are averaged per student, so a small school, class or house can beat a big one.'],
        ].map(point)}
      </div>

      <SectionTitle>What your school sees</SectionTitle>
      <Card flat className="mb-3">
        <p className="text-sm">
          <strong>Totals only.</strong> How many students take part, how many did a chore, chores done, the
          average per student, for the whole school and for each class or house.
        </p>
        <p className="text-xs text-muted mt-1">
          Never a list of children, never what a child did or typed. No numbers at all for a group of
          fewer than {SCHOOL_MIN_STUDENTS} students, so no total is ever one child’s. A first name appears
          only on the top-ten list, and only where a parent said yes. We check every school is real
          before it joins a league.
        </p>
      </Card>

      <SectionTitle>What children never do</SectionTitle>
      <div className="grid gap-2 mb-3">
        {[
          ['💬', 'No typing to strangers', 'There is no chat box. Children can only tap ready-made, friendly messages, and only in groups a parent on each side agreed to.'],
          ['📷', 'No photos', 'RankUp takes no photos and asks for none. Nothing about a child’s home leaves it.'],
          ['👪', 'Nothing without a parent', 'Only a parent can put a child in a school or a house, and can take them out again at any time.'],
        ].map(point)}
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
            {dollars(quote.yearlyCents)} a year ({12 - SCHOOL_YEAR_MONTHS} months free). First {quote.trialDays} days free.
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
        <p className="text-xs text-muted mt-2">
          Pay by card, monthly or yearly, or ask for a yearly invoice your office can pay by card or
          bank transfer. The price is the whole school’s, however many students join.
        </p>
      </Card>

      <SectionTitle>How a pilot works</SectionTitle>
      <Card flat className="mb-3" data-testid="how-a-pilot-works">
        <ol className="text-sm grid gap-1.5 list-decimal pl-5">
          <li>Ask for a pilot below. A person reads it and replies by email.</li>
          <li>We send you a pilot code. Type it when you sign your school up.</li>
          <li>Your school plays free for the pilot, usually a semester ({PILOT_DEFAULT_DAYS} days), instead of the {SCHOOL_TRIAL_DAYS}-day trial. No card.</li>
          <li>Open the pilot report any time: one printable page of totals for whoever decides.</li>
          <li>{PILOT_REMINDER_DAYS} days before the end we email you. Carry on by card or invoice, or simply stop: nothing is charged by itself.</li>
        </ol>
      </Card>

      {!transport.isConfigured() && (
        <Banner tone="info" icon="🕒" title="Opening soon" className="mb-3">
          School sign-up opens when RankUp launches. Prices above are what you will pay.
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={onPilot}>Request a pilot</Button>
        <Button disabled={!transport.isConfigured()} onClick={() => onStart(students)}>
          Sign your school up
        </Button>
      </div>
      <button type="button" className="w-full text-sm underline text-muted mt-3" onClick={() => navigate('/school/help')}>
        Questions from schools, answered
      </button>
      <button type="button" className="w-full text-sm underline text-muted mt-2" onClick={() => navigate('/district')}>
        Buying for a whole district? One plan for all your schools
      </button>
    </div>
  )
}

// ------------------------------------------------------------ request a pilot

/*
 * "Request a pilot": the same way as a district's "Get a quote". What is
 * typed goes to us by email (api/pilot-request.js) and is not kept on this
 * site; the same rules are checked here first (src/lib/pilotRules.js).
 */
function PilotRequestForm({ onBack }) {
  const [form, setForm] = useState({ school: '', name: '', role: '', email: '', town: '', students: '', message: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const configured = transport.isConfigured()

  const submit = async () => {
    setBusy(true)
    setError('')
    const res = await requestPilot(form)
    setBusy(false)
    if (res.ok) { setSent(true); return }
    if (res.reason === 'invalid') { setErrors(res.errors); return }
    setErrors({})
    setError(pilotRequestError(res.reason))
  }

  if (sent) {
    return (
      <Card data-testid="pilot-sent">
        <p className="font-semibold mb-1">Thank you. Your request is on its way.</p>
        <p className="text-sm text-muted">
          A person reads it and replies to {form.email.trim()} with your pilot code. Nothing you typed is kept on this site.
        </p>
        <button type="button" className="w-full text-xs underline text-muted mt-3" onClick={onBack}>Back to the School League</button>
      </Card>
    )
  }

  const hint = (k, fallback) => (errors[k] ? <span className="text-bad">{errors[k]}</span> : fallback)
  return (
    <Card data-testid="pilot-form">
      <p className="text-sm mb-3">
        Try the School League free for a semester. Tell us a little about your school and a person will
        reply by email with your pilot code.
      </p>
      <Field label="School" hint={hint('school')}><TextInput value={form.school} onChange={set('school')} maxLength={PILOT_REQUEST_LIMITS.school} /></Field>
      <Field label="Your name" hint={hint('name')}><TextInput value={form.name} onChange={set('name')} maxLength={PILOT_REQUEST_LIMITS.name} /></Field>
      <Field label="Your role" hint={hint('role', 'Optional. Head of school, teacher, office.')}>
        <TextInput value={form.role} onChange={set('role')} maxLength={PILOT_REQUEST_LIMITS.role} />
      </Field>
      <Field label="Work email" hint={hint('email', 'We reply here.')}>
        <TextInput type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} maxLength={PILOT_REQUEST_LIMITS.email} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Town or city" hint={hint('town', 'Optional.')}>
          <TextInput value={form.town} onChange={set('town')} maxLength={PILOT_REQUEST_LIMITS.town} />
        </Field>
        <Field label="Students, about" hint={hint('students', 'Optional.')}>
          <TextInput type="number" inputMode="numeric" min={1} value={form.students} onChange={set('students')} />
        </Field>
      </div>
      <Field label="Anything else" hint={hint('message', `Optional. ${PILOT_REQUEST_LIMITS.message} characters at most.`)}>
        <TextArea rows={3} value={form.message} onChange={set('message')} maxLength={PILOT_REQUEST_LIMITS.message} />
      </Field>
      {error && <p className="text-sm mb-3 text-bad" role="alert">{error}</p>}
      <Button className="w-full" disabled={busy || !configured} onClick={submit}>{busy ? 'Sending…' : 'Send the request'}</Button>
      <p className="text-xs text-muted mt-2">
        {configured ? 'What you type goes to us by email and is not kept on this site.' : 'Pilots open when RankUp launches.'}
      </p>
      <button type="button" className="w-full text-xs underline text-muted mt-3" onClick={onBack}>Back</button>
    </Card>
  )
}

// ---------------------------------------------------------------- register

/*
 * One screen from "Sign your school up" to the school's page.
 *
 * The account and the school used to be two screens: an email and password
 * with their own button, then the school's details with another. They are
 * one form now, with one button, and the number of students typed on the
 * front page to see the price is already filled in. Signed in already (a
 * parent signing their child's school up, say), the account part is not
 * shown at all. tests/schoolsignup.mjs walks it and counts the steps.
 */
function Register({ onDone, students = '', onBack }) {
  const signedIn = Boolean(transport.currentUserId())
  const [form, setForm] = useState({ name: '', district: '', city: '', students: String(students || ''), yourName: '' })
  const [account, setAccount] = useState({ email: '', password: '' })
  const [haveAccount, setHaveAccount] = useState(false)
  const [staffCode, setStaffCode] = useState('')
  const [pilotCode, setPilotCode] = useState('')
  const [asStaff, setAsStaff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const quote = schoolPrice(form.students)
  const accountReady = signedIn || (account.email.trim() && account.password.length >= 8)

  const submit = async () => {
    setBusy(true)
    setError('')
    if (!transport.currentUserId()) {
      try {
        const email = account.email.trim()
        const session = haveAccount
          ? await transport.signIn(email, account.password)
          : await transport.signUp(email, account.password)
        if (!session?.access_token) {
          // Email confirmation is on: the account exists, the school waits.
          // Everything typed stays; after the link, one tap finishes it.
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
    // A staff code is eight letters; an invite from the district, ten.
    const typed = staffCode.replace(/[^A-Za-z0-9]/g, '')
    const res = !asStaff ? await schools.register(form)
      : typed.length === 10 ? await schools.claimInvite(typed, form.yourName)
        : await schools.joinStaff(typed, form.yourName)
    if (!res.ok) { setBusy(false); setError(schoolError(res.reason)); return }
    // A pilot code from us: the school is signed up either way, and the
    // school's page says whether the code worked (it can be typed again there).
    let note = null
    if (!asStaff && pilotCode.trim()) {
      const pilot = await schools.redeemPilot(pilotCode)
      note = pilot.ok
        ? { tone: 'good', title: 'Your pilot has started', body: `${pilot.days} days free, until ${longDate(pilot.ends_at)}.` }
        : { tone: 'warn', title: 'The pilot code did not work', body: `${schoolError(pilot.reason)} Your school is signed up on the ${SCHOOL_TRIAL_DAYS}-day trial; you can type the code again under Plan.` }
    }
    setBusy(false)
    onDone(note)
  }

  return (
    <Card>
      <div className="flex gap-1 p-1 card-flat mb-3" role="tablist">
        {[[false, 'New school'], [true, 'I have a code']].map(([v, label]) => (
          <button key={label} type="button" role="tab" aria-selected={asStaff === v}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: asStaff === v ? 'var(--accent)' : 'transparent', color: asStaff === v ? 'var(--on-accent, #fff)' : 'inherit' }}
                  onClick={() => { setAsStaff(v); setError('') }}>
            {label}
          </button>
        ))}
      </div>

      {!signedIn && (
        <div data-testid="school-account">
          <p className="text-xs text-muted mb-2">
            {haveAccount ? 'Sign in with your school account.' : 'Your account: use your school email. We check every school is real before it joins a league.'}
          </p>
          <Field label="Email">
            <TextInput type="email" inputMode="email" autoComplete="email" value={account.email}
                       onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))} placeholder="you@yourschool.edu" />
          </Field>
          <Field label="Password" hint={haveAccount ? null : 'At least 8 characters.'}>
            <TextInput type="password" autoComplete={haveAccount ? 'current-password' : 'new-password'} value={account.password}
                       onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))} />
          </Field>
          <button type="button" className="text-xs underline text-muted mb-3"
                  onClick={() => { setHaveAccount((h) => !h); setError('') }}>
            {haveAccount ? 'I need to create an account' : 'I already have an account'}
          </button>
        </div>
      )}

      <Field label="Your name" hint="As parents and other staff will see it, e.g. Ms Lane.">
        <TextInput value={form.yourName} onChange={set('yourName')} maxLength={60} />
      </Field>

      {asStaff ? (
        <Field label="Staff or invite code" hint="A staff code from your school’s admin, or the invite your district sent you.">
          <TextInput value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} maxLength={10}
                     style={{ letterSpacing: '0.25em', textTransform: 'uppercase' }} />
        </Field>
      ) : (
        <>
          <Field label="School name"><TextInput value={form.name} onChange={set('name')} maxLength={80} /></Field>
          <Field label="School district" hint="Schools in the same district compete with each other.">
            <TextInput value={form.district} onChange={set('district')} maxLength={80} />
          </Field>
          <Field label="Town or city" hint="Optional. It helps us check the school is real.">
            <TextInput value={form.city} onChange={set('city')} maxLength={60} />
          </Field>
          <Field label="Number of students">
            <TextInput type="number" inputMode="numeric" min={1} max={20000} value={form.students} onChange={set('students')} />
          </Field>
          <Field label="Pilot code" hint="Optional. If we sent you one, it starts your free pilot.">
            <TextInput value={pilotCode} onChange={(e) => setPilotCode(formatPilotCode(e.target.value))} maxLength={11}
                       placeholder="ABCDE-FGHJK" autoComplete="off" className="field font-mono tracking-widest uppercase" />
          </Field>
          {quote && (
            <p className="text-sm mb-3">
              {quote.label}: <strong>{dollars(quote.monthlyCents)}/month</strong> after{' '}
              {looksLikePilotCode(pilotCode) ? 'your free pilot' : `a ${quote.trialDays}-day free trial`}.
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm mb-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
      <Button className="w-full" disabled={busy || !accountReady} onClick={submit}>
        {busy ? 'Working…' : asStaff ? 'Join my school' : 'Sign the school up'}
      </Button>
      <button type="button" className="w-full text-xs underline text-muted mt-3" onClick={onBack}>Back</button>
    </Card>
  )
}

// --------------------------------------------------------------- dashboard

function Dashboard({ school, league, demo, onChange, flash = null }) {
  const admin = school.role === 'admin'
  const [pilotCode, setPilotCode] = useState('')
  const [invoicing, setInvoicing] = useState(false)
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [invoiceSent, setInvoiceSent] = useState('')
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
  const [districtCode, setDistrictCode] = useState('')
  const district = school.district_plan || null
  const districtPays = Boolean(district?.covered)

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

  // A yearly invoice, emailed by Stripe to the address given.
  const sendInvoice = async () => {
    if (demo) { setInvoicing(false); setNotice('This is a sample school, so no invoice is sent. A real school gets one by email.'); return }
    setBusy(true)
    const res = await requestSchoolInvoice(invoiceEmail)
    setBusy(false)
    if (!res.ok) { setError(billingError(res.reason)); return }
    setInvoicing(false)
    setError('')
    setInvoiceSent(res.sent_to)
    onChange()
  }

  const justPaid = typeof window !== 'undefined' && window.location.hash.includes('checkout=success')
  const trialDays = school.status === 'trial'
    ? Math.max(0, Math.ceil((new Date(school.trial_ends_at) - Date.now()) / 86400000)) : null
  const pilot = school.pilot || null
  const paying = school.status === 'active' && school.has_customer
  // A pilot code can be typed while the school is on its trial (or its
  // trial has run out), has no plan and no district paying, and has not had one.
  const canPilot = admin && !pilot && !paying && !districtPays && ['trial', 'lapsed'].includes(school.status)
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
      {flash && (
        <Banner tone={flash.tone} icon={flash.tone === 'good' ? '🎉' : '⚠️'} title={flash.title} className="mb-3">
          {flash.body}
        </Banner>
      )}
      {invoiceSent && (
        <Banner tone="good" icon="📨" title="Your invoice is on its way" className="mb-3">
          Stripe emails it to {invoiceSent}{trialDays > 0 ? ` when your ${pilot ? 'pilot' : 'free trial'} ends` : ''}. Your office can pay it by card or bank transfer.
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

      <HouseBoard houses={school.houses} />
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
        {admin && schoolBillingNotice(school) && (
          <Banner tone={schoolBillingNotice(school).tone} icon={schoolBillingNotice(school).icon}
                  title={schoolBillingNotice(school).title} className="mb-2">
            {schoolBillingNotice(school).body}
          </Banner>
        )}
        {district && (
          <Banner tone={districtPays ? 'good' : 'info'} icon="🏛️" title={districtPays ? `${district.name} pays for your school` : `Part of ${district.name}`} className="mb-2">
            {districtPays
              ? 'Your district’s plan covers the school, so there is nothing to pay here. If the district stops paying, your school goes back to its own plan, its free trial or the free level, and keeps its points.'
              : 'Your district’s plan does not cover the school yet. Until it does, your school is on its own plan or its free trial. The district sees your school’s totals, never a student.'}
          </Banner>
        )}
        <p className="text-sm">
          {school.price?.label}, {dollars(school.price?.monthly_cents || 0)} a month
          {trialDays !== null && !districtPays && !paying && (
            <> · <Chip className="border-accent text-accent" data-testid="trial-left">
              {pilot ? `${trialDays} days of your pilot left` : `${trialDays} days of free trial left`}
            </Chip></>
          )}
          {school.status === 'active' && <> · <Chip tone="var(--good)">Paid</Chip></>}
          {school.status === 'lapsed' && !districtPays && <> · <Chip tone="var(--warn)">Ended</Chip></>}
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
        {admin && (demo || billingLive()) && !(districtPays && !(school.status === 'active' && school.has_customer)) && (
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
              <Button variant="ghost" className="w-full py-2 min-h-0 text-sm mt-2" disabled={busy}
                      onClick={() => { setInvoicing(true); setError('') }}>
                {dollars(school.price?.yearly_cents || 0)} a year, by invoice
              </Button>
              {trialDays > 0 && (
                <p className="text-xs text-muted mt-2">
                  Nothing is charged, and no invoice is due, until your {pilot ? 'pilot' : 'free trial'} ends, in {trialDays} days.
                </p>
              )}
            </>
          )
        )}
        {pilot && (
          <p className="text-xs text-muted mt-2" data-testid="pilot-status">
            🎓 A {pilot.days}-day pilot, {new Date(pilot.ends_at) > new Date() ? 'until' : 'which ended on'} {longDate(pilot.ends_at)}.
            {' '}We email you {PILOT_REMINDER_DAYS} days before it ends.
          </p>
        )}
        {canPilot && (
          <div className="mt-3" data-testid="pilot-code">
            <p className="text-xs text-muted mb-1">Have a pilot code from us? It turns your trial into a free pilot.</p>
            <div className="flex gap-2">
              <TextInput value={pilotCode} onChange={(e) => setPilotCode(formatPilotCode(e.target.value))} maxLength={11}
                         aria-label="Pilot code" placeholder="ABCDE-FGHJK" autoComplete="off"
                         className="field font-mono tracking-widest uppercase" />
              <Button className="py-2 min-h-0 text-sm shrink-0" disabled={busy || !looksLikePilotCode(pilotCode)}
                      onClick={() => act(async () => {
                        if (demo) return { ok: true }
                        const res = await schools.redeemPilot(pilotCode)
                        if (res.ok) setPilotCode('')
                        return res
                      }, 'Your pilot has started.')}>
                Start the pilot
              </Button>
            </div>
          </div>
        )}
        {admin && (
          <Button variant="soft" className="w-full mt-3" onClick={() => navigate('/school/report')}>
            📄 {pilot ? 'The pilot report' : 'The trial report'}, for the school office
          </Button>
        )}
      </Card>

      {admin && <HouseSettings school={school} demo={demo} busy={busy} act={act} />}

      {admin && (
        <Card flat className="mb-3" data-testid="school-district">
          <SectionTitle>District</SectionTitle>
          {district ? (
            <>
              <p className="text-xs text-muted mb-2">
                Your school is part of {district.name}. The district sees your school’s totals (students taking
                part, chores done), never a student’s name or numbers.
              </p>
              <button type="button" className="text-xs underline text-muted" disabled={busy}
                      onClick={() => {
                        if (demo || window.confirm(`Take your school out of ${district.name}? ${districtPays ? 'The district stops paying for it.' : ''}`)) {
                          act(() => schools.leaveDistrict(), `Your school has left ${district.name}.`)
                        }
                      }}>
                Leave the district
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted mb-2">Has your district bought RankUp for its schools? Type the code it gave you.</p>
              <div className="flex gap-2">
                <TextInput value={districtCode} onChange={(e) => setDistrictCode(e.target.value.toUpperCase())} maxLength={8}
                           aria-label="District code" placeholder="District code" className="field font-mono tracking-widest" />
                <Button className="py-2 min-h-0 text-sm shrink-0" disabled={busy || districtCode.trim().length < 8}
                        onClick={() => act(() => schools.joinDistrict(districtCode), 'Your school is now part of the district.')}>
                  Join
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      <button type="button" className="w-full text-sm underline text-muted mb-3" onClick={() => navigate('/school/help')}>
        Help: questions from schools
      </button>

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
        open={invoicing}
        onClose={() => setInvoicing(false)}
        title="Pay by invoice"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setInvoicing(false)}>Cancel</Button>
            <Button className="flex-1" disabled={busy || !/@/.test(invoiceEmail)} onClick={sendInvoice}>Send the invoice</Button>
          </>
        }
      >
        <p className="text-sm mb-2">
          A yearly plan, {dollars(school.price?.yearly_cents || 0)}. Stripe emails the invoice, and your office pays it by
          card or bank transfer. It renews each year with a new invoice; cancel any time.
        </p>
        <Field label="Send the invoice to" hint="Usually the school office or its accounts address.">
          <TextInput type="email" inputMode="email" autoComplete="email" value={invoiceEmail}
                     onChange={(e) => setInvoiceEmail(e.target.value)} placeholder="office@yourschool.edu" />
        </Field>
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

// ------------------------------------------------------------------ houses

/*
 * The admin names the school's houses (or classes). Parents choose which one
 * their child is in, on their side of the app; the school never sees who is
 * in which, only each one's totals on the board above.
 */
function HouseSettings({ school, demo, busy, act }) {
  const houses = school.houses || { kind: 'house', groups: [] }
  const kind = houses.kind === 'class' ? 'class' : 'house'
  const groups = houses.groups || []
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [newName, setNewName] = useState('')
  const plain = (v) => v.trim().length > 0 && wordsOk(v)
  const word = groupWord(kind, { lower: true })
  const words = groupWord(kind, { plural: true, lower: true })
  const run = (fn, done) => act(async () => (demo ? { ok: true } : fn()), done)

  return (
    <Card flat className="mb-3" data-testid="house-settings">
      <SectionTitle>{groupWord(kind, { plural: true })}</SectionTitle>
      <p className="text-xs text-muted mb-2">
        Split your students into houses or classes, and each one’s totals go on your board. Parents choose
        which one their child is in. You see totals only, never who is in which.
      </p>
      <div className="flex gap-1 p-1 card-flat mb-3" role="tablist" aria-label="Houses or classes">
        {[['house', 'Houses'], ['class', 'Classes']].map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={kind === v} disabled={busy}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold ${kind === v ? 'bg-accent text-white' : ''}`}
                  onClick={() => kind !== v && run(() => schools.setGroupKind(v), `Your school uses ${v === 'class' ? 'classes' : 'houses'}.`)}>
            {label}
          </button>
        ))}
      </div>
      {groups.length === 0 && <p className="text-sm text-muted mb-2">No {words} yet.</p>}
      {groups.map((g) => (
        <div key={g.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-line text-sm">
          {renaming === g.id ? (
            <>
              <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={SCHOOL_GROUP_NAME_MAX}
                         aria-label={`New name for ${g.name}`} />
              <Button className="py-1.5 min-h-0 text-xs shrink-0" disabled={busy || !plain(newName)}
                      onClick={() => { setRenaming(null); run(() => schools.renameGroup(g.id, newName), 'Renamed.') }}>
                Save
              </Button>
            </>
          ) : (
            <>
              <span className="font-semibold truncate">{g.name}</span>
              <span className="flex gap-3 text-xs shrink-0">
                <button type="button" className="underline text-muted" disabled={busy}
                        onClick={() => { setRenaming(g.id); setNewName(g.name) }}>Rename</button>
                <button type="button" className="underline text-bad" disabled={busy}
                        onClick={() => {
                          if (demo || window.confirm(`Remove ${g.name}? Its students stay in the school, in no ${word}.`)) {
                            run(() => schools.removeGroup(g.id), `${g.name} removed.`)
                          }
                        }}>Remove</button>
              </span>
            </>
          )}
        </div>
      ))}
      {groups.length < SCHOOL_MAX_GROUPS && (
        <div className="flex gap-2 mt-3">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={SCHOOL_GROUP_NAME_MAX}
                     aria-label={`New ${word}`} placeholder={kind === 'class' ? 'e.g. Year 5 Blue' : 'e.g. Kestrel'} />
          <Button className="py-2 min-h-0 text-sm shrink-0" disabled={busy || !plain(name)}
                  onClick={() => { const n = name; setName(''); run(() => schools.addGroup(n), `${n.trim()} added.`) }}>
            Add
          </Button>
        </div>
      )}
      {name && !wordsOk(name) && <p className="text-xs text-bad mt-1">Children read these names, so not that one.</p>}
      <p className="text-xs text-muted mt-2">
        Up to {SCHOOL_MAX_GROUPS}. A {word} shows numbers once {school.min_students || SCHOOL_MIN_STUDENTS} or more of its
        students take part.
      </p>
    </Card>
  )
}
