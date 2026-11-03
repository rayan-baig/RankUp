/**
 * The screens added for launch, in a real browser at 390x844:
 *
 *   - Settings shows the version (package.json's, built in) and links to Help;
 *   - Help answers the questions, with the plan list's prices;
 *   - a link to nowhere shows "not found" and a way home, on either side of
 *     the app, and the nav bar stays;
 *   - a screen that cannot download with no internet says so, and Try again
 *     opens it once the signal is back;
 *   - with no internet, the sync line says so, and a chore sent with no
 *     signal says it is saved on the phone until it really has gone;
 *   - an arcade game, and a sport in SportsMania, say how to play as they start.
 *
 * Screenshots of each go to tests/screenshots/launch-*.png.
 */
import { readFileSync } from 'node:fs'
import { launch, reporter, setUpFamily, asParent, asKid, sendToParent, setKidInDatabase, finish, SHOT_DIR } from './helpers.mjs'
import { TIERS } from '../src/state/initialState.js'
import { findGame } from '../src/data/minigames.js'
import { SPORTS } from '../src/data/sports.js'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const ok = (name, cond, detail = '') => (cond ? pass(name) : fail(name, detail))
const text = () => page.locator('body').innerText()
const go = async (hash, wait = 900) => {
  await page.evaluate((h) => { window.location.hash = h }, hash)
  await page.waitForTimeout(wait)
}
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version

await setUpFamily(page)
await asParent(page)

console.log('\n=== Settings: the version, and the way to Help ===')
await go('/parent/settings')
const summary = await text()
ok(`the Help & about line shows version ${VERSION}`, summary.includes(`RankUp ${VERSION}`), summary.slice(0, 300))
await page.getByRole('button', { name: /Help & about/ }).click()
await page.waitForTimeout(300)
const versionLine = await page.getByTestId('app-version').innerText().catch(() => '')
ok('and, opened, says which version and whose', versionLine.includes(VERSION) && /MTRX Horizyn/.test(versionLine), versionLine)
await page.getByTestId('app-version').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${SHOT_DIR}/launch-settings-about.png` })
await page.getByRole('button', { name: /^Help/ }).filter({ hasText: 'Linking a phone' }).click()
await page.waitForTimeout(900)
ok('Help opens from Settings', page.url().endsWith('#/parent/help'), page.url())

console.log('\n=== Help ===')
const help = await text()
ok('it is the help page', /Tap a question to see the answer/.test(help), help.slice(0, 200))
const asked = await page.locator('[aria-expanded]').count()
ok(`it asks between 12 and 15 questions (${asked})`, asked >= 12 && asked <= 15)
await page.screenshot({ path: `${SHOT_DIR}/launch-help.png` })
await page.getByRole('button', { name: 'What do the plans cost?' }).click()
await page.waitForTimeout(300)
const prices = await page.getByTestId('help-answer-prices').innerText().catch(() => '')
ok('the prices are the plan list\'s', prices.includes(`$${TIERS.standard.price.toFixed(2)} a month`)
  && prices.includes(`$${TIERS.elite.yearPrice.toFixed(2)} a year`) && /Starter: free/.test(prices), prices)
await page.screenshot({ path: `${SHOT_DIR}/launch-help-prices.png` })
await page.getByRole('button', { name: 'See your plan' }).first().click()
await page.waitForTimeout(900)
ok('and an answer\'s button opens the screen it talks about', page.url().endsWith('#/parent/plan'), page.url())

console.log('\n=== A link to nowhere, in Parent Mode ===')
await go('/parent/no-such-screen')
ok('says it cannot find that page', await page.getByTestId('not-found').isVisible().catch(() => false), (await text()).slice(0, 160))
ok('and the nav bar is still there', (await page.locator('nav').count()) > 0)
await page.screenshot({ path: `${SHOT_DIR}/launch-not-found.png` })
await page.getByRole('button', { name: 'Go home' }).click()
await page.waitForTimeout(900)
ok('Go home goes to the parent home', page.url().endsWith('#/parent'), page.url())
await go('/legal/nothing-here')
ok('an unknown legal page is not shown as the privacy policy', await page.getByTestId('not-found').isVisible().catch(() => false),
  (await text()).slice(0, 120))

console.log('\n=== No internet ===')
await go('/parent', 1200)
await page.context().setOffline(true)
await page.evaluate(() => window.dispatchEvent(new Event('offline')))
await page.waitForTimeout(2500)
// The sync line updates on its next round; poke it so this does not wait.
await page.getByRole('button', { name: /Up to date|Syncing|No internet|waiting/ }).first().click().catch(() => {})
await page.waitForTimeout(1500)
const badge = await text()
ok('the sync line says "No internet"', /No internet/.test(badge), badge.slice(0, 240))

// A screen never opened before has not been downloaded yet.
await go('/parent/alliance', 2500)
ok('a screen not yet on the phone says there is no internet, not that it broke',
  await page.getByTestId('offline-screen').isVisible().catch(() => false), (await text()).slice(0, 200))
ok('and not "This screen broke"', !/This screen broke/.test(await text()))
await page.screenshot({ path: `${SHOT_DIR}/launch-offline.png` })
await page.context().setOffline(false)
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Try again' }).click()
await page.waitForTimeout(2500)
ok('with the signal back, Try again opens it', !(await page.getByTestId('offline-screen').isVisible().catch(() => false))
  && !/This screen broke/.test(await text()), (await text()).slice(0, 160))

console.log('\n=== A chore sent with no signal ===')
await asKid(page)
await go('/kid/quests')
await page.locator('button.card').first().click()
await page.waitForTimeout(700)
const questUrl = page.url()
await page.context().setOffline(true)
await page.evaluate(() => window.dispatchEvent(new Event('offline')))
await sendToParent(page)
// Sending goes back to the quest list; the quest itself says where it is.
await go(new URL(questUrl).hash.slice(1), 800)
const unsent = await text()
ok('says it is saved on the phone, not that it was sent', /Saved on your phone/.test(unsent) && !/Sent to your parent/.test(unsent),
  unsent.slice(0, 300))
await page.screenshot({ path: `${SHOT_DIR}/launch-saved-offline.png` })
await page.context().setOffline(false)
await page.evaluate(() => window.dispatchEvent(new Event('online')))
let sent = false
for (let i = 0; i < 20 && !sent; i += 1) {
  await page.waitForTimeout(500)
  sent = /Sent to your parent/.test(await text())
}
ok('and once it has gone, says it was sent', sent, (await text()).slice(0, 300))
ok('on the same quest', page.url() === questUrl)

console.log('\n=== How to play, before the first move ===')
await setKidInDatabase('Ava', { play_tokens: 3 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await go('/kid/arcade', 1400)
await page.getByRole('button', { name: /^Memory Match/ }).first().click()
await page.waitForTimeout(900)
const howTo = await page.getByTestId('how-to-play').innerText().catch(() => '')
ok('Memory Match says how to play as it opens', howTo.includes(findGame('memory').howTo), howTo)
await page.screenshot({ path: `${SHOT_DIR}/launch-how-to-play.png` })
await page.getByRole('button', { name: 'Give up' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /^SportsMania/ }).first().click()
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Golf/ }).click()
await page.waitForTimeout(700)
const sportLine = await page.getByTestId('sport-how-to').innerText().catch(() => '')
ok('a sport says how it is played as it starts', sportLine.includes(SPORTS.find((s) => s.id === 'golf').howTo), sportLine)
await page.screenshot({ path: `${SHOT_DIR}/launch-sport-how-to.png` })

console.log('\n=== A link to nowhere, on the child\'s side ===')
await go('/kid/no-such-screen')
ok('says it cannot find that page', await page.getByTestId('not-found').isVisible().catch(() => false), (await text()).slice(0, 160))
await page.getByRole('button', { name: 'Go home' }).click()
await page.waitForTimeout(900)
ok('Go home goes to the child\'s home', page.url().endsWith('#/kid'), page.url())

// The phone was offline on purpose: failed requests, and React noting the
// download error it handed to the screen's card, are expected.
await finish(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|dynamically imported module|net::|The above error occurred/i.test(e)), fails, browser)
