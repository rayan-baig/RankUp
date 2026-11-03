/**
 * Two grown-ups in one family, driven as two real devices.
 *
 * The thing worth proving end to end is not the invite code — the SQL suite
 * already hammers that — but the join: that a second parent who types a code
 * ends up looking at the SAME children and the SAME waiting chore, rather than
 * at an empty family of their own. That failure mode is silent, it is what
 * separated households would actually hit, and nothing but a real second
 * browser catches it.
 *
 * Needs the local backend running; see supabase/test/README.md.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { reducer } from '../src/state/reducer.js'
import { createInitialState } from '../src/state/initialState.js'

const { fails, pass, fail } = reporter()

/*
 * The reducer first, directly, because the browser cannot check this one.
 *
 * The app saves its state on a 250ms debounce, so by the time localStorage
 * shows anything the first sync snapshot has already merged — and a snapshot
 * only ever contains the caller's own family, which sets family.id correctly
 * whatever the join did with it. Deleting the line that sets it did not fail
 * the browser test. It fails this one.
 */
console.log('\n=== The join itself ===')
{
  const fresh = createInitialState()
  const after = reducer(fresh, {
    type: 'JOIN_FAMILY',
    familyId: 'f0000000-0000-0000-0000-00000000beef',
    familyName: 'The Two-House Family',
    parentName: 'Alex',
    pin: '5678',
  })
  after.family.id === 'f0000000-0000-0000-0000-00000000beef'
    ? pass('joining points the app at the family that was joined')
    : fail('join sets the family id', after.family.id)
  after.onboarded === true
    ? pass('and stops it asking to be set up')
    : fail('join onboards', String(after.onboarded))
  after.kids.length === 0
    ? pass('without inventing a child — sync brings the real ones')
    : fail('join invents no kid', JSON.stringify(after.kids))
  after.session.role === 'parent' && after.session.parentUnlocked
    ? pass('and drops them straight into parent mode')
    : fail('join opens parent mode', JSON.stringify(after.session))
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const errors = []
const track = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`${tag}: ${m.text()}`)
  })
}

const stamp = Date.now()
const first = await ctx.newPage()
const second = await ctx.newPage()
track(first, 'first')
track(second, 'second')

// Each page's own store: a page opened with ?device=x keeps its state under
// its own key (src/lib/storage.js), and reading the plain key read the first
// parent's phone whichever page was asked.
const state = (p) => p.evaluate(() => {
  const device = new URLSearchParams(window.location.search).get('device')
  return JSON.parse(localStorage.getItem(`rankup.state.v1${device ? `.${device}` : ''}`))
})

console.log('\n=== One parent sets the family up ===')
await first.goto(BASE, { waitUntil: 'networkidle' })
await first.waitForTimeout(600)
await first.getByRole('button', { name: /I'm a parent/ }).click()
await first.waitForTimeout(400)
await first.locator('input[type=email]').fill(`first${stamp}@example.com`)
await first.locator('input[type=password]').fill('correct-horse-battery')
await first.getByRole('button', { name: 'Create account' }).click()
await first.waitForTimeout(1600)
await first.locator('input').nth(0).fill('Sam')
await first.locator('input').nth(1).fill('The Two-House Family')
await first.locator('input').nth(2).fill('1234')
await first.getByRole('button', { name: 'Continue' }).click()
await first.waitForTimeout(1400)
if (await first.getByText('What RankUp collects about your child').count()) {
  await first.locator('input[type=checkbox]').check()
  await first.locator('input[placeholder*="Samira"]').fill('Sam Rivera')
  await first.waitForTimeout(200)
  await first.getByRole('button', { name: /I agree/ }).click()
  await first.waitForTimeout(1500)
}
await first.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await first.getByRole('button', { name: 'Start playing' }).click()
await first.waitForTimeout(2500)

const before = await state(first)
before?.kids?.[0]?.name === 'Ava'
  ? pass('the first parent has a family with a child in it')
  : fail('first parent set up', JSON.stringify(before?.kids))

console.log('\n=== They invite the other one ===')
await first.evaluate(() => { window.location.hash = '/parent/settings' })
await first.waitForTimeout(1200)
await first.getByRole('button', { name: 'Invite another grown-up' }).click()
await first.waitForTimeout(1500)
await first.screenshot({ path: `${SHOT_DIR}/coparent-invite.png` })

const code = await first.evaluate(() => {
  const el = [...document.querySelectorAll('code')]
    .find((c) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/.test(c.textContent.trim()))
  return el ? el.textContent.trim() : null
})
code
  ? pass(`a code is shown to send on (${code})`)
  : fail('invite code shown', (await first.evaluate(() => document.body.innerText)).slice(0, 200))

console.log('\n=== The other one joins, on their own phone ===')
await second.goto(`${BASE}?device=second`, { waitUntil: 'networkidle' })
await second.waitForTimeout(600)
await second.getByRole('button', { name: /I'm a parent/ }).click()
await second.waitForTimeout(400)
await second.locator('input[type=email]').fill(`second${stamp}@example.com`)
await second.locator('input[type=password]').fill('correct-horse-battery')
await second.getByRole('button', { name: 'Create account' }).click()
await second.waitForTimeout(1600)

// The link only appears on the family-details step, which is where a second
// parent would otherwise start typing a family name that already exists.
const hasLink = await second.getByText(/Join their family instead/).count()
hasLink
  ? pass('the way in is offered where a second parent would look for it')
  : fail('join link on the setup screen', 'no link')

await second.getByText(/Join their family instead/).click()
await second.waitForTimeout(600)

// A wrong code says so rather than doing something strange.
await second.locator('input').nth(0).fill('Alex')
await second.locator('input[aria-label="Invitation code"]').fill('ZZZZZZ')
await second.locator('input[inputmode=numeric]').fill('5678')
await second.getByRole('button', { name: 'Join' }).click()
await second.waitForTimeout(1500)
const refused = await second.evaluate(() => document.body.innerText)
;/no invitation has that code/i.test(refused)
  ? pass('a wrong code is refused in words a person can act on')
  : fail('wrong code refused', refused.slice(0, 200))

await second.locator('input[aria-label="Invitation code"]').fill(code)
await second.getByRole('button', { name: 'Join' }).click()

/*
 * Read it the moment the join lands, before the first snapshot arrives.
 *
 * Waiting first made this assertion meaningless: the sync layer sets
 * family.id from whatever the server sends, and the server only ever sends
 * this account's own family, so the id was right no matter what the join had
 * done with it. Deleting the line that sets it did not fail the test. The
 * thing worth checking is that the JOIN itself put them in the right place.
 */
await second.waitForFunction(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1.second') || '{}')
  return s.onboarded === true
}, null, { timeout: 15000 }).catch(() => {})
const joined = await state(second)
joined?.onboarded
  ? pass('the second parent is through setup without inventing a family')
  : fail('second parent onboarded', JSON.stringify(joined?.onboarded))
joined?.family?.id === before?.family?.id
  ? pass('and is looking at the same family as the first parent')
  : fail('same family', `${joined?.family?.id} vs ${before?.family?.id}`)

await second.waitForTimeout(3500)
await second.screenshot({ path: `${SHOT_DIR}/coparent-joined.png` })

console.log('\n=== And really sees it ===')
// The whole point. Everything above could pass while the second phone shows an
// empty house, because the family row arrives before the children do.
await second.waitForTimeout(3000)
const synced = await state(second)
synced?.kids?.some((k) => k.name === 'Ava')
  ? pass("the first parent's child is on the second parent's phone")
  : fail('kids synced', JSON.stringify(synced?.kids?.map((k) => k.name)))

console.log('\n=== The first parent sees them listed ===')
await first.reload({ waitUntil: 'networkidle' })
await first.waitForTimeout(2500)
await first.evaluate(() => { window.location.hash = '/parent/settings' })
await first.waitForTimeout(1500)
const listed = await first.evaluate(() => document.body.innerText)
;/Alex/.test(listed)
  ? pass('both grown-ups are listed on the first phone')
  : fail('adults listed', listed.slice(0, 300))
// The invitation is spent, so it must not still be sitting there to re-send.
!new RegExp(code).test(listed)
  ? pass('and the spent invitation is no longer offered')
  : fail('spent invite hidden', 'the used code is still on screen')

console.log('\n=== The same code again, after it was accepted ===')
const third = await ctx.newPage()
track(third, 'third')
await third.goto(`${BASE}?device=third`, { waitUntil: 'networkidle' })
await third.waitForTimeout(600)
await third.getByRole('button', { name: /I'm a parent/ }).click()
await third.waitForTimeout(400)
await third.locator('input[type=email]').fill(`third${stamp}@example.com`)
await third.locator('input[type=password]').fill('correct-horse-battery')
await third.getByRole('button', { name: 'Create account' }).click()
await third.waitForTimeout(1600)
await third.getByText(/Join their family instead/).click()
await third.waitForTimeout(600)
await third.locator('input').nth(0).fill('Jo')
await third.locator('input[aria-label="Invitation code"]').fill(code)
await third.locator('input[inputmode=numeric]').fill('2468')
await third.getByRole('button', { name: 'Join' }).click()
await third.waitForTimeout(1500)
const reused = await third.evaluate(() => document.body.innerText)
;/already been used/i.test(reused)
  ? pass('a code already accepted is refused, and says so')
  : fail('reused code refused', reused.slice(0, 200))
;(await state(third))?.onboarded !== true
  ? pass('and that phone joined nothing')
  : fail('reused code joined nothing', 'the third phone is set up')

console.log('\n=== The first parent removes the second ===')
await first.evaluate(() => { window.location.hash = '/parent/settings' })
await first.waitForTimeout(1200)
let asked = ''
first.once('dialog', (d) => { asked = d.message(); d.dismiss() })
await first.getByRole('button', { name: 'Remove' }).click()
await first.waitForTimeout(800)
;/Remove Alex/.test(asked) && /invite them again/.test(asked)
  ? pass('removing asks first, and says what it does')
  : fail('remove asks first', asked)
;/Alex/.test(await first.evaluate(() => document.body.innerText))
  ? pass('saying no keeps them in the family')
  : fail('dismissed remove kept them', 'Alex is gone')
first.once('dialog', (d) => d.accept())
await first.getByRole('button', { name: 'Remove' }).click()
await first.waitForTimeout(1500)
await first.screenshot({ path: `${SHOT_DIR}/coparent-removed.png` })
!/Alex/.test(await first.evaluate(() => document.body.innerText))
  ? pass('yes takes them out of the list')
  : fail('removed adult unlisted', 'Alex is still listed')

// The second phone finds out on its next sync, and erases what it held. Two
// answers of "no family" in a row are needed, so one odd answer cannot erase a
// phone; a phone in use asks every few seconds (a touch wakes it), and a tab
// in the background here would not ask at all.
await second.bringToFront()
for (let i = 0; i < 8; i += 1) {
  if (await second.evaluate(() => Boolean(document.querySelector('[data-testid="device-wiped"]')))) break
  // A touch, as the person holding it would give, without pressing anything.
  await second.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown'))).catch(() => {})
  await second.waitForTimeout(9000)
}
const gone = await second.evaluate(() => document.querySelector('[data-testid="device-wiped"]')?.textContent || '')
;/no longer part of a family/.test(gone)
  ? pass("the removed parent's phone says so and keeps nothing")
  : fail('removed phone wiped', gone || (await second.evaluate(() => document.body.innerText)).slice(0, 200))
!(await state(second))?.kids?.length
  ? pass('no child is left on it')
  : fail('removed phone holds no child', JSON.stringify((await state(second))?.kids?.map((k) => k.name)))
await second.screenshot({ path: `${SHOT_DIR}/coparent-removed-phone.png` })

await finish(errors, fails, browser)
