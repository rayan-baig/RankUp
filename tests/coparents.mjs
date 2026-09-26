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

const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))

console.log('\n=== One parent sets the family up ===')
await first.goto(BASE, { waitUntil: 'networkidle' })
await first.waitForTimeout(600)
await first.getByRole('button', { name: /I'm a parent/ }).click()
await first.waitForTimeout(400)
await first.locator('input[type=email]').fill(`first${stamp}@example.com`)
await first.locator('input[type=password]').fill('correct-horse-battery')
await first.getByRole('button', { name: 'Create account' }).click()
await first.waitForTimeout(1600)
await first.getByRole('button', { name: 'Continue' }).click()
await first.waitForTimeout(400)
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
await first.getByRole('button', { name: 'Continue' }).click()
await first.waitForTimeout(300)
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
await second.getByRole('button', { name: 'Continue' }).click()
await second.waitForTimeout(500)

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
  const s = JSON.parse(localStorage.getItem('rankup.state.v1') || '{}')
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

await finish(errors, fails, browser)
