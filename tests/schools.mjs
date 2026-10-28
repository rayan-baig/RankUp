/**
 * School prices, checked against the database.
 *
 * A principal sees the price in the app before they have an account, so the
 * app keeps its own copy of the price list (SCHOOL_PRICES). The database
 * holds the real one (school_price_quote), and a school must never be shown
 * one price and billed another. So both are asked about every size where the
 * answer could change, and every size in between that a school might be.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'
import { schoolPrice, SCHOOL_PRICES, dollars, monthLabel, demoMySchools } from '../src/lib/schools.js'
import { schoolPriceId, schoolTrialEnd, championReward, schoolIdOf, SCHOOL_PRICE_ENV } from '../api/_shared/schoolBilling.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== The app on its own ===')
ok('250 students is a small school', schoolPrice(250).band === 'small')
ok('a year is ten months', schoolPrice(900).yearlyCents === schoolPrice(900).monthlyCents * 10)
ok('nothing is not a school', schoolPrice(0) === null && schoolPrice('') === null && schoolPrice(20001) === null)
ok('dollars print without stray cents', dollars(5900) === '$59' && dollars(1250) === '$12.50')
ok('a month key reads as a month', /2026/.test(monthLabel('2026-09')))
ok('the bands are in order of size and price',
  SCHOOL_PRICES.every((p, i) => i === 0 || (p.upTo > SCHOOL_PRICES[i - 1].upTo && p.monthlyCents > SCHOOL_PRICES[i - 1].monthlyCents)))

const kids = [{ id: 'a', name: 'Ava' }, { id: 'n', name: 'Noah' }]
const parentView = demoMySchools(kids)
const kidView = demoMySchools(kids, 'n')
ok('the look-around shows one child in a school and one not',
  parentView.children[0].school && parentView.children[1].school === null)
ok('a child in the look-around sees only themselves',
  kidView.children.length === 1 && kidView.children[0].kid_id === 'n')
ok('a parent sees their child as "yours", not as "you"',
  parentView.children[0].school.stars.some((s) => s.yours && !s.you))

console.log('\n=== Charging a school ===')
const env = { STRIPE_PRICE_SCHOOL_MEDIUM: 'price_m', STRIPE_PRICE_SCHOOL_MEDIUM_YEAR: 'price_my' }
ok('a medium school is charged the medium price', schoolPriceId('medium', 'month', env) === 'price_m')
ok('yearly is its own price', schoolPriceId('medium', 'year', env) === 'price_my')
ok('anything that is not "year" is monthly', schoolPriceId('medium', 'weekly', env) === 'price_m')
ok('a band with no price set gets nothing, not a cheaper one', schoolPriceId('large', 'month', env) === '')
ok('a made-up band gets nothing', schoolPriceId('tiny', 'month', env) === '')
ok('every band has a monthly and a yearly price to set',
  SCHOOL_PRICES.every((p) => SCHOOL_PRICE_ENV.month[p.band] && SCHOOL_PRICE_ENV.year[p.band]))
const now = Date.UTC(2026, 9, 10)
ok('paying early keeps the rest of the free trial',
  schoolTrialEnd(new Date(now + 20 * 86400000).toISOString(), now) === Math.floor((now + 20 * 86400000) / 1000))
ok('a trial with under two days left is not carried (Stripe refuses it)',
  schoolTrialEnd(new Date(now + 86400000).toISOString(), now) === undefined)
ok('nor is one already over', schoolTrialEnd(new Date(now - 86400000).toISOString(), now) === undefined)
ok('a paying Champion gets a coupon', championReward({ status: 'active', stripe_customer_id: 'cus_1' }) === 'coupon')
ok('a Champion on its trial gets more trial', championReward({ status: 'trial' }) === 'extend_trial')
ok('a Champion whose plan ended waits', championReward({ status: 'lapsed', stripe_customer_id: 'cus_1' }) === 'wait')
ok('a school subscription is told apart from a family one',
  schoolIdOf({ metadata: { school_id: 's1' } }) === 's1' && schoolIdOf({ metadata: { family_id: 'f1' } }) === null)
ok('including on an invoice, where Stripe nests it',
  schoolIdOf({ subscription_details: { metadata: { school_id: 's2' } } }) === 's2')

console.log('\n=== The app and the database agree ===')
const client = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await client.connect()

const sizes = new Set([1, 20000])
for (const p of SCHOOL_PRICES) [p.upTo - 1, p.upTo, p.upTo + 1].forEach((n) => n >= 1 && n <= 20000 && sizes.add(n))
for (let n = 1; n <= 20000; n += 97) sizes.add(n)

let drift = 0
for (const n of [...sizes].sort((a, b) => a - b)) {
  const { rows } = await client.query('select school_price_quote($1) as q', [n])
  const db = rows[0].q
  const app = schoolPrice(n)
  if (db.band !== app.band || db.monthly_cents !== app.monthlyCents || db.yearly_cents !== app.yearlyCents
      || db.trial_days !== app.trialDays || db.label !== app.label) {
    drift += 1
    if (drift <= 5) console.log(`  FAIL ${n} students — app ${JSON.stringify(app)}, database ${JSON.stringify(db)}`)
  }
}
ok(`the app and the database quote the same on all ${sizes.size} sizes`, drift === 0, `${drift} disagreed`)

await client.end()
console.log(fails ? `\n${fails} FAILED` : '\nALL SCHOOL CHECKS PASSED')
process.exit(fails ? 1 : 0)
