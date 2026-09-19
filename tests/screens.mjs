/**
 * Open every screen in the app and make sure none of them breaks.
 *
 * The other suites each drive one flow deeply. This one goes wide instead: it
 * walks all twenty-odd routes as a parent and as a child, on an account with
 * real data behind it, and fails on any React crash, any unhandled error, and
 * any screen that renders nothing at all.
 *
 * A screen that throws does not just look wrong — the boundary swallows it and
 * the child sees an apology card where their chores should be. That is the kind
 * of thing nobody notices until a real person hits it on a Saturday morning.
 */
import { launch, reporter, setUpFamily, asParent, asKid, submitPhotoProof, finish, setPlanInDatabase, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

const PARENT_ROUTES = [
  '/parent', '/parent/approvals', '/parent/assign', '/parent/kids', '/parent/blueprint',
  '/parent/override', '/parent/guilds', '/parent/alliance', '/parent/plan',
  '/parent/settings', '/parent/pair',
]
const KID_ROUTES = [
  '/kid', '/kid/quests', '/kid/shop', '/kid/market', '/kid/arcade', '/kid/guild', '/kid/profile',
]
const OPEN_ROUTES = ['/legal/privacy', '/legal/terms', '/switch']

/** Visit one route and report anything that went wrong on it. */
async function visit(route, label) {
  const before = errors.length
  await page.evaluate((r) => { window.location.hash = r }, route)
  await page.waitForTimeout(700)

  const crashed = await page.getByText(/This screen hit a snag|Something went wrong/i).count()
  const text = (await page.evaluate(() => document.body.innerText)).trim()
  const fresh = errors.slice(before)

  if (crashed) fail(`${label} ${route}`, 'the crash boundary caught something')
  else if (text.length < 20) fail(`${label} ${route}`, `rendered almost nothing (${text.length} chars)`)
  else if (fresh.length) fail(`${label} ${route}`, fresh[0].slice(0, 120))
  else pass(`${label} ${route}`)
}

await setUpFamily(page)
// Elite, so the screens that are gated behind a plan actually render their
// contents rather than a "not on your plan" card — a locked screen that never
// runs its own code is not a screen that has been tested.
await setPlanInDatabase('The Riveras', 'elite')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// Real data behind the screens: a submission waiting, so the review screen has
// something to draw, and history for the charts.
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(600)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
await submitPhotoProof(page)

console.log('\n=== Every parent screen ===')
await asParent(page)
for (const route of PARENT_ROUTES) await visit(route, 'parent')

console.log('\n=== Every kid screen ===')
await asKid(page)
for (const route of KID_ROUTES) await visit(route, 'kid')

console.log('\n=== And the ones anybody can reach ===')
for (const route of OPEN_ROUTES) await visit(route, 'open')

console.log('\n=== A quest that does not exist is a message, not a crash ===')
await asKid(page)
await visit('/kid/quest/does-not-exist', 'kid')

console.log('\n=== A route nobody defined is a message, not a blank page ===')
await visit('/parent/nonsense-route', 'open')

await page.screenshot({ path: `${SHOT_DIR}/screens-last.png` })
await finish(errors, fails, browser)
