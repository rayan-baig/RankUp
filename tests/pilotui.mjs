/**
 * Pilot, the AI helper, in a real browser: where it is, where it never is,
 * and a change going through its confirm card.
 *
 *   - the robot on the signed-out front door, and in Parent Mode above the
 *     tab bar; tapping it opens the window with the MTRX Horizyn words;
 *   - with a (stand-in) AI provider asking to add a chore, the card says
 *     "Pilot wants to: add the chore “Feed the dog” for Ava (30 XP)"; Allow
 *     puts it on Ava's list through the app's own state;
 *   - "Explain this screen" sends no child's or family's name;
 *   - gone the moment Parent Mode is left ("Hand to a kid", the demo's
 *     Ava and Noah buttons), on every child's screen, and on a child's
 *     phone in every state (set up, being set up, unlinked), where not one
 *     Pilot file is even fetched;
 *   - leaving the demo (a different family in this tab) forgets the chat and
 *     the key kept for this visit.
 *
 * No request reaches a real AI company: the provider is answered in the page.
 * Needs the dev server and the stand-in API (supabase/test/up.sh).
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { reducer } from '../src/state/reducer.js'
import { createInitialState } from '../src/state/initialState.js'

const { fails, pass, fail } = reporter()
const check = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []

async function newPage(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...options })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`console: ${m.text()}`) })
  if (process.env.TEST_HTTP_LOG) page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
  const pilotFiles = []
  page.on('request', (r) => { if (/\/pilot[/-]|pilotRankUp/.test(new URL(r.url()).pathname)) pilotFiles.push(r.url()) })
  return { page, ctx, pilotFiles }
}
const go = async (page, route, wait = 700) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
/** The robot is on the page and showing. */
const robotShown = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  return Boolean(root && root.isConnected && root.querySelector('.pilot-launcher') && root.getClientRects().length && getComputedStyle(root).display !== 'none')
})
/** Not in the page at all. */
const robotGone = (page) => page.evaluate(() => !document.querySelector('.pilot-root, .pa-stage, .pilot-alive') && document.documentElement.dataset.pilot !== 'on')
async function waitForRobot(page, ms = 9000) {
  for (let t = 0; t < ms; t += 250) { if (await robotShown(page)) return true; await page.waitForTimeout(250) }
  return false
}
/** Open Parent Mode from the PIN screen (the demo opens without a PIN). */
async function openParentMode(page) {
  if (await page.getByLabel('Parent PIN').count()) await page.getByLabel('Parent PIN').fill('1234')
  else await page.getByRole('button', { name: 'Open Parent Mode' }).click()
  await page.waitForTimeout(900)
}
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/rkpilot-${name}.png` }).catch(() => {})

// A stand-in for the AI provider: each request is answered from the list.
const sse = (events) => events.map(([name, obj]) => `event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`).join('')
const toolCall = (name, input) => sse([
  ['message_start', { type: 'message_start', message: { id: 'm1' } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' } }],
])
const words = (text) => sse([
  ['message_start', { type: 'message_start', message: { id: 'm2' } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' } }],
])
async function standInProvider(page, answers) {
  const bodies = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    bodies.push(route.request().postData() || '')
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: answers.shift() || words('OK') })
  })
  return bodies
}
const KEY = JSON.stringify({ keys: [{ id: 'k1', provider: 'anthropic', key: 'test-key', model: 'test-model' }], active: 'k1' })

// -----------------------------------------------------------------------------
console.log('\n=== The front door, for a visitor ===')
{
  const { page, ctx } = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  check('the robot comes once the page has loaded', await waitForRobot(page))
  check('loaded from this site by the gate (one core tag, nothing in the page source)', await page.evaluate(() => document.querySelectorAll('#pilot-core').length === 1))
  await shot(page, 'front-door')
  await page.getByRole('button', { name: /I'm a kid/ }).click()
  await page.waitForTimeout(500)
  check('"I\'m a kid": gone while a child sets the phone up', await robotGone(page))
  await page.getByRole('button', { name: /Back/ }).first().click().catch(() => {})
  await page.waitForTimeout(800)
  check('and back on the front door after "Back"', await waitForRobot(page, 3000))
  await ctx.close()
}

// -----------------------------------------------------------------------------
console.log('\n=== Parent Mode (the demo family) ===')
const { page, ctx } = await newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByTestId('see-it-live').click()
await page.waitForTimeout(1200)
check('the parent dashboard has the robot', await waitForRobot(page) && (await page.evaluate(() => location.hash)) === '#/parent')
const place = await page.evaluate(() => {
  const r = document.querySelector('.pilot-launcher').getBoundingClientRect()
  const nav = [...document.querySelectorAll('nav')].pop()?.getBoundingClientRect()
  return { robotBottom: r.bottom, navTop: nav ? nav.top : 9999 }
})
check('above the tab bar, not on it', place.robotBottom <= place.navTop + 1, JSON.stringify(place))
await shot(page, 'parent-dashboard')
let alive = false
for (let t = 0; t < 8000 && !alive; t += 250) { alive = await page.evaluate(() => Boolean(document.querySelector('.pilot-root .pa-stage'))); if (!alive) await page.waitForTimeout(250) }
check('the moving robot wakes up once the page is idle, inside Pilot\'s own element', alive
  && await page.evaluate(() => [...document.querySelectorAll('.pa-stage')].every((el) => el.closest('.pilot-root'))))

await page.locator('.pilot-launcher').click()
await page.waitForTimeout(1500)
const head = await page.evaluate(() => ({ name: document.querySelector('.pilot-word')?.textContent, tag: document.querySelector('.pilot-tagline')?.textContent }))
check('the window: "Pilot", "Your AI copilot. Powered by you."', head.name === 'Pilot' && head.tag === 'Your AI copilot. Powered by you.', JSON.stringify(head))
check('the 18+ line beside the key settings', /AI keys are for grown-ups/.test(await page.locator('.pilot-root').innerText()))
await shot(page, 'chat-window')

console.log('\n=== Explain this screen keeps names private ===')
for (const route of ['/parent', '/parent/approvals', '/parent/kids', '/parent/money', '/parent/settings', '/parent/history']) {
  await go(page, route, 900)
  const sent = await page.evaluate(() => window.PilotPack.screenText())
  const raw = await page.evaluate(() => window.PilotPanel.screenText())
  check(`${route}: no child's or family's name in what would be sent`, !/\b(Ava|Noah|Rivera|Sam)\b/.test(sent), sent.slice(0, 200))
  if (['/parent', '/parent/approvals', '/parent/kids'].includes(route)) {
    check(`${route}: and the children's names are marked private on the screen itself`, !/\b(Ava|Noah)\b/.test(raw), raw.slice(0, 200))
  }
}

console.log('\n=== A change goes through its card ===')
await go(page, '/parent', 900)
await page.evaluate((k) => sessionStorage.setItem('rankup-pilot-settings', k), KEY)
const bodies = await standInProvider(page, [toolCall('add_chore', { child: 'Ava', title: 'Feed the dog', difficulty: 'medium' }), words('Done: Feed the dog is on Ava’s list.')])
await page.reload({ waitUntil: 'networkidle' })
await waitForRobot(page)
if (!(await page.locator('.pilot-panel').isVisible().catch(() => false))) await page.locator('.pilot-launcher').click()
await page.waitForTimeout(1200)
await page.locator('.pilot-input').fill('Add a chore for Ava: feed the dog')
await page.locator('.pilot-send').click()
const card = page.locator('.pilot-card').filter({ hasText: 'Pilot wants to' })
await card.waitFor({ timeout: 8000 }).catch(() => {})
const cardText = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ')
check('the card says exactly what will happen', /Pilot wants to: ?Add the chore “Feed the dog” for Ava \(30 XP\)/i.test(cardText), cardText)
const asked = bodies[0] || ''
check('the provider was offered RankUp\'s tools, and nothing for plans, pauses or phones',
  /"add_chore"/.test(asked) && /"whats_waiting_for_review"/.test(asked) && !/"(change_plan|buy_|pause_|unlink|remove_child)/.test(asked))
check('what went to the provider names no child id or family name', !/kid_[a-z0-9]|Rivera/.test(asked))
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).quests.filter((q) => q.title === 'Feed the dog').length)
check('nothing is added before Allow', before === 0)
await shot(page, 'confirm-card')
await card.getByRole('button', { name: 'Allow' }).click()
await page.waitForTimeout(1500)
const after = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  const ava = s.kids.find((k) => k.name === 'Ava')
  return s.quests.filter((q) => q.title === 'Feed the dog' && q.kidId === ava.id && q.status === 'assigned').length
})
check('Allow: "Feed the dog" is on Ava\'s list, saved like any chore', after === 1)
check('and Pilot says so', /Done: Feed the dog/.test(await page.locator('.pilot-log').innerText().catch(() => '')))
await shot(page, 'after-allow')

console.log('\n=== Gone the moment Parent Mode is left ===')
await page.locator('.pilot-win[aria-label="Close Pilot"]').click().catch(() => {})
await page.getByRole('button', { name: /Hand to a kid/ }).click()
await page.waitForTimeout(150)
check('"Hand to a kid": gone at once', await robotGone(page))
await page.waitForTimeout(1500)
check('and stays gone on the PIN screen', await robotGone(page) && /switch/.test(await page.evaluate(() => location.hash)))
await openParentMode(page)
check('the PIN brings it back in Parent Mode', await waitForRobot(page, 4000))
await page.getByRole('button', { name: /Ava/ }).first().click()
await page.waitForTimeout(150)
check('the demo\'s "Ava" view: gone at once', await robotGone(page))
await page.waitForTimeout(800)
await shot(page, 'kid-home-ava')
const KID_ROUTES = ['/kid', '/kid/quests', '/kid/shop', '/kid/market', '/kid/arcade', '/kid/profile', '/kid/leaderboards', '/kid/school',
  '/kid/dragon', '/kid/genesis', '/kid/guild', '/switch']
const shownOn = []
for (const r of KID_ROUTES) { await go(page, r, 500); if (!(await robotGone(page))) shownOn.push(r) }
check(`on none of ${KID_ROUTES.length} child's screens`, shownOn.length === 0, shownOn.join(', '))
await go(page, '/parent', 600)
check('a parent link from the child\'s side asks for the PIN, with no robot', await robotGone(page))
await openParentMode(page)
await page.getByRole('button', { name: /Noah/ }).first().click().catch(() => {})
await page.waitForTimeout(300)
check('the demo\'s "Noah" view: gone too', await robotGone(page))
await page.waitForTimeout(500)
await shot(page, 'kid-home-noah')

console.log('\n=== Leaving the demo forgets the chat and this visit\'s key ===')
const kept = await page.evaluate(() => [sessionStorage.getItem('rankup-pilot-chat'), sessionStorage.getItem('rankup-pilot-settings')])
check('(there was a chat and a key for this visit)', Boolean(kept[0] && kept[1]))
await page.getByRole('button', { name: 'Start for free' }).click()
await page.waitForTimeout(400)
await page.getByRole('dialog').getByRole('button', { name: /Start|Clear|Yes/ }).last().click().catch(() => {})
await page.waitForTimeout(1500)
const left = await page.evaluate(() => ({ onboarded: JSON.parse(localStorage.getItem('rankup.state.v1') || '{}').onboarded,
  chat: sessionStorage.getItem('rankup-pilot-chat'), key: sessionStorage.getItem('rankup-pilot-settings') }))
check('the demo is over', !left.onboarded, JSON.stringify(left))
check('its chat and the key kept for this visit are gone', (!left.chat || JSON.parse(left.chat).messages.length === 0) && !left.key, JSON.stringify(left))
await ctx.close()

// -----------------------------------------------------------------------------
console.log('\n=== Reduce motion: the robot sits still ===')
for (const [label, options, setting] of [['the browser\'s "reduce motion"', { reducedMotion: 'reduce' }, false], ['RankUp\'s own Reduce motion setting', {}, true]]) {
  const { page: mp, ctx: mc, pilotFiles } = await newPage(options)
  await mp.goto(BASE, { waitUntil: 'networkidle' })
  await mp.getByTestId('see-it-live').click()
  await mp.waitForTimeout(1200)
  if (setting) {
    await mp.evaluate(() => { const s = JSON.parse(localStorage.getItem('rankup.state.v1')); s.settings.reduceMotion = true; localStorage.setItem('rankup.state.v1', JSON.stringify(s)) })
    await mp.waitForTimeout(400)
    pilotFiles.length = 0 // only what this load fetches, with the setting on
    await mp.reload({ waitUntil: 'networkidle' })
  }
  check(`${label}: the robot is there`, await waitForRobot(mp))
  await mp.waitForTimeout(5000)
  const moving = pilotFiles.filter((u) => /pilot-(motion|actor)|pilot-rest-|\/poses\//.test(u))
  check(`${label}: the moving robot is never fetched`, moving.length === 0, moving.join(', '))
  check(`${label}: and nothing moves`, await mp.evaluate(() => !document.querySelector('.pa-stage') && getComputedStyle(document.querySelector('.pilot-robot')).animationName === 'none'))
  await mc.close()
}

// -----------------------------------------------------------------------------
console.log('\n=== A child\'s phone, in every state: no Pilot, not one Pilot file ===')
const kidPhone = reducer(createInitialState(), { type: 'LINKED_BY_CODE', kid: { id: 'kid_pilot1', name: 'Ava', themeId: 'blockcraft' }, familyName: 'Fam', real: false })
const STATES = [
  ['set up as a child\'s', kidPhone, ['/kid', '/kid/shop', '/parent', '/parent/plan', '/gift', '/school', '/switch', '/']],
  ['being set up (showing its code)', reducer(createInitialState(), { type: 'START_PAIRING', record: { code: '482913', kidName: 'Ava', themeId: 'blockcraft', createdAt: Date.now(), expiresAt: Date.now() + 600000, attempts: 0 } }), ['/welcome', '/gift', '/school']],
  ['unlinked from being a child\'s', { ...createInitialState(), deviceWiped: 'unlinked', deviceWipedChild: true }, ['/welcome', '/gift', '/school']],
]
for (const [label, state, routes] of STATES) {
  const { page: kp, ctx: kc, pilotFiles } = await newPage()
  await kp.goto(BASE, { waitUntil: 'domcontentloaded' })
  await kp.evaluate((s) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('rankup.state.v1', s); localStorage.setItem('rankup-pilot-settings', '{"keys":[]}') }, JSON.stringify(state))
  await kp.reload({ waitUntil: 'networkidle' })
  const shown = []
  for (const r of routes) {
    await go(kp, r, 400)
    await kp.waitForTimeout(r === routes[0] ? 2500 : 300)
    if (!(await robotGone(kp))) shown.push(r)
  }
  check(`a phone ${label}: no robot on ${routes.join(' ')}`, shown.length === 0, shown.join(', '))
  check(`a phone ${label}: no Pilot file fetched`, pilotFiles.length === 0, pilotFiles.join(', '))
  check(`a phone ${label}: anything Pilot kept on it is gone`, await kp.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('rankup-pilot'))))
  if (label.startsWith('set up')) await shot(kp, 'kid-phone')
  await kc.close()
}

await finish(errors, fails, browser)
