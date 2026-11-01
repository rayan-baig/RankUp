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

/** Upper size of each band, and its price in cents a month. */
export const SCHOOL_PRICES = [
  { band: 'small', label: 'Small school', upTo: 300, monthlyCents: 2900 },
  { band: 'medium', label: 'Medium school', upTo: 800, monthlyCents: 5900 },
  { band: 'large', label: 'Large school', upTo: 1500, monthlyCents: 9900 },
  { band: 'xl', label: 'Very large school', upTo: 20000, monthlyCents: 14900 },
]

export const SCHOOL_TRIAL_DAYS = 30
export const SCHOOL_MIN_STUDENTS = 5

/** What a school this size pays, worked out the same way the database does. */
export function schoolPrice(students) {
  const n = Math.floor(Number(students))
  if (!Number.isFinite(n) || n < 1 || n > 20000) return null
  const row = SCHOOL_PRICES.find((p) => n <= p.upTo)
  return {
    band: row.band,
    label: row.label,
    monthlyCents: row.monthlyCents,
    // A year is ten months: two free for paying up front.
    yearlyCents: row.monthlyCents * 10,
    trialDays: SCHOOL_TRIAL_DAYS,
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

  // For a family.
  mine: () => call('my_schools'),
  join: (kidId, joinCode, showName) =>
    call('join_school', { p_kid_id: kidId, p_join_code: code(joinCode), p_show_name: Boolean(showName) }),
  setNameSharing: (kidId, show) => call('set_school_name_sharing', { p_kid_id: kidId, p_show: Boolean(show) }),
  leave: (kidId) => call('leave_school', { p_kid_id: kidId }),

  // Either.
  league: (schoolId = null) => call('school_league', { p_school_id: schoolId }),
}

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
    })
  }
  return card
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
        // The first child is in a school and the second is not, so the
        // look-around shows both the league and how a child joins one.
        school: i === 0 ? demoSchoolCard({ forKid: k.name, asKid: Boolean(onlyKidId) }) : null,
      }))
      // A child sees their own school, not their brother's.
      .filter((c) => !onlyKidId || c.kid_id === onlyKidId),
  }
}

export const demoOverview = () => ({ ok: true, school: demoSchoolCard({ staff: true }) })
