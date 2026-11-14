/**
 * A school district, in a real browser: from the front page to the district
 * picture, a principal claiming their invite, and "Get a quote".
 *
 *   - the price ladder and the calculator say what the database charges;
 *   - a district office signs up in one form and adds schools, each with an
 *     invite for its principal, and the plan's price is the database's;
 *   - a principal signs up with the invite and runs the school's page, which
 *     says it is part of the district;
 *   - the district sees totals once five students take part, and never a
 *     child's name or anything a child typed;
 *   - the quote form checks what it needs and sends only that.
 *
 * Against the mock API and a real Postgres (supabase/test/up.sh).
 */
import pg from 'pg'
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { districtPrice, dollars, DISTRICT_DISCOUNTS } from '../src/lib/schools.js'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const ok = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))
const field = (p, label) => p.locator('label', { hasText: label }).locator('input, textarea').first()
const body = (p) => p.locator('body').innerText()

const stamp = Date.now()
const districtName = `Riverside Unified ${stamp}`

console.log('\n=== The front page: the ladder and the price ===')
await page.goto(`${BASE}/#/district`, { waitUntil: 'networkidle' })
await page.getByTestId('district-ladder').waitFor({ timeout: 15000 })
const ladder = await page.getByTestId('district-ladder').innerText()
ok('the ladder is there, every step of it', DISTRICT_DISCOUNTS.every((d) => ladder.includes(`${d.pct}% off each`)), ladder.slice(0, 200))
await field(page, 'Small school').fill('3')
await field(page, 'Medium school').fill('8')
await field(page, 'Large school').fill('1')
await page.waitForTimeout(200)
const twelve = districtPrice([250, 250, 250, ...Array(8).fill(800), 1500])
ok(`twelve schools are priced as the database prices them: ${dollars(twelve.yearlyCents)} a year`,
  (await page.getByTestId('district-quote').innerText()).includes(dollars(twelve.yearlyCents)))
ok('with what they save', (await page.getByTestId('district-quote').innerText()).includes(dollars(twelve.savingCents)))

console.log('\n=== Signing the district up: one form ===')
await page.getByRole('button', { name: 'Set up your district' }).click()
await page.getByTestId('district-account').waitFor()
await page.locator('input[type=email]').fill(`office${stamp}@example.com`)
await page.locator('input[type=password]').fill('correct-horse-battery')
await field(page, 'Your name').fill('Dr Ames')
await field(page, 'District name').fill(districtName)
await page.getByRole('button', { name: 'Sign the district up' }).click()
await page.getByTestId('district-totals').waitFor({ timeout: 15000 })
ok('the district page opens, under the district\'s name', (await body(page)).includes(districtName))
ok('with a code for schools already on RankUp', /^[A-Z0-9]{8}$/.test((await page.getByTestId('district-code').innerText()).trim()))

console.log('\n=== Adding schools ===')
const addSchool = async (name, students) => {
  await page.getByRole('button', { name: 'Add a school' }).click()
  await field(page, 'School name').fill(name)
  await field(page, 'Town or city').fill('Riverside')
  await field(page, 'Number of students').fill(String(students))
  await page.getByRole('button', { name: 'Add it' }).click()
  await page.getByTestId('district-invite').waitFor({ timeout: 10000 })
  const invite = (await page.getByTestId('district-invite').innerText()).trim()
  return invite
}
const oakInvite = await addSchool(`Oak Primary ${stamp}`, 420)
ok('each school added comes with a ten-letter invite for its principal', /^[A-Z0-9]{10}$/.test(oakInvite), oakInvite)
await page.screenshot({ path: `${SHOT_DIR}/district-invite.png` })
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(600)
await addSchool(`Elm Middle ${stamp}`, 900)
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(800)
const schoolsText = await page.getByTestId('district-schools').innerText()
ok('both schools are listed, each with its invite until it is used', schoolsText.includes(`Oak Primary ${stamp}`)
  && schoolsText.includes(oakInvite) && schoolsText.includes(`Elm Middle ${stamp}`))
ok('each says how it is paid for: a free trial, for now', /Free trial, \d+ days left/.test(schoolsText))
ok('and shows no numbers while too few students take part', /Numbers show once 5 or more students take part/.test(schoolsText))
const plan = await page.getByTestId('district-plan').innerText()
const two = districtPrice([420, 900])
ok(`the plan is the database's price: ${dollars(two.yearlyCents)} a year for two schools`, plan.includes(dollars(two.yearlyCents)), plan.slice(0, 300))
ok('and says what happens if the district stops paying', /goes back to its own plan, its free trial or the free\s+level/.test(plan))

console.log('\n=== The principal claims the invite ===')
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const head = await ctx2.newPage()
head.on('pageerror', (e) => errors.push(`principal pageerror: ${e.message}`))
await head.goto(`${BASE}/#/school`, { waitUntil: 'networkidle' })
await head.getByRole('button', { name: 'Sign your school up' }).click()
await head.getByRole('tab', { name: 'I have a code' }).click()
await head.locator('input[type=email]').fill(`principal${stamp}@example.com`)
await head.locator('input[type=password]').fill('correct-horse-battery')
await field(head, 'Your name').fill('Ms Oak')
await field(head, 'Staff or invite code').fill(oakInvite.toLowerCase())
await head.getByRole('button', { name: 'Join my school' }).click()
await head.getByTestId('school-district').waitFor({ timeout: 15000 })
const headText = await body(head)
ok('the principal runs the school\'s page, with the parents\' code', /For parents/.test(headText) && headText.includes(`Oak Primary ${stamp}`))
ok('which says the school is part of the district', headText.includes(`Part of ${districtName}`))

console.log('\n=== The district picture: totals only ===')
// Six children of one family in Oak, with chores done this month. Their
// names, and the note one typed, must never reach the district.
const db = new pg.Client({
  host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()
const fam = (await db.query(`insert into families (name, tier) values ('The Wobblethorpes', 'standard') returning id`)).rows[0].id
const parentUser = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`wobble${stamp}@example.com`])).rows[0].id
await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Wilma')`, [parentUser, fam])
await db.query('select seed_consent($1, $2)', [fam, parentUser])
const oakId = (await db.query('select id from schools where name = $1', [`Oak Primary ${stamp}`])).rows[0].id
for (let n = 1; n <= 6; n += 1) {
  const kid = (await db.query(`insert into kids (family_id, name) values ($1, $2) returning id`, [fam, `Wobblethorpe Kid${n}`])).rows[0].id
  const quest = (await db.query(`insert into quests (family_id, kid_id, title) values ($1, $2, 'Feed the axolotl') returning id`, [fam, kid])).rows[0].id
  await db.query(`insert into school_members (kid_id, school_id, family_id, show_name, joined_at) values ($1, $2, $3, true, date_trunc('month', now()))`, [kid, oakId, fam])
  if (n <= 4) {
    await db.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at, note)
                    values ($1, $2, $3, 'approved', now(), 'my secret note'), ($1, $2, $3, 'approved', now(), 'my secret note')`, [fam, quest, kid])
  }
}
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('district-totals').waitFor({ timeout: 15000 })
await page.waitForTimeout(500)
const totals = await page.getByTestId('district-totals').innerText()
const listed = await page.getByTestId('district-schools').innerText()
ok('Oak\'s numbers show once six students take part: 6 taking part, 67% did a chore, 8 chores',
  /\b6\b[\s\S]*taking part/i.test(listed) && listed.includes('67%') && /\b8\b\s*\n?\s*chores/i.test(listed), listed.slice(0, 400))
ok('the district totals count Oak, and leave out Elm (too few)', /\b6\b/.test(totals) && /1 of your schools has fewer than 5/.test(totals), totals)
ok('the principal shows as signed up', listed.includes('Principal signed up'))
const all = await body(page)
ok('never a child: no name, no note, no chore', !/Wobblethorpe|Kid1|secret note|axolotl|Wilma/.test(all))
await page.screenshot({ path: `${SHOT_DIR}/district-dashboard.png`, fullPage: true })

console.log('\n=== Get a quote ===')
let sentBody = null
await page.route('**/api/district-quote', async (route) => {
  sentBody = JSON.parse(route.request().postData() || '{}')
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
})
await page.getByRole('button', { name: /Get a quote/ }).first().click()
await page.getByTestId('quote-form').waitFor()
ok('the form starts with the district\'s name', (await field(page, 'District').inputValue()) === districtName)
await page.getByRole('button', { name: 'Send the request' }).click()
await page.waitForTimeout(300)
const asked = await page.getByTestId('quote-form').innerText()
ok('sent empty, it says what is missing, and sends nothing', /Your name, so we know/.test(asked) && /An email address/.test(asked) && sentBody === null, asked.slice(0, 300))
await field(page, 'Your name').fill('Dr Ames')
await field(page, 'Your role').fill('Superintendent')
await field(page, 'Work email').fill(`Office${stamp}@Example.com`)
await field(page, 'Schools').fill('140')
await field(page, 'Students, about').fill('52000')
await field(page, 'Anything else').fill('We pay by purchase order.')
await page.screenshot({ path: `${SHOT_DIR}/district-quote.png`, fullPage: true })
await page.getByRole('button', { name: 'Send the request' }).click()
await page.getByTestId('quote-sent').waitFor({ timeout: 10000 })
ok('it is sent, tidied: the email in lower case, the numbers as numbers', sentBody?.email === `office${stamp}@example.com`
  && sentBody?.schools === 140 && sentBody?.students === 52000 && sentBody?.district === districtName, JSON.stringify(sentBody))
ok('and the page says a person will reply', /A person reads it and replies/.test(await body(page)))

console.log('\n=== The school\'s own page: back to the front page link ===')
await head.goto(`${BASE}/#/school`, { waitUntil: 'networkidle' })
await ctx2.close()
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } })
const visitor = await fresh.newPage()
await visitor.goto(`${BASE}/#/school`, { waitUntil: 'networkidle' })
await visitor.getByRole('button', { name: /Buying for a whole district/ }).click()
await visitor.getByTestId('district-ladder').waitFor({ timeout: 10000 })
ok('the School League\'s front page leads to the district page', visitor.url().endsWith('#/district'))
await fresh.close()

await db.query('delete from families where id = $1', [fam])
await db.query('delete from auth.users where id = $1', [parentUser])
await db.end()
await finish(errors, fails, browser)
