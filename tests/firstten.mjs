/**
 * A new family's first ten minutes, on a fresh phone-sized window.
 *
 * One parent, one phone, from the front door to the first chore accepted,
 * counting every tap and every box typed in. It was 28 (two of them typing a
 * URL, because Parent Mode had no way out to the child's side); it is 24. The
 * ceiling below is the number now, so a step that creeps back in fails here
 * rather than being noticed by the next family.
 *
 * On the way it checks the three things a new family meets on the dashboard
 * and on the child's home:
 *   - "How RankUp works": shown, in the way of nothing, gone on "Got it" and
 *     still gone after a reload;
 *   - the first-week checklist: ticks itself from what really happened
 *     (adding a child, three chores, an accepted one, a phone paired from a
 *     second browser) and disappears once all four are done;
 *   - the child's home says what to do next, above the fold, in one button.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'

const MAX_STEPS = 24

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
const track = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`${tag}: ${m.text()}`)
  })
}
track(page, 'parent')

let steps = 0
const tap = async (locator, wait = 500) => { await locator.click(); steps += 1; await page.waitForTimeout(wait) }
const type = async (locator, value) => { await locator.fill(value); steps += 1 }
const hash = () => page.evaluate(() => location.hash)
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))
const checklist = () => page.evaluate(() => {
  const card = document.querySelector('[data-testid="first-week"]')
  if (!card) return null
  return Object.fromEntries([...card.querySelectorAll('[data-step]')].map((li) => [li.dataset.step, li.dataset.done === 'true']))
})
/** Is the element wholly inside the first screenful? */
const aboveFold = (selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.top >= 0 && r.bottom <= innerHeight
}, selector)

console.log('\n=== Front door to the dashboard ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await tap(page.getByRole('button', { name: /I'm a parent/ }), 400)
await type(page.locator('input[type=email]'), `first${Date.now()}@example.com`)
await type(page.locator('input[type=password]'), 'correct-horse-battery')
await tap(page.getByRole('button', { name: 'Create account' }), 1600)

const familyScreen = await page.evaluate(() => document.body.innerText)
;/Your family/.test(familyScreen) && /Step 1 of 2/.test(familyScreen)
  ? pass('signing up goes straight to the family, in two steps not four')
  : fail('no repeated welcome screen', familyScreen.slice(0, 160))

await type(page.locator('input').nth(0), 'Sam')
await type(page.locator('input').nth(2), '1234')
await tap(page.getByRole('button', { name: 'Continue' }), 1200)
await tap(page.locator('input[type=checkbox]'), 100)
await type(page.locator('input[placeholder*="Samira"]'), 'Sam Rivera')
await tap(page.getByRole('button', { name: /I agree/ }), 1500)

const kidScreen = await page.evaluate(() => document.body.innerText)
;/Add your first kid/.test(kidScreen) && /picks a world/.test(kidScreen)
  ? pass('the child\'s name and their world are one screen')
  : fail('kid and theme on one screen', kidScreen.slice(0, 160))
await type(page.locator('input[placeholder="e.g. Ava"]'), 'Ava')
await tap(page.getByRole('button', { name: 'Start playing' }), 1500)

;(await hash()) === '#/parent'
  ? pass('setup ends on the parent dashboard')
  : fail('lands on the dashboard', await hash())
await page.screenshot({ path: `${SHOT_DIR}/firstten-dashboard.png` })

console.log('\n=== How it works, and the first week ===')
;(await page.getByTestId('how-it-works').count()) === 1
  ? pass('a new parent is shown how RankUp works')
  : fail('how it works shown', 'not on the dashboard')
const cards = await page.getByTestId('how-it-works').locator('li').count()
cards === 3 ? pass('in three cards') : fail('three cards', String(cards))

let list = await checklist()
list && list.kid && !list.pair && !list.assign && !list.accept
  ? pass('the first-week list starts with the child ticked and the rest to do')
  : fail('checklist starts from real state', JSON.stringify(list))

// Straight from the list: "Assign 3 chores" opens the packs, ready to add.
await tap(page.locator('[data-step="assign"] button'), 700)
;(await hash()).startsWith('#/parent/assign')
  ? pass('"Assign 3 chores" opens the assign screen')
  : fail('checklist links to assign', await hash())
;(await page.getByRole('tab', { name: 'Quest packs', selected: true }).count()) === 1
  ? pass('which opens on the ready-made packs for a family with no chores')
  : fail('assign opens on packs', 'opened on the form')
await tap(page.getByRole('button', { name: /Add all 7 to Ava/ }), 600)

await tap(page.getByRole('button', { name: 'Home', exact: true }), 700)
list = await checklist()
list?.assign ? pass('three chores assigned ticks itself') : fail('assign ticks', JSON.stringify(list))

console.log('\n=== "How it works" is shown once ===')
// Still there after a pack was added: it was in the way of nothing. Closing it
// is not a step of the walk, since nothing needs it closed.
;(await page.getByTestId('how-it-works').count()) === 1
  ? pass('it stays put while the parent gets on with it')
  : fail('how it works still shown', 'gone before Got it')
await page.getByTestId('how-it-works').getByRole('button', { name: 'Got it' }).click()
await page.waitForTimeout(400)
;(await page.getByTestId('how-it-works').count()) === 0
  ? pass('"Got it" closes it')
  : fail('how it works dismissible', 'still shown')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
if (!(await hash()).startsWith('#/parent')) {
  await page.getByLabel('Parent PIN').fill('1234')
  await page.waitForTimeout(800)
}
!(await store()).submissions.some((s) => s.status === 'approved') && (await page.getByTestId('how-it-works').count()) === 0
  ? pass('and it stays closed after a reload, before any chore is accepted')
  : fail('how it works remembered', 'came back')

console.log('\n=== Handing the phone to the child ===')
await tap(page.getByRole('button', { name: /Hand to Ava/ }), 900)
;(await hash()) === '#/kid'
  ? pass('one tap hands the phone to Ava, out of Parent Mode')
  : fail('hand to Ava', await hash())
!(await store()).session.parentUnlocked
  ? pass('and Parent Mode is locked behind her')
  : fail('parent mode locked on hand-over', 'still unlocked')

await page.screenshot({ path: `${SHOT_DIR}/firstten-kidhome.png` })
const nextText = await page.getByTestId('next-up').innerText().catch(() => '')
;/Make your bed/.test(nextText) && /Start this quest/.test(nextText)
  ? pass('her home says what to do next: the first quest, and one button')
  : fail('kid home next step', nextText)
;(await aboveFold('[data-testid="next-up"]'))
  ? pass('above the fold on a phone')
  : fail('next step above the fold', 'below it')

await tap(page.getByRole('button', { name: 'Start this quest' }), 600)
;(await hash()).startsWith('#/kid/quest/')
  ? pass('"Start this quest" opens it')
  : fail('start opens the quest', await hash())
await tap(page.getByRole('button', { name: /I did it/ }), 500)
await tap(page.getByRole('button', { name: 'Send to parent' }), 800)

console.log('\n=== Back to the parent, and accepting ===')
await tap(page.getByRole('button', { name: 'You', exact: true }), 700)
await tap(page.getByRole('button', { name: 'Switch profile' }), 600)
await type(page.getByLabel('Parent PIN'), '1234')
await page.waitForTimeout(800)
;(await hash()) === '#/parent'
  ? pass('the right PIN opens Parent Mode with no extra tap')
  : fail('pin auto-unlocks', await hash())
await tap(page.getByRole('button', { name: 'Review' }).first(), 700)
await tap(page.getByRole('button', { name: /^Accept/ }).first(), 1500)

const after = await store()
const approved = after.submissions.filter((s) => s.status === 'approved')
approved.length === 1 && after.kids[0].xp > 0
  ? pass(`the first chore is accepted and Ava has ${after.kids[0].xp} XP`)
  : fail('first chore accepted', JSON.stringify({ approved: approved.length, xp: after.kids[0].xp }))

console.log(`\n  ${steps} taps and boxes from the front door to the first accepted chore (was 28)`)
steps <= MAX_STEPS
  ? pass(`at most ${MAX_STEPS} steps`)
  : fail(`at most ${MAX_STEPS} steps`, String(steps))

await page.evaluate(() => { location.hash = '/parent' })
await page.waitForTimeout(700)
list = await checklist()
list?.accept && !list.pair
  ? pass('an accepted chore ticks itself; the phone is still to pair')
  : fail('accept ticks', JSON.stringify(list))

console.log('\n=== Pairing a phone finishes the list ===')
const kid = await ctx.newPage()
track(kid, 'kid')
await kid.goto(`${BASE}?device=kid`, { waitUntil: 'networkidle' })
await kid.waitForTimeout(500)
await kid.getByRole('button', { name: /I'm a kid/ }).click()
await kid.waitForTimeout(300)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name: 'Continue' }).click()
await kid.waitForTimeout(300)
await kid.getByRole('button', { name: 'Get my code' }).click()
await kid.waitForTimeout(1500)
const code = await kid.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid'))?.pendingPairing?.code)

await page.locator('[data-step="pair"] button').click()
await page.waitForTimeout(700)
;(await hash()) === '#/parent/pair'
  ? pass('"Pair a phone" opens the linking screen')
  : fail('checklist links to pairing', await hash())
await page.locator('input[inputmode=numeric]').fill(code || '')
await page.waitForTimeout(2500)
await kid.waitForTimeout(4000)

await page.evaluate(() => { location.hash = '/parent' })
await page.waitForTimeout(800)
;(await page.getByTestId('first-week').count()) === 0
  ? pass('with all four done, the list is gone')
  : fail('checklist disappears when done', JSON.stringify(await checklist()))

console.log('\n=== The child\'s own phone ===')
;(await kid.evaluate(() => location.hash)) === '#/kid'
  ? pass('the paired phone opens on Ava\'s home')
  : fail('kid phone home', await kid.evaluate(() => location.hash))
await kid.waitForTimeout(2000)
await kid.screenshot({ path: `${SHOT_DIR}/firstten-kidphone.png` })
const kidNext = await kid.getByTestId('next-up').innerText().catch(() => '')
const kidAbove = await kid.evaluate(() => {
  const r = document.querySelector('[data-testid="next-up"]')?.getBoundingClientRect()
  return Boolean(r) && r.top >= 0 && r.bottom <= innerHeight
})
;/Start this quest/.test(kidNext) && kidAbove
  ? pass(`a fresh phone says what to do next, above the fold (${kidNext.split('\n').filter(Boolean)[1]})`)
  : fail('fresh kid phone next step', `${kidAbove} ${kidNext}`)

await finish(errors, fails, browser)
