/**
 * School pilots, houses and "Request a pilot": the rules both sides share.
 *
 * Pure, no imports: the server functions load it too (api/operator-schools.js
 * makes the codes, api/pilot-request.js checks the form), so what the page
 * says and what the server does are the same numbers. The database holds the
 * same rules again (supabase/schools.sql, "Pilots, the report for the school
 * office, and houses"), and supabase/test/58-pilots-and-houses.sql checks them.
 */

/** A pilot's length unless the operator says otherwise: a semester. PILOT_DAYS on the server changes it. */
export const PILOT_DEFAULT_DAYS = 90
/** The shortest and longest pilot a code can give (create_school_pilot). */
export const PILOT_MIN_DAYS = 14
export const PILOT_MAX_DAYS = 365
/** The school's admin is emailed this many days before the pilot ends (due_pilot_reminders). */
export const PILOT_REMINDER_DAYS = 14
/** A code is good for this long unless the operator picks another date. */
export const PILOT_CODE_VALID_DAYS = 60
/** Wrong codes a school's admin may type in an hour (redeem_school_pilot). */
export const PILOT_TRIES_AN_HOUR = 5
/** Houses (or classes) a school may have (school_max_groups). */
export const SCHOOL_MAX_GROUPS = 12
export const SCHOOL_GROUP_NAME_MAX = 30
/** "Request a pilot": this many an hour from one place (record_pilot_request). */
export const PILOT_REQUESTS_AN_HOUR = 3

/*
 * A code is 10 characters from the same alphabet as every school code:
 * capital letters and digits without 0, O, 1 and I. About 50 bits, shown as
 * XXXXX-XXXXX. The server makes it; the database keeps only its sha256.
 */
export const PILOT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const PILOT_CODE_LENGTH = 10

/** A code as typed, without spaces, dashes or case. The same as redeem_school_pilot. */
export function normalizePilotCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** "ABCDEFGHJK" as "ABCDE-FGHJK". */
export function formatPilotCode(text) {
  const code = normalizePilotCode(text).slice(0, PILOT_CODE_LENGTH)
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code
}

/** Ten characters from the alphabet: worth sending to the server. */
export function looksLikePilotCode(text) {
  const code = normalizePilotCode(text)
  return code.length === PILOT_CODE_LENGTH && [...code].every((c) => PILOT_CODE_ALPHABET.includes(c))
}

/** A pilot's length from a setting or a form: a whole number of days in range, or the default. */
export function pilotDays(value, fallback = PILOT_DEFAULT_DAYS) {
  const n = Number(String(value ?? '').trim())
  if (!Number.isInteger(n) || n < PILOT_MIN_DAYS || n > PILOT_MAX_DAYS) return fallback
  return n
}

// ---------------------------------------------------------------------------
// "Request a pilot", the front page's form. The same shape as "Get a quote"
// (src/lib/quoteRules.js): checked the same way in the browser and on the
// server, sent by email to whoever runs RankUp, and not kept.
// ---------------------------------------------------------------------------

export const PILOT_REQUEST_LIMITS = {
  school: 80,
  name: 60,
  role: 60,
  email: 200,
  town: 60,
  message: 500,
  maxStudents: 20000,
}

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/

/** One line of plain text: no control characters, spaces folded, trimmed. */
const line = (v, max) => String(v ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** A short note: line breaks kept (at most two in a row), nothing else odd. */
const note = (v, max) => String(v ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ' '))
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, max)

const whole = (v) => {
  const s = String(v ?? '').replace(/[,\s]/g, '')
  return /^\d+$/.test(s) ? Number(s) : NaN
}

/**
 * Check the form. Returns { ok, errors: { field: 'what to fix' }, clean }.
 * The school, a name and an email are needed; the role, the town, the
 * number of students and a note are optional.
 */
export function checkPilotRequest(form = {}) {
  const errors = {}
  const email = line(form.email, PILOT_REQUEST_LIMITS.email).toLowerCase()
  const clean = {
    school: line(form.school, PILOT_REQUEST_LIMITS.school),
    name: line(form.name, PILOT_REQUEST_LIMITS.name),
    role: line(form.role, PILOT_REQUEST_LIMITS.role),
    email: EMAIL.test(email) ? email : '',
    town: line(form.town, PILOT_REQUEST_LIMITS.town),
    students: String(form.students ?? '').trim() === '' ? null : whole(form.students),
    message: note(form.message, PILOT_REQUEST_LIMITS.message),
  }
  if (clean.school.length < 2) errors.school = 'Which school is it?'
  if (clean.name.length < 1) errors.name = 'Your name, so we know who to write to.'
  if (!clean.email) errors.email = 'An email address we can reply to.'
  if (clean.students !== null && (!Number.isInteger(clean.students) || clean.students < 1
      || clean.students > PILOT_REQUEST_LIMITS.maxStudents)) {
    errors.students = 'About how many students, as a number. Or leave it empty.'
  }
  if (String(form.message ?? '').length > PILOT_REQUEST_LIMITS.message) {
    errors.message = `${PILOT_REQUEST_LIMITS.message} characters at most.`
  }
  return { ok: Object.keys(errors).length === 0, errors, clean }
}
