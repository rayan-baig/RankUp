/**
 * Gift subscriptions, in the app.
 *
 * The rules are the database's (supabase/test/55-gifts.sql) and buying,
 * paying and the emails go through the real webhook in tests/billingwalk.mjs.
 * This is what people see:
 *
 *   - the front door links to the Give page, which needs no account, takes
 *     its prices from the plan list and checks what is typed (a rude word, a
 *     link, a missing email) before anything is sent
 *   - the printable gift card shows the code, the plan and the message from
 *     its link, and a link with no proper code shows no code
 *   - in Parent Mode, Settings and the plan screen lead to "Redeem a gift";
 *     a wrong code is refused in words; a real one gives the plan, and
 *     Settings then says "Gift plan: Elite Pass until <date>"
 *   - the parent's dashboard reminds them when 30 days or fewer are left
 *   - a child never sees buying, redeeming or the gift: not on their screens,
 *     and the gift pages are not reachable out of Parent Mode
 *
 * The redeem endpoint is a server function the dev server does not serve,
 * so its answer is the database's own redeem_gift_code, called here with the
 * family the endpoint would have found.
 *
 * Screenshots (390x844): rankup-gift-give.png, rankup-gift-card.png,
 * rankup-gift-redeem.png, rankup-gift-settings.png in SHOT_DIR.
 *
 * Needs the stack:  supabase/test/up.sh
 */
import pg from 'pg'
import { createHash } from 'node:crypto'
import { launch, reporter, setUpFamily, asParent, asKid, finish, SHOT_DIR, BASE } from './helpers.mjs'
import { TIERS } from '../src/state/initialState.js'
import { usd } from '../src/lib/plans.js'

const { fails, pass, fail } = reporter()
const check = (name, cond, detail = '') => (cond ? pass(name) : fail(name, detail))
const { browser, page, errors } = await launch()

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
const hash = (code) => createHash('sha256').update(code.replace(/[^A-Z0-9]/g, '')).digest('hex')

console.log('\n=== Never on a child\'s phone: the front door shows nothing to buy ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
check('before anyone says who they are, the front door has the gift and schools links',
  await page.getByTestId('give-link').count() === 1 && await page.getByTestId('schools-link').count() === 1)
// The front door as this phone has it saved, then as a child's phone would.
const fresh = await page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1') || '{}'))
for (const [what, patch] of [
  ['a phone waiting to be linked to a child', { pendingPairing: { code: '123456', expiresAt: Date.now() + 600000 } }],
  ['a child\'s phone that was unlinked', { deviceWiped: 'unlinked', deviceWipedChild: true }],
  ['a phone set up as a child\'s', { device: { role: 'kid', linkedKidId: null, familyName: null, pairedAt: null } }],
]) {
  // A phone of its own, with that saved before the app starts.
  // eslint-disable-next-line no-await-in-loop
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  // eslint-disable-next-line no-await-in-loop
  await ctx.addInitScript((st) => { if (!sessionStorage.getItem('t-set')) { localStorage.setItem('rankup.state.v1', st); sessionStorage.setItem('t-set', '1') } },
    JSON.stringify({ ...fresh, onboarded: false, ...patch }))
  // eslint-disable-next-line no-await-in-loop
  const child = await ctx.newPage()
  // eslint-disable-next-line no-await-in-loop
  await child.goto(`${BASE}/#/welcome`, { waitUntil: 'networkidle' })
  // eslint-disable-next-line no-await-in-loop
  await child.waitForTimeout(800)
  // eslint-disable-next-line no-await-in-loop
  const seen = { gift: await child.getByTestId('give-link').count(), schools: await child.getByTestId('schools-link').count(),
    // eslint-disable-next-line no-await-in-loop
    front: await child.getByRole('button', { name: /I'm a parent|I'm a kid/ }).count() }
  check(`${what}: no gift link and no schools link (both are one tap from prices)`, seen.gift === 0 && seen.schools === 0, JSON.stringify(seen))
  // eslint-disable-next-line no-await-in-loop
  await ctx.close()
}

console.log('\n=== The Give page, from the front door, with no account ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const link = page.getByTestId('give-link')
check('the front door links to "Give a year of RankUp as a gift"', await link.count() === 1)
await link.click()
await page.waitForTimeout(900)
check('which opens the Give page, with no sign-in', await page.getByTestId('give-rankup').count() === 1
  && /Give a year of RankUp/.test(await body()))
const text = await body()
check('both plans, at the yearly prices from the plan list', text.includes(`$${usd(TIERS.standard.yearPrice)}`)
  && text.includes(`$${usd(TIERS.elite.yearPrice)}`) && text.includes(TIERS.standard.name) && text.includes(TIERS.elite.name))
check('it says the family gets 12 months from redeeming, and nothing renews', /12 months from the day they redeem/.test(text) && /Nothing renews/.test(text))
check('and says, honestly, how long each person\'s details are kept', /until the code runs out/.test(text) && /deleted within 30 days/.test(text))
await page.screenshot({ path: `${SHOT_DIR}/rankup-gift-give.png` })

await page.getByTestId('gift-pay').click()
await page.waitForTimeout(300)
check('paying with nothing filled in names what is missing', /Your email, for the receipt/.test(await body()) && /Their email, so we can send it/.test(await body()))
await page.getByTestId('gift-buyer-email').fill('gift-buyer@example.com')
await page.getByTestId('gift-to-email').fill('them@example.com')
await page.getByTestId('gift-message').fill('a shit present')
await page.getByTestId('gift-pay').click()
await page.waitForTimeout(300)
check('a rude word in the message is refused on the page', /Please choose different words/.test(await body()))
await page.getByTestId('gift-message').fill('see www.example.com')
await page.getByTestId('gift-pay').click()
await page.waitForTimeout(300)
check('and a link', /No links or email addresses/.test(await body()))
const typed = 'x'.repeat(250)
await page.getByTestId('gift-message').fill(typed)
check('the message stops at 200 characters', (await page.getByTestId('gift-message').inputValue()).length === 200)
await page.getByTestId('gift-message').fill('Happy holidays!')
await page.getByTestId('gift-delivery-self').click()
await page.getByTestId('gift-plan-standard').click()
check('the button says what is paid, for which plan', (await page.getByTestId('gift-pay').innerText()).includes(`$${usd(TIERS.standard.yearPrice)}`)
  && (await page.getByTestId('gift-pay').innerText()).includes(TIERS.standard.name))

console.log('\n=== The printable gift card ===')
await go('/gift/card?code=ABCD-EFGH-JKMN&plan=elite&to=The+Riveras&from=Grandma+Jo&msg=Happy+holidays%2C+all+of+you!&by=2028-11-14')
const card = await page.getByTestId('gift-card').innerText().catch(() => '')
check('it shows the code, "A year of RankUp", the plan and how to redeem it', card.includes('ABCD-EFGH-JKMN') && /A year of RankUp/.test(card)
  && card.includes(TIERS.elite.name) && /Redeem a gift/.test(card), card)
check('with the names and the message', /The Riveras/i.test(card) && /Grandma Jo/i.test(card) && /Happy holidays, all of you!/.test(card), card)
check('and the date it must be used by', /14 November 2028/.test(card))
check('and a Print button', await page.getByTestId('gift-card-print').count() === 1)
await page.evaluate(() => window.scrollTo(0, 0))
await page.screenshot({ path: `${SHOT_DIR}/rankup-gift-card.png` })
await go('/gift/card?code=<script>&plan=elite')
check('a link without a proper code shows no code at all', !(await body()).includes('<script>') && /••••/.test(await body()))

console.log('\n=== Redeeming, in Parent Mode ===')
await setUpFamily(page)
const family = (await db.query('select id from families order by created_at desc limit 1')).rows[0].id
await asParent(page)
await go('/parent/settings')
check('Settings has "Redeem a gift" and "Give RankUp as a gift"', await page.getByTestId('redeem-link').count() === 1
  && await page.getByTestId('give-link-parent').count() === 1)
check('and no gift line while there is no gift', await page.getByTestId('gift-plan-line').count() === 0)
await go('/parent/plan')
check('so does the plan screen', await page.getByTestId('gift-card-plan').count() === 1)

// A gift bought and paid for, as the webhook leaves it: only the hash is kept.
const CODE = 'WXYZ-2345-HJKM'
const BAD = 'WXYZ-2345-HJKN'
await db.query(`insert into gift_orders (plan, delivery, paid_at, stripe_session, code_hash, expires_at)
                values ('elite', 'self', now(), $1, $2, now() + interval '2 years')`, [`cs_ui_${RUN}`, hash(CODE)])
await page.route('**/api/redeem-gift', async (route) => {
  const { code } = JSON.parse(route.request().postData() || '{}')
  const r = (await db.query('select redeem_gift_code($1, $2, $3) as r', [family, code, 'ui-test'])).rows[0].r
  if (r.ok) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...r }) })
  else await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: r.reason }) })
})
await go('/parent/redeem')
await page.getByTestId('redeem-code').fill(BAD.toLowerCase().replace(/-/g, ' '))
check('the code is tidied as it is typed', (await page.getByTestId('redeem-code').inputValue()) === BAD)
await page.getByTestId('redeem-submit').click()
await page.waitForTimeout(900)
check('a code nobody sold is refused in words', /does not match a gift/.test(await page.getByTestId('redeem-error').innerText().catch(() => '')))
await page.getByTestId('redeem-code').fill(CODE)
await page.getByTestId('redeem-submit').click()
await page.waitForTimeout(2500)
const done = await page.getByTestId('redeem-done').innerText().catch(() => '')
check('a real code gives the plan, until a date a year away', done.includes(`${TIERS.elite.name} is yours until`) && /starts today/i.test(done), done)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await go('/parent/redeem')
await page.getByTestId('redeem-gift-line').waitFor({ timeout: 8000 }).catch(() => {})
const redeemLine = await page.getByTestId('redeem-gift-line').innerText().catch(() => '')
check('the redeem screen then shows the gift', redeemLine.includes(`Gift plan: ${TIERS.elite.name} until`), redeemLine)
await page.evaluate(() => window.scrollTo(0, 0))
await page.screenshot({ path: `${SHOT_DIR}/rankup-gift-redeem.png` })
await go('/parent/settings')
await page.getByTestId('gift-plan-line').waitFor({ timeout: 8000 }).catch(() => {})
const line = await page.getByTestId('gift-plan-line').innerText().catch(() => '')
const until = (await db.query('select gift_until from families where id = $1', [family])).rows[0].gift_until
const date = new Date(until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
check(`Settings says "Gift plan: ${TIERS.elite.name} until <date>"`, line.includes(`Gift plan: ${TIERS.elite.name} until ${date}`), line)
check('and the plan in Parent account says it is a gift', (await body()).includes(`Starter · gift of ${TIERS.elite.name}`))
await page.getByTestId('gift-card-settings').evaluate((el) => el.scrollIntoView({ block: 'start' }))
await page.evaluate(() => window.scrollBy(0, -12))
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOT_DIR}/rankup-gift-settings.png` })

console.log('\n=== The reminder, 30 days before it ends ===')
await go('/parent')
check('no reminder with a year left', await page.getByTestId('gift-ending-notice').count() === 0)
await db.query("update families set gift_until = now() + interval '20 days' where id = $1", [family])
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await go('/parent')
await page.getByTestId('gift-ending-notice').waitFor({ timeout: 8000 }).catch(() => {})
const notice = await page.getByTestId('gift-ending-notice').innerText().catch(() => '')
check('20 days left: the dashboard says so, and what to do', new RegExp(`Your gift of ${TIERS.elite.name} ends in (19|20) days`).test(notice)
  && /choose a plan/.test(notice), notice)

console.log('\n=== A child never sees gifts ===')
await asKid(page)
const seen = []
for (const route of ['/kid', '/kid/quests', '/kid/profile', '/kid/shop', '/kid/arcade', '/kid/leaderboards']) {
  await go(route)
  if (/gift|redeem|give rankup|a year of rankup/i.test(await body())) seen.push(route)
}
check('no child\'s screen mentions a gift, redeeming or giving', seen.length === 0, seen.join(', '))
for (const route of ['/gift', '/gift/card?code=ABCD-EFGH-JKMN&plan=elite', '/parent/redeem']) {
  await go(route)
  const where = await page.evaluate(() => window.location.hash)
  const t = await body()
  if (/Give a year of RankUp|Your gift code|Redeem a gift/.test(t) || !/^#\/(switch|kid)/.test(where)) seen.push(`${route} -> ${where}`)
}
check('and the gift pages are not reachable out of Parent Mode: the PIN comes first', seen.length === 0, seen.join(', '))

await db.query('delete from gift_orders where stripe_session = $1', [`cs_ui_${RUN}`])
await db.query('delete from gift_redeem_attempts where ip_key = $1', ['ui-test'])
await db.end()
if (BASE) console.log(`\n(screenshots in ${SHOT_DIR})`)
await finish(errors, fails, browser)
