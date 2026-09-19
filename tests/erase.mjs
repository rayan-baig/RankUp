/**
 * "Erase this device" must not erase the family.
 *
 * The button's own words are that it clears this device "without touching your
 * account or anything synced". Before this test, it wiped local state but left
 * the sync shadow behind — and the next save read the empty state against that
 * shadow and queued a DELETE for every kid, quest, reward and note, which then
 * reached every other device.
 */
import { setUpFamily, asParent, launch, reporter, finish, BASE } from './helpers.mjs'

const { pass, fail, fails } = reporter()
const { browser, page } = await launch()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

// Every delete the device tries to send, recorded.
const deletes = []
await page.route('**/rest/v1/**', async (route) => {
  if (route.request().method() === 'DELETE') deletes.push(route.request().url())
  await route.continue()
})

await setUpFamily(page)
await asParent(page)
await page.waitForTimeout(1500)

const before = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1') || '{}')
  return { quests: (s.quests || []).length, kids: (s.kids || []).length }
})
console.log('\n=== Before erasing ===')
before.quests > 0 && before.kids > 0
  ? pass(`the family has ${before.kids} kid and ${before.quests} quests to lose`)
  : fail('the fixture did not create anything, so this test proves nothing')

console.log('\n=== Erase, then let the sync loop run ===')
await page.evaluate(() => { window.location.hash = '/parent/settings' })
await page.waitForTimeout(800)
// The real button, not the function behind it — the promise being tested is
// the one printed on the button.
await page.getByRole('button', { name: /Erase local data on this device only/ }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Erase', exact: true }).click()
await page.waitForTimeout(4000)

const sweep = deletes.length
sweep === 0
  ? pass('no deletes were sent to the server')
  : fail(`the device sent ${sweep} DELETE requests after a local-only erase`, deletes[0])

// The promise on the button is that the account and anything synced are
// untouched. That is a question about the server, not about localStorage.
const { default: pg } = await import('pg')
const client = new pg.Client({ host: '/tmp', port: 55432, user: 'postgres', database: 'rankup_test' })
await client.connect()
const survived = await client.query(
  `select (select count(*) from kids)   as kids,
          (select count(*) from quests) as quests`)
await client.end()

const { kids, quests } = survived.rows[0]
Number(kids) >= before.kids
  ? pass(`the family is still on the server (${kids} kid, ${quests} quests)`)
  : fail(`the erase deleted the family from the server — ${kids} kids left`)

finish(errs, fails, browser)
