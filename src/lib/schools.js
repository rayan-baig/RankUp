/**
 * The School League, from the app's side.
 *
 * Schools sign up and pay by size; parents put their children in with the
 * school's code; each month the database scores every school, names a
 * District Champion, settles rivalries and picks each school's School Stars.
 * None of that is worked out here. The browser asks; it never reports a
 * score. See supabase/schools.sql.
 *
 * The one thing this file does know for itself is the price list, so a
 * principal can see what it costs before making an account. It is a copy of
 * school_price_quote() in the SQL, and tests/schools.mjs fails if they differ.
 */

import { transport } from './sync/transport.js'
import {
  PILOT_DEFAULT_DAYS, PILOT_TRIES_AN_HOUR, SCHOOL_MAX_GROUPS, checkPilotRequest, normalizePilotCode,
} from './pilotRules.js'

export { PILOT_DEFAULT_DAYS, PILOT_REMINDER_DAYS, SCHOOL_MAX_GROUPS, SCHOOL_GROUP_NAME_MAX } from './pilotRules.js'

/** Upper size of each band, and its price in cents a month. */
export const SCHOOL_PRICES = [
  { band: 'small', label: 'Small school', upTo: 300, monthlyCents: 2900 },
  { band: 'medium', label: 'Medium school', upTo: 800, monthlyCents: 5900 },
  { band: 'large', label: 'Large school', upTo: 1500, monthlyCents: 9900 },
  { band: 'xl', label: 'Very large school', upTo: 20000, monthlyCents: 14900 },
]

export const SCHOOL_TRIAL_DAYS = 30
/** A Champion still on its trial gets this many more days (settle_schools in the SQL). */
export const SCHOOL_CHAMPION_TRIAL_DAYS = 30
/** A year is this many months' money: two free for paying up front. */
export const SCHOOL_YEAR_MONTHS = 10
export const SCHOOL_MIN_STUDENTS = 5
/*
 * Three rules that live in supabase/schools.sql, copied here so the school
 * help page can say them. tests/schoolhelp.mjs reads the SQL and fails if a
 * copy and its rule ever differ.
 */
/** Accepted chores a student can score a day (school_kid_points: least(count(*), 8)). */
export const SCHOOL_DAILY_CHORES = 8
/** Rivalries a school can have at once, waiting or active (challenge_school). */
export const SCHOOL_MAX_RIVALS = 3
/** A school's Stars each month (settle_school_month: rn <= 10). */
export const SCHOOL_STARS = 10

/** What a school this size pays, worked out the same way the database does. */
export function schoolPrice(students) {
  const n = Math.floor(Number(students))
  if (!Number.isFinite(n) || n < 1 || n > 20000) return null
  const row = SCHOOL_PRICES.find((p) => n <= p.upTo)
  return {
    band: row.band,
    label: row.label,
    monthlyCents: row.monthlyCents,
    yearlyCents: row.monthlyCents * SCHOOL_YEAR_MONTHS,
    trialDays: SCHOOL_TRIAL_DAYS,
  }
}

/*
 * School districts: one plan, by invoice, for many schools (supabase/schools.sql,
 * "School districts"). Each school is priced by its size at the yearly price
 * above, less a discount that depends on its place in the district's plan,
 * biggest school first: the 1st to 9th 10% off, the 10th to 24th 20% off, the
 * 25th onwards 30% off. Like tax brackets, so adding a school always adds to
 * the total: with one discount for the whole plan, ten schools at 20% off
 * would cost less than nine at 10% off. district_price_quote() in the SQL is
 * the same, and tests/schools.mjs fails if the two ever disagree.
 */
export const DISTRICT_DISCOUNTS = [
  { from: 1, pct: 10 },
  { from: 10, pct: 20 },
  { from: 25, pct: 30 },
]
/** A district plan is for at least this many schools: one school is the School League. */
export const DISTRICT_MIN_SCHOOLS = 2
/** More than this, and a district asks for a quote. */
export const DISTRICT_MAX_SCHOOLS = 100
/** How long a school's invite for its principal lasts (add_district_school). */
export const DISTRICT_INVITE_DAYS = 30

/** The discount on the school in this place in a district's plan, in percent. */
export function districtDiscount(place) {
  let pct = 0
  for (const step of DISTRICT_DISCOUNTS) if (place >= step.from) pct = step.pct
  return pct
}

/**
 * What a district pays a year for schools of these sizes, worked out the way
 * the database does: one line per size and discount. Null when the sizes are
 * not schools, or there are too few or too many of them.
 */
export function districtPrice(studentCounts) {
  const list = Array.isArray(studentCounts) ? studentCounts : []
  if (list.length < DISTRICT_MIN_SCHOOLS || list.length > DISTRICT_MAX_SCHOOLS) return null
  const quotes = list.map((n) => schoolPrice(n))
  if (quotes.some((q) => !q)) return null
  const placed = [...quotes].sort((a, b) => b.yearlyCents - a.yearlyCents)
  const lines = []
  placed.forEach((q, i) => {
    const pct = districtDiscount(i + 1)
    let line = lines.find((l) => l.band === q.band && l.pct === pct)
    if (!line) {
      line = { band: q.band, label: q.label, pct, quantity: 0, fullCents: q.yearlyCents,
        unitYearlyCents: Math.round((q.yearlyCents * (100 - pct)) / 100), yearlyCents: 0 }
      lines.push(line)
    }
    line.quantity += 1
    line.yearlyCents = line.unitYearlyCents * line.quantity
  })
  lines.sort((a, b) => b.fullCents - a.fullCents || a.pct - b.pct)
  const yearlyCents = lines.reduce((sum, l) => sum + l.yearlyCents, 0)
  const fullYearlyCents = quotes.reduce((sum, q) => sum + q.yearlyCents, 0)
  return {
    schools: list.length,
    lines: lines.map((l) => ({ band: l.band, label: l.label, pct: l.pct, quantity: l.quantity,
      unitYearlyCents: l.unitYearlyCents, yearlyCents: l.yearlyCents })),
    yearlyCents,
    fullYearlyCents,
    savingCents: fullYearlyCents - yearlyCents,
  }
}

/** "North Valley" → "North Valley district", but never "… District district". */
export const districtLabel = (d) => (/\bdistrict$/i.test(String(d || '').trim()) ? d : `${d} district`)

export const dollars = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

/** "2026-09" → "September 2026". */
export function monthLabel(key) {
  if (!key) return ''
  const [y, m] = String(key).split('-').map(Number)
  if (!y || !m) return String(key)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const SCHOOL_ERRORS = {
  unavailable: 'The School League needs the sync service. This device is not connected to one yet.',
  not_signed_in: 'Sign in first.',
  not_an_adult: 'A child’s account cannot do this. A teacher or principal signs the school up.',
  already_staff: 'You are already on a school’s staff.',
  bad_name: 'Give the school’s full name.',
  bad_district: 'Which district is the school in?',
  bad_size: 'How many students are at the school? (1 to 20,000)',
  bad_your_name: 'Add your name, as parents and staff will see it.',
  no_such_code: 'No school has that code. Check the letters and try again.',
  not_a_parent: 'Only a parent on the account can do this.',
  not_your_child: 'That is not one of your children.',
  already_in_one: 'That child is already in a school. Take them out of it first.',
  not_in_one: 'That child is not in a school.',
  not_school_admin: 'Only the school’s admin can do this.',
  not_school_staff: 'Only school staff can do this.',
  not_verified_yet: 'We are still checking your school is real. Rivalries open once it is.',
  plan_not_active: 'Your school’s plan has ended. Renew it to compete.',
  no_such_school: 'That school cannot be challenged right now.',
  too_many_rivals: 'Three rivals at a time. End one to start another.',
  already_rivals: 'You already have a rivalry with that school.',
  no_such_challenge: 'That challenge has already been answered.',
  nothing_to_publish: 'There is no list for that month yet.',
  no_such_place: 'That place is already empty.',
  smaller_contact_us: 'Your school has been checked at its current size. Contact us to make it smaller.',
  not_yourself: 'To leave, use “Leave this school’s staff” instead.',
  not_on_staff: 'They are no longer on the staff.',
  last_staff: 'You are the only member of staff. Add a teacher with the staff code first, or contact us to close the school.',
  paying_contact_us: 'Your plan is being paid, so the price is on your card. Contact us to change your school’s size.',
  not_your_school: 'That league belongs to a school you are not part of.',
  invite_expired: 'That invite has run out. Ask your district for a new one.',
  already_in_district: 'Your school is already part of a district. Leave it first.',
  not_in_district: 'Your school is not part of a district.',
  too_many_schools: 'That district already has as many schools as a plan can hold. Ask the district to get a quote.',
  // Pilot codes (redeem_school_pilot).
  bad_code: 'That is not a pilot code we know. Check the letters and try again.',
  used: 'That pilot code has already been used.',
  expired: 'That pilot code has run out. Ask us for a new one.',
  too_many_tries: `That is ${PILOT_TRIES_AN_HOUR} codes that did not work in an hour. Please wait an hour and try again.`,
  already_piloted: 'Your school has already had its pilot.',
  already_paying: 'Your school already has a plan, so a pilot would add nothing. The code is still unused.',
  district_pays: 'Your district already pays for your school, so a pilot would add nothing. The code is still unused.',
  suspended: 'This school is suspended. Contact us to sort it out.',
  // Houses and classes.
  bad_group_name: `Give it a short name, up to 30 letters, that children can read.`,
  group_name_taken: 'Your school already has one with that name.',
  too_many_groups: `A school can have up to ${SCHOOL_MAX_GROUPS}.`,
  no_such_group: 'That one is not in this school any more.',
  bad_group_kind: 'Choose houses or classes.',
}

export function schoolError(reason) {
  return SCHOOL_ERRORS[reason] || 'That did not work. Please try again.'
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

const code = (s) => String(s || '').toUpperCase().trim()

export const schools = {
  // For a principal or teacher.
  register: ({ name, district, city, students, yourName }) =>
    call('register_school', {
      p_name: name, p_district: district, p_city: city || '',
      p_students: Number(students), p_your_name: yourName,
    }),
  joinStaff: (staffCode, yourName) => call('join_school_staff', { p_staff_code: code(staffCode), p_your_name: yourName }),
  // A principal whose district added the school, with the district's invite.
  claimInvite: (invite, yourName) => call('claim_school_invite', { p_code: code(invite), p_your_name: yourName }),
  joinDistrict: (districtCode) => call('join_district', { p_code: code(districtCode) }),
  leaveDistrict: () => call('leave_district'),
  overview: () => call('school_overview'),
  rotateCodes: () => call('rotate_school_codes'),
  districtSchools: (query = '') => call('district_schools', { p_query: query }),
  challenge: (schoolId) => call('challenge_school', { p_rival_id: schoolId }),
  answer: (rivalryId, accept) => call('answer_challenge', { p_rivalry_id: rivalryId, p_accept: accept }),
  endRivalry: (rivalryId) => call('end_rivalry', { p_rivalry_id: rivalryId }),
  leaveStaff: () => call('leave_school_staff'),
  removeStaff: (ref) => call('remove_school_staff', { p_ref: ref }),
  removeStar: (monthKey, rank) => call('remove_school_star', { p_month_key: monthKey, p_rank: rank }),
  updateSize: (students) => call('update_school_size', { p_students: Number(students) }),
  publishStars: (monthKey, leaveOut = []) =>
    call('publish_top_students', { p_month_key: monthKey, p_leave_out: leaveOut }),
  // A pilot code from us, and the report for the school office.
  redeemPilot: (pilotCode) => call('redeem_school_pilot', { p_code: normalizePilotCode(pilotCode) }),
  report: () => call('school_pilot_report'),
  // Houses (or classes), named by the admin.
  addGroup: (name) => call('add_school_group', { p_name: name }),
  renameGroup: (id, name) => call('rename_school_group', { p_group_id: id, p_name: name }),
  removeGroup: (id) => call('remove_school_group', { p_group_id: id }),
  setGroupKind: (kind) => call('set_school_group_kind', { p_kind: kind === 'class' ? 'class' : 'house' }),

  // For a family.
  mine: () => call('my_schools'),
  join: (kidId, joinCode, showName) =>
    call('join_school', { p_kid_id: kidId, p_join_code: code(joinCode), p_show_name: Boolean(showName) }),
  setNameSharing: (kidId, show) => call('set_school_name_sharing', { p_kid_id: kidId, p_show: Boolean(show) }),
  leave: (kidId) => call('leave_school', { p_kid_id: kidId }),
  // Which house (or class) a child is in. Null for none.
  setGroup: (kidId, groupId) => call('set_kid_school_group', { p_kid_id: kidId, p_group_id: groupId || null }),

  // Either.
  league: (schoolId = null) => call('school_league', { p_school_id: schoolId }),
}

/** "House" or "Class", from the school's choice (schools.group_kind). */
export const groupWord = (kind, { plural = false, lower = false } = {}) => {
  const word = kind === 'class' ? (plural ? 'Classes' : 'Class') : (plural ? 'Houses' : 'House')
  return lower ? word.toLowerCase() : word
}

const PILOT_REQUEST_URL = import.meta.env?.VITE_PILOT_REQUEST_URL || '/api/pilot-request'

/**
 * Send a "Request a pilot" request. No account needed: it goes to the
 * server, which emails it to whoever runs RankUp and keeps none of it.
 * Checked here first with the same rules the server uses.
 */
export async function requestPilot(form) {
  const { ok, errors, clean } = checkPilotRequest(form)
  if (!ok) return { ok: false, reason: 'invalid', errors }
  // Never from the look-around: nothing in the demo is sent anywhere.
  if (transport.isNetworkPaused()) return { ok: false, reason: 'demo' }
  try {
    const res = await fetch(PILOT_REQUEST_URL, {
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

export const PILOT_REQUEST_ERRORS = {
  demo: 'This is the demo, so nothing is sent. Leave the demo to send a request.',
  too_many_requests: 'We have had a few requests from here this hour. Please try again later.',
  busy: 'We have had a lot of requests this hour. Please try again later.',
  not_configured: 'Pilot requests are not set up on this site yet.',
  not_sent: 'Your request could not be sent just now. Please try again in a few minutes.',
}

export function pilotRequestError(reason) {
  return PILOT_REQUEST_ERRORS[reason] || 'Your request could not be sent. Please try again.'
}

/** "16 November 2026". */
export const longDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

// ---------------------------------------------------------------------------
// The look-around. Same shapes the database returns, clearly sample data, so
// the demo can show a feature that otherwise needs a real school.
// ---------------------------------------------------------------------------

function lastMonthKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function demoSchoolCard({ forKid = null, asKid = false, staff = false } = {}) {
  const last = lastMonthKey()
  const stars = [
    { rank: 1, score: 41, name: 'Maya', you: false, yours: false, published: true, excluded: false },
    { rank: 2, score: 38, name: forKid || 'A student', you: Boolean(forKid) && asKid, yours: Boolean(forKid) && !asKid, published: true, excluded: false },
    { rank: 3, score: 35, name: 'Leo', you: false, yours: false, published: true, excluded: false },
    { rank: 4, score: 33, name: 'A student', you: false, yours: false, published: true, excluded: false },
    { rank: 5, score: 30, name: 'Zara', you: false, yours: false, published: true, excluded: false },
  ]
  const card = {
    name: 'Oakridge Elementary',
    district: 'North Valley',
    city: 'Springfield',
    verified: true,
    live: true,
    score: 14.2,
    students: 186,
    min_students: SCHOOL_MIN_STUDENTS,
    ranked: true,
    district_rank: 2,
    district_schools: 6,
    rivalries: [
      { id: 'demo-r1', status: 'active', asked_by_us: true, rival: { name: 'Lakeside Academy', city: 'Springfield' }, our_score: 14.2, their_score: 12.4, won: 2, lost: 1, drawn: 0 },
      ...(staff ? [{ id: 'demo-r2', status: 'pending', asked_by_us: false, rival: { name: 'Pine Hill School', city: 'Shelbyville' }, our_score: 14.2, their_score: 15.0, won: 0, lost: 0, drawn: 0 }] : []),
    ],
    stars,
    stars_month: last,
    titles: [{ month: '2026-06', score: 15.8 }],
    houses: DEMO_HOUSES,
  }
  if (staff) {
    Object.assign(card, {
      role: 'admin',
      status: 'trial',
      trial_ends_at: new Date(Date.now() + 19 * 86400000).toISOString(),
      student_count: 420,
      price: { ok: true, band: 'medium', label: 'Medium school', monthly_cents: 5900, yearly_cents: 59000, trial_days: 30 },
      join_code: 'OAK7RD',
      staff_code: 'STAFF4NV',
      sharing_names: 121,
      staff: [{ name: 'Ms Lane', role: 'admin', you: true }, { name: 'Mr Ray', role: 'teacher', you: false }],
      challenges_in: 1,
      pilot: { days: PILOT_DEFAULT_DAYS, started_at: new Date(Date.now() - (PILOT_DEFAULT_DAYS - 19) * 86400000).toISOString(), ends_at: new Date(Date.now() + 19 * 86400000).toISOString() },
    })
  }
  return card
}

/*
 * Four houses, one too small to show. A shown house's numbers are made up
 * to be believable; the small one shows nothing, as the database does.
 */
const demoHouse = (id, name, students, active, chores) => ({
  id, name, shown: true, students, active, chores,
  share_pct: Math.round((100 * active) / students),
  average: Math.round((chores / students) * 10) / 10,
})
const DEMO_HOUSES = {
  kind: 'house',
  min_students: SCHOOL_MIN_STUDENTS,
  groups: [
    demoHouse('demo-h1', 'Kestrel', 52, 44, 812),
    demoHouse('demo-h2', 'Otter', 61, 49, 866),
    demoHouse('demo-h3', 'Heron', 48, 35, 590),
    { id: 'demo-h4', name: 'Badger', shown: false },
  ],
}

/** What school_pilot_report() returns for the sample school. */
export function demoReport(now = Date.now()) {
  const day = 86400000
  const from = new Date(now - (PILOT_DEFAULT_DAYS - 19) * day)
  const monday = new Date(now - 30 * day)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const shown = DEMO_HOUSES.groups.filter((g) => g.shown)
  const students = 186
  const active = 151
  const chores = 2718
  return {
    ok: true,
    school: { name: 'Oakridge Elementary', city: 'Springfield', district: 'North Valley', student_count: 420 },
    kind: 'pilot',
    from: from.toISOString(),
    to: new Date(now).toISOString(),
    ends_at: new Date(now + 19 * day).toISOString(),
    over: false,
    status: 'trial',
    paid: false,
    min_students: SCHOOL_MIN_STUDENTS,
    totals: { shown: true, students, active, share_pct: Math.round((100 * active) / students), chores, average: Math.round((chores / students) * 10) / 10 },
    busiest_week: { starts: monday.toISOString().slice(0, 10), chores: 412 },
    kinds: [{ kind: 'kitchen', share_pct: 31 }, { kind: 'bedroom', share_pct: 24 }, { kind: 'pets', share_pct: 12 }],
    groups: { ...DEMO_HOUSES, groups: [...shown].sort((a, b) => b.average - a.average).concat(DEMO_HOUSES.groups.filter((g) => !g.shown)) },
    price: (({ band, label, monthlyCents, yearlyCents, trialDays }) => ({
      ok: true, band, label, monthly_cents: monthlyCents, yearly_cents: yearlyCents, trial_days: trialDays,
    }))(schoolPrice(420)),
  }
}

export const DEMO_LEAGUE = {
  ok: true,
  district: 'North Valley',
  min_students: SCHOOL_MIN_STUDENTS,
  schools: [
    { name: 'Pine Hill School', city: 'Shelbyville', score: 15.0, students: 240, ranked: true, you: false },
    { name: 'Oakridge Elementary', city: 'Springfield', score: 14.2, students: 186, ranked: true, you: true },
    { name: 'Lakeside Academy', city: 'Springfield', score: 12.4, students: 301, ranked: true, you: false },
    { name: 'Hillcrest Middle', city: 'Ogdenville', score: 9.7, students: 158, ranked: true, you: false },
    { name: 'Riverbend School', city: 'Shelbyville', score: 8.1, students: 97, ranked: true, you: false },
    { name: 'Maple Grove', city: 'North Haverbrook', score: 6.3, students: 64, ranked: true, you: false },
  ],
  champion: { month: '2026-06', name: 'Oakridge Elementary', city: 'Springfield', score: 15.8 },
}

/** What my_schools() returns for the look-around family. */
export function demoMySchools(kids = [], onlyKidId = null) {
  return {
    ok: true,
    children: kids
      .map((k, i) => ({
        kid_id: k.id,
        kid_name: k.name,
        show_name: i === 0,
        group_id: i === 0 ? 'demo-h2' : null,
        // The first child is in a school and the second is not, so the
        // look-around shows both the league and how a child joins one.
        school: i === 0 ? demoSchoolCard({ forKid: k.name, asKid: Boolean(onlyKidId) }) : null,
      }))
      // A child sees their own school, not their brother's.
      .filter((c) => !onlyKidId || c.kid_id === onlyKidId),
  }
}

export const demoOverview = () => ({ ok: true, school: demoSchoolCard({ staff: true }) })

/**
 * What a school's staff are told about its plan, from school_overview()'s
 * `billing_status`, `billing_ends_at` and `status`. Null when there is
 * nothing to say.
 *
 * A failing card keeps a school playing while Stripe tries again, and the
 * page said nothing about it until the school dropped out of the league with
 * no warning. Mirrors billingNotice in billing.js for a family.
 */
export function schoolBillingNotice(school) {
  if (!school) return null
  const state = school.billing_status
  const until = school.billing_ends_at ? new Date(school.billing_ends_at) : null
  const after = school.status === 'trial' ? 'back on what is left of your free trial' : 'out of the league for now'
  switch (state) {
    case 'past_due':
      return {
        tone: 'bad', icon: '⚠️', title: 'A payment failed',
        body: 'The card was declined when your plan renewed. Your school is still in the league while Stripe tries again. Update the card in “Card, invoices and cancelling”.',
      }
    case 'unpaid':
    case 'incomplete_expired':
      return {
        tone: 'bad', icon: '⚠️', title: 'Your plan has stopped',
        body: `Stripe could not take the payment after several tries, so your school is ${after}. Choose a plan below to start again. Your students’ points are kept.`,
      }
    case 'refunded':
      return {
        tone: 'info', icon: '↩️', title: 'Your payment was refunded',
        body: `The payment was handed back in full, so that period is not paid for and your school is ${after}. Choose a plan below whenever you want it back. Your students’ points are kept.`,
      }
    case 'canceled':
      if (school.status === 'active') return null
      return {
        tone: 'info', icon: 'ℹ️', title: 'Your plan has ended',
        body: `Your school is ${after}. Choose a plan below to start again. Your students’ points are kept.`,
      }
    case 'active':
    case 'trialing':
      if (until && until.getTime() > Date.now()) {
        return {
          tone: 'info', icon: '📅', title: 'Your plan is ending',
          body: `It was cancelled, so it stops on ${until.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. Nothing changes until then. Changed your mind? Use “Card, invoices and cancelling”.`,
        }
      }
      return null
    default:
      return null
  }
}
