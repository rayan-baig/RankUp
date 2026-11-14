/**
 * The "Get a quote" form for school districts: what is checked, the same way
 * in the browser and on the server (api/district-quote.js), so a request the
 * form let through is never refused for a reason the form did not show.
 *
 * Pure, no imports: the server loads it too. The request goes by email to
 * whoever runs RankUp and is not kept anywhere else; only adults fill it in.
 */

export const QUOTE_LIMITS = {
  district: 80,
  name: 60,
  role: 60,
  email: 200,
  message: 500,
  maxSchools: 2000,
  maxStudents: 2000000,
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

/** An email address as given, or '' when it is not one. */
export function cleanEmail(v) {
  const email = line(v, QUOTE_LIMITS.email).toLowerCase()
  return EMAIL.test(email) ? email : ''
}

const whole = (v) => {
  const s = String(v ?? '').replace(/[,\s]/g, '')
  return /^\d+$/.test(s) ? Number(s) : NaN
}

/**
 * Check the form. Returns { ok, errors: { field: 'what to fix' }, clean }.
 * The district, a name, an email and how many schools are needed; the role,
 * the number of students and a message are optional.
 */
export function checkQuoteForm(form = {}) {
  const errors = {}
  const clean = {
    district: line(form.district, QUOTE_LIMITS.district),
    name: line(form.name, QUOTE_LIMITS.name),
    role: line(form.role, QUOTE_LIMITS.role),
    email: cleanEmail(form.email),
    schools: whole(form.schools),
    students: String(form.students ?? '').trim() === '' ? null : whole(form.students),
    message: note(form.message, QUOTE_LIMITS.message),
  }
  if (clean.district.length < 2) errors.district = 'Which district is it?'
  if (clean.name.length < 1) errors.name = 'Your name, so we know who to write to.'
  if (!clean.email) errors.email = 'An email address we can reply to.'
  if (!Number.isInteger(clean.schools) || clean.schools < 1 || clean.schools > QUOTE_LIMITS.maxSchools) {
    errors.schools = `How many schools? (1 to ${QUOTE_LIMITS.maxSchools.toLocaleString('en-US')})`
  }
  if (clean.students !== null && (!Number.isInteger(clean.students) || clean.students > QUOTE_LIMITS.maxStudents)) {
    errors.students = 'About how many students, as a number. Or leave it empty.'
  }
  if (String(form.message ?? '').length > QUOTE_LIMITS.message) errors.message = `${QUOTE_LIMITS.message} characters at most.`
  return { ok: Object.keys(errors).length === 0, errors, clean }
}
