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
import {
  schoolPrice, SCHOOL_PRICES, dollars, monthLabel, demoMySchools,
  districtPrice, districtDiscount, DISTRICT_DISCOUNTS, DISTRICT_MIN_SCHOOLS, DISTRICT_MAX_SCHOOLS,
} from '../src/lib/schools.js'
import { schoolPriceId, schoolTrialEnd, championReward, schoolIdOf, SCHOOL_PRICE_ENV } from '../api/_shared/schoolBilling.js'
import {
  districtPriceId, districtItems, paidBands, districtUpdate, invoiceDays, districtIdOf, DISTRICT_PRICE_ENV,
} from '../api/_shared/districtBilling.js'
import { checkQuoteForm, cleanEmail } from '../src/lib/quoteRules.js'

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
ok('including on an invoice, where Stripe nests it now',
  schoolIdOf({ parent: { subscription_details: { metadata: { school_id: 's3' } } } }) === 's3')
ok('and where older API versions put it',
  schoolIdOf({ subscription_details: { metadata: { school_id: 's2' } } }) === 's2')

console.log('\n=== A district\'s price ===')
ok('the ladder: 10% off the 1st to 9th school, 20% the 10th to 24th, 30% from the 25th',
  districtDiscount(1) === 10 && districtDiscount(9) === 10 && districtDiscount(10) === 20
  && districtDiscount(24) === 20 && districtDiscount(25) === 30 && districtDiscount(100) === 30)
ok('two medium schools are $1,062 a year', districtPrice([420, 420]).yearlyCents === 106200)
ok('one school is not a district plan, nor are 101', districtPrice([420]) === null
  && districtPrice(Array(DISTRICT_MAX_SCHOOLS + 1).fill(420)) === null && districtPrice([420, 0]) === null)
{
  // The reason for brackets: one discount for the whole plan would make ten
  // schools cheaper than nine. Shown here so the comment stays true.
  const flat = (n) => n * (1 - (n >= 25 ? 0.3 : n >= 10 ? 0.2 : 0.1))
  ok('(one discount for everyone would make 10 schools cheaper than 9, and 25 cheaper than 24)',
    flat(10) < flat(9) && flat(25) < flat(24))
  let worse = 0
  for (const n of [100, 500, 1000, 5000]) {
    for (let k = DISTRICT_MIN_SCHOOLS; k < DISTRICT_MAX_SCHOOLS; k += 1) {
      if (districtPrice(Array(k + 1).fill(n)).yearlyCents <= districtPrice(Array(k).fill(n)).yearlyCents) worse += 1
    }
  }
  let seed = 7
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const sizes = [100, 500, 1000, 5000]
  for (let r = 0; r < 2000; r += 1) {
    const list = Array.from({ length: DISTRICT_MIN_SCHOOLS + Math.floor(rand() * 97) }, () => sizes[Math.floor(rand() * 4)])
    const before = districtPrice(list)
    const after = districtPrice([...list, sizes[Math.floor(rand() * 4)]])
    if (after.yearlyCents <= before.yearlyCents || after.yearlyCents >= after.fullYearlyCents) worse += 1
  }
  ok('adding a school never makes a plan cheaper, and a district always pays less than its schools alone (2,000 plans)', worse === 0, String(worse))
}
ok('the ladder starts at the first school and only grows',
  DISTRICT_DISCOUNTS[0].from === 1 && DISTRICT_DISCOUNTS.every((d, i) => i === 0 || (d.from > DISTRICT_DISCOUNTS[i - 1].from && d.pct > DISTRICT_DISCOUNTS[i - 1].pct)))

console.log('\n=== Invoicing a district ===')
const denv = Object.fromEntries(Object.values(DISTRICT_PRICE_ENV).flatMap((p) => Object.values(p)).map((name) => [name, `price_${name.toLowerCase()}`]))
ok('every size has a price at every step of the ladder',
  SCHOOL_PRICES.every((p) => DISTRICT_DISCOUNTS.every((d) => DISTRICT_PRICE_ENV[p.band]?.[d.pct])))
ok('a line is charged at its own size and discount', districtPriceId('medium', 20, denv) === 'price_stripe_price_district_medium_20')
const plan = districtPrice([420, 420, 900, 250]).lines
const items = districtItems(plan.map((l) => ({ band: l.band, pct: l.pct, quantity: l.quantity })), denv)
ok('the plan becomes one Stripe price per line, with the schools as its quantity',
  items.length === 3 && items.find((i) => i.price.endsWith('medium_10')).quantity === 2, JSON.stringify(items))
ok('a line with no price set means no invoice, not a cheaper one',
  districtItems([{ band: 'medium', pct: 10, quantity: 2 }], { STRIPE_PRICE_DISTRICT_SMALL_10: 'p' }) === null)
const sub = { items: { data: [
  { id: 'si_1', quantity: 2, price: { id: denv.STRIPE_PRICE_DISTRICT_MEDIUM_10 } },
  { id: 'si_2', quantity: 1, price: { id: denv.STRIPE_PRICE_DISTRICT_LARGE_10 } }] } }
ok('the webhook reads what a plan pays for from its prices', JSON.stringify(paidBands(sub, denv)) === JSON.stringify({ bands: { medium: 2, large: 1 }, all: false }))
ok('a price set by hand in Stripe (a quoted deal) pays for every school',
  paidBands({ items: { data: [{ quantity: 1, price: { id: 'price_hand_made' } }] } }, denv).all === true)
const change = districtUpdate(sub, [{ price: denv.STRIPE_PRICE_DISTRICT_MEDIUM_10, quantity: 3 }, { price: denv.STRIPE_PRICE_DISTRICT_SMALL_10, quantity: 1 }], denv)
ok('updating a plan changes quantities in place, takes off what is gone and adds what is new',
  JSON.stringify(change) === JSON.stringify([{ id: 'si_1', quantity: 3 }, { id: 'si_2', deleted: true }, { price: denv.STRIPE_PRICE_DISTRICT_SMALL_10, quantity: 1 }]),
  JSON.stringify(change))
ok('but never a plan set up by hand', districtUpdate({ items: { data: [{ id: 'si_x', price: { id: 'price_hand_made' } }] } }, [], denv) === null)
ok('30 days to pay unless DISTRICT_INVOICE_DAYS says otherwise, within reason',
  invoiceDays('') === 30 && invoiceDays('14') === 14 && invoiceDays('0') === 30 && invoiceDays('365') === 30)
ok('a district\'s Stripe objects are told apart from a school\'s and a family\'s',
  districtIdOf({ metadata: { district_id: 'd1' } }) === 'd1' && districtIdOf({ metadata: { school_id: 's1' } }) === null
  && districtIdOf({ parent: { subscription_details: { metadata: { district_id: 'd2' } } } }) === 'd2')

console.log('\n=== The "Get a quote" form ===')
const good = checkQuoteForm({ district: ' Big  Plains ', name: 'Dr Ames', email: 'Ames@District.org', schools: '140', students: '52,000' })
ok('a filled-in form passes, tidied', good.ok && good.clean.district === 'Big Plains' && good.clean.email === 'ames@district.org'
  && good.clean.schools === 140 && good.clean.students === 52000, JSON.stringify(good))
const bad = checkQuoteForm({ district: '', name: '', email: 'nope', schools: 'lots', students: 'many', message: 'x'.repeat(501) })
ok('an empty or wrong one names each field to fix',
  ['district', 'name', 'email', 'schools', 'students', 'message'].every((f) => bad.errors[f]), Object.keys(bad.errors).join(','))
ok('an email address is an email address', cleanEmail('a@b.co') === 'a@b.co' && cleanEmail('a@b') === '' && cleanEmail('a b@c.org') === '')

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

// And a district's plan, for the same mixes of schools.
let districtDrift = 0
let seed2 = 11
const rand2 = () => { seed2 = (seed2 * 16807) % 2147483647; return seed2 / 2147483647 }
const plans = [[420, 420], Array(10).fill(420), Array(25).fill(250), Array(DISTRICT_MAX_SCHOOLS).fill(1600), [1, 20000, 300, 301]]
for (let r = 0; r < 60; r += 1) {
  plans.push(Array.from({ length: DISTRICT_MIN_SCHOOLS + Math.floor(rand2() * 99) }, () => 1 + Math.floor(rand2() * 20000)))
}
for (const list of plans) {
  const { rows } = await client.query('select district_price_quote($1::int[]) as q', [list])
  const db = rows[0].q
  const app = districtPrice(list)
  const same = db.ok && app && db.yearly_cents === app.yearlyCents && db.full_yearly_cents === app.fullYearlyCents
    && db.schools === app.schools && db.lines.length === app.lines.length
    && db.lines.every((l, i) => l.band === app.lines[i].band && l.pct === app.lines[i].pct
      && l.quantity === app.lines[i].quantity && l.unit_yearly_cents === app.lines[i].unitYearlyCents)
  if (!same) {
    districtDrift += 1
    if (districtDrift <= 3) console.log(`  FAIL ${list.length} schools — app ${JSON.stringify(app)}, database ${JSON.stringify(db)}`)
  }
}
ok(`the app and the database price the same district plan, all ${plans.length} of them`, districtDrift === 0, `${districtDrift} disagreed`)
const tooFew = (await client.query('select district_price_quote($1::int[]) as q', [[420]])).rows[0].q
ok('and agree one school is not a district', tooFew.reason === 'too_few_schools' && districtPrice([420]) === null)

await client.end()
console.log(fails ? `\n${fails} FAILED` : '\nALL SCHOOL CHECKS PASSED')
process.exit(fails ? 1 : 0)
