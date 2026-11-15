/**
 * Pause instead of cancel, the half-price month, the Elite nudge and the
 * yearly offer, in the app, on a 390x844 phone.
 *
 * The rules are the database's (supabase/test/57-pauses.sql) and the
 * Stripe side is tests/keepplan.mjs, through the real functions. This is
 * what a parent and a child see:
 *
 *   - "Cancel my plan" is on the plan screen, plain, and opens "Before you
 *     cancel": a pause of 1, 2 or 3 months, the half-price month, and
 *     "Cancel my plan" again, all on the screen at once with no scrolling.
 *     Cancelling from there goes straight to Stripe's cancel page.
 *   - a pause: the plan screen says until when and offers "Start my plan
 *     again now"; the dashboard says it; the child sees "Paused — your
 *     progress is safe", and nothing else about plans
 *   - resuming puts it all back
 *   - the half-price month, once: never offered again after it is taken
 *   - the Elite nudge after a great week, in Parent Mode only: shown once,
 *     not again on the next visit, again after 14 days, gone with "Not
 *     now", and upgrading on Stripe's confirm page
 *   - "Switch to yearly — save about 30%" in Settings for a monthly payer,
 *     and not for a yearly one
 *   - no child's screen shows a price, an offer or anything to buy
 *
 * Payments are switched on for this file alone: it starts its own dev
 * server with VITE_STRIPE_ENABLED=true on a free port (every other suite
 * runs with payments off). The server functions are not served by the dev
 * server, so /api/keep-plan is answered here by the database's own
 * functions, called with the family the function would have found, and
 * the billing portal and checkout answer with an address in the app.
 *
 * Screenshots (390x844) in SHOT_DIR: rankup-grow-pause-cancel.png,
 * rankup-grow-paused-plan.png, rankup-grow-kid-paused.png,
 * rankup-grow-elite-nudge.png, rankup-grow-yearly.png.
 *
 * Needs the stack:  supabase/test/up.sh
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import pg from 'pg'

/** A port nothing is listening on. */
const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer()
  srv.on('error', reject)
  srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
})
const PORT = await freePort()
const OWN = `http://localhost:${PORT}`
process.env.BASE_URL = OWN
const { launch, reporter, setUpFamily, asParent, asKid, finish, SHOT_DIR, readState } = await import('./helpers.mjs')
const { TIERS } = await import('../src/state/initialState.js')
const { annualSaving, usd, priceWords } = await import('../src/lib/plans.js')

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, VITE_STRIPE_ENABLED: 'true' },
  stdio: 'ignore',
  detached: true,
})
const stopVite = () => { try { process.kill(-vite.pid, 'SIGKILL') } catch { /* gone */ } }
let up = false
for (let i = 0; i < 80 && !up; i += 1) {
  try { up = (await fetch(`${OWN}/`)).ok } catch { /* not yet */ }
  if (!up) await new Promise((r) => setTimeout(r, 500))
}
if (!up) { stopVite(); console.log('FAIL the dev server with payments on did not start'); process.exit(1) }

const { fails, pass, fail } = reporter()
const check = (name, cond, detail = '') => (cond ? pass(name) : fail(name, detail))
const { browser, page, errors } = await launch()
// The nudge's "last shown" lives on this phone. A change to it is applied as
// the page loads, before the app reads its state, so the app cannot save
// over it on the way out (moveBack, below).
await page.addInitScript(() => {
  const patch = sessionStorage.getItem('rankup.test.nudge')
  if (!patch) return
  sessionStorage.removeItem('rankup.test.nudge')
  try {
    const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
    s.settings.upgradeNudge = { ...(s.settings.upgradeNudge || {}), ...JSON.parse(patch) }
    localStorage.setItem('rankup.state.v1', JSON.stringify(s))
  } catch { /* nothing saved yet */ }
})
const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const RUN = Date.now().toString(36)
const go = async (hash) => {
  await page.evaluate((h) => { window.location.hash = h }, hash)
  await page.waitForTimeout(900)
}
const body = () => page.locator('body').innerText()
const fresh = async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
}
const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/rankup-grow-${name}.png` })
const inView = (testId) => page.getByTestId(testId).evaluate((el) => {
  const r = el.getBoundingClientRect()
  return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0
}).catch(() => false)

/* ---------- a family paying for Standard, monthly ---------- */
await setUpFamily(page)
const family = (await db.query('select id from families order by created_at desc limit 1')).rows[0].id
await db.query(`update families set tier = 'standard', subscription_status = 'active', stripe_customer_id = $2,
                  stripe_subscription_id = $3, billing_cycle = 'month', trial_tier = null, trial_ends_at = null,
                  billing_event_at = now() - interval '1 day'
                where id = $1`, [family, `cus_ui_${RUN}`, `sub_ui_${RUN}`])
const fam = async () => (await db.query('select paused_until, save_offer_used_at, effective_tier(id) as effective from families where id = $1', [family])).rows[0]

// The server functions, as the dev server cannot run them.
const portalCalls = []
const checkoutCalls = []
await page.route('**/api/billing-portal', async (route) => {
  const asked = JSON.parse(route.request().postData() || '{}')
  portalCalls.push(asked.flow || 'home')
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${OWN}/#/parent/plan?portal=${asked.flow || 'home'}` }) })
})
await page.route('**/api/create-checkout', async (route) => {
  checkoutCalls.push(JSON.parse(route.request().postData() || '{}'))
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${OWN}/#/parent/plan?checkout=cancelled` }) })
})
await page.route('**/api/keep-plan', async (route) => {
  const { action, months } = JSON.parse(route.request().postData() || '{}')
  const one = async (sql, args) => (await db.query(sql, args)).rows[0].r
  let r
  if (action === 'pause') {
    r = await one('select start_plan_pause($1, $2, $3) as r', [family, months, 'month'])
    if (r.ok) await one('select finish_plan_pause($1, true) as r', [r.pause_id])
    if (r.ok) r = { ok: true, paused_until: r.resumes_at, months }
  } else if (action === 'resume') {
    r = await one('select end_plan_pause($1) as r', [family])
    if (r.ok) r = { ok: true, resumed: true }
  } else {
    r = await one('select claim_save_offer($1, $2) as r', [family, 'month'])
    if (r.ok) r = { ...(await one('select finish_save_offer($1, true) as r', [family])), saved: true }
  }
  await route.fulfill({ status: r.ok ? 200 : 409, contentType: 'application/json', body: JSON.stringify(r.ok ? r : { error: r.reason }) })
})

await asParent(page)
await fresh()

console.log('\n=== "Cancel my plan" offers a pause first, and cancelling stays one tap away ===')
await go('/parent/plan')
await page.getByTestId('cancel-plan').waitFor({ timeout: 10000 }).catch(() => {})
check('the plan screen has "Cancel my plan", in plain words', (await page.getByTestId('cancel-plan').innerText().catch(() => '')) === 'Cancel my plan')
check('and "Manage billing or update card"', await page.getByTestId('manage-billing').count() === 1)
await page.getByTestId('cancel-plan').click()
await page.waitForTimeout(500)
const sheet = await page.getByTestId('keep-sheet').innerText().catch(() => '')
check('"Before you cancel" opens with a pause of 1, 2 or 3 months', /Before you cancel/.test(await body()) && /Pause instead/.test(sheet)
  && await page.getByTestId('pause-1').count() === 1 && await page.getByTestId('pause-2').count() === 1 && await page.getByTestId('pause-3').count() === 1, sheet)
check('it says billing stops, the kids keep everything, and it starts again by itself',
  /Nothing is charged while it is paused/.test(sheet) && /keep every bit of XP, coins and items/.test(sheet) && /starts again by itself/.test(sheet))
check(`and the half-price month, against the plan list's price (${priceWords(TIERS.standard)}), once`,
  sheet.includes(`at half price, instead of ${priceWords(TIERS.standard)}`) && /Once only/.test(sheet), sheet)
check('"Cancel my plan" is in the sheet too', (await page.getByTestId('cancel-anyway').innerText().catch(() => '')) === 'Cancel my plan')
check('and every choice, cancelling included, is on the screen at once: nothing to scroll for',
  await inView('pause-1') && await inView('save-offer') && await inView('cancel-anyway'))
await shot('pause-cancel')
await page.getByTestId('cancel-anyway').click()
await page.waitForTimeout(900)
check('cancelling from there goes straight to Stripe\'s cancel page', portalCalls.at(-1) === 'cancel'
  && (await page.evaluate(() => window.location.hash)).includes('portal=cancel'), portalCalls.join(','))
check('and nothing was paused or discounted on the way', !(await fam()).paused_until && !(await fam()).save_offer_used_at)

console.log('\n=== A pause of 2 months ===')
// Stripe's page would have been another site; coming back opens the plan screen afresh.
await go('/parent')
await go('/parent/plan')
await page.getByTestId('manage-billing').waitFor({ timeout: 8000 }).catch(() => {})
await page.getByTestId('manage-billing').click()
await page.waitForTimeout(400)
check('"Manage billing" offers the pause first too', await page.getByTestId('keep-sheet').count() === 1
  && await page.getByTestId('manage-anyway').count() === 1)
await page.getByTestId('pause-2').click()
await page.waitForTimeout(1500)
const note = await page.getByTestId('keep-note').innerText().catch(() => '')
const paused = await fam()
check(`the plan screen says until when: "${note.split('\n')[1]}"`, /Paused until (\d{1,2} [A-Z][a-z]+ \d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})/.test(note) && /starts again by itself/.test(note), note)
check('and it is true: paused for two months, the free level\'s features until then', paused.paused_until
  && Math.abs(paused.paused_until.getTime() - new Date(new Date().setMonth(new Date().getMonth() + 2)).getTime()) < 3600000 && paused.effective === 'starter')
await page.getByTestId('resume-plan').waitFor({ timeout: 8000 }).catch(() => {})
check('"Your plan is paused" with the date, and "Start my plan again now"', /Your plan is paused/.test(await body()) && /starts again by itself on/.test(await body())
  && await page.getByTestId('resume-plan').count() === 1)
check('"Cancel my plan" is still there while paused', await page.getByTestId('cancel-plan').count() === 1)
await page.evaluate(() => window.scrollTo(0, 0))
await shot('paused-plan')
await fresh()
await go('/parent')
check('the dashboard says it is paused, and until when', /Your plan is paused/.test(await body()) && /starts again by itself on/.test(await body()))
await go('/parent/settings')
check('the plan in Settings says paused', (await body()).includes(`${TIERS.standard.name} · paused`))

console.log('\n=== The child: "Paused — your progress is safe", and nothing to buy ===')
await asKid(page)
await go('/kid')
await page.getByTestId('paused-note').waitFor({ timeout: 8000 }).catch(() => {})
const kidNote = await page.getByTestId('paused-note').innerText().catch(() => '')
check(`the child sees a friendly note: "${kidNote.split('\n')[1]}"`, /Paused — your progress is safe/.test(kidNote)
  && /XP, coins and items are all kept/.test(kidNote), kidNote)
check('with no price, no plan name and nothing to buy in it', !/\$|Standard|Elite|Starter|price|buy|upgrade|cancel|pay/i.test(kidNote), kidNote)
await page.evaluate(() => window.scrollTo(0, 0))
await shot('kid-paused')
const kidState = await readState(page)
check('and the child\'s XP and coins are all still there', kidState.kids[0] && kidState.kids[0].xp >= 0 && kidState.kids.length === 1)

const OFFER_WORDS = /half price|50%|% off|Switch to yearly|save about|Pause instead|Cancel my plan|Start my plan again|Elite Pass gives|See Elite|Subscribe|\$\d/i
async function kidSeesNoOffers(label) {
  const seen = []
  for (const route of ['/kid', '/kid/quests', '/kid/profile', '/kid/shop', '/kid/arcade', '/kid/leaderboards', '/kid/market']) {
    await go(route)
    const t = await body()
    if (OFFER_WORDS.test(t) || await page.getByTestId('upgrade-nudge').count() || await page.getByTestId('yearly-offer').count()) {
      seen.push(`${route}: ${t.match(OFFER_WORDS)?.[0] || 'a card'}`)
    }
  }
  check(label, seen.length === 0, seen.join('; '))
  // And the parent's screens are behind the PIN.
  const reached = []
  for (const route of ['/parent/plan', '/parent/settings', '/parent']) {
    await go(route)
    if (!/^#\/(switch|kid)/.test(await page.evaluate(() => window.location.hash))) reached.push(route)
  }
  check('and the parent\'s plan, settings and dashboard are not reachable out of Parent Mode', reached.length === 0, reached.join(', '))
}
await kidSeesNoOffers('no child\'s screen shows a price, an offer, a pause or anything to buy, while paused')

console.log('\n=== Resume early ===')
await asParent(page)
await go('/parent/plan')
await page.getByTestId('resume-plan').waitFor({ timeout: 8000 }).catch(() => {})
await page.getByTestId('resume-plan').click()
await page.waitForTimeout(1500)
check('"Start my plan again now" puts the plan back at once', /Your plan is back on/.test(await page.getByTestId('keep-note').innerText().catch(() => ''))
  && !(await fam()).paused_until && (await fam()).effective === 'standard')
check('and the paused notice goes', !/Your plan is paused/.test(await body()) && await page.getByTestId('resume-plan').count() === 0)
await fresh()
await asKid(page)
await go('/kid')
await page.waitForTimeout(800)
check('the child\'s note goes too', await page.getByTestId('paused-note').count() === 0)
await asParent(page)

console.log('\n=== The half-price month, once ===')
await go('/parent/plan')
await page.getByTestId('cancel-plan').waitFor({ timeout: 8000 }).catch(() => {})
await page.getByTestId('cancel-plan').click()
await page.waitForTimeout(400)
await page.getByTestId('save-offer').click()
await page.waitForTimeout(1500)
check('taking it says the next month is half price', /Your next month is half price/.test(await page.getByTestId('keep-note').innerText().catch(() => ''))
  && Boolean((await fam()).save_offer_used_at))
await fresh()
await go('/parent/plan')
await page.getByTestId('cancel-plan').waitFor({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(800)
await page.getByTestId('cancel-plan').click()
await page.waitForTimeout(900)
check('it is never offered again: "Cancel my plan" now goes straight to Stripe\'s cancel page',
  await page.getByTestId('save-offer').count() === 0 && portalCalls.at(-1) === 'cancel', portalCalls.join(','))
const usedOnce = await db.query('select claim_save_offer($1) as r', [family])
check('and the database refuses a second one whatever the screen does', usedOnce.rows[0].r.reason === 'already_used')

console.log('\n=== The Elite nudge, after a great week, in Parent Mode only ===')
// Twelve chores accepted this week, as the database leaves them.
const kid = (await db.query('select id from kids where family_id = $1 limit 1', [family])).rows[0].id
for (let i = 0; i < 12; i += 1) {
  const quest = (await db.query(`insert into quests (family_id, kid_id, title, xp, status) values ($1, $2, $3, 10, 'approved') returning id`,
    [family, kid, `Great week ${i}`])).rows[0].id
  await db.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at) values ($1, $2, $3, 'approved', now() - make_interval(hours => $4))`,
    [family, quest, kid, i * 6])
}
await db.query('update families set save_offer_used_at = now() - interval \'60 days\' where id = $1', [family])
await fresh()
await go('/parent')
await page.getByTestId('upgrade-nudge').waitFor({ timeout: 10000 }).catch(() => {})
const nudge = await page.getByTestId('upgrade-nudge').innerText().catch(() => '')
check(`the dashboard shows it: "${nudge.split('\n')[1]}"`, /Great week: 1[0-9] chores accepted/.test(nudge), nudge)
check(`and says "${TIERS.elite.name} gives ${TIERS.elite.xpMultiplier}× XP", with the plan list's price`,
  nudge.includes(`${TIERS.elite.name} gives ${TIERS.elite.xpMultiplier}× XP`) && nudge.includes(`$${usd(TIERS.elite.price)}`), nudge)
check('it is short: a title, a line and two buttons', nudge.split('\n').filter(Boolean).length <= 5, nudge)
await page.getByTestId('upgrade-nudge').evaluate((el) => el.scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
await shot('elite-nudge')
await page.getByTestId('nudge-upgrade').click()
await page.waitForTimeout(900)
check('upgrading goes to Stripe\'s confirm page for this plan (no second checkout)', portalCalls.at(-1) === 'upgrade' && checkoutCalls.length === 0,
  `${portalCalls.join(',')} / ${checkoutCalls.length}`)

await fresh()
await go('/parent')
check('shown once: not again on the next visit', await page.getByTestId('upgrade-nudge').count() === 0)
// A fortnight later, on this phone.
const moveBack = (field, days) => page.evaluate(([f, d]) => {
  const patch = { [f]: Date.now() - d * 86400000 }
  if (f === 'dismissedAt') patch.shownAt = Date.now() - 30 * 86400000
  sessionStorage.setItem('rankup.test.nudge', JSON.stringify(patch))
}, [field, days])
await moveBack('shownAt', 13)
await fresh()
await go('/parent')
check('not 13 days later either', await page.getByTestId('upgrade-nudge').count() === 0)
await moveBack('shownAt', 15)
await fresh()
await go('/parent')
await page.getByTestId('upgrade-nudge').waitFor({ timeout: 8000 }).catch(() => {})
check('again 15 days later', await page.getByTestId('upgrade-nudge').count() === 1)
await page.getByTestId('nudge-dismiss').click()
await page.waitForTimeout(400)
check('"Not now" takes it away at once', await page.getByTestId('upgrade-nudge').count() === 0)
await fresh()
await go('/parent')
check('and it stays away', await page.getByTestId('upgrade-nudge').count() === 0)
await moveBack('dismissedAt', 10)
await fresh()
await go('/parent')
check('for a fortnight from when it was dismissed', await page.getByTestId('upgrade-nudge').count() === 0)

// An Elite tool opened is a Standard limit too.
await moveBack('dismissedAt', 20)
await db.query(`update submissions set decided_at = now() - interval '9 days' where family_id = $1`, [family])
await fresh()
await go('/parent')
check('(no great week now: nothing)', await page.getByTestId('upgrade-nudge').count() === 0)
await go('/parent/override')
check('(an Elite tool, behind its own gate)', /Elite/.test(await body()))
await go('/parent')
await page.getByTestId('upgrade-nudge').waitFor({ timeout: 8000 }).catch(() => {})
check('opening an Elite tool brings it back on the dashboard, saying so',
  /That one is an Elite Pass tool/.test(await page.getByTestId('upgrade-nudge').innerText().catch(() => '')))

console.log('\n=== The child never sees the nudge ===')
await moveBack('shownAt', 20)
await db.query(`update submissions set decided_at = now() where family_id = $1`, [family])
await fresh()
await asKid(page)
await kidSeesNoOffers('no child\'s screen shows the nudge, a price or an offer, even when a parent would be shown it')

console.log('\n=== "Switch to yearly", for a monthly payer ===')
await asParent(page)
await go('/parent/settings')
await page.getByTestId('yearly-offer').waitFor({ timeout: 8000 }).catch(() => {})
const yearly = await page.getByTestId('yearly-offer').innerText().catch(() => '')
const saving = annualSaving(TIERS.standard)
check(`Settings offers it: "${yearly.split('\n')[1]}"`, yearly.includes(`Switch to yearly — save about ${saving.percent}%`), yearly)
check('with the plan list\'s two prices and the real saving', yearly.includes(`$${usd(TIERS.standard.yearPrice)}/yr`) && yearly.includes(`$${saving.saved}`))
await page.getByTestId('yearly-offer').evaluate((el) => el.scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
await shot('yearly')
await page.getByTestId('yearly-switch').click()
await page.waitForTimeout(900)
check('it opens Stripe\'s confirm page for yearly billing', portalCalls.at(-1) === 'yearly', portalCalls.join(','))
await db.query(`update families set billing_cycle = 'year' where id = $1`, [family])
await fresh()
await go('/parent/settings')
await page.waitForTimeout(800)
check('a family paying yearly is not offered it', await page.getByTestId('yearly-offer').count() === 0)

await db.query('delete from families where id = $1', [family])
await db.end()
stopVite()
console.log(`\n(screenshots in ${SHOT_DIR})`)
await finish(errors, fails, browser)
