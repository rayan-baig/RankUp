/**
 * The School League's help page answers what schools ask, with the code's
 * own numbers (src/data/schoolHelp.js).
 *
 * Every price is the price list's (SCHOOL_PRICES), the trial and the year are
 * the constants the sign-up and checkout use, and the three rules that live
 * only in the SQL (the daily chore cap, rivals at once, Stars a month) are
 * copied in src/lib/schools.js: this reads supabase/schools.sql and fails if
 * a copy and its rule ever differ.
 *
 * Runs the app's own code in Node; needs nothing running.
 */
import { readFileSync } from 'node:fs'
import { schoolHelp, schoolPriceLines } from '../src/data/schoolHelp.js'
import {
  SCHOOL_PRICES, SCHOOL_TRIAL_DAYS, SCHOOL_YEAR_MONTHS, SCHOOL_MIN_STUDENTS, SCHOOL_CHAMPION_TRIAL_DAYS,
  SCHOOL_DAILY_CHORES, SCHOOL_MAX_RIVALS, SCHOOL_STARS, dollars,
} from '../src/lib/schools.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const questions = schoolHelp()
const answer = (id) => (questions.find((q) => q.id === id)?.a || []).join(' ')
const everything = questions.map((q) => `${q.q} ${q.a.join(' ')}`).join('\n')

console.log('\n=== About ten real questions ===')
ok(`${questions.length} questions, between 9 and 12`, questions.length >= 9 && questions.length <= 12)
ok('each a question with an answer', questions.every((q) => q.q.endsWith('?') && q.a.length && q.a.every((l) => l.trim())))
ok('no two share an id', new Set(questions.map((q) => q.id)).size === questions.length)
for (const id of ['what', 'price', 'trial', 'join', 'points', 'see', 'verify', 'champion', 'rivals', 'staff', 'cancel']) {
  ok(`answered: ${questions.find((q) => q.id === id)?.q || id}`, Boolean(answer(id)))
}

console.log('\n=== Prices are the price list\'s ===')
for (const p of SCHOOL_PRICES) {
  ok(`${p.label}: ${dollars(p.monthlyCents)} a month and ${dollars(p.monthlyCents * SCHOOL_YEAR_MONTHS)} a year`,
    answer('price').includes(`${dollars(p.monthlyCents)} a month, or ${dollars(p.monthlyCents * SCHOOL_YEAR_MONTHS)} a year`))
}
ok('one line per size, smallest first', schoolPriceLines().length === SCHOOL_PRICES.length && schoolPriceLines()[0].startsWith(`Up to ${SCHOOL_PRICES[0].upTo}`))
const known = new Set(SCHOOL_PRICES.flatMap((p) => [dollars(p.monthlyCents), dollars(p.monthlyCents * SCHOOL_YEAR_MONTHS)]))
const quoted = [...everything.matchAll(/\$[\d,.]+/g)].map((m) => m[0])
ok('no price the code does not charge', quoted.every((q) => known.has(q)), quoted.filter((q) => !known.has(q)).join(', '))
const source = readFileSync('src/data/schoolHelp.js', 'utf8').replace(/\$\{[^}]*\}/g, '')
ok('and none typed by hand', !/\$\d/.test(source) && !/\b(29|59|99|149|290|590|990|1490)\b/.test(source))
ok(`the year is ${SCHOOL_YEAR_MONTHS} months' money`, answer('price').includes(`costs ${SCHOOL_YEAR_MONTHS} months, so ${12 - SCHOOL_YEAR_MONTHS} months are free`))

console.log('\n=== The other numbers are the code\'s ===')
ok(`a ${SCHOOL_TRIAL_DAYS}-day trial, no card`, answer('trial').includes(`${SCHOOL_TRIAL_DAYS} days`) && /no card/.test(answer('trial')))
ok(`at most ${SCHOOL_DAILY_CHORES} chores a day`, answer('points').includes(`at most ${SCHOOL_DAILY_CHORES} a day`))
ok(`${SCHOOL_MIN_STUDENTS} students to be ranked`, answer('points').includes(`at least ${SCHOOL_MIN_STUDENTS} students`))
ok(`${SCHOOL_MAX_RIVALS} rivals at once`, answer('rivals').includes(`up to ${SCHOOL_MAX_RIVALS} rivalries`))
ok(`top ${SCHOOL_STARS} Stars`, answer('see').includes(`top ${SCHOOL_STARS}`))
ok(`a Champion on its trial gets ${SCHOOL_CHAMPION_TRIAL_DAYS} more days`, answer('champion').includes(`${SCHOOL_CHAMPION_TRIAL_DAYS} more days`))
ok('no photos', /no photos/i.test(answer('see')))

console.log('\n=== The copies of the SQL\'s rules match it ===')
const sql = readFileSync('supabase/schools.sql', 'utf8')
ok(`school_kid_points caps a day at ${SCHOOL_DAILY_CHORES}`, sql.includes(`least(count(*), ${SCHOOL_DAILY_CHORES})`))
ok(`challenge_school allows ${SCHOOL_MAX_RIVALS} rivalries`, (sql.match(new RegExp(`>= ${SCHOOL_MAX_RIVALS} then\\s+return jsonb_build_object\\('ok', false, 'reason', 'too_many_rivals'\\)`, 'g')) || []).length === 2)
ok(`the Stars are the top ${SCHOOL_STARS}`, sql.includes(`where rn <= ${SCHOOL_STARS}`))
ok(`the trial is ${SCHOOL_TRIAL_DAYS} days`, sql.includes(`default now() + interval '${SCHOOL_TRIAL_DAYS} days'`))
ok(`a Champion's trial grows by ${SCHOOL_CHAMPION_TRIAL_DAYS} days`, sql.includes(`greatest(trial_ends_at, now()) + interval '${SCHOOL_CHAMPION_TRIAL_DAYS} days'`))

console.log('\n=== Reachable ===')
const app = readFileSync('src/App.jsx', 'utf8')
const portal = readFileSync('src/screens/SchoolPortal.jsx', 'utf8')
ok('the app has the page at /school/help, without an account', /route === '\/school\/help'/.test(app) && app.includes("route === '/school/help' || route === '/operator') return"))
ok('linked from the front page and the school\'s own page', (portal.match(/navigate\('\/school\/help'\)/g) || []).length === 2)

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
