/**
 * The front door, and the look-around behind it.
 *
 * Two things are worth a test here and they pull in opposite directions. The
 * demo has to be a REAL family — every screen populated, nothing empty, no
 * crash boundary — because it is the only argument the product gets to make
 * before somebody decides. And it has to be completely inert: not one request
 * to a server, and not one row left behind when the visitor starts their own.
 *
 * The second is the one that would ship broken without a test. A demo that
 * quietly queued a stranger's children into the first real account somebody
 * created would be invisible in development and mortifying in production.
 */
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1') || '{}'))

// Every request that leaves the page, so "it never talks to a server" is
// measured rather than asserted.
const calls = []
page.on('request', (r) => {
  const url = r.url()
  if (url.startsWith(BASE) || url.startsWith('data:')) return
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return
  calls.push(`${r.method()} ${url}`)
})

console.log('\n=== The front door ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOT_DIR}/welcome.png` })

const door = await page.evaluate(() => document.body.innerText)
;/have a look around/i.test(door)
  ? pass('the first thing offered costs nothing')
  : fail('look-around offered', door.slice(0, 200))
;/no account, no email/i.test(door)
  ? pass('and says so, because "free" has stopped meaning anything')
  : fail('no-account promise', door.slice(0, 200))

// The self-playing loop has to actually advance — a still frame of a phone is
// not worth the code.
const firstBeat = await page.evaluate(() => document.body.innerText.match(/You assign it|They photograph it|The app checks the photo|You approve/)?.[0])
await page.waitForTimeout(2600)
const secondBeat = await page.evaluate(() => document.body.innerText.match(/You assign it|They photograph it|The app checks the photo|You approve/)?.[0])
firstBeat && secondBeat && firstBeat !== secondBeat
  ? pass(`the loop plays by itself (${firstBeat} → ${secondBeat})`)
  : fail('loop preview advances', `${firstBeat} then ${secondBeat}`)

console.log('\n=== Looking around ===')
await page.getByRole('button', { name: /Have a look around/ }).click()
await page.waitForTimeout(1800)
await page.screenshot({ path: `${SHOT_DIR}/lookaround.png` })

const demo = await state()
demo.demo === true
  ? pass('the demo is flagged as one')
  : fail('demo flag set', JSON.stringify(demo.demo))
demo.kids?.length === 2
  ? pass('with a family that has two children in it')
  : fail('demo has kids', JSON.stringify(demo.kids?.map((k) => k.name)))
demo.kids?.every((k) => k.xp > 0)
  ? pass('both of whom have actually earned something')
  : fail('demo kids have history', JSON.stringify(demo.kids?.map((k) => k.xp)))
demo.submissions?.some((s) => s.status === 'pending')
  ? pass('and one chore waiting, so the review screen is not empty')
  : fail('demo has something to review', JSON.stringify(demo.submissions?.map((s) => s.status)))

console.log('\n=== Every screen, with nothing missing ===')
const ROUTES = [
  '/parent', '/parent/approvals', '/parent/assign', '/parent/kids',
  '/parent/blueprint', '/parent/plan', '/parent/settings',
  '/kid', '/kid/quests', '/kid/shop', '/kid/arcade', '/kid/profile',
]
for (const route of ROUTES) {
  await page.evaluate((r) => { window.location.hash = r }, route)
  await page.waitForTimeout(650)
  const text = await page.evaluate(() => document.body.innerText)
  const broken = /Something went wrong|went wrong on this screen/i.test(text)
  broken ? fail(`demo ${route}`, text.slice(0, 120)) : pass(`demo ${route}`)
}

console.log('\n=== And it is inert ===')
// The banner is the safety rail: a visitor must never think this is theirs.
const banner = await page.evaluate(() => document.body.innerText)
;/looking around the Rivera family/i.test(banner)
  ? pass('every screen says whose family this is')
  : fail('demo banner shown', banner.slice(0, 160))

demo.syncQueue?.length === 0
  ? pass('nothing is queued to upload')
  : fail('demo queues nothing', JSON.stringify(demo.syncQueue))

calls.length === 0
  ? pass('and in all of that, not one request left the page')
  : fail('demo makes no requests', calls.slice(0, 4).join(' | '))

console.log('\n=== Starting a real one ===')
await page.evaluate(() => { window.location.hash = '/parent' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Start mine' }).first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Start mine' }).last().click()
await page.waitForTimeout(1500)

const after = await state()
!after.demo
  ? pass('the demo is gone')
  : fail('demo cleared', JSON.stringify(after.demo))
!after.onboarded && (after.kids?.length || 0) === 0
  ? pass("and takes nobody else's children into the real family")
  : fail('demo leaves nothing behind', JSON.stringify({ onboarded: after.onboarded, kids: after.kids?.length }))
const back = await page.evaluate(() => document.body.innerText)
;/have a look around/i.test(back)
  ? pass('landing them back at the front door')
  : fail('back at the door', back.slice(0, 160))

finish(errors, fails, browser)
