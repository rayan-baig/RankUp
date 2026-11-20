/**
 * The fixes from the product review (0.22.0), in a real browser.
 *
 *   - the front door's small print, the public legal pages with no "not
 *     finished" banner and a way back for a visitor, the line on sign-up;
 *   - no spending pressure on a child's screens: no rarity labels, no market
 *     hours, no real-money price, no "Elite Pass only", and the daily bonus
 *     only for a chore done;
 *   - Block Craft's background with no bright stripe across the middle;
 *   - plain names on the plan screens and "Pause and limits";
 *   - the demo's words, its Rewards and League buttons, the plan cards side
 *     by side on a computer, Settings in groups, the PIN hidden, the money
 *     sign in US dollars;
 *   - and a child's phone linked with a code the parent made for that child,
 *     typing nothing else, in the parent's world, with no second profile.
 */
import { chromium } from 'playwright'
import { launch, finish, BASE, SHOT_DIR, setUpFamily, setPlanInDatabase } from './helpers.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails.push(label) }
}

const { browser, page, errors } = await launch()
const text = () => page.evaluate(() => document.body.innerText)
const hash = () => page.evaluate(() => location.hash)
const go = async (route, wait = 900) => {
  await page.evaluate((r) => { window.location.hash = r }, route)
  await page.waitForTimeout(wait)
}

console.log('\n=== The front door and the legal pages ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const footer = page.getByTestId('front-footer')
ok('the front door has Privacy, Terms and Contact at the foot',
  (await footer.count()) === 1 && /Privacy[\s\S]*Terms[\s\S]*Contact/.test(await footer.innerText()))
ok('Contact writes to the company address',
  (await footer.getByRole('link', { name: 'Contact' }).getAttribute('href')) === 'mailto:help@mtrxhorizyn.com')
await footer.getByRole('link', { name: 'Privacy' }).click()
await page.waitForTimeout(900)
let legal = await text()
ok('the privacy policy opens with no account', /Privacy Policy/.test(legal))
ok('with no "Not finished" banner on the public page', !/Not finished|Still to fill in/.test(legal))
ok('and no placeholder anywhere', !/\[YOUR|POSTAL ADDRESS\]/.test(legal))
ok('it says how to reach the company', /help@mtrxhorizyn\.com/.test(legal))
await page.screenshot({ path: `${SHOT_DIR}/review-legal.png` })
await page.getByTestId('legal-back').click()
await page.waitForTimeout(700)
ok('"Back" takes a visitor to the front door, not to Settings', /#\/welcome/.test(await hash()), await hash())
await go('/legal/terms')
legal = await text()
ok('the terms say how to reach the company too', /Terms of Use/.test(legal) && /help@mtrxhorizyn\.com/.test(legal))

console.log('\n=== Sign-up says what you agree to ===')
await go('/welcome', 500)
await page.getByRole('button', { name: /I'm a parent/ }).click()
await page.waitForTimeout(600)
const agree = page.getByTestId('agree-line')
ok('"By creating an account you agree to the Terms and the Privacy Policy"',
  (await agree.count()) === 1 && /By creating an account you agree/.test(await agree.innerText()))
ok('both linked', (await agree.getByRole('link').count()) === 2)

console.log('\n=== The demo: a child\'s screens ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /See it live/ }).click()
await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 8000 })
const bar = page.getByTestId('demo-banner')
const asAva = async () => { await bar.getByRole('button', { name: /Ava/ }).click(); await page.waitForTimeout(700) }
await asAva()
await go('/kid/market')
const market = await text()
await page.screenshot({ path: `${SHOT_DIR}/review-market.png`, fullPage: true })
ok('the market has no rarity labels', !/\b(Common|Rare|Legendary)\b/.test(market), market.match(/\b(Common|Rare|Legendary)\b/)?.[0])
ok('no opening hours and nothing about being shut', !/shut|Opens|Sunday|8pm|tonight/i.test(market))
ok('no real-money price', !/[$£€]\s?\d/.test(market))
ok('and every skin can be bought now, with what she has earned', (await page.getByRole('button', { name: /more Gems|Buy for/ }).count()) >= 6)
await go('/kid/shop')
ok('the Rewards screen shows no market countdown box', !/SUNDAY|Right now|8pm/.test(await text()))

await go('/kid')
const home = await text()
ok('no "login bonus" for opening the app', !/login bonus|just for showing up/i.test(home))
ok('and no market card on the home screen', !/Market is open/i.test(home))
const milestone = await page.getByTestId('next-milestone').innerText().catch(() => '')
ok('one next goal on the home card, the nearer one', /^(Next form at level \d+|🔒 Secret world at level \d+|🔒 Beat the dragon)/.test(milestone), milestone)

console.log('\n=== Block Craft: no stripe across the middle ===')
{
  // The background alone, with every card hidden, at the old stripe's height.
  await page.addStyleTag({ content: '.shell, nav, [data-testid=demo-banner] { visibility: hidden !important }' })
  await page.waitForTimeout(300)
  const shot = await page.screenshot()
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (s.textContent.includes('visibility: hidden !important')) s.remove() }))
  const rows = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const lum = (y) => {
      const d = g.getImageData(0, Math.round(y), img.width, 1).data
      let t = 0
      for (let i = 0; i < d.length; i += 4) t += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      return t / (d.length / 4)
    }
    const h = img.height
    return { stripe: lum(h * 0.47), above: lum(h * 0.40), below: lum(h * 0.55) }
  }, shot.toString('base64'))
  ok('the band at 46-48% is no brighter than the sky around it',
    rows.stripe < Math.max(rows.above, rows.below) + 12, JSON.stringify(rows))
}

console.log('\n=== The parent\'s side of the demo ===')
await bar.getByRole('button', { name: /Parent/ }).click()
await page.waitForTimeout(800)
await go('/parent')
const tour = page.getByTestId('demo-more')
await tour.getByRole('button', { name: /Rewards/ }).click()
await page.waitForTimeout(700)
ok('"Rewards" opens the parent\'s rewards, in Settings', /#\/parent\/settings/.test(await hash()), await hash())
ok('with the rewards open', /Add reward/.test(await text()))
await go('/parent')
await tour.getByRole('button', { name: /League/ }).click()
await page.waitForTimeout(700)
ok('"League" opens the parent\'s leaderboards', /#\/parent\/leaderboards/.test(await hash()), await hash())

await go('/parent/settings')
const settings = await text()
ok('Settings is in six groups', (await page.locator('[data-testid^=settings-group-]').count()) === 6)
await page.getByRole('button', { name: /Parent account/ }).click()
await page.waitForTimeout(300)
ok('the PIN box hides the digits', (await page.getByTestId('settings-pin').getAttribute('type')) === 'password')
ok('pocket money is in US dollars unless chosen', (await page.getByTestId('settings-currency').inputValue()) === 'USD')
await page.getByRole('button', { name: /Flash Tickets/ }).click()
await page.waitForTimeout(300)
const flash = await text()
ok('no developer words in the demo', !/Stripe is not configured|Add \(test\)|Payments are switched off/.test(flash + settings))
ok('and Flash Tickets do not undercut saving up', /saving up is how they get one/.test(flash) && !/did not save quite enough/.test(flash))
await page.screenshot({ path: `${SHOT_DIR}/review-settings.png`, fullPage: true })

await go('/parent/plan')
const plan = await text()
ok('the plan screen says plainly the demo charges nothing', /Nothing is charged in the demo/.test(plan) && !/Payments are switched off/.test(plan))
ok('no "Consequence Engine", "Currency Tax", "Lockdown" or "Discount Tournament"',
  !/Consequence Engine|System Override|Currency Tax|Lockdown|Discount Tournament/.test(plan))
await go('/parent/override')
const pause = await text()
ok('"Pause and limits", in plain words', /Pause and limits/.test(pause) && !/Override Protocol|Tax|Lockdown|Lockout/.test(pause))

console.log('\n=== The plan cards side by side on a computer ===')
{
  const wide = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const p = await wide.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /See it live/ }).click()
  await p.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 8000 })
  await p.evaluate(() => { window.location.hash = '/parent/plan' })
  await p.waitForTimeout(1000)
  const boxes = await p.locator('[data-testid=plan-cards] > *').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y } }))
  ok('three cards on one row', boxes.length === 3 && new Set(boxes.map((b) => Math.round(b.y))).size === 1 && boxes[2].x > boxes[0].x, JSON.stringify(boxes))
  await p.screenshot({ path: `${SHOT_DIR}/review-plan-desktop.png` })
  await wide.close()
}

console.log('\n=== Linking a child\'s phone with a code the parent made ===')
{
  // A real family, on the real backend: the parent adds Ava in Block Craft,
  // makes a code for her, and the child's phone types only the code.
  const real = await launch()
  const parent = real.page
  await setUpFamily(parent)
  const familyName = await parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).family.name)
  await setPlanInDatabase(familyName)
  const ava = await parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).kids.find((k) => k.name === 'Ava'))
  await parent.evaluate(() => { window.location.hash = '/parent/pair' })
  await parent.waitForTimeout(900)
  await parent.getByTestId('make-code-Ava').click()
  await parent.getByTestId('made-code').waitFor({ timeout: 8000 })
  const code = (await parent.getByTestId('made-code').innerText()).match(/(\d{3}) (\d{3})/)?.slice(1).join('')
  ok('the parent is shown six digits for Ava', /^\d{6}$/.test(code || ''), code)
  await parent.screenshot({ path: `${SHOT_DIR}/review-pair-parent.png` })

  const kidBrowser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const kid = await (await kidBrowser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await kid.goto(BASE, { waitUntil: 'networkidle' })
  await kid.getByRole('button', { name: /I'm a kid/ }).click()
  await kid.waitForTimeout(400)
  ok('the child\'s phone asks only for the code', (await kid.locator('input[placeholder="e.g. Ava"]').count()) === 0
    && /Type your code/.test(await kid.evaluate(() => document.body.innerText)))
  await kid.locator('input[inputmode=numeric]').fill('000000' === code ? '111111' : '000000')
  await kid.waitForTimeout(1500)
  ok('a wrong code is refused, in a child\'s words', /don't match/.test(await kid.getByTestId('kid-code-error').innerText().catch(() => '')))
  await kid.locator('input[inputmode=numeric]').fill(code)
  await kid.waitForFunction(() => location.hash.startsWith('#/kid'), null, { timeout: 10000 }).catch(() => {})
  await kid.waitForTimeout(2500)
  const kidState = await kid.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))
  ok('the phone is Ava\'s, the same profile the parent made', kidState?.device?.linkedKidId === ava.id, JSON.stringify(kidState?.device))
  ok('in the world the parent chose', kidState?.kids?.find((k) => k.id === ava.id)?.themeId === ava.themeId,
    `${kidState?.kids?.[0]?.themeId} vs ${ava.themeId}`)
  await kid.screenshot({ path: `${SHOT_DIR}/review-pair-kid.png` })
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await parent.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    // eslint-disable-next-line no-await-in-loop
    await parent.waitForTimeout(700)
    // eslint-disable-next-line no-await-in-loop
    if (/is linked/.test(await parent.evaluate(() => document.body.innerText))) break
  }
  ok('the parent\'s phone says Ava is linked', /Ava is linked/.test(await parent.evaluate(() => document.body.innerText)))
  const kids = (await parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).kids)).filter((k) => k.name === 'Ava')
  ok('and there is still one Ava', kids.length === 1, String(kids.length))
  errors.push(...real.errors)
  await kidBrowser.close()
  await real.browser.close()
}

await finish(errors, fails, browser)
