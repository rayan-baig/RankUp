/**
 * Setup finishes on a deployment that has switched nothing optional on.
 *
 * Guilds ship off, and Stripe is off until the operator connects an account.
 * Every other suite runs with guilds on (supabase/test/up.sh turns them on for
 * guilds.mjs), so a setup step that quietly depended on either would pass
 * everywhere except on the build a real family gets first. This starts the
 * app twice, on its own ports, the way such a deployment would:
 *
 *   1. a backend, with guilds and payments off;
 *   2. no backend at all (one phone, nothing synced).
 *
 * and walks a parent from the front door to their dashboard with a child.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import pg from 'pg'
import { reporter, finish } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []

async function serve(port, env) {
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  })
  for (let i = 0; i < 60; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`http://localhost:${port}/`)
      if (res.ok) return child
    } catch { /* not up yet */ }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`vite did not start on ${port}`)
}
const stop = (child) => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } }

async function setUp(base, { account }) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  const email = `plain${Date.now()}@example.com`
  if (account) {
    await page.locator('input[type=email]').fill(email)
    await page.locator('input[type=password]').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForTimeout(1600)
  }
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(300)
  await page.locator('input').nth(0).fill('Sam')
  await page.locator('input').nth(1).fill('Plain Family')
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1200)
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Test Parent')
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.locator('input[placeholder="e.g. Ava"]').fill('Ava')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(4000)
  const where = await page.evaluate(() => window.location.hash)
  const text = await page.evaluate(() => document.body.innerText)
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1') || '{}'))
  await ctx.close()
  return { where, text, st, email }
}

console.log('\n=== With a backend, guilds off and payments off ===')
{
  const child = await serve(5181, { VITE_GUILDS_ENABLED: 'false', VITE_STRIPE_ENABLED: 'false' })
  try {
    const r = await setUp('http://localhost:5181', { account: true })
    r.where.startsWith('#/parent') && /Ava/.test(r.text)
      ? pass('setup ends on the dashboard, with the child on it')
      : fail('setup finishes', `${r.where} ${r.text.slice(0, 120)}`)
    const db = new pg.Client({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432),
      user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test' })
    await db.connect()
    const { rows } = await db.query(
      `select k.name from kids k join families f on f.id = k.family_id where f.name = 'Plain Family'
        and f.id = $1`, [r.st.family?.id || '00000000-0000-0000-0000-000000000000'])
    await db.end()
    rows.length === 1 && rows[0].name === 'Ava'
      ? pass('and the family and the child are on the server')
      : fail('family synced', JSON.stringify(rows))
    !/guild/i.test(r.text)
      ? pass('nothing on the dashboard offers a guild that is switched off')
      : fail('no guild offered', r.text.match(/.{0,40}guild.{0,40}/i)?.[0])
  } finally { stop(child) }
}

console.log('\n=== With no backend at all ===')
{
  const child = await serve(5182, { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_GUILDS_ENABLED: 'false', VITE_STRIPE_ENABLED: 'false' })
  try {
    const r = await setUp('http://localhost:5182', { account: false })
    r.where.startsWith('#/parent') && /Ava/.test(r.text) && r.st.onboarded
      ? pass('setup still ends on the dashboard, on this phone alone')
      : fail('device-only setup finishes', `${r.where} ${r.text.slice(0, 120)}`)
  } finally { stop(child) }
}

finish(errors, fails, browser)
