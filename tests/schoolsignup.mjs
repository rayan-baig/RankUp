/**
 * A school, from the front page to its first league table, step by step.
 *
 * Counts every field typed and every button tapped by a principal who checks
 * the price on the way, then signs up. It was eleven steps over three
 * screens before the school's own page: the price and "Sign your school up";
 * an account screen (email, password, "Create account"); then the school
 * (name, school, district, town, the number of students typed a second time,
 * "Sign the school up"). The account is part of the school's form now, and
 * the number of students comes with it from the price: nine steps, two
 * screens before the school's page.
 *
 * Against the mock API and a real Postgres (supabase/test/up.sh).
 */
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { SCHOOL_PRICES, dollars } from '../src/lib/schools.js'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const ok = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))

let steps = 0
const screens = new Set()
const type = async (locator, value) => { steps += 1; await locator.fill(value) }
const tap = async (locator) => { steps += 1; await locator.click() }
const screen = async (name) => { screens.add(name); await page.waitForTimeout(500) }
const field = (label) => page.locator('label', { hasText: label }).locator('input').first()

const stamp = Date.now()
const school = `Maple Grove Primary ${stamp}`

console.log('\n=== The front page: what it is and what it costs ===')
await page.goto(`${BASE}/#/school`, { waitUntil: 'networkidle' })
await screen('front page')
await type(page.getByPlaceholder('e.g. 420'), '420')
ok('the price for that size is shown before any account', /Medium school/.test(await page.locator('body').innerText()))
await tap(page.getByRole('button', { name: 'Sign your school up' }))

console.log('\n=== One form: the account and the school ===')
await screen('sign-up form')
ok('the account is asked for on the same form as the school',
  await page.getByTestId('school-account').isVisible() && await field('School name').isVisible())
ok('the number of students typed for the price is already there', (await field('Number of students').inputValue()) === '420')
ok('the town is marked optional', /Optional/.test(await page.locator('label', { hasText: 'Town or city' }).innerText()))
await type(page.locator('input[type=email]'), `principal${stamp}@example.com`)
await type(page.locator('input[type=password]'), 'correct-horse-battery')
await type(field('Your name'), 'Ms Lane')
await type(field('School name'), school)
await type(field('School district'), `Riverside ${stamp}`)
await type(field('Town or city'), 'Riverside')
await page.screenshot({ path: `${SHOT_DIR}/school-signup.png`, fullPage: true })
await tap(page.getByRole('button', { name: 'Sign the school up' }))

console.log('\n=== The school\'s page, with its league table ===')
await page.getByTestId('league-table').waitFor({ state: 'visible', timeout: 15000 })
await screen('school page')
const table = await page.getByTestId('league-table').innerText()
ok('the league table is there, with the new school in it', table.includes(school), table.slice(0, 200))
ok('and the parents\' code to send out', /For parents/.test(await page.locator('body').innerText()))
await page.screenshot({ path: `${SHOT_DIR}/school-first-table.png` })

console.log(`\n  ${steps} steps over ${screens.size} screens (it was 11 over 4)`)
ok(`${steps} steps, no more than 9`, steps <= 9, String(steps))
ok(`${screens.size} screens, no more than 3 counting the school's own page`, screens.size <= 3, [...screens].join(', '))

console.log('\n=== The help page for schools ===')
await page.evaluate(() => { window.location.hash = '/school/help' })
await page.waitForTimeout(1200)
const helpQuestions = await page.locator('button[aria-expanded]').count()
ok(`the help page opens, with ${helpQuestions} questions`, helpQuestions >= 9, String(helpQuestions))
await page.getByRole('button', { name: 'How much does it cost?' }).click()
await page.waitForTimeout(300)
ok('and the prices in it', (await page.getByTestId('school-help-price').innerText()).includes(`${dollars(SCHOOL_PRICES[1].monthlyCents)} a month`))
await page.screenshot({ path: `${SHOT_DIR}/school-help.png`, fullPage: true })

console.log('\n=== Signed in already: no account fields at all ===')
await page.evaluate(() => { window.location.hash = '/school' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
ok('a signed-in admin comes straight back to the school\'s page', await page.getByTestId('league-table').isVisible().catch(() => false))

await finish(errors, fails, browser)
