/**
 * Parental consent, in the browser.
 *
 * The claim: a parent cannot get to the point of adding a child without
 * consenting, and the consent is genuinely recorded rather than merely shown.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE } from './helpers.mjs'
import { CONSENT_NOTICE, CONSENT_VERSION } from '../src/data/legalText.js'
const MOCK = process.env.MOCK_URL || 'http://localhost:54321'

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

// RankUp is a product of MTRX Horizyn, which is who runs it: both documents
// say so, and say nothing about any one person.
const privacyText = await page.locator('body').innerText()
;/RankUp is a product of MTRX Horizyn\. MTRX Horizyn operates it/.test(privacyText)
  ? pass('the privacy policy names MTRX Horizyn as who runs RankUp')
  : fail('operator named in the policy', privacyText.match(/Who we are[\s\S]{0,200}/i)?.[0])
;!/\[YOUR NAME|operated by \[/.test(privacyText)
  ? pass('with no name placeholder left in it')
  : fail('no name placeholder', privacyText.match(/.{0,40}\[YOUR NAME.{0,40}/)?.[0])
await page.goto(`${BASE}#/legal/terms`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const termsText = await page.locator('body').innerText()
;/RankUp is a product of MTRX Horizyn\. "We" means MTRX Horizyn\./.test(termsText)
  ? pass('and so do the terms')
  : fail('operator named in the terms', termsText.slice(0, 300))
const unfinished = await page.getByText(/Still to fill in: the company's contact email and postal address/).count()
unfinished > 0
  ? pass('while the contact email and postal address are placeholders, the page still says so')
  : fail('unfilled banner names what is left', termsText.slice(0, 300))
const notice = JSON.stringify(CONSENT_NOTICE)
;!/MTRX|operated by|\[YOUR/i.test(notice)
  ? pass(`the consent notice names no operator, so ${CONSENT_VERSION} stands unchanged`)
  : fail('consent notice unchanged by the operator name', notice.match(/.{0,40}(MTRX|operated by|\[YOUR).{0,40}/i)?.[0])

console.log('\n=== Consent stands between the account and the child ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: /I'm a parent/ }).click()
await page.waitForTimeout(400)
await page.locator('input[type=email]').fill(`consent${Date.now()}@example.com`)
await page.locator('input[type=password]').fill('correct-horse-battery')
await page.getByRole('button', { name: 'Create account' }).click()
await page.waitForTimeout(1500)
await page.locator('input').nth(0).fill('Sam')
await page.locator('input').nth(2).fill('1234')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(1200)

;(await page.getByText('What RankUp collects about your child').count()) > 0
  ? pass('the consent notice appears before any child is added')
  : fail('consent gate appears', await page.locator('body').innerText().then((t) => t.slice(0, 150)))

const shown = await page.locator('body').innerText()
;/No photographs/i.test(shown) && /never takes, sends or keeps photographs/.test(shown)
  ? pass('it says RankUp takes no photographs')
  : fail('no-photos wording shown', shown.slice(0, 200))
;!/\bAI\b|Anthropic|photo check/i.test(shown)
  ? pass('and mentions no AI check')
  : fail('no AI check mentioned', shown.match(/.{0,40}(\bAI\b|Anthropic|photo check).{0,40}/i)?.[0])

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
const recorded = await page.evaluate(async (MOCK) => {
  const raw = localStorage.getItem('rankup.session.v1')
  if (!raw) return { skipped: 'no session' }
  const token = JSON.parse(raw).access_token
  const res = await fetch(`${MOCK}/rest/v1/rpc/export_family_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` },
    body: '{}',
  })
  const data = await res.json()
  return { consents: data?.consents?.length ?? 0, signed: data?.consents?.[0]?.signed_name, version: data?.consents?.[0]?.version }
}, MOCK)
recorded.consents === 1
  ? pass(`the consent is on the server, signed "${recorded.signed}"`)
  : fail('consent recorded server-side', JSON.stringify(recorded))
recorded.version === CONSENT_VERSION && CONSENT_VERSION === '2026-11'
  ? pass(`against the notice in force, ${CONSENT_VERSION}`)
  : fail('signed the current version', JSON.stringify(recorded))

console.log('\n=== The words signed are the words stored ===')
// What the database keeps as the record of what this parent agreed to must be
// what the screen showed them, line for line.
const stored = await page.evaluate(async ({ version, MOCK }) => {
  const res = await fetch(`${MOCK}/rest/v1/consent_notices?version=eq.${version}`,
    { headers: { apikey: 'local-anon-key' } })
  const current = await fetch(`${MOCK}/rest/v1/rpc/current_consent_version`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key' }, body: '{}',
  })
  return { rows: await res.json(), current: await current.json() }
}, { version: CONSENT_VERSION, MOCK })
const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim()
const storedBody = flat(stored.rows?.[0]?.body)
const lines = [CONSENT_NOTICE.title, ...CONSENT_NOTICE.sections.flatMap((x) => [x.heading, ...x.body]), CONSENT_NOTICE.affirmation]
const missing = lines.filter((line) => !storedBody.includes(flat(line)))
stored.current === CONSENT_VERSION
  ? pass('the database shows new parents the same version the app does')
  : fail('current version agrees', JSON.stringify(stored.current))
storedBody && missing.length === 0
  ? pass(`every line the app shows is in the stored ${CONSENT_VERSION} notice`)
  : fail('stored notice matches the app', missing[0] || 'no stored notice')
const leftover = storedBody.replace(new RegExp(lines.map((l) => flat(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), '')
  .replace(/[\s*]/g, '')
leftover === ''
  ? pass('and nothing else: no photographs taken in the app, no AI check')
  : fail('stored notice has nothing extra', leftover.slice(0, 120))

await finish(errors, fails, browser)
