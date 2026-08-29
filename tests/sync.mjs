/**
 * The whole loop, across two devices, through a real database.
 *
 * This is the test that matters most: a quest assigned on the parent's phone
 * has to appear on the kid's, their photo proof has to come back, and the XP
 * has to land. Everything else in the app is decoration if this does not work.
 *
 * It needs the local backend running — see supabase/test/README.md:
 *
 *   supabase/test/run.sh                   # apply the schema
 *   node supabase/test/mock-server.mjs     # the API, backed by Postgres
 *   npm run dev                            # with .env.local pointing at it
 */
import { chromium } from 'playwright'
const SHOT = process.env.SHOT_DIR || 'tests/screenshots'
const fails = []
const pass = n => console.log('  PASS', n)
const fail = (n,d) => { fails.push(n); console.log('  FAIL', n, '—', d) }

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] })
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, permissions:['camera'] })
const errors = []
const track = (p, tag) => {
  p.on('pageerror', e => errors.push(`${tag}: ${e.message}`))
  p.on('console', m => { if (m.type()==='error' && !m.text().includes('ERR_CONNECTION')) errors.push(`${tag}: ${m.text()}`) })
}
const parent = await ctx.newPage(); track(parent,'parent')
const kid = await ctx.newPage(); track(kid,'kid')

const stamp = Date.now()
console.log('\n=== Parent creates an account and a family ===')
await parent.goto('http://localhost:5173/', { waitUntil:'networkidle' })
await parent.waitForTimeout(600)
await parent.getByRole('button', { name:/I'm a parent/ }).click()
await parent.waitForTimeout(400)
const sawSignIn = await parent.getByText('Create your parent account').count()
sawSignIn ? pass('a backend being configured brings up the account screen')
          : fail('account screen appears', 'not shown')
await parent.locator('input[type=email]').fill(`p${stamp}@example.com`)
await parent.locator('input[type=password]').fill('correct-horse-battery')
await parent.getByRole('button', { name:'Create account' }).click()
await parent.waitForTimeout(1200)

await parent.getByRole('button', { name:'Continue' }).click()
await parent.locator('input').nth(0).fill('Sam')
await parent.locator('input').nth(1).fill('The Riveras')
await parent.locator('input').nth(2).fill('1234')
await parent.getByRole('button', { name:'Continue' }).click()
await parent.waitForTimeout(1500)
// Consent now stands between the family details and the first child.
if (await parent.getByText('What RankUp collects about your child').count()) {
  await parent.locator('input[type=checkbox]').check()
  await parent.locator('input[placeholder*="Samira"]').fill('Sam Rivera')
  await parent.waitForTimeout(200)
  await parent.getByRole('button', { name: /I agree/ }).click()
  await parent.waitForTimeout(1500)
}
await parent.locator('input[placeholder="e.g. Ava"]').fill('Jonah')
await parent.getByRole('button', { name:'Continue' }).click()
await parent.waitForTimeout(200)
await parent.getByRole('button', { name:'Start playing' }).click()
await parent.waitForTimeout(2500)

const pState = () => parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))
let ps = await pState()
;/^[0-9a-f-]{36}$/.test(ps.family.id)
  ? pass(`the family id came from the server (${ps.family.id.slice(0,8)}…)`)
  : fail('server assigned the family id', ps.family.id)

console.log('\n=== Kid device pairs ===')
await kid.goto('http://localhost:5173/?device=kid', { waitUntil:'networkidle' })
await kid.waitForTimeout(600)
await kid.getByRole('button', { name:/I'm a kid/ }).click()
await kid.waitForTimeout(400)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name:'Continue' }).click()
await kid.waitForTimeout(400)
await kid.getByRole('button', { name:/Sugar Rush/ }).first().click()
await kid.waitForTimeout(300)
await kid.getByRole('button', { name:'Get my code' }).click()
await kid.waitForTimeout(2500)
const kState = () => kid.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid')))
const code = (await kState())?.pendingPairing?.code
;/^[0-9]{6}$/.test(code||'') ? pass(`kid device got a code from the server (${code})`)
                            : fail('kid got a server code', String(code))

await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(800)
await parent.locator('input[inputmode=numeric]').fill(code)
await parent.waitForTimeout(2000)
;(await parent.getByText(/Ava is linked/).count()) > 0
  ? pass('the parent linked the device through the database')
  : fail('parent linked the device', 'no confirmation')
await kid.waitForTimeout(4000)
;(await kState()).onboarded ? pass('the kid device knows it is linked') : fail('kid device linked','not onboarded')

console.log('\n=== A quest assigned on the parent phone reaches the kid phone ===')
await parent.evaluate(() => { window.location.hash = '/parent/assign' })
await parent.waitForTimeout(800)
await parent.locator('select').first().selectOption({ label: 'Ava' })
await parent.waitForTimeout(300)
await parent.locator('input[placeholder="e.g. Make your bed"]').fill('Tidy the bookshelf')
await parent.getByRole('button', { name:/Assign to Ava/ }).click()
await parent.waitForTimeout(3000)

// The kid device pulls on an interval; nudge it by focusing the tab.
await kid.bringToFront()
await kid.evaluate(() => { window.location.hash = '/kid/quests' })
await kid.waitForTimeout(6000)
await kid.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await kid.waitForTimeout(4000)
await kid.screenshot({ path:`${SHOT}/sync-kid-quests.png` })
const kq = (await kState()).quests.map(q=>q.title)
kq.includes('Tidy the bookshelf')
  ? pass('the quest crossed devices through the database')
  : fail('quest reached the kid device', `kid has: ${JSON.stringify(kq)}`)

console.log('\n=== The kid submits and the parent sees it ===')
const visible = await kid.getByText('Tidy the bookshelf').count()
if (visible) {
  await kid.getByText('Tidy the bookshelf').first().click()
  await kid.waitForTimeout(600)
  await kid.getByRole('button', { name:/Take photo proof/ }).click()
  await kid.waitForTimeout(2500)
  await kid.getByRole('button', { name:'Take photo' }).click()
  await kid.waitForTimeout(700)
  await kid.getByRole('button', { name:'Use this photo' }).click()
  await kid.waitForTimeout(3500)
  await kid.getByRole('button', { name:'Send to parent' }).click()
  await kid.waitForTimeout(4000)

  await parent.bringToFront()
  await parent.evaluate(() => { window.location.hash = '/parent/approvals' })
  await parent.waitForTimeout(6000)
  await parent.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await parent.waitForTimeout(4000)
  await parent.screenshot({ path:`${SHOT}/sync-parent-review.png` })
  // The photo is the whole point of the review screen: a parent asked to
  // approve a picture they cannot see is just clicking yes.
  const proof = await parent.locator('img[alt^="Proof for"]').count()
  proof
    ? pass('the photo itself reached the parent phone, not just the row')
    : fail('the photo itself reached the parent phone', 'no proof image on the review screen')

  const inQueue = await parent.getByText('Tidy the bookshelf').count()
  inQueue ? pass('the submission reached the parent phone')
          : fail('submission reached the parent', 'not in the review queue')

  if (inQueue) {
    await parent.getByRole('button', { name:'Approve' }).first().click()
    await parent.waitForTimeout(4000)
    await kid.bringToFront()
    await kid.evaluate(() => { window.location.hash = '/kid' })
    await kid.waitForTimeout(6000)
    await kid.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await kid.waitForTimeout(4000)
    await kid.screenshot({ path:`${SHOT}/sync-kid-xp.png` })
    const xp = (await kState()).kids[0].xp
    xp > 0 ? pass(`the XP reached the kid's phone (xp=${xp})`)
           : fail('XP reached the kid device', `xp=${xp}`)
  }
} else {
  fail('kid could open the synced quest', 'quest not visible')
}

console.log('\nJS errors:', errors.length); errors.slice(0,10).forEach(e=>console.log('  ',e))
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL SYNC CHECKS PASSED')
await b.close()
process.exit(fails.length ? 1 : 0)
