/**
 * Guilds, driven as three devices: two parents and one kid.
 *
 * The rule being proved is the one that makes this feature safe to ship at all:
 * a child does not join until a parent on each side has agreed. Everything
 * else here — the roster, the chat, the contact-detail guard — matters less
 * than that.
 *
 * Needs the local backend running; see supabase/test/README.md.
 */
import { chromium } from 'playwright'
import pg from 'pg'
import { reporter, finish, BASE } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const errors = []
const track = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`${tag}: ${m.text()}`)
  })
}

const stamp = Date.now()

/** Set a family up from scratch on its own device namespace. */
async function makeFamily(page, device, familyName, kidName) {
  const url = device ? `${BASE}?device=${device}` : BASE
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  await page.locator('input[type=email]').fill(`${device || 'main'}${stamp}@example.com`)
  await page.locator('input[type=password]').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('input').nth(0).fill('Parent')
  await page.locator('input').nth(1).fill(familyName)
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1500)
  // Consent now stands between the family details and the first child.
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Test Parent')
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.locator('input[placeholder="e.g. Ava"]').fill(kidName)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(2500)

  // Guilds start at Standard; Starter is a one-child plan with none. Only
  // Stripe's webhook may write the tier column, so put the family on Standard
  // the same way the webhook does rather than flipping a flag in the browser.
  await upgradeInDatabase(familyName)
  await page.evaluate(() => { window.location.hash = '/parent' })
  await page.waitForTimeout(3000)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(2500)
}

/** Stands in for the Stripe webhook: the only thing allowed to set a tier. */
async function upgradeInDatabase(familyName, tier = 'standard') {
  const client = new pg.Client({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'rankup_test',
  })
  await client.connect()
  await client.query('update families set tier = $1 where name = $2', [tier, familyName])
  await client.end()
}

const famA = await ctx.newPage(); track(famA, 'famA')
const famB = await ctx.newPage(); track(famB, 'famB')

console.log('\n=== Two unrelated families ===')
await makeFamily(famA, '', 'The Ashes', 'Amy')
await makeFamily(famB, 'famb', 'The Brooks', 'Bo')
pass('two families set up on separate devices')

console.log('\n=== A parent creates a guild ===')
await famA.evaluate(() => { window.location.hash = '/parent/guilds' })
await famA.waitForTimeout(1200)
await famA.locator('input[placeholder="e.g. The Bookworms"]').fill('The Bookworms')
await famA.getByRole('button', { name: 'Create guild' }).click()
await famA.waitForTimeout(3000)
// The roster arrives on the next pull, so nudge it rather than racing it.
await famA.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await famA.waitForTimeout(3000)
const code = (await famA.locator('.font-mono').first().innerText().catch(() => '')).trim()
;/^[A-Z2-9]{6}$/.test(code) ? pass(`the guild has an invite code (${code})`)
                           : fail('guild invite code', `got "${code}"`)

console.log('\n=== The other kid asks to join ===')
await famB.evaluate(() => { window.location.hash = '/kid/guild' })
await famB.waitForTimeout(1500)
await famB.locator('input[placeholder="e.g. K7M2QP"]').fill(code)
await famB.getByRole('button', { name: 'Ask to join' }).click()
await famB.waitForTimeout(2500)
;(await famB.getByText('Waiting for two grown-ups').count()) > 0
  ? pass('asking does not join — it waits for two grown-ups')
  : fail('join is gated on consent', await famB.locator('body').innerText().then(t => t.slice(0, 120)))

console.log('\n=== One parent alone is not enough ===')
await famB.bringToFront()
await famB.evaluate(() => { window.location.hash = '/parent/guilds' })
await famB.waitForTimeout(500)
await famB.evaluate(() => window.dispatchEvent(new Event('focus')))
await famB.waitForTimeout(2500)
await famB.getByRole('button', { name: 'Approve' }).first().click()
await famB.waitForTimeout(2000)
await famB.evaluate(() => { window.location.hash = '/kid/guild' })
await famB.waitForTimeout(2500)
;(await famB.getByText('Waiting for two grown-ups').count()) > 0
  ? pass("their own parent approving alone still does not let them in")
  : fail('one parent is not enough', 'the kid got in with one approval')

console.log('\n=== The guild owner\'s parent agrees too ===')
await famA.bringToFront()
await famA.evaluate(() => { window.location.hash = '/parent/guilds' })
await famA.waitForTimeout(500)
await famA.evaluate(() => window.dispatchEvent(new Event('focus')))
await famA.waitForTimeout(2500)
const waiting = await famA.getByRole('button', { name: 'Approve' }).count()
waiting > 0 ? pass("the request reaches the guild owner's parent")
            : fail('request reaches the owner', 'nothing to approve')
if (waiting) {
  await famA.getByRole('button', { name: 'Approve' }).first().click()
  await famA.waitForTimeout(2500)

  await famB.bringToFront()
  await famB.evaluate(() => { window.location.hash = '/kid/guild' })
  await famB.waitForTimeout(500)
  await famB.evaluate(() => window.dispatchEvent(new Event('focus')))
  await famB.waitForTimeout(3000)
  const roster = await famB.locator('body').innerText()
  roster.includes('Amy') && roster.includes('Bo')
    ? pass('with both agreed, the kid sees the real roster')
    : fail('roster shows both children', roster.slice(0, 200).replace(/\n+/g, ' | '))

  console.log('\n=== Chat, and the contact-detail guard ===')
  await famB.locator('input[placeholder="Say something…"]').fill('call me on 07700 900123')
  await famB.getByRole('button', { name: 'Send' }).click()
  await famB.waitForTimeout(2000)
  ;(await famB.getByText(/can't share phone numbers/).count()) > 0
    ? pass('a phone number is refused with a clear reason')
    : fail('phone numbers refused', 'no message shown')

  await famB.locator('input[placeholder="Say something…"]').fill('finished my chores')
  await famB.getByRole('button', { name: 'Send' }).click()
  await famB.waitForTimeout(2500)

  await famA.bringToFront()
  await famA.evaluate(() => { window.location.hash = '/kid/guild' })
  await famA.waitForTimeout(500)
  await famA.evaluate(() => window.dispatchEvent(new Event('focus')))
  await famA.waitForTimeout(3000)
  ;(await famA.getByText('finished my chores').count()) > 0
    ? pass('a normal message reaches the other family')
    : fail('message crosses families', 'not visible')
}

console.log('\nJS errors:', errors.length)
errors.slice(0, 8).forEach((e) => console.log('  ', e))
await finish(errors, fails, browser)
