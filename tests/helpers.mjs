/** Shared setup for the smoke tests. See tests/README.md. */
import { chromium } from 'playwright'

export const BASE = process.env.BASE_URL || 'http://localhost:5173'
export const SHOT_DIR = process.env.SHOT_DIR || 'tests/screenshots'

export function reporter() {
  const fails = []
  return {
    fails,
    pass: (n) => console.log('  PASS', n),
    fail: (n, d) => { fails.push(n); console.log('  FAIL', n, '—', d) },
  }
}

/**
 * Stands in for the Stripe webhook, which is the only thing allowed to write a
 * family's tier. Tests that need more than one child, or guilds, have to be on
 * a plan that includes them — Starter covers one child and no guilds.
 */
export async function setPlanInDatabase(familyName, tier = 'standard') {
  const { default: pg } = await import('pg')
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

export async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // Gives the page a synthetic camera so the photo flow can be driven headlessly.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    permissions: ['camera'],
  })
  const page = await ctx.newPage()
  const errors = []
  if (process.env.TEST_HTTP_LOG) {
    page.on('response', async (r) => {
      if (r.status() >= 400) {
        console.log('HTTP', r.status(), r.url(), (await r.text().catch(() => '')).slice(0, 200))
      }
    })
  }
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // Google Fonts is blocked in some sandboxes; that is not an app error.
    if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`console: ${m.text()}`)
  })
  return { browser, page, errors }
}

/** The saved app state, read straight out of the browser. */
export const readState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))

/** Run onboarding and assign the 7-quest kid pack. */
export async function setUpFamily(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  // Setup now opens by asking whose phone this is.
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  // Setup opens with an account, so the family exists server-side before a
  // child's name is ever typed — consent needs something to attach to.
  await page.locator('input[type=email]').fill(`test${Date.now()}@example.com`)
  await page.locator('input[type=password]').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(1600)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(400)
  await page.locator('input').nth(0).fill('Sam')
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1200)
  // Consent now stands between the family details and the first child.
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Test Parent')
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.locator('input[placeholder="e.g. Ava"]').fill('Ava')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(1000)
  await page.evaluate(() => { window.location.hash = '/parent/assign' })
  await page.waitForTimeout(500)
  await page.getByRole('tab', { name: 'Quest packs' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Add all 7 to Ava/ }).click()
  await page.waitForTimeout(500)
}

export async function asParent(page) {
  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Enter PIN' }).click()
  await page.locator('input[type=password]').fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.waitForTimeout(600)
}

export async function asKid(page) {
  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Ava/ }).first().click()
  await page.waitForTimeout(600)
}

/** Open the camera, take a shot, run the check, and send it to the parent. */
export async function submitPhotoProof(page) {
  await page.getByRole('button', { name: /Take photo proof/ }).click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Use this photo' }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Send to parent' }).click()
  await page.waitForTimeout(800)
}

export function finish(errors, fails, browser) {
  console.log('\nJS errors on the page:', errors.length)
  errors.slice(0, 8).forEach((e) => console.log('  ', e))
  console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
  return browser.close().then(() => process.exit(fails.length ? 1 : 0))
}
