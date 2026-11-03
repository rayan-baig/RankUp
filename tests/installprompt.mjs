/**
 * "Add to Home Screen", at the right moment and only then.
 *
 * Asked on a first visit, before RankUp has done anything for a family, it is
 * noise, and a parent who says "not now" there is never asked again. So it
 * waits for the family's first accepted chore, appears once on the parent's
 * dashboard, and is never shown on a child's side. Chrome's own offer
 * (`beforeinstallprompt`) is caught as the page loads and kept for that
 * moment; an iPhone gets the two steps in words.
 *
 * Played here as a family's first chore, end to end on one phone at 390x844,
 * with Chrome's offer played by a stand-in event; then as an iPhone. The
 * rules themselves are tests/installcard.mjs.
 */
import { launch, reporter, setUpFamily, asParent, asKid, sendToParent, finish, SHOT_DIR, BASE } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const ok = (name, cond, detail = '') => (cond ? pass(name) : fail(name, detail))

/** Chrome's offer, as Chrome makes it: once, as the page loads. */
const offerInstall = (p) => p.evaluate(() => {
  window.__prompted = 0
  const e = new Event('beforeinstallprompt', { cancelable: true })
  e.prompt = () => { window.__prompted += 1; return Promise.resolve() }
  e.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(e)
  return e.defaultPrevented
})
const card = (p) => p.locator('[data-testid="install-prompt"]')
const goHome = async (p) => {
  await p.evaluate(() => { window.location.hash = '/parent' })
  await p.waitForTimeout(700)
}

console.log('\n=== Not on a first visit ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
const held = await offerInstall(page)
ok('Chrome\'s own install bar is held back for the app\'s moment', held === true)
ok('the front door does not ask', (await card(page).count()) === 0)

await setUpFamily(page)
// setUpFamily opened the page afresh; Chrome offers again on every load.
await offerInstall(page)
await asParent(page)
await goHome(page)
ok('a new family\'s dashboard does not ask either, though Chrome has offered', (await card(page).count()) === 0)

console.log('\n=== Not while a child plays ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
await sendToParent(page)
await page.evaluate(() => { window.location.hash = '/kid' })
await page.waitForTimeout(600)
ok('the child\'s home never asks', (await card(page).count()) === 0)

console.log('\n=== After the first accepted chore ===')
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: /^Accept/ }).first().click()
await page.waitForTimeout(1000)
await goHome(page)
ok('the dashboard asks, once the first chore is accepted', (await card(page).count()) === 1)
ok('with Chrome\'s own install button', (await card(page).getAttribute('data-kind')) === 'install'
  && (await card(page).getByRole('button', { name: 'Install' }).count()) === 1)
const box = await card(page).boundingBox()
ok('where it is seen, on the first screen', Boolean(box) && box.y + box.height <= 844, JSON.stringify(box))
await page.screenshot({ path: `${SHOT_DIR}/install-android.png` })

await card(page).getByRole('button', { name: 'Install' }).click()
await page.waitForTimeout(400)
ok('Install opens Chrome\'s prompt', (await page.evaluate(() => window.__prompted)) === 1)
ok('and the card goes', (await card(page).count()) === 0)

await page.reload({ waitUntil: 'networkidle' })
await offerInstall(page)
await asParent(page)
await goHome(page)
ok('it is not asked again on this phone, even when Chrome offers again', (await card(page).count()) === 0)

console.log('\n=== An iPhone ===')
{
  const state = await page.evaluate(() => localStorage.getItem('rankup.state.v1'))
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  })
  const ios = await ctx.newPage()
  ios.on('pageerror', (e) => errors.push(`pageerror (iPhone): ${e.message}`))
  await ios.goto(BASE, { waitUntil: 'domcontentloaded' })
  await ios.evaluate((s) => { localStorage.clear(); localStorage.setItem('rankup.state.v1', s) }, state)
  await ios.reload({ waitUntil: 'networkidle' })
  await asParent(ios)
  await goHome(ios)
  ok('an iPhone is shown the steps, as there is no button to give it', (await card(ios).getAttribute('data-kind')) === 'ios')
  const words = (await card(ios).innerText()).replace(/\s+/g, ' ')
  ok('Share, then Add to Home Screen', /Tap Share/.test(words) && /Tap Add to Home Screen/.test(words), words)
  await ios.screenshot({ path: `${SHOT_DIR}/install-iphone.png` })
  await card(ios).getByRole('button', { name: 'Got it' }).click()
  await ios.waitForTimeout(300)
  ok('"Got it" puts it away', (await card(ios).count()) === 0)
  await ios.reload({ waitUntil: 'networkidle' })
  await asParent(ios)
  await goHome(ios)
  ok('and it stays away', (await card(ios).count()) === 0)

  // Opened from the home screen already: nothing to ask.
  await ios.evaluate(() => localStorage.removeItem('rankup.install.dismissed.v1'))
  await ios.addInitScript(() => { Object.defineProperty(window.navigator, 'standalone', { get: () => true }) })
  await ios.reload({ waitUntil: 'networkidle' })
  await asParent(ios)
  await goHome(ios)
  ok('an iPhone already running it from the home screen is not asked', (await card(ios).count()) === 0)
  await ctx.close()
}

console.log('\n=== A child\'s own phone ===')
{
  // The same family, as a paired child's phone would hold it.
  const state = JSON.parse(await page.evaluate(() => localStorage.getItem('rankup.state.v1')))
  const kidId = state.kids[0].id
  state.device = { ...state.device, role: 'kid', linkedKidId: kidId, pairedAt: new Date().toISOString() }
  state.session = { role: 'kid', kidId, parentUnlocked: false }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const kidPhone = await ctx.newPage()
  await kidPhone.goto(BASE, { waitUntil: 'domcontentloaded' })
  await kidPhone.evaluate((s) => { localStorage.clear(); localStorage.setItem('rankup.state.v1', s) }, JSON.stringify(state))
  await kidPhone.reload({ waitUntil: 'networkidle' })
  await offerInstall(kidPhone)
  await kidPhone.waitForTimeout(800)
  ok('a child\'s phone never asks, whatever Chrome offers', (await card(kidPhone).count()) === 0)
  await ctx.close()
}

finish(errors, fails, browser)
