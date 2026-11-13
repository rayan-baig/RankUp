/**
 * "Invite a family, get a free month", in the app.
 *
 * The rules are the database's (supabase/test/54-referral-rewards.sql) and the
 * Stripe side is tests/billingwalk.mjs. This is what a parent and a child see:
 *
 *   - Settings has the card, with the family's code, and says nobody has
 *     joined yet
 *   - once families have joined and one pays, the card counts them, and the
 *     free month; never another family's name or email
 *   - the parent's dashboard says "You earned a free month" once: OK, and it
 *     does not come back, after a reload either
 *   - the plan screen has the card too
 *   - a family on Starter is told its month is banked until it picks a plan
 *   - the child's screens never mention any of it
 *
 * Needs the stack:  supabase/test/up.sh
 */
import pg from 'pg'
import { launch, reporter, setUpFamily, asParent, asKid, finish, SHOT_DIR, BASE } from './helpers.mjs'

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

await setUpFamily(page)
const family = (await db.query('select id from families order by created_at desc limit 1')).rows[0].id
await asParent(page)

console.log('\n=== The card in Settings ===')
await go('/parent/settings')
const card = page.getByTestId('invite-card')
await card.waitFor({ timeout: 8000 }).catch(() => {})
check('Settings has "Invite a family, get a free month"', await card.getByText('Invite a family, get a free month').count() === 1)
const code = (await page.getByTestId('invite-code').innerText().catch(() => '')).trim()
check('with the family\'s own code', /^[A-Z2-9]{6}$/.test(code), code)
check('and says nobody has joined yet', /No families have joined with your code yet/.test(await card.innerText().catch(() => '')))

// Two families join with the code; one of them pays, and the free month is
// on this family's account. Written as the webhook would leave them.
const others = []
for (const n of [1, 2]) {
  const user = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`zebra-${n}-${RUN}@example.com`])).rows[0].id
  const id = (await db.query(`insert into families (name) values ($1) returning id`, [`Zebra Household ${n} ${RUN}`])).rows[0].id
  await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, $3, 'parent')`, [user, id, `Zebra Parent ${n}`])
  others.push({ id, email: `zebra-${n}-${RUN}@example.com`, name: `Zebra Household ${n} ${RUN}` })
}
await db.query('insert into referrals (invited_family_id, referrer_family_id) values ($1, $3), ($2, $3)', [others[0].id, others[1].id, family])
await db.query(`update referrals set paid_invoice = 'in_ui_${RUN}', paid_at = now(), reward_state = 'applied', reward_at = now(),
                reward_amount = 1599, reward_currency = 'USD', reward_applied_at = now() where invited_family_id = $1`, [others[0].id])

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await go('/parent/settings')
await card.waitFor({ timeout: 8000 }).catch(() => {})
const counts = await page.getByTestId('invite-counts').innerText().catch(() => '')
check('the card counts the families who joined, and how many pay', /2 families joined with your code, 1 pays for a plan\./.test(counts), counts)
check('and the free month earned', /1 free month earned/.test(counts), counts)
const settingsText = await body()
check('never another family\'s name or email', others.every((o) => !settingsText.includes(o.name) && !settingsText.includes(o.email)
  && !settingsText.includes(o.id)) && !/Zebra/.test(settingsText))
// The whole 390x844 screen, with the card at the top of it.
await card.evaluate((el) => el.scrollIntoView({ block: 'start' }))
await page.evaluate(() => window.scrollBy(0, -12))
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOT_DIR}/rankup-ref-invite-card.png` })

console.log('\n=== "You earned a free month", once ===')
await go('/parent')
const notice = page.getByTestId('referral-reward-notice')
await notice.waitFor({ timeout: 8000 }).catch(() => {})
check('the dashboard says a free month was earned', await page.getByText('You earned a free month!').count() === 1
  && /next bill/.test(await notice.innerText().catch(() => '')))
await page.evaluate(() => window.scrollTo(0, 0))
await page.screenshot({ path: `${SHOT_DIR}/rankup-ref-free-month-notice.png` })
await page.getByRole('button', { name: 'OK' }).first().click()
await page.waitForTimeout(800)
check('OK puts it away', await page.getByText('You earned a free month!').count() === 0)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
check('and it does not come back after a reload (seen for the family)', await page.getByText('You earned a free month!').count() === 0)
check('the database remembers it was seen', (await db.query('select reward_seen_at is not null as seen from referrals where invited_family_id = $1',
  [others[0].id])).rows[0].seen === true)

console.log('\n=== The plan screen ===')
await go('/parent/plan')
const planCard = page.getByTestId('invite-card-plan')
await planCard.waitFor({ timeout: 8000 }).catch(() => {})
check('the plan screen has the card, with the code and the free month', (await planCard.innerText().catch(() => '')).includes(code)
  && /1 free month earned/.test(await planCard.innerText().catch(() => '')))
check('without the box for someone else\'s code', await planCard.getByLabel('Invite code').count() === 0)

console.log('\n=== A family on Starter: banked ===')
await db.query(`update referrals set paid_invoice = 'in_ui2_${RUN}', paid_at = now(), reward_state = 'banked', reward_at = now()
                where invited_family_id = $1`, [others[1].id])
await go('/parent/settings')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await go('/parent/settings')
const banked = await page.getByTestId('invite-banked').innerText().catch(() => '')
check('a banked month says it comes off the first bill when a plan is chosen',
  /1 free month banked\. It comes off your first bill when you choose a plan\./.test(banked), banked)

console.log('\n=== The child never sees it ===')
await asKid(page)
const seen = []
for (const route of ['/kid', '/kid/quests', '/kid/profile', '/kid/shop', '/kid/arcade', '/kid/leaderboards']) {
  await go(route)
  const text = await body()
  if (/free month|invite a family|invite code|joined with your code|banked/i.test(text) || text.includes(code)) seen.push(route)
}
check('no child\'s screen mentions invites, codes or free months', seen.length === 0, seen.join(', '))

await db.query('delete from families where id = any($1::uuid[])', [others.map((o) => o.id)])
await db.query('delete from auth.users where email like $1', [`zebra-%-${RUN}@example.com`])
await db.end()
if (BASE) console.log(`\n(screenshots in ${SHOT_DIR})`)
await finish(errors, fails, browser)
