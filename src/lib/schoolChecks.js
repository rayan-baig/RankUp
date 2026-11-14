/**
 * The operator's checklist for a school waiting to be verified.
 *
 * A verified school is ranked, can challenge rivals, and sees the first
 * names parents agreed to share, so it is worth five minutes. Each check is
 * something the operator does by hand, next to the facts RankUp already has
 * that help with it (from operator_schools() in supabase/schools.sql):
 * nothing here decides for them. `flag` marks a fact worth a second look.
 *
 * tests/schoolchecks.mjs checks each one.
 */
import { schoolPrice, dollars, districtLabel, SCHOOL_MIN_STUDENTS } from './schools.js'

/** Free email services: a school address is better evidence than one of these. */
export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk', 'outlook.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'zoho.com',
])

/** Words that often appear in a school's own email domain. */
const SCHOOLISH = /(\.edu(\.|$)|k12|\.sch\.|school|academy|isd|usd|\.ac\.)/i

const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The school's name, without the words most names share. */
function nameWords(name) {
  const common = new Set(['school', 'primary', 'elementary', 'middle', 'high', 'academy', 'the', 'of', 'and', 'st', 'saint'])
  return fold(name).split(' ').filter((w) => w.length > 2 && !common.has(w))
}

export function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@')
  return at === -1 ? '' : String(email).slice(at + 1).toLowerCase()
}

/** What the admin's email says about them working at the school. */
export function emailFact(staff = [], schoolName = '') {
  const admin = staff.find((s) => s.role === 'admin') || staff[0]
  if (!admin?.email) return { fact: 'No email on the account.', flag: 'warn' }
  const domain = emailDomain(admin.email)
  const confirmed = admin.email_confirmed === true ? 'confirmed' : admin.email_confirmed === false ? 'not confirmed yet' : 'confirmation unknown'
  if (FREE_MAIL.has(domain)) {
    return { fact: `${admin.name}, ${admin.email}: a free email address (${confirmed}). Call the school to check.`, flag: 'warn' }
  }
  const matches = nameWords(schoolName).some((w) => domain.includes(w))
  const looksLikeSchool = SCHOOLISH.test(`.${domain}`) || matches
  return {
    fact: `${admin.name}, ${admin.email} (${confirmed}). ${looksLikeSchool
      ? `${domain} looks like a school's own address${matches ? ' and matches its name' : ''}: check it is this school's.`
      : `${domain} is not obviously a school's: check it on the school's website.`}`,
    flag: looksLikeSchool && admin.email_confirmed !== false ? 'ok' : 'look',
  }
}

/** The checks for one school, given every school (for duplicates and neighbours). */
export function schoolChecks(school, all = []) {
  const others = all.filter((s) => s.id !== school.id)
  const key = school.district_key || fold(school.district)
  const sameDistrict = others.filter((s) => (s.district_key || fold(s.district)) === key)
  const sameName = sameDistrict.filter((s) => fold(s.name) === fold(school.name))
  const price = schoolPrice(school.student_count)
  const email = emailFact(school.staff, school.name)

  return [
    {
      id: 'exists',
      label: 'The school exists',
      how: 'Find it in the official list of schools for its area, or on its own website. The name and town should match.',
      fact: `${school.name} · ${school.city || 'no town given'} · ${districtLabel(school.district)}`,
      flag: school.city ? 'ok' : 'look',
    },
    {
      id: 'person',
      label: 'The person signing up works there',
      how: 'An address on the school’s own domain is good evidence. If not, or if in doubt, phone the school office on the number from its website, not one the person gave.',
      fact: email.fact,
      flag: email.flag,
    },
    {
      id: 'size',
      label: 'The size is about right',
      how: 'Compare with the number on the school’s website or the official list. The size sets the price, and a smaller size than the truth pays less.',
      fact: `${school.student_count} students: ${price ? `${price.label}, ${dollars(price.monthlyCents)} a month` : 'no price for that size'}${school.student_count < SCHOOL_MIN_STUDENTS ? ` (fewer than the ${SCHOOL_MIN_STUDENTS} who must join for it to be ranked, so it never could be)` : ''}.`,
      flag: !price || school.student_count < SCHOOL_MIN_STUDENTS ? 'warn' : 'ok',
    },
    {
      id: 'unique',
      label: 'It is not already signed up',
      how: 'Two accounts for one school split its students and its score. If one is already verified, this one is probably not needed.',
      fact: sameName.length
        ? `Same name in the same district: ${sameName.map((s) => `${s.name} (${s.verified ? 'verified' : s.status})`).join(', ')}.`
        : 'No other school with this name in this district.',
      flag: sameName.length ? 'warn' : 'ok',
    },
    {
      id: 'district',
      label: 'The district is spelled the official way',
      how: 'Schools only compete with schools whose district is written the same way. A new spelling is a league of one.',
      fact: sameDistrict.length
        ? `${sameDistrict.length} other ${sameDistrict.length === 1 ? 'school' : 'schools'} in ${districtLabel(school.district)}.`
        : `The first school in ${districtLabel(school.district)}. Check that is how the district is really written.`,
      flag: sameDistrict.length ? 'ok' : 'look',
    },
  ]
}
