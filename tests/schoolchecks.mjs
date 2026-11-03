/**
 * The operator's checklist for checking a school is real (/#/operator).
 *
 * Each school waiting to be verified shows what to check by hand, beside the
 * facts RankUp already has (src/lib/schoolChecks.js, from operator_schools()):
 * the school and its town, the admin's email and whether it is confirmed,
 * the size and the price it sets, another school with the same name in the
 * district, and how many schools share the district's spelling. "Verify"
 * waits until every check is ticked.
 *
 * The rules in Node, then the page in a browser with the operator's API
 * answered by the test (no server, no key).
 */
import { schoolChecks, emailFact } from '../src/lib/schoolChecks.js'
import { schoolPrice, dollars, SCHOOL_MIN_STUDENTS } from '../src/lib/schools.js'
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const ok = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))

const staff = (email, confirmed = true) => [{ name: 'Ms Lane', role: 'admin', email, email_confirmed: confirmed }]
const base = {
  id: 'a', name: 'Maple Grove Primary', district: 'Riverside', district_key: 'riverside', city: 'Riverside',
  student_count: 420, size_band: 'medium', status: 'trial', verified: false, created_at: '2026-11-01T10:00:00Z',
  students_joined: 3, paying: false, staff: staff('lane@maplegrove.sch.example'),
}
const twin = { ...base, id: 'b', verified: true, status: 'active', staff: staff('head@maplegrove.sch.example') }
const neighbour = { ...base, id: 'c', name: 'Oak Lane Elementary', verified: true }
const by = (list, id) => list.find((c) => c.id === id)

console.log('\n=== The checks, and the facts beside them ===')
const plain = schoolChecks(base, [base, neighbour])
ok('five checks, each with what to do and a fact', plain.length === 5 && plain.every((c) => c.label && c.how && c.fact && c.flag))
ok('the school, its town and district', by(plain, 'exists').fact === 'Maple Grove Primary · Riverside · Riverside district')
ok('a school address that matches its name is good evidence', by(plain, 'person').flag === 'ok' && /matches its name/.test(by(plain, 'person').fact), by(plain, 'person').fact)
const price = schoolPrice(420)
ok('the size, with the price it sets, from the price list', by(plain, 'size').fact.includes(`${price.label}, ${dollars(price.monthlyCents)} a month`), by(plain, 'size').fact)
ok('no other school of that name', by(plain, 'unique').flag === 'ok')
ok('one other school spells the district this way', /1 other school in Riverside district/.test(by(plain, 'district').fact))

console.log('\n=== What gets flagged ===')
ok('a free email address: phone the school', emailFact(staff('someone@gmail.com')).flag === 'warn' && /free email/.test(emailFact(staff('someone@gmail.com')).fact))
ok('an address not yet confirmed is a second look', emailFact(staff('lane@maplegrove.sch.example', false), base.name).flag === 'look')
ok('no email at all', emailFact([]).flag === 'warn')
const dupe = schoolChecks(base, [base, twin])
ok('the same name in the same district, with its state', by(dupe, 'unique').flag === 'warn' && /verified/.test(by(dupe, 'unique').fact), by(dupe, 'unique').fact)
const alone = schoolChecks({ ...base, district: 'Rivreside', district_key: 'rivreside' }, [base, neighbour])
ok('the first school in a district: check the spelling', by(alone, 'district').flag === 'look' && /first school/.test(by(alone, 'district').fact))
const tiny = schoolChecks({ ...base, student_count: SCHOOL_MIN_STUDENTS - 1 }, [])
ok(`fewer students than the ${SCHOOL_MIN_STUDENTS} a league needs`, by(tiny, 'size').flag === 'warn')
ok('no town given', schoolChecks({ ...base, city: '' }, []).find((c) => c.id === 'exists').flag === 'look')

console.log('\n=== On the operator page ===')
const { browser, page, errors } = await launch()
let schools = [base, twin, neighbour]
await page.route('**/api/operator-schools', async (route) => {
  const body = route.request().postDataJSON?.()
  if (body?.action === 'verify') schools = schools.map((s) => (s.id === body.school_id ? { ...s, verified: true } : s))
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, schools }) })
})
await page.goto(`${BASE}/#/operator`, { waitUntil: 'networkidle' })
await page.locator('input[type=password]').fill('any-key-the-test-answers')
await page.getByRole('button', { name: 'Open' }).click()
await page.getByTestId('school-checklist').first().waitFor({ timeout: 8000 })
const card = page.getByTestId('school-a')
const text = await card.innerText()
ok('the waiting school shows its checklist with the facts', /Before you verify \(0 of 5 checked\)/i.test(text)
  && text.includes('Ms Lane, lane@maplegrove.sch.example (confirmed)') && /Same name in the same district/.test(text), text.slice(0, 400))
ok('verified schools do not', (await page.getByTestId('school-checklist').count()) === 1)
const verify = card.getByRole('button', { name: /verify/ }).first()
ok('Verify waits until every check is ticked', await verify.isDisabled())
await page.screenshot({ path: `${SHOT_DIR}/operator-checklist.png`, fullPage: true })
const boxes = card.locator('input[type=checkbox]')
for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check()
ok('and then it can be pressed', await card.getByRole('button', { name: 'It is real: verify' }).isEnabled())
await card.getByRole('button', { name: 'It is real: verify' }).click()
await page.waitForTimeout(500)
ok('and the school is verified', (await page.getByTestId('school-checklist').count()) === 0)

await finish(errors, fails, browser)
