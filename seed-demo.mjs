/**
 * Drive the real app to build a believable family, then dump what it saved.
 *
 * Hand-writing the state object would mean guessing at shapes the reducer and
 * the mappers actually own, and one wrong field boots the preview into a crash
 * boundary. Driving the real screens means whatever comes out is, by
 * construction, state the app made itself.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5174'
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  pageerror:', e.message))
const step = (s) => console.log('  ·', s)
const go = async (hash, wait = 600) => {
  await page.evaluate((h) => { window.location.hash = h }, hash)
  await page.waitForTimeout(wait)
}
const unlock = async () => {
  await go('/switch', 400)
  const enter = page.getByRole('button', { name: 'Enter PIN' })
  if (!(await enter.count())) return
  await enter.click()
  await page.locator('input').first().fill('1234')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.waitForTimeout(700)
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

step('whose phone')
await page.getByRole('button', { name: /I'm a parent/ }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Continue' }).click()   // welcome
await page.waitForTimeout(500)

step('family details')
await page.locator('input[placeholder="e.g. Sam"]').fill('Sam')
await page.locator('input[placeholder="e.g. The Rivera family"]').fill('The Rivera Family')
// The PIN field is the third input; its placeholder is bullets, not text.
await page.locator('input').nth(2).fill('1234')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(700)

step('consent, which stands between the family and the first child')
if (await page.getByText('What RankUp collects about your child').count()) {
  await page.locator('input[type=checkbox]').check()
  await page.locator('input[placeholder*="Samira"]').fill('Sam Rivera')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /I agree/ }).click()
  await page.waitForTimeout(900)
}

step('first child')
await page.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Start playing' }).click()
await page.waitForTimeout(900)

// Elite, because a preview should show what the product IS, not the floor of
// it — and because Starter caps a family at one child, so the second one
// cannot exist until the plan does.
step('Elite, via the local switch the app offers when no card is connected')
await go('/parent/plan', 800)
const elite = page.getByRole('button', { name: /Switch to Elite Pass/ }).first()
if (await elite.count()) {
  await elite.click()
  await page.waitForTimeout(500)
  // A confirmation modal stands in front of it.
  const confirm = page.getByRole('button', { name: 'Switch', exact: true })
  if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(1000) }
}

step('a second child, because most families are not one child')
await go('/parent/kids')
const addKid = page.getByRole('button', { name: '+ Add' }).first()
if (await addKid.count()) {
  await addKid.click(); await page.waitForTimeout(500)
  const nameField = page.locator('input[placeholder="e.g. Ava"], input').first()
  await nameField.fill('Noah')
  await page.waitForTimeout(200)
  const save = page.getByRole('button', { name: /^(Add|Save|Create|Continue|Done)/ }).first()
  if (await save.count()) { await save.click(); await page.waitForTimeout(900) }
}

step('the kid pack for Ava')
await go('/parent/assign')
await page.getByRole('tab', { name: 'Quest packs' }).click()
await page.waitForTimeout(300)
const packBtn = page.getByRole('button', { name: /Add all 7 to/ }).first()
await packBtn.click()
await page.waitForTimeout(800)

// Chores finished and approved, so the app is not a blank scoreboard.
const asKid = async (name) => {
  await go('/switch', 400)
  const btn = page.getByRole('button', { name: new RegExp(name) }).first()
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(700) }
}

/** One whole chore: the child does it, photographs it, the parent approves. */
const doChore = async (name, { sticker = null, leaveWaiting = false } = {}) => {
  await asKid(name)
  await go('/kid/quests')
  const card = page.locator('button.card').first()
  if (!(await card.count())) return false
  await card.click()
  await page.waitForTimeout(500)

  const camera = page.getByRole('button', { name: /Take photo proof/ })
  if (await camera.count()) {
    await camera.click(); await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Take photo' }).click(); await page.waitForTimeout(700)
    await page.getByRole('button', { name: 'Use this photo' }).click(); await page.waitForTimeout(3200)
  } else {
    const done = page.getByRole('button', { name: 'Mark as done' })
    if (await done.count()) { await done.click(); await page.waitForTimeout(700) }
  }
  const send = page.getByRole('button', { name: 'Send to parent' })
  if (await send.count()) { await send.click(); await page.waitForTimeout(900) }
  if (leaveWaiting) return true

  await unlock()
  await go('/parent/approvals')
  if (sticker !== null) {
    const chip = page.locator('button.chip').nth(sticker)
    if (await chip.count()) { await chip.click(); await page.waitForTimeout(250) }
  }
  const approve = page.getByRole('button', { name: /^Approve/ }).first()
  if (await approve.count()) { await approve.click(); await page.waitForTimeout(1200) }
  // A level-up overlay can sit over the next navigation.
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)
  return true
}

for (let n = 0; n < 4; n += 1) {
  step(`Ava, chore ${n + 1}: done, photographed, approved`)
  if (!(await doChore('Ava', { sticker: n < 3 ? n : null }))) break
}

step('the teen pack for Noah')
await unlock()
await go('/parent/assign')
const kidSelect = page.locator('select').first()
if (await kidSelect.count()) {
  await kidSelect.selectOption({ label: 'Noah' }).catch(() => {})
  await page.waitForTimeout(400)
}
await page.getByRole('tab', { name: 'Quest packs' }).click()
await page.waitForTimeout(300)
const teenPack = page.getByRole('button', { name: /Add all 6 to Noah/ }).first()
if (await teenPack.count()) { await teenPack.click(); await page.waitForTimeout(800) }

for (let n = 0; n < 2; n += 1) {
  step(`Noah, chore ${n + 1}: done, photographed, approved`)
  if (!(await doChore('Noah', { sticker: n + 4 }))) break
}

step('one waiting to be reviewed, so the queue is not empty')
await doChore('Ava', { leaveWaiting: true })
await unlock()

step('rewards worth saving for')
await go('/parent/settings', 800)
for (const [name, cost] of [["Pick Friday's film", 60], ['An hour later bedtime', 90], ['Day out, you choose', 250]]) {
  const field = page.locator('input[placeholder*="Friday"]').first()
  if (!(await field.count())) break
  await field.fill(name)
  const costField = page.getByLabel('Cost').first()
  if (await costField.count()) { await costField.fill(String(cost)) }
  await page.waitForTimeout(200)
  const add = page.getByRole('button', { name: /^Add/ }).first()
  if (await add.count()) { await add.click(); await page.waitForTimeout(500) }
}

step('finish on the parent dashboard')
await unlock()

const dump = await page.evaluate(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    out[k] = localStorage.getItem(k)
  }
  return out
})

const state = JSON.parse(dump['rankup.state.v1'] || '{}')
console.log('\n  kids:', (state.kids || []).map((k) => `${k.name} xp=${k.xp} coins=${k.coins}`).join(', '))
console.log('  quests:', (state.quests || []).length,
  '| approved:', (state.submissions || []).filter((s) => s.status === 'approved').length,
  '| pending:', (state.submissions || []).filter((s) => s.status === 'pending').length)
console.log('  photo store keys:', Object.keys(JSON.parse(dump['rankup.photos.v1'] || '{}')).length)
console.log('  total localStorage bytes:', JSON.stringify(dump).length)

writeFileSync('/tmp/demo-state.json', JSON.stringify(dump))
await b.close()
