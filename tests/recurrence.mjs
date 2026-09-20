/**
 * The app and the database must agree on when a chore comes back.
 *
 * Both work it out. They have to: a phone with no backend still has to bring
 * tomorrow's chores back by itself, and a phone WITH one must not be the thing
 * that decides which chores reopen, because reopening a quest is how it gets
 * paid a second time.
 *
 * So the danger is drift. If the app shows "Make your bed" back on Saturday
 * and the database does not, the child does it, submits it, and the submission
 * is refused as not_open — for a chore that was on their list.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'
import { recurrenceDue } from '../src/lib/recurrence.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const RECURRENCES = ['once', 'daily', 'weekdays', 'weekly', 'monthly', null]
const STATUSES = ['assigned', 'submitted', 'approved', 'redo']
// A fortnight starting on a Monday, so every weekday and both weekend days are
// covered, plus the week boundary that 'weekly' turns on.
const DAYS = []
for (let i = 0; i < 15; i += 1) {
  const d = new Date(Date.UTC(2026, 8, 7 + i))   // 2026-09-07 is a Monday
  DAYS.push(d.toISOString().slice(0, 10))
}

console.log('\n=== When a repeating chore is due ===')
const cases = []
for (const recurrence of RECURRENCES) {
  for (const status of STATUSES) {
    for (const last of DAYS) {
      for (const today of DAYS) cases.push({ recurrence, status, last, today })
    }
  }
}
// And the case that is easiest to get wrong: nothing to measure from.
for (const recurrence of RECURRENCES) cases.push({ recurrence, status: 'approved', last: null, today: DAYS[0] })

const mismatches = []
for (const c of cases) {
  const fromDb = (await db.query(
    'select recurring_quest_due($1, $2, $3::date, $4::date) as due',
    [c.recurrence, c.status, c.last, c.today],
  )).rows[0].due
  const fromApp = recurrenceDue(
    { recurrence: c.recurrence, status: c.status, lastResetOn: c.last }, c.today,
  )
  if (Boolean(fromDb) !== fromApp) mismatches.push(`${JSON.stringify(c)} app=${fromApp} db=${fromDb}`)
}
ok(`the app and the database agree on all ${cases.length} of them`, mismatches.length === 0,
  `${mismatches.length} differ, first: ${mismatches[0] || ''}`)

console.log('\n=== And the rules are the ones a parent was promised ===')
const due = (recurrence, last, today, status = 'approved') =>
  recurrenceDue({ recurrence, status, lastResetOn: last }, today)

ok('a one-off never comes back', !due('once', '2026-09-07', '2026-09-30'))
ok('a daily chore is back the next morning', due('daily', '2026-09-07', '2026-09-08'))
ok('but not twice on the same day', !due('daily', '2026-09-08', '2026-09-08'))
ok('a school-day chore is back on Friday', due('weekdays', '2026-09-10', '2026-09-11'))
ok('and stays away on Saturday', !due('weekdays', '2026-09-11', '2026-09-12'))
ok('and on Sunday', !due('weekdays', '2026-09-11', '2026-09-13'))
ok('and is waiting again on Monday', due('weekdays', '2026-09-11', '2026-09-14'))
ok('a weekly chore waits the full seven days', !due('weekly', '2026-09-07', '2026-09-13'))
ok('and returns on the seventh', due('weekly', '2026-09-07', '2026-09-14'))

console.log('\n=== A chore that is not finished is never due ===')
// It would wipe a send-back note the parent had just written, which reads to
// the child as the parent changing their mind.
ok('one waiting to be approved does not reopen', !due('daily', '2026-09-07', '2026-09-09', 'submitted'))
ok('one sent back to redo does not reopen', !due('daily', '2026-09-07', '2026-09-09', 'redo'))
ok('one never started does not reopen', !due('daily', '2026-09-07', '2026-09-09', 'assigned'))

await db.end()
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
