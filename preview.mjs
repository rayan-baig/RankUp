/**
 * A guided tour of the whole app, captured as screenshots.
 *
 * Drives two devices at once — a parent's phone and a kid's — through the real
 * loop: setup, consent, pairing, a chore, a photo, the review, the payout. It
 * is how you look at RankUp without owning two phones, and it is where more
 * than one real bug has turned up that no unit test noticed.
 *
 * Needs the same local backend as tests/sync.mjs (see supabase/test/README.md):
 *
 *   supabase/test/run.sh                   # apply the schema
 *   node supabase/test/mock-server.mjs     # the API, backed by Postgres
 *   npm run dev                            # with .env.local pointing at it
 *
 *   SHOT_DIR=/tmp/preview node preview.mjs
 *
 * PREVIEW_DEBUG=1 also prints failed requests and the kid device's state, which
 * is what you want when a screen comes out empty.
 */
import { chromium } from 'playwright'
const SHOT = process.env.SHOT_DIR || process.env.SP + '/preview'
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] })
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
  permissions:['camera','notifications'] })
const parent = await ctx.newPage()
const kid = await ctx.newPage()
if (process.env.PREVIEW_DEBUG) {
  for (const [who, pg] of [['parent', parent], ['kid', kid]]) {
    pg.on('response', async (r) => {
      if (r.status() >= 400) console.log('HTTP', r.status(), who, r.url(), (await r.text().catch(()=>'')).slice(0,300))
    })
  }
}
const errs = []
for (const [p,t] of [[parent,'parent'],[kid,'kid']]) {
  p.on('pageerror', e => errs.push(`${t}: ${e.message}`))
  p.on('console', m => { if (m.type()==='error' && !m.text().includes('ERR_CONNECTION')) errs.push(`${t}: ${m.text()}`) })
}
let n = 0
const shot = async (page, name) => {
  n += 1
  await page.evaluate(() => window.scrollTo(0,0))
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOT}/${String(n).padStart(2,'0')}-${name}.png` })
  console.log(' ', name)
}

const stamp = Date.now()
await parent.goto('http://localhost:5173/', { waitUntil:'networkidle' })
await parent.waitForTimeout(700)
await shot(parent, 'whose-phone')

await parent.getByRole('button', { name:/I'm a parent/ }).click()
await parent.waitForTimeout(500)
await shot(parent, 'create-account')
await parent.locator('input[type=email]').fill(`demo${stamp}@example.com`)
await parent.locator('input[type=password]').fill('correct-horse-battery')
await parent.getByRole('button', { name:'Create account' }).click()
await parent.waitForTimeout(1600)
await parent.getByRole('button', { name:'Continue' }).click()
await parent.waitForTimeout(400)
await parent.locator('input').nth(0).fill('Sam')
await parent.locator('input').nth(1).fill('The Riveras')
await parent.locator('input').nth(2).fill('1234')
await shot(parent, 'your-family')
await parent.getByRole('button', { name:'Continue' }).click()
await parent.waitForTimeout(1600)
await shot(parent, 'consent-top')
await parent.evaluate(() => window.scrollTo(0, 99999))
await parent.waitForTimeout(400)
await parent.screenshot({ path: `${SHOT}/${String(++n).padStart(2,'0')}-consent-sign.png` })
console.log('  consent-sign')
await parent.locator('input[type=checkbox]').check()
await parent.locator('input[placeholder*="Samira"]').fill('Sam Rivera')
await parent.getByRole('button', { name:/I agree/ }).click()
await parent.waitForTimeout(1800)
await parent.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await shot(parent, 'add-a-kid')
await parent.getByRole('button', { name:'Continue' }).click()
await parent.waitForTimeout(600)
await parent.getByRole('button', { name:/Sugar Rush/ }).first().click()
await parent.waitForTimeout(500)
await shot(parent, 'pick-a-theme')
await parent.getByRole('button', { name:'Start playing' }).click()
await parent.waitForTimeout(2500)
await shot(parent, 'parent-dashboard')

// Assign a couple of quests
await parent.evaluate(() => { window.location.hash = '/parent/assign' })
await parent.waitForTimeout(900)
await parent.getByRole('tab', { name:'Quest packs' }).click()
await parent.waitForTimeout(400)
await shot(parent, 'quest-packs')
await parent.getByRole('button', { name:/Add all 7 to Ava/ }).click()
await parent.waitForTimeout(2500)

// Kid device pairs
await kid.goto('http://localhost:5173/?device=kid', { waitUntil:'networkidle' })
await kid.waitForTimeout(700)
await kid.getByRole('button', { name:/I'm a kid/ }).click()
await kid.waitForTimeout(500)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name:'Continue' }).click()
await kid.waitForTimeout(500)
await kid.getByRole('button', { name:/Sugar Rush/ }).first().click()
await kid.waitForTimeout(400)
await kid.getByRole('button', { name:'Get my code' }).click()
await kid.waitForTimeout(2200)
await shot(kid, 'kid-pairing-code')
const code = await kid.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid'))?.pendingPairing?.code)

await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(900)
await shot(parent, 'parent-enter-code')
await parent.locator('input[inputmode=numeric]').fill(code)
await parent.waitForTimeout(2500)
await shot(parent, 'device-linked')
await kid.waitForTimeout(4500)
await shot(kid, 'kid-home')

// The kid does a chore
await kid.evaluate(() => { window.location.hash = '/kid/quests' })
await kid.waitForTimeout(1200)
await shot(kid, 'kid-quests')
const dump = async () => console.log(await kid.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('rankup.state.v1.kid') || '{}')
  return JSON.stringify({ familyId: st.family?.id, quests: (st.quests||[]).length,
    subs: (st.submissions||[]).length, family: st.family, lastSyncedAt: st.lastSyncedAt })
}))
if (process.env.PREVIEW_DEBUG) {
  console.log(await kid.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('rankup.state.v1.kid') || '{}')
    return JSON.stringify({ device: st.device, familyId: st.family?.id,
      kids: (st.kids||[]).map(k=>({id:k.id,name:k.name})), quests: (st.quests||[]).length,
      session: st.session, keys: Object.keys(localStorage) }, null, 2)
  }))
}
await kid.locator('button.card').first().click()
await kid.waitForTimeout(800)
await shot(kid, 'quest-detail')
await kid.getByRole('button', { name:/Take photo proof/ }).click()
await kid.waitForTimeout(2600)
await shot(kid, 'camera')
await kid.getByRole('button', { name:'Take photo' }).click()
await kid.waitForTimeout(900)
await kid.getByRole('button', { name:'Use this photo' }).click()
await kid.waitForTimeout(3600)
await shot(kid, 'ai-check')
await kid.getByRole('button', { name:'Send to parent' }).click()
await kid.waitForTimeout(3500)

// Parent reviews
await parent.bringToFront()
await parent.evaluate(() => { window.location.hash = '/parent/approvals' })
await parent.waitForTimeout(1000)
await parent.evaluate(() => window.dispatchEvent(new Event('focus')))
await parent.waitForTimeout(6000)
await shot(parent, 'parent-review')
const canApprove = await parent.getByRole('button', { name:'Approve' }).count()
if (canApprove) {
  await parent.getByRole('button', { name:'Approve' }).first().click()
  await parent.waitForTimeout(2500)
  await kid.bringToFront()
  await kid.evaluate(() => { window.location.hash = '/kid' })
  await kid.waitForTimeout(7000)
  await shot(kid, 'kid-earned-xp')
}

// Parent tools
await parent.bringToFront()
for (const [hash, name] of [
  ['/parent/plan','plans'],
  ['/parent/blueprint','behaviour-blueprint'],
  ['/parent/override','override-protocol'],
  ['/parent/settings','settings'],
  ['/legal/privacy','privacy-policy'],
]) {
  await parent.evaluate((h) => { window.location.hash = h }, hash)
  await parent.waitForTimeout(1400)
  await shot(parent, name)
}

console.log('\nJS errors:', errs.length)
errs.slice(0,5).forEach(e => console.log('  ', e))
if (process.env.PREVIEW_DEBUG) await dump()
await b.close()
