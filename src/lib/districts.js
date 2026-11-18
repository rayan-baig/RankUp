/**
 * School districts, from the app's side: one plan for many schools.
 *
 * A district admin signs the district up, adds its schools (each gets a
 * one-time invite for its principal) and sees the district picture: totals
 * per school and for the district, never a child. Everything is worked out by
 * the database (supabase/schools.sql, "School districts"); the browser asks.
 * The price list is in schools.js with the School League's.
 */
import { transport } from './sync/transport.js'
import { DISTRICT_MIN_SCHOOLS, DISTRICT_MAX_SCHOOLS, DISTRICT_INVITE_DAYS, SCHOOL_MIN_STUDENTS, districtPrice } from './schools.js'
import { checkQuoteForm } from './quoteRules.js'

const QUOTE_URL = import.meta.env?.VITE_DISTRICT_QUOTE_URL || '/api/district-quote'

export const DISTRICT_ERRORS = {
  unavailable: 'Districts need the sync service. This device is not connected to one yet.',
  not_signed_in: 'Sign in first.',
  not_an_adult: 'A child’s account cannot do this.',
  already_district_staff: 'You already run a district on RankUp.',
  bad_name: 'Give the full name.',
  bad_your_name: 'Add your name, as schools will see it.',
  bad_size: 'How many students are at the school? (1 to 20,000)',
  not_district_admin: 'Only the district’s admin can do this.',
  not_your_school: 'That school is not part of your district.',
  has_admin: 'That school’s principal has already signed up.',
  too_many_schools: `A district plan holds up to ${DISTRICT_MAX_SCHOOLS} schools. Use “Get a quote” for more.`,
  too_few_schools: `A district plan is for ${DISTRICT_MIN_SCHOOLS} schools or more.`,
}

export function districtError(reason) {
  return DISTRICT_ERRORS[reason] || 'That did not work. Please try again.'
}

const call = async (fn, args = {}) => {
  if (!transport.isConfigured()) return { ok: false, reason: 'unavailable' }
  try {
    return (await transport.rpc(fn, args)) || { ok: false, reason: 'unavailable' }
  } catch (err) {
    console.warn(`[RankUp] ${fn}:`, err.message)
    return { ok: false, reason: 'unavailable', message: err.message }
  }
}

export const districts = {
  register: ({ name, yourName }) => call('register_district', { p_name: name, p_your_name: yourName }),
  overview: () => call('district_overview'),
  addSchool: ({ name, city, students }) =>
    call('add_district_school', { p_name: name, p_city: city || '', p_students: Number(students) }),
  newInvite: (ref) => call('new_school_invite', { p_school_id: ref }),
  removeSchool: (ref) => call('remove_district_school', { p_school_id: ref }),
  rotateCode: () => call('rotate_district_code'),
}

/**
 * Send a "Get a quote" request. No account needed: it goes to the server,
 * which emails it to whoever runs RankUp. Checked here first with the same
 * rules the server uses, so nothing is refused that the form let through.
 */
export async function sendQuote(form) {
  const { ok, errors, clean } = checkQuoteForm(form)
  if (!ok) return { ok: false, reason: 'invalid', errors }
  // Never from the look-around: nothing in the demo is sent anywhere.
  if (transport.isNetworkPaused()) return { ok: false, reason: 'demo' }
  try {
    const res = await fetch(QUOTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clean),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, reason: data.error || `http_${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'network', message: err.message }
  }
}

export const QUOTE_ERRORS = {
  demo: 'This is the demo, so nothing is sent. Leave the demo to send a request.',
  too_many_quotes: 'We have had a few requests from here this hour. Please try again later.',
  busy: 'We have had a lot of requests this hour. Please try again later.',
  not_configured: 'Quotes are not set up on this site yet.',
  not_sent: 'Your request could not be sent just now. Please try again in a few minutes.',
}

export function quoteError(reason) {
  return QUOTE_ERRORS[reason] || 'Your request could not be sent. Please try again.'
}

/** How a school is paid for, in a few words, from district_overview()'s school. */
export function schoolCover(s, now = Date.now()) {
  if (s.covered) return { label: 'Paid by the district', tone: 'var(--good)' }
  if (s.own_plan) return { label: 'Pays for itself', tone: 'var(--accent)' }
  if (s.status === 'trial' && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now) {
    const days = Math.max(1, Math.ceil((new Date(s.trial_ends_at).getTime() - now) / 86400000))
    return { label: `Free trial, ${days} ${days === 1 ? 'day' : 'days'} left`, tone: 'var(--accent)' }
  }
  if (s.status === 'suspended') return { label: 'Suspended', tone: 'var(--bad)' }
  return { label: 'Free level: not in the league', tone: 'var(--warn)' }
}

/**
 * What the district admin is told about the plan, from district_overview()'s
 * status and Stripe's last word. Null when there is nothing to say.
 */
export function districtBillingNotice(d) {
  if (!d) return null
  const until = d.billing_ends_at ? new Date(d.billing_ends_at) : null
  const fallBack = 'Each school is back on its own plan, its free trial or the free level. Nothing is deleted, and the schools keep their points.'
  switch (d.billing_status) {
    case 'past_due':
      return { tone: 'bad', icon: '⚠️', title: 'The invoice is overdue',
        body: 'Your schools are still covered while Stripe reminds you. Pay it from the invoice email, or from “Invoices and cancelling”.' }
    case 'unpaid':
    case 'incomplete_expired':
    case 'canceled':
      return d.status === 'active' ? null : { tone: 'info', icon: 'ℹ️', title: 'Your district plan has ended', body: `${fallBack} Send a new invoice to start again.` }
    case 'refunded':
      return { tone: 'info', icon: '↩️', title: 'Your payment was refunded', body: `So that year is not paid for. ${fallBack}` }
    case 'active':
    case 'trialing':
      if (until && until.getTime() > Date.now()) {
        return { tone: 'info', icon: '📅', title: 'Your plan is ending',
          body: `It was cancelled, so it stops on ${until.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. After that: ${fallBack.charAt(0).toLowerCase()}${fallBack.slice(1)}` }
      }
      return null
    default:
      return null
  }
}

/** districtPrice()'s answer in the shape district_price_quote() gives, so one screen shows either. */
export function asQuote(price) {
  if (!price) return null
  return {
    ok: true,
    schools: price.schools,
    lines: price.lines.map((l) => ({ band: l.band, label: l.label, pct: l.pct, quantity: l.quantity,
      unit_yearly_cents: l.unitYearlyCents, yearly_cents: l.yearlyCents })),
    yearly_cents: price.yearlyCents,
    full_yearly_cents: price.fullYearlyCents,
    saving_cents: price.savingCents,
  }
}

// ---------------------------------------------------------------------------
// The look-around: the same shapes district_overview() returns, plainly sample
// data, so a district can see what it would get before signing up.
// ---------------------------------------------------------------------------

function monthKey(offset = 0, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const sampleMonth = (students, active, chores) => (students < SCHOOL_MIN_STUDENTS
  ? { students, shown: false }
  : { students, shown: true, active, chores_shown: true, chores, score: Math.round((chores / students) * 10) / 10 })

export function demoDistrict() {
  const schools = [
    { ref: 'demo-1', name: 'Hillcrest Middle', city: 'Ogdenville', student_count: 640, size_band: 'medium', verified: true, status: 'trial', covered: true, own_plan: false, has_admin: true, staff: 4, this_month: sampleMonth(158, 121, 1334), last_month: sampleMonth(150, 118, 1702) },
    { ref: 'demo-2', name: 'Lakeside Academy', city: 'Springfield', student_count: 880, size_band: 'large', verified: true, status: 'trial', covered: true, own_plan: false, has_admin: true, staff: 6, this_month: sampleMonth(301, 244, 2876), last_month: sampleMonth(297, 230, 3730) },
    { ref: 'demo-3', name: 'Maple Grove Elementary', city: 'North Haverbrook', student_count: 240, size_band: 'small', verified: true, status: 'trial', covered: true, own_plan: false, has_admin: true, staff: 2, this_month: sampleMonth(64, 41, 403), last_month: sampleMonth(60, 44, 610) },
    { ref: 'demo-4', name: 'Pine Hill School', city: 'Shelbyville', student_count: 410, size_band: 'medium', verified: false, status: 'trial', covered: true, own_plan: false, has_admin: false, staff: 0,
      invite: 'PINE7HQ4KX', invite_expires_at: new Date(Date.now() + 26 * 86400000).toISOString(), this_month: sampleMonth(0), last_month: sampleMonth(0) },
    { ref: 'demo-5', name: 'Riverbend School', city: 'Shelbyville', student_count: 190, size_band: 'small', verified: true, status: 'trial', covered: false, own_plan: false, has_admin: true, staff: 1,
      trial_ends_at: new Date(Date.now() + 12 * 86400000).toISOString(), this_month: sampleMonth(3), last_month: sampleMonth(2) },
  ]
  const totals = (which) => {
    const shown = schools.filter((s) => s[which].shown)
    return {
      schools: schools.length,
      shown: shown.length,
      students: shown.reduce((n, s) => n + s[which].students, 0),
      active: shown.reduce((n, s) => n + s[which].active, 0),
      chores: shown.filter((s) => s[which].chores_shown).reduce((n, s) => n + s[which].chores, 0),
      covered: schools.filter((s) => s.covered).length,
    }
  }
  return {
    ok: true,
    district: {
      name: 'North Valley Unified',
      you: 'Dr Ames',
      status: 'active',
      link_code: 'NVU4K7QP',
      has_customer: true,
      paying: true,
      billing_status: 'active',
      billing_period_end: new Date(Date.now() + 240 * 86400000).toISOString(),
      billing_ends_at: null,
      month: monthKey(0),
      last_month: monthKey(-1),
      min_students: SCHOOL_MIN_STUDENTS,
      min_schools: DISTRICT_MIN_SCHOOLS,
      max_schools: DISTRICT_MAX_SCHOOLS,
      invite_days: DISTRICT_INVITE_DAYS,
      schools,
      totals: totals('this_month'),
      last_totals: totals('last_month'),
      quote: asQuote(districtPrice(schools.map((x) => x.student_count))),
    },
  }
}
