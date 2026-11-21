/**
 * The fixes from the strict re-review (0.25.0), in a real browser.
 * tests/fixes25.mjs holds the rules in plain Node.
 *
 * In the look-around (no network needed):
 *   - "Do this next" on Ava's Home pays what her quest card and the quest's
 *     own page say: the Elite boost included, not the bare XP;
 *   - the theme picker shows a picture on every world's card, fifteen
 *     different ones, Block Craft's the owner's own level-1 picture;
 *   - every arcade tile has its own picture, and no game is badged NEW;
 *   - a dark world's header shows its skyline, a light world's none;
 *   - "Sent!" for a moment after Send to parent;
 *   - no "?device=kid" developer note; an Elite family's Plans say "Move to
 *     Starter", never "Stay on Starter", and the arcade's winnings in the
 *     children's own word.
 *
 * In a new family (the stand-in API):
 *   - the PIN is stored as a salted hash only; a plain PIN saved by an
 *     older version is moved over and still opens Parent Mode;
 *   - five wrong PINs and the box waits a minute, says so calmly, keeps
 *     waiting after a reload, and waits two minutes the next time;
 *   - Settings changes the PIN with a button, and the new one works.
 */
import { launch, finish, BASE, SHOT_DIR, setUpFamily, readState } from './helpers.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails.push(label) }
}

const { browser, page, errors } = await launch()
const text = () => page.evaluate(() => document.body.innerText)
const go = async (route, wait = 900) => {
  await page.evaluate((r) => { window.location.hash = r }, route)
  await page.waitForTimeout(wait)
}

console.log('\n=== The look-around: one pay, everywhere ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /See it live/ }).click()
await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
const bar = page.getByTestId('demo-banner')
const asAva = async () => { await bar.getByRole('button', { name: /Ava/ }).click(); await page.waitForTimeout(700) }
const asParent = async () => { await bar.getByRole('button', { name: /Parent/ }).click(); await page.waitForTimeout(700) }
await asAva()
await go('/kid')
const nextUp = page.getByTestId('next-up')
const nextText = await nextUp.innerText()
const title = await nextUp.locator('.font-display').first().innerText()
const m = nextText.match(/\+(\d+) XP · \S+ \+(\d+)/)
ok('"Do this next" shows a quest and its pay', Boolean(m && title), nextText)
await page.screenshot({ path: `${SHOT_DIR}/fixes25-next-up.png` })
await go('/kid/quests')
const questCard = page.locator('button.card', { hasText: title }).first()
const cardXp = (await questCard.getByTestId('quest-xp').innerText()).match(/\+(\d+) XP/)?.[1]
const cardCoins = (await questCard.innerText()).match(/\S \+(\d+)\n/)?.[1]
ok(`the quest card for "${title}" says the same XP (+${cardXp})`, m && cardXp === m[1], `home +${m?.[1]}, card +${cardXp}`)
ok(`and the same coins (+${cardCoins})`, m && cardCoins === m[2], `home +${m?.[2]}, card +${cardCoins}`)
await questCard.click()
await page.waitForTimeout(800)
const detailText = await text()
const total = detailText.match(/(\d+) XP · \S+ (\d+)/)
ok('and so does the quest\'s own page', total && m && total[1] === m[1] && total[2] === m[2], total?.[0])
ok('which is the Elite-boosted pay, not the base 30 XP', m && Number(m[1]) > 30, m?.[0])

console.log('\n=== "Sent!" after Send to parent ===')
await page.getByRole('button', { name: /I did it/ }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Send to parent' }).click()
await page.waitForTimeout(300)
const sent = page.getByTestId('sent-moment')
ok('a "Sent!" card shows on the quest list', (await sent.count()) === 1 && /Sent!/.test(await sent.innerText()) && /#\/kid\/quests/.test(await page.evaluate(() => location.hash)))
ok('naming the chore and what happens next', new RegExp(`“${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}” is with your parent`).test(await sent.innerText()), await sent.innerText())
await page.screenshot({ path: `${SHOT_DIR}/fixes25-sent.png` })
await page.waitForTimeout(2600)
ok('and goes by itself a moment later', (await sent.count()) === 0)

console.log('\n=== Every arcade game has its own tile, and nothing is NEW ===')
await go('/kid/arcade', 1200)
const tileSrcs = await page.$$eval('button[aria-label] img[aria-hidden="true"]', (imgs) => imgs.map((i) => i.getAttribute('src')).filter((s) => /game-/.test(s)))
ok(`21 tiles with pictures (${tileSrcs.length})`, tileSrcs.length === 21)
ok('each its own picture', new Set(tileSrcs).size === tileSrcs.length)
ok('no game badged NEW: none is new to the arcade', (await page.getByTestId('game-new').count()) === 0)
await page.screenshot({ path: `${SHOT_DIR}/fixes25-arcade.png`, fullPage: true })

console.log('\n=== Headers follow the world ===')
await go('/kid/quests')
ok('Block Craft (a dark world): the skyline, drawn in the world\'s colours', (await page.getByTestId('hero-city').count()) === 1)

console.log('\n=== A picture on every world\'s card ===')
await go('/kid/profile')
await page.getByRole('button', { name: /Ask a parent to change the theme/ }).click()
await page.waitForTimeout(300)
await page.getByLabel('Parent PIN for the theme').fill('1234')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForTimeout(800)
const cards = page.locator('button[aria-pressed]')
const cardInfo = await cards.evaluateAll((els) => els.map((el) => ({ name: el.querySelector('.font-display')?.textContent || '', src: el.querySelector('img')?.getAttribute('src') || '' })))
const worlds = cardInfo.filter((c) => c.src)
ok(`all 15 world cards have a picture (${worlds.length})`, cardInfo.length >= 15 && worlds.length >= 15, JSON.stringify(cardInfo.filter((c) => !c.src).map((c) => c.name)))
ok('fifteen different pictures', new Set(worlds.map((c) => c.src)).size >= 15)
ok('Block Craft\'s card is the owner\'s own level-1 picture', /avatar-blockcraft-1[-.]/.test(cardInfo.find((c) => c.name === 'Block Craft')?.src || ''))
ok('Pegasus Horizon\'s is the drawn winged horse', /avatar-pegasus/.test(cardInfo.find((c) => c.name === 'Pegasus Horizon')?.src || ''))
await page.locator('button[aria-pressed]', { hasText: 'Pegasus Horizon' }).scrollIntoViewIfNeeded()
await page.screenshot({ path: `${SHOT_DIR}/fixes25-picker.png` })
await page.locator('button[aria-pressed]', { hasText: 'Pegasus Horizon' }).click()
await page.getByRole('button', { name: 'Save theme' }).click()
await page.waitForTimeout(900)
const avatarSrc = await page.locator('.fx-avatar image').first().getAttribute('href').catch(() => '')
ok('on Pegasus Horizon, the avatar is the drawn winged horse', /avatar-pegasus/.test(avatarSrc || ''), avatarSrc)
await go('/kid/quests')
ok('Pegasus Horizon (a light world): no night skyline in the header', (await page.getByTestId('hero-city').count()) === 0)
await page.screenshot({ path: `${SHOT_DIR}/fixes25-light-header.png` })

console.log('\n=== Parent side of the look-around ===')
await asParent()
await go('/parent/pair')
ok('no "?device=kid" developer note in the demo', !/device=kid|Testing on one computer/.test(await text()))
await go('/parent/plan', 1200)
const plan = await text()
ok('an Elite family is never told "Stay on Starter"', !/Stay on/.test(plan))
ok('Starter\'s button says "Move to Starter · free"', (await page.getByTestId('plan-button-starter').innerText()).includes('Move to Starter · free'))
ok('the arcade\'s winnings in the children\'s word, never "coins"', /up to 15 (Gems|Star Shards)( or (Gems|Star Shards))? a day/.test(plan) && !/coins a day/.test(plan))
await page.screenshot({ path: `${SHOT_DIR}/fixes25-plan.png`, fullPage: true })

console.log('\n=== A new family: the PIN is a hash ===')
await page.evaluate(() => localStorage.clear())
await setUpFamily(page)
let s = await readState(page)
const raw = await page.evaluate(() => localStorage.getItem('rankup.state.v1'))
ok('the family keeps a salted hash of the PIN', /^v1\$\d+\$4\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(s.family.pinHash || ''), s.family.pinHash)
ok('and never the PIN: no "pin" anywhere in what this phone stores', !('pin' in s.family) && !/"pin":/.test(raw))

const lockParent = async (patch = {}) => {
  await page.evaluate((p) => {
    const st = JSON.parse(localStorage.getItem('rankup.state.v1'))
    st.session = { ...st.session, parentUnlocked: false }
    st.family = { ...st.family, ...p.family }
    if (p.dropHash) delete st.family.pinHash
    localStorage.setItem('rankup.state.v1', JSON.stringify(st))
  }, patch)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await go('/switch', 500)
}
const pinBox = () => page.getByLabel('Parent PIN', { exact: true })
const hash = () => page.evaluate(() => location.hash)

console.log('\n=== A plain PIN from an older version is moved over ===')
await lockParent({ family: { pin: '4321' }, dropHash: true })
s = await readState(page)
ok('as the app opens: the hash kept, the plain PIN gone', !('pin' in s.family) && /^v1\$/.test(s.family.pinHash || ''), JSON.stringify(s.family).slice(0, 160))
await pinBox().fill('4321')
await page.waitForTimeout(700)
ok('and the old PIN still opens Parent Mode', (await hash()).startsWith('#/parent'), await hash())

console.log('\n=== Five wrong PINs, and a calm wait ===')
await lockParent()
for (const wrong of ['1111', '2222', '3333', '4444']) { await pinBox().fill(wrong); await page.waitForTimeout(250) }
ok('four wrong PINs: "not right", and the box still takes another', /That PIN is not right/.test(await text()) && await pinBox().isEnabled())
await pinBox().fill('5555')
await page.waitForTimeout(400)
const wait = page.getByTestId('pin-wait')
ok('the fifth: "Take a breather and try again in 1 minute."', (await wait.count()) === 1 && /Too many wrong PINs\. Take a breather and try again in 1 minute\./.test(await wait.innerText()), await wait.innerText().catch(() => ''))
ok('and the box takes nothing while it waits', await pinBox().isDisabled() && await page.getByRole('button', { name: 'Unlock' }).isDisabled())
await page.screenshot({ path: `${SHOT_DIR}/fixes25-pin-wait.png` })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await go('/switch', 500)
ok('a reload does not start the count again', await pinBox().isDisabled() && /try again in 1 minute/.test(await text()), (await text()).slice(0, 200))
const fastForward = () => page.evaluate(() => {
  const t = JSON.parse(localStorage.getItem('rankup.pinlock.v1'))
  localStorage.setItem('rankup.pinlock.v1', JSON.stringify({ ...t, until: Date.now() - 1000 }))
})
await fastForward()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await go('/switch', 500)
ok('once the minute is up, the box is open again', await pinBox().isEnabled())
for (const wrong of ['1111', '2222', '3333', '4444', '5555']) { await pinBox().fill(wrong); await page.waitForTimeout(250) }
ok('five more wrong: the wait doubles to 2 minutes', /try again in 2 minutes/.test(await text()), (await text()).slice(0, 300))
await fastForward()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await go('/switch', 500)
await pinBox().fill('4321')
await page.waitForTimeout(700)
ok('then the right PIN opens Parent Mode', (await hash()).startsWith('#/parent'), await hash())
ok('and the count starts again', await page.evaluate(() => localStorage.getItem('rankup.pinlock.v1')) === null)

console.log('\n=== Settings: a new PIN, saved with a button ===')
await go('/parent/settings')
await page.getByRole('button', { name: /Parent account/ }).click()
await page.waitForTimeout(300)
const box = page.getByTestId('settings-pin')
ok('the box starts empty (there is no PIN to show, only its hash)', (await box.inputValue()) === '' && (await box.getAttribute('type')) === 'password')
await box.fill('24')
ok('a PIN under 4 digits cannot be saved', await page.getByTestId('settings-pin-save').isDisabled())
const before = (await readState(page)).family.pinHash
await box.fill('2468')
await page.getByTestId('settings-pin-save').click()
await page.waitForTimeout(500)
s = await readState(page)
ok('"New PIN saved.": a new hash, still no PIN', /New PIN saved/.test(await text()) && s.family.pinHash !== before && !('pin' in s.family))
await lockParent()
await pinBox().fill('4321')
await page.waitForTimeout(500)
ok('the old PIN no longer opens it', (await hash()).startsWith('#/switch'))
await pinBox().fill('2468')
await page.waitForTimeout(700)
ok('the new one does', (await hash()).startsWith('#/parent'), await hash())

await finish(errors, fails, browser)
