/**
 * Parental consent, in the browser.
 *
 * The claim: a parent cannot get to the point of adding a child without
 * consenting, and the consent is genuinely recorded rather than merely shown.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(m.text())
})

console.log('\n=== The policy is readable without an account ===')
await page.goto(`${BASE}#/legal/privacy`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
;(await page.getByText('Privacy Policy').count()) > 0
  ? pass('a parent can read the privacy policy before signing up')
  : fail('privacy policy is public', await page.locator('body').innerText().then((t) => t.slice(0, 120)))

console.log('\n=== Consent stands between the account and the child ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: /I'm a parent/ }).click()
await page.waitForTimeout(400)
await page.locator('input[type=email]').fill(`consent${Date.now()}@example.com`)
await page.locator('input[type=password]').fill('correct-horse-battery')
await page.getByRole('button', { name: 'Create account' }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Continue' }).click()
await page.locator('input').nth(0).fill('Sam')
await page.locator('input').nth(2).fill('1234')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(1200)

;(await page.getByText('What RankUp collects about your child').count()) > 0
  ? pass('the consent notice appears before any child is added')
  : fail('consent gate appears', await page.locator('body').innerText().then((t) => t.slice(0, 150)))

const blocked = await page.getByRole('button', { name: /I agree/ }).isDisabled()
blocked ? pass('you cannot agree without ticking and signing')
        : fail('agree is gated', 'button was enabled with nothing filled in')

await page.locator('input[type=checkbox]').check()
await page.waitForTimeout(200)
const stillBlocked = await page.getByRole('button', { name: /I agree/ }).isDisabled()
stillBlocked ? pass('ticking alone is not enough — a signature is required')
             : fail('signature required', 'enabled with no signature')

await page.locator('input[placeholder*="Samira"]').fill('Sam Rivera')
await page.waitForTimeout(300)
await page.getByRole('button', { name: /I agree/ }).click()
await page.waitForTimeout(2000)

;(await page.getByText(/Add your first kid/).count()) > 0
  ? pass('after consenting, you reach the child step')
  : fail('consent leads onward', await page.locator('body').innerText().then((t) => t.slice(0, 150)))

console.log('\n=== It was actually recorded ===')
const recorded = await page.evaluate(async () => {
  const raw = localStorage.getItem('rankup.session.v1')
  if (!raw) return { skipped: 'no session' }
  const token = JSON.parse(raw).access_token
  const res = await fetch('http://localhost:54321/rest/v1/rpc/export_family_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
    body: '{}',
  })
  const data = await res.json()
  return { consents: data?.consents?.length ?? 0, signed: data?.consents?.[0]?.signed_name }
})
recorded.consents === 1
  ? pass(`the consent is on the server, signed "${recorded.signed}"`)
  : fail('consent recorded server-side', JSON.stringify(recorded))

await finish(errors, fails, browser)
