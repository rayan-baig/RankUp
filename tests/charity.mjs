/**
 * Charity Week, in the app and in the database.
 *
 * A week with a public promise attached is a date range two separate systems
 * have to agree about. The banner decides what a family is told; the database
 * decides what is counted and handed over. If those disagree by one day, the
 * app promised something on a day the total did not include — and the gap is
 * invisible until somebody adds it up in July.
 *
 * So both are run over the same instants and compared, including the awkward
 * ones: the first second, the last second, one second past the end, and the
 * turn of the year.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'
import {
  inCharityWeek,
  charityWindow,
  daysUntilCharityWeek,
  daysLeftOfCharityWeek,
  nextCharityWindow,
  charityDatesLabel,
} from '../src/lib/charity.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const iso = (ms) => new Date(ms).toISOString()

console.log('\n=== The window is where it should be ===')
{
  const w = charityWindow(2027)
  // The week containing 22 June 2027, which is a Tuesday — so the window is
  // Monday the 21st to Sunday the 27th. Hardcoded on purpose: a test that
  // recomputes the answer the same way the code does proves nothing.
  ok('starts midnight UTC on the Monday', iso(w.from) === '2027-06-21T00:00:00.000Z', iso(w.from))
  ok('and ends when the next Monday starts', iso(w.to) === '2027-06-28T00:00:00.000Z', iso(w.to))
  ok('which is exactly seven days', (w.to - w.from) === 7 * 86400000)
  ok('and 22 June itself is inside it', inCharityWeek(Date.UTC(2027, 5, 22)))

  // Every year, whatever weekday the 22nd lands on, the week must start on a
  // Monday and must contain the 22nd. That is the whole promise.
  let wrong = 0
  for (let y = 2026; y <= 2046; y += 1) {
    const win = charityWindow(y)
    const startsMonday = new Date(win.from).getUTCDay() === 1
    const holds22nd = inCharityWeek(Date.UTC(y, 5, 22))
    if (!startsMonday || !holds22nd) wrong += 1
  }
  ok('and that holds for the next twenty-one years', wrong === 0, `${wrong} years wrong`)
}

console.log('\n=== Both ends, to the second ===')
{
  const w = charityWindow(2027)
  inCharityWeek(w.from)
    ? ok('the very first instant is in', true)
    : ok('the very first instant is in', false)
  inCharityWeek(w.to - 1000)
    ? ok('the last second of the Sunday is in', true)
    : ok('the last second of the Sunday is in', false)
  !inCharityWeek(w.to)
    ? ok('and the next Monday is out — half-open, no double-counted day', true)
    : ok('the next Monday is out', false)
  !inCharityWeek(w.from - 1000)
    ? ok('the last second before it is out', true)
    : ok('the last second before it is out', false)
}

console.log('\n=== The countdown reads correctly from both sides ===')
{
  const w = charityWindow(2027)
  daysUntilCharityWeek(w.from - 3 * 86400000) === 3
    ? ok('three days before, it says three', true)
    : ok('three days before', false, String(daysUntilCharityWeek(w.from - 3 * 86400000)))
  daysUntilCharityWeek(w.from + 86400000) === 0
    ? ok('once it has started, nothing is counted down to', true)
    : ok('no countdown during the week', false)
  daysLeftOfCharityWeek(w.from + 86400000) === 6
    ? ok('one day in, six are left', true)
    : ok('days left', false, String(daysLeftOfCharityWeek(w.from + 86400000)))
  daysLeftOfCharityWeek(w.to + 86400000) === 0
    ? ok('and after it ends, none are', true)
    : ok('no days left after', false)

  // The one that would be wrong if the year were hardcoded anywhere.
  const julyFirst = Date.UTC(2027, 6, 1)
  nextCharityWindow(julyFirst).year === 2028
    ? ok('in July it is already looking at next year', true)
    : ok('rolls to next year', false, String(nextCharityWindow(julyFirst).year))
  const newYear = Date.UTC(2028, 0, 1)
  nextCharityWindow(newYear).year === 2028
    ? ok('and in January it is this year again, not last', true)
    : ok('January looks forward', false, String(nextCharityWindow(newYear).year))
}

console.log('\n=== It reads properly to a person ===')
charityDatesLabel(2027) === '21–27 June 2027'
  ? ok('the dates label says 21–27 June 2027', true)
  : ok('dates label', false, charityDatesLabel(2027))

console.log('\n=== And the database agrees, instant for instant ===')
const client = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await client.connect()

/*
 * Every boundary, plus a spread of ordinary days across several years —
 * including a leap year, because June sits after 29 February and an
 * off-by-one in day arithmetic shows up there first.
 */
const INSTANTS = []
for (const year of [2026, 2027, 2028, 2031]) {
  const w = charityWindow(year)
  INSTANTS.push(
    w.from - 1000, w.from, w.from + 1000,
    w.from + 3 * 86400000,
    w.to - 1000, w.to, w.to + 1000,
    Date.UTC(year, 0, 1), Date.UTC(year, 11, 31, 23, 59, 59),
  )
}

let drift = 0
for (const at of INSTANTS) {
  const { rows: [row] } = await client.query('select in_charity_week($1::timestamptz) as yes', [iso(at)])
  const app = inCharityWeek(at)
  if (app !== row.yes) {
    drift += 1
    console.log(`  FAIL ${iso(at)} — app says ${app}, database says ${row.yes}`)
  }
}
drift === 0
  ? ok(`the app and the database agree on all ${INSTANTS.length} instants`, true)
  : ok('app and database agree', false, `${drift} disagreed`)

console.log('\n=== The total counts the right payments ===')
await client.query(`
  insert into auth.users (id, email) values
    ('c0000000-0000-0000-0000-000000000001', 'charity-test@example.com')
  on conflict do nothing;
  insert into families (id, name) values
    ('c0000000-0000-0000-0000-00000000000f', 'Charity Test') on conflict do nothing;
`)

const w2027 = charityWindow(2027)
const add = (eventId, at, pence, currency = 'GBP') => client.query(
  `insert into billing_events (family_id, stripe_event, type, payload, amount_pence, currency, received_at)
   values ('c0000000-0000-0000-0000-00000000000f', $1, 'invoice.paid', '{}'::jsonb, $2, $3, $4)
   on conflict (stripe_event) do nothing`,
  [eventId, pence, currency, iso(at)],
)

await add('ch_in_1', w2027.from + 3600000, 499)
await add('ch_in_2', w2027.to - 3600000, 999)
await add('ch_in_usd', w2027.from + 7200000, 700, 'USD')
// Just outside, on both sides. These must not be counted.
await add('ch_before', w2027.from - 3600000, 100000)
await add('ch_after', w2027.to + 3600000, 100000)
// A real event that moved no money — a cancellation. Not revenue.
await client.query(
  `insert into billing_events (family_id, stripe_event, type, payload, received_at)
   values ('c0000000-0000-0000-0000-00000000000f', 'ch_cancel', 'canceled', '{}'::jsonb, $1)
   on conflict (stripe_event) do nothing`, [iso(w2027.from + 1000)],
)

const { rows: [{ total }] } = await client.query('select charity_week_total(2027) as total')
const gbp = (total.totals || []).find((t) => t.currency === 'GBP')
const usd = (total.totals || []).find((t) => t.currency === 'USD')

gbp?.pence === 1498
  ? ok('the pounds inside the week add up (£4.99 + £9.99)', true)
  : ok('GBP total', false, JSON.stringify(total.totals))
usd?.pence === 700
  ? ok('dollars are totalled separately, never converted', true)
  : ok('USD total', false, JSON.stringify(total.totals))
gbp?.payments === 2
  ? ok('and only the two payments inside it are counted', true)
  : ok('payment count', false, String(gbp?.payments))
!JSON.stringify(total.totals).includes('100000')
  ? ok('the £1000 an hour either side of the week is left out', true)
  : ok('boundaries excluded', false, JSON.stringify(total.totals))

// Idempotence: Stripe retries, and a retry must not inflate a charity total.
await add('ch_in_1', w2027.from + 3600000, 499)
const { rows: [{ total: again }] } = await client.query('select charity_week_total(2027) as total')
const gbpAgain = (again.totals || []).find((t) => t.currency === 'GBP')
gbpAgain?.pence === 1498
  ? ok('a retried Stripe event does not count twice', true)
  : ok('retry is idempotent', false, JSON.stringify(again.totals))

console.log('\n=== And a browser cannot read the company figures ===')
await client.query(`
  grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
`)
await client.query("set role app_user")
let refused = false
try {
  await client.query('select charity_week_total(2027)')
} catch (err) {
  refused = /permission denied/i.test(err.message)
}
await client.query('reset role')
refused
  ? ok('the total is not readable from a signed-in browser', true)
  : ok('total is revoked', false, 'a browser could read the subscriber count')

await client.end()
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
