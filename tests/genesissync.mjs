/**
 * Theme Genesis across a parent's phone and a child's phone, through a real
 * database; and a theme sent to RankUp, picked for a Season, arriving in
 * another family's theme picker on the day the Season starts.
 *
 *   1. A child makes a theme on their own phone. It reaches the parent's
 *      phone. "Use this theme" on a phone with no PIN is a request: the
 *      parent switches it on from Review, and the child's phone changes,
 *      every level and coin as it was.
 *   2. The parent renames it in Settings; the child's phone shows the name.
 *   3. The child asks to send it to RankUp; nothing goes until the parent
 *      says yes, and what goes is the theme alone, with the credit the
 *      parent typed and never the child's name.
 *   4. Another family sees none of it, not even by asking the API.
 *   5. The operator picks it for the next Season. The family is told. Until
 *      the Season starts no other family has it; on the day, the other
 *      family's child sees "New Season!" and finds it in their picker,
 *      credited, and can wear it.
 *   6. The parent removes the child's theme; the child's phone goes back to
 *      the theme it was made from, progress untouched.
 *
 * Needs the stack (supabase/test/up.sh): the mock API on :54321, Postgres,
 * and the dev server on :5173.
 */
import { chromium } from 'playwright'
import pg from 'pg'
import { BASE, setPlanInDatabase } from './helpers.mjs'

const SHOT = process.env.SHOT_DIR || 'tests/screenshots'
const MOCK = process.env.MOCK_URL || 'http://localhost:54321'
const fails = []
const ok = (n, cond, d = '') => { if (cond) console.log('  PASS', n); else { fails.push(n); console.log('  FAIL', n, '—', d) } }

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const otherCtx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
const track = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`${tag}: ${m.text()}`) })
}
const parent = await ctx.newPage(); track(parent, 'parent')
const kid = await ctx.newPage(); track(kid, 'kid')
const other = await otherCtx.newPage(); track(other, 'other')
const stamp = Date.now()
const FAMILY = `Genesis ${stamp}`
const OTHER = `Elsewhere ${stamp}`

const state = (p, key = 'rankup.state.v1') => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key)
const kState = () => state(kid, 'rankup.state.v1.kid')
const hash = (p, h) => p.evaluate((x) => { window.location.hash = x }, h)
const nudge = async (p, ms = 4000) => {
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await p.waitForTimeout(ms)
}
/** Wait (up to ~30s, nudging) until a phone's state passes the check. */
async function until(p, read, check, label) {
  for (let i = 0; i < 10; i += 1) {
    const s = await read()
    if (check(s)) return s
    await nudge(p, 3000)
  }
  ok(label, false, 'timed out')
  return read()
}

async function makeFamily(page, family, child) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  await page.locator('input[type=email]').fill(`${child.toLowerCase()}${stamp}@example.com`)
  await page.locator('input[type=password]').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(1300)
  await page.locator('input').nth(0).fill('Sam')
  await page.locator('input').nth(1).fill(family)
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1500)
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Sam Test')
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.locator('input[placeholder="e.g. Ava"]').fill(child)
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(2500)
}

console.log('\n=== A family, and a child\'s own phone ===')
await makeFamily(parent, FAMILY, 'Mira')
await setPlanInDatabase(FAMILY)
await nudge(parent, 2500)
await kid.goto(`${BASE}/?device=kid`, { waitUntil: 'networkidle' })
await kid.waitForTimeout(600)
await kid.getByRole('button', { name: /I'm a kid/ }).click()
await kid.waitForTimeout(400)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name: 'Continue' }).click()
await kid.waitForTimeout(400)
await kid.getByRole('button', { name: /Sugar Rush/ }).first().click()
await kid.getByRole('button', { name: 'Get my code' }).click()
await kid.waitForTimeout(2500)
const code = (await kState())?.pendingPairing?.code
await hash(parent, '/parent/pair')
await parent.waitForTimeout(800)
await parent.locator('input[inputmode=numeric]').fill(code)
await parent.waitForTimeout(2000)
await kid.waitForTimeout(4000)
ok('the child\'s phone is linked', (await kState()).onboarded)
const avaId = (await kState()).device.linkedKidId
await db.query('update kids set xp = 3000, coins = 77 where id = $1', [avaId])
await nudge(kid, 4000)
const avaBefore = (await kState()).kids.find((k) => k.id === avaId)
const progressOf = (k) => JSON.stringify([k.xp, k.coins, k.streak?.count])

console.log('\n=== 1. The child makes a theme on their own phone ===')
await hash(kid, '/kid/profile')
await kid.waitForTimeout(800)
await kid.getByTestId('open-genesis').click()
await kid.waitForTimeout(500)
await kid.getByRole('button', { name: /Start a new theme/ }).click()
await kid.getByTestId('genesis-name').fill('Comet Crew')
await kid.getByTestId('vibe-space').click()
for (let i = 0; i < 3; i += 1) { await kid.getByTestId('genesis-next').click(); await kid.waitForTimeout(400) }
await kid.getByTestId('genesis-use').click()
await kid.waitForTimeout(600)
ok('on a phone with no PIN, "Use this theme" asks a grown-up', await kid.getByText(/A grown-up can switch it on/).isVisible())
await kid.screenshot({ path: `${SHOT}/genesis-sync-kid-asked.png` })
let ks = await kState()
const theme = ks.kidThemes[0]
ok('the theme is saved, finished, with the request', theme?.name === 'Comet Crew' && theme.status === 'ready' && theme.useAsk)
ok('and the child is still on the theme they had (the lock holds)', ks.kids.find((k) => k.id === avaId).themeId === 'sugarrush')

const ps = await until(parent, () => state(parent), (s) => s.kidThemes?.some((t) => t.id === theme.id && t.useAsk),
  'the theme reaches the parent\'s phone')
ok('the theme reaches the parent\'s phone, with the request', ps.kidThemes.some((t) => t.id === theme.id && t.name === 'Comet Crew'))
ok('as a row in the family\'s database', (await db.query('select name from kid_themes where id = $1', [theme.id])).rows[0]?.name === 'Comet Crew')
await hash(parent, '/parent/approvals')
await parent.waitForTimeout(800)
ok('Review shows what the child asked', await parent.getByTestId('theme-ask-use').isVisible())
await parent.screenshot({ path: `${SHOT}/genesis-sync-parent-review.png` })
await parent.getByRole('button', { name: /Switch Ava to it/ }).click()
await parent.waitForTimeout(2500)
ks = await until(kid, kState, (s) => s.kids.find((k) => k.id === avaId)?.themeId === `custom-${theme.id}`,
  'the child\'s phone changes to their theme')
const avaNow = ks.kids.find((k) => k.id === avaId)
ok('the child\'s phone is in their own theme', avaNow.themeId === `custom-${theme.id}`)
ok('with every level and coin as it was', progressOf(avaNow) === progressOf(avaBefore), `${progressOf(avaNow)} vs ${progressOf(avaBefore)}`)
ok('and the request is answered', !ks.kidThemes.find((t) => t.id === theme.id).useAsk)
await hash(kid, '/kid')
await kid.waitForTimeout(1200)
ok('its coins are called by the name the child gave them', (await kid.locator('body').textContent()).includes('Star Bits'))
await kid.evaluate(() => window.scrollTo(0, 0))
await kid.screenshot({ path: `${SHOT}/genesis-sync-kid-home.png` })

console.log('\n=== 2. The parent renames it ===')
await hash(parent, '/parent/settings')
await parent.waitForTimeout(800)
await parent.getByRole('button', { name: /Kids' own themes/ }).click()
await parent.getByTestId('kid-theme-row').filter({ hasText: 'Comet Crew' }).getByRole('button', { name: 'Rename' }).click()
await parent.getByTestId('kid-theme-rename').fill('Comet Crew Max')
await parent.getByTestId('kid-theme-rename-save').click()
await parent.waitForTimeout(2500)
await until(kid, kState, (s) => s.kidThemes.find((t) => t.id === theme.id)?.name === 'Comet Crew Max', 'the new name reaches the child\'s phone')
ok('the new name reaches the child\'s phone', (await kState()).kidThemes.find((t) => t.id === theme.id)?.name === 'Comet Crew Max')

console.log('\n=== 3. Sending it to RankUp needs the parent ===')
await hash(kid, `/kid/genesis?edit=${theme.id}`)
await kid.waitForTimeout(700)
await kid.getByTestId('genesis-track').getByRole('button', { name: /Launch/ }).click()
await kid.waitForTimeout(500)
await kid.getByTestId('genesis-ask-send').click()
await kid.waitForTimeout(2500)
ok('the child asks; nothing is sent yet', (await db.query('select count(*)::int n from theme_submissions where source_theme_id = $1', [theme.id])).rows[0].n === 0)
await until(parent, () => state(parent), (s) => s.kidThemes?.some((t) => t.id === theme.id && t.sendAsk), 'the request reaches the parent')
await hash(parent, '/parent/approvals')
await parent.waitForTimeout(800)
ok('Review shows it, saying what would be sent', await parent.getByTestId('theme-ask-send').isVisible()
  && (await parent.getByTestId('theme-ask-send').textContent()).includes('Never Ava'))
ok('the credit starts empty: the child\'s name is never filled in for the parent', (await parent.getByTestId('theme-credit').inputValue()) === '')
await parent.getByTestId('theme-credit').fill('Captain A')
await parent.getByTestId('theme-send').click()
await parent.waitForTimeout(3500)
const sub = (await db.query('select * from theme_submissions where source_theme_id = $1', [theme.id])).rows[0]
ok('the parent says yes, and it is sent', Boolean(sub) && sub.credit === 'Captain A' && sub.status === 'new')
ok('carrying the theme alone: its name and design',
  sub && JSON.stringify(Object.keys(sub.payload).sort()) === '["design","name"]' && sub.payload.name === 'Comet Crew Max'
    && JSON.stringify(Object.keys(sub.payload.design).sort()) === JSON.stringify(['a', 'a2', 'base', 'bg', 'cur', 'mascot', 'pat', 'v', 'vibe', 'worlds']))
ok('and nothing of the child\'s or the family\'s', sub && !/Ava|Mira|Genesis|[0-9a-f]{8}-[0-9a-f]{4}/.test(JSON.stringify(sub.payload)))

console.log('\n=== 4. Another family sees none of it ===')
await makeFamily(other, OTHER, 'Zed')
const os = await state(other)
ok('another family\'s phone has no theme of theirs', (os.kidThemes || []).length === 0)
const otherUser = (await db.query('select p.user_id from parents p join families f on f.id = p.family_id where f.name = $1', [OTHER])).rows[0].user_id
const asked = await (await fetch(`${MOCK}/rest/v1/kid_themes`, { headers: { apikey: 'local-anon-key', Authorization: `Bearer ${otherUser}` } })).json()
ok('not even by asking the API for every theme', Array.isArray(asked) && asked.length === 0, JSON.stringify(asked).slice(0, 120))
const snap = await (await fetch(`${MOCK}/rest/v1/rpc/family_snapshot`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${otherUser}` },
  body: JSON.stringify({ p_since: 0 }) })).json()
ok('nor in its sync', !JSON.stringify(snap).includes('Comet Crew'))
const sent = await (await fetch(`${MOCK}/rest/v1/theme_submissions`, { headers: { apikey: 'local-anon-key', Authorization: `Bearer ${otherUser}` } })).json()
ok('nor what was sent to RankUp', Array.isArray(sent) ? sent.length === 0 : true)

console.log('\n=== 5. Picked for the next Season ===')
const number = 600 + Math.floor(Math.random() * 300)
await db.query('delete from seasons where number = $1', [number])
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const seasonId = (await db.query('select (operator_create_season($1, $2, $3::date))->>\'id\' id', [number, 'Comet Season', tomorrow])).rows[0].id
const pick = (await db.query('select operator_pick_theme($1, $2) r', [sub.id, seasonId])).rows[0].r
ok('the operator picks it for the next Season', pick.ok === true, JSON.stringify(pick))
await until(kid, kState, (s) => s.kidThemes.find((t) => t.id === theme.id)?.pickedSeason === number, 'the family hears')
await hash(kid, '/kid')
await kid.waitForTimeout(1000)
ok('the child is told: "Your theme was picked"', await kid.getByText(`Your theme was picked for Season ${number}!`).isVisible())
await kid.evaluate(() => window.scrollTo(0, 0))
await kid.screenshot({ path: `${SHOT}/genesis-sync-picked.png` })

await other.reload({ waitUntil: 'networkidle' })
await other.waitForTimeout(3000)
ok('before the Season starts, no other family has it', !((await state(other)).seasons || []).some((s) => s.number === number))

await db.query('update seasons set starts_on = (now() at time zone \'utc\')::date where id = $1', [seasonId])
await other.reload({ waitUntil: 'networkidle' })
await other.waitForTimeout(3500)
const seasons = (await state(other)).seasons || []
ok('on its first day, the other family has the Season', seasons.some((s) => s.number === number && s.themes.some((t) => t.name === 'Comet Crew Max' && t.credit === 'Captain A')))
ok('holding the theme and its credit, nothing of the family it came from', !/Ava|Mira|Genesis/.test(JSON.stringify(seasons)))
await hash(other, '/switch')
await other.waitForTimeout(600)
await other.getByRole('button', { name: /Zed/ }).first().click()
await other.waitForTimeout(1500)
ok('their child sees "New Season!" on their home screen', await other.getByTestId('season-moment').isVisible())
await other.screenshot({ path: `${SHOT}/genesis-sync-new-season.png` })
await other.getByRole('button', { name: 'See them' }).click()
await other.waitForTimeout(800)
await other.getByRole('button', { name: /Ask a parent to change the theme/ }).click()
await other.locator('input[type=password]').fill('1234')
await other.getByRole('button', { name: 'Unlock' }).click()
await other.waitForTimeout(400)
const tile = other.getByTestId('season-theme').filter({ hasText: 'Comet Crew Max' })
ok('and finds it in their theme picker, marked with the Season and the credit',
  (await tile.count()) === 1 && /SEASON/.test(await tile.textContent()) && (await tile.textContent()).includes('by Captain A'))
await tile.click()
await other.getByRole('button', { name: 'Save theme' }).click()
await other.waitForTimeout(800)
const zed = (await state(other)).kids.find((k) => k.name === 'Zed')
ok('and can wear it', zed.themeId.startsWith('season-'))
await hash(other, '/kid')
await other.waitForTimeout(1000)
ok('the moment is shown once', (await other.getByTestId('season-moment').count()) === 0)

console.log('\n=== 6. The parent removes the child\'s theme ===')
await hash(parent, '/parent/settings')
await parent.waitForTimeout(800)
await parent.getByRole('button', { name: /Kids' own themes/ }).click()
await parent.getByTestId('kid-theme-row').filter({ hasText: 'Comet Crew Max' }).getByRole('button', { name: 'Remove' }).click()
await parent.getByTestId('kid-theme-remove-confirm').click()
await parent.waitForTimeout(2500)
ks = await until(kid, kState, (s) => !s.kidThemes.some((t) => t.id === theme.id), 'it leaves the child\'s phone')
const avaAfter = ks.kids.find((k) => k.id === avaId)
ok('it leaves the child\'s phone', !ks.kidThemes.some((t) => t.id === theme.id))
ok('which goes back to the theme it was made from', avaAfter.themeId === 'matrixblocks', avaAfter.themeId)
ok('with every level and coin as it was', progressOf(avaAfter) === progressOf(avaBefore))
ok('the Season keeps its copy for everyone', (await db.query('select count(*)::int n from season_themes where season_id = $1', [seasonId])).rows[0].n === 1)

await db.query('delete from seasons where number = $1', [number])
ok('no errors on any phone', errors.length === 0, errors.slice(0, 5).join('; '))
await db.end()
await b.close()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
