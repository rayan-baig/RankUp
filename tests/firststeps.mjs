/**
 * The first five minutes, in Node: the getting-started list, the starter
 * chores and rewards, every empty screen's words, and the demo family.
 *
 * The list must tick from what really happened and nothing else, so each
 * step is driven through the real reducer, the way the app does it. The
 * empty states must each end in a real next step, so every action is checked
 * against the routes App.jsx actually draws. And the demo must be inert: its
 * names are a fixed made-up list, nothing is queued for a server, and with the
 * network paused (as the app pauses it for the demo) not one call reaches
 * fetch — not Supabase, not /api, not Stripe's checkout.
 *
 * Pure Node, no browser and no database. tests/demolive.mjs walks the same
 * demo in a browser and counts the requests that leave the page.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { reducer } from '../src/state/reducer.js'
import { createInitialState, makeKid } from '../src/state/initialState.js'
import { firstWeekSteps, showFirstWeek, starterChores, STARTER_REWARDS, FIRST_WEEK_CHORES } from '../src/lib/firstWeek.js'
import { EMPTY_STATES, EMPTY_LIMITS } from '../src/data/emptyStates.js'
import { buildDemoFamily, DEMO_NAMES } from '../src/lib/demoFamily.js'
import { levelFromXp } from '../src/lib/xp.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const run = (state, ...actions) => actions.reduce(reducer, state)
const step = (state, id) => firstWeekSteps(state).find((s) => s.id === id)

console.log('\n=== Getting started ticks from real state ===')
const ava = makeKid({ name: 'Ava', themeId: 'blockcraft' })
let s = run(createInitialState(), {
  type: 'COMPLETE_ONBOARDING',
  family: { name: 'Test family', parentName: 'Sam', pin: '1234' },
  kid: ava,
  guildName: "Ava's Guild",
})
const ids = firstWeekSteps(s).map((x) => x.id).join(',')
ok('four steps: a child, their phone, a first chore, an accepted chore', ids === 'kid,pair,assign,accept', ids)
ok('a family that just set up has the child ticked and the rest to do',
  step(s, 'kid').done && !step(s, 'pair').done && !step(s, 'assign').done && !step(s, 'accept').done)
ok('the list shows on a new family\'s dashboard', showFirstWeek(s))
ok('the phone step is about the child by name', /Ava's phone/.test(step(s, 'pair').label), step(s, 'pair').label)
ok('and offers "We share one phone" for a family with one', step(s, 'pair').skip === 'We share one phone')
ok('the chore step offers the starter chores for Ava', step(s, 'assign').starter?.id === ava.id)

console.log('\n=== Starter chores, one tap ===')
const starters = starterChores(s.kids[0])
ok(`${FIRST_WEEK_CHORES} starter chores`, starters.length === FIRST_WEEK_CHORES, String(starters.length))
ok('easy to start: a bed, a book, the dishwasher',
  starters.map((q) => q.title).join('|') === 'Make your bed|Read for 20 minutes|Load the dishwasher',
  starters.map((q) => q.title).join('|'))
ok('each one is Ava\'s, with XP and no surprise double XP',
  starters.every((q) => q.kidId === ava.id && q.xp > 0 && q.doubleXp === false))
const adaptiveKid = makeKid({ name: 'Noah', themeId: 'blockcraft', accessibility: { hasNeeds: true, notes: '', supports: [] } })
const adaptive = starterChores(adaptiveKid)
ok('a child with adaptive quests gets three from the adaptive pack',
  adaptive.length === 3 && adaptive.every((q) => q.adaptive === true), adaptive.map((q) => q.title).join('|'))
ok('nobody to give them to, no chores', starterChores(null).length === 0)

s = run(s, { type: 'ADD_QUESTS', quests: starters })
ok('adding them ticks "Add a first chore"', step(s, 'assign').done && !step(s, 'assign').starter)

console.log('\n=== The phone, and the first accepted chore ===')
const shared = run(s, { type: 'UPDATE_SETTINGS', patch: { sharedPhone: true } })
ok('"We share one phone" counts the phone step as done', step(shared, 'pair').done && !step(shared, 'pair').skip)
ok('a linked phone does too', step({ ...s, kids: s.kids.map((k) => ({ ...k, pairedDeviceAt: Date.now() })) }, 'pair').done)

const quest = s.quests[0]
s = run(s, { type: 'SUBMIT_QUEST', submission: { questId: quest.id, kidId: ava.id, note: '', onTime: true } })
ok('a chore waiting sends the last step to Review', step(s, 'accept').to === '/parent/approvals' && !step(s, 'accept').done)
const sub = s.submissions[s.submissions.length - 1]
s = run(s, { type: 'APPROVE_SUBMISSION', submissionId: sub.id, sticker: 'proud' })
ok('accepting it ticks the last step', step(s, 'accept').done)
// 0.29.0: a chore done and accepted with no child's phone linked was done on
// a grown-up's phone, so the family shares one and the list finishes.
ok('accepted with no child\'s phone linked: the phone step ticks itself (a one-phone family)', step(s, 'pair').done && !step(s, 'pair').skip)
ok('so all four are done and the list is gone for good', !showFirstWeek(s))
const linkedLater = { ...s, submissions: s.submissions.map((x) => ({ ...x, status: 'pending' })) }
ok('before anything is accepted, the phone step still waits (and offers both ways)', !step(linkedLater, 'pair').done && step(linkedLater, 'pair').skip === 'We share one phone')
const allDone = run(s, { type: 'UPDATE_SETTINGS', patch: { sharedPhone: true } })
ok('"We share one phone" tapped as well changes nothing', !showFirstWeek(allDone))
ok('"Hide this list" hides it before then', !showFirstWeek(run(createInitialState(), { type: 'UPDATE_SETTINGS', patch: { firstWeekHidden: true } })))
ok('never in the demo', !showFirstWeek({ ...createInitialState(), demo: true }))

console.log('\n=== Starter rewards ===')
const withRewards = run(createInitialState(), ...STARTER_REWARDS.map((reward) => ({ type: 'ADD_REWARD', reward: { ...reward } })))
ok('three starter rewards go in through the reducer', withRewards.rewards.length === 3)
ok('each with a name, an icon and a price', withRewards.rewards.every((r) => r.name && r.icon && r.cost > 0))
ok('the first one is about two days of chores away, not a week', STARTER_REWARDS[0].cost <= 90)

console.log('\n=== Every empty screen says what to do next ===')
const app = readFileSync('src/App.jsx', 'utf8')
const routes = new Set([...app.matchAll(/route === '([^']+)'/g)].map((m) => m[1]))
for (const [key, e] of Object.entries(EMPTY_STATES)) {
  ok(`${key}: a short title (${e.title.length} letters)`, e.title.length > 0 && e.title.length <= EMPTY_LIMITS.title)
  ok(`${key}: one short line (${e.body.length} letters)`, e.body.length > 0 && e.body.length <= EMPTY_LIMITS.body)
  ok(`${key}: no placeholder left in`, !/\{|\}|undefined|TODO/.test(`${e.title} ${e.body}`))
  if (e.action) {
    const to = e.action.to.split('?')[0]
    ok(`${key}: "${e.action.label}" opens ${to}, a real screen`, routes.has(to) && e.action.label.length <= EMPTY_LIMITS.label)
  }
  const kidSide = key.startsWith('kid')
  if (!kidSide) ok(`${key}: a parent always gets a next step`, Boolean(e.action))
  if (kidSide && e.action) ok(`${key}: a child's next step stays on the child's side`, e.action.to.startsWith('/kid'))
}
// Every screen that shows an empty state names one that exists.
const screens = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? screens(`${dir}/${d.name}`) : d.name.endsWith('.jsx') ? [`${dir}/${d.name}`] : []))
const used = new Set()
for (const file of screens('src')) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/<EmptyNext[^>]*which=(?:"([^"]+)"|\{([^}]+)\})/g)) {
    const names = m[1] ? [m[1]] : [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
    names.forEach((n) => used.add(n))
  }
}
const unknown = [...used].filter((n) => !EMPTY_STATES[n])
ok(`the screens use ${used.size} empty states, all of them defined`, used.size >= 6 && unknown.length === 0, unknown.join(', '))
for (const key of ['noKids', 'review', 'history', 'money', 'kidQuests', 'kidRewards']) {
  ok(`"${key}" is on a screen`, used.has(key))
}

console.log('\n=== The demo family: made up, fixed, and inert ===')
const demo = buildDemoFamily()
ok('flagged as the demo', demo.demo === true)
ok(`its family is ${DEMO_NAMES.family}, with ${DEMO_NAMES.parent} as the parent`,
  demo.family.name === DEMO_NAMES.family && demo.family.parentName === DEMO_NAMES.parent)
ok(`its children are only ${DEMO_NAMES.kids.join(' and ')}`,
  demo.kids.map((k) => k.name).sort().join() === [...DEMO_NAMES.kids].sort().join(), demo.kids.map((k) => k.name).join())
ok('built the same way every time', buildDemoFamily().kids.map((k) => k.name).join() === demo.kids.map((k) => k.name).join())
const json = JSON.stringify(demo)
ok('no email address anywhere in it', !/[\w.+-]+@[\w-]+\.[\w.]+/.test(json))
ok('never synced, nothing queued to send', !demo.lastSyncedAt && demo.syncQueue.length === 0 && demo.noticeQueue.length === 0)
ok('no photo kept anywhere in it', !/data:image|photoUrl|photo_url/.test(json))
const waiting = demo.submissions.find((x) => x.status === 'pending')
const demoAva = demo.kids.find((k) => k.name === 'Ava')
ok('one chore waiting, Ava\'s', Boolean(waiting) && waiting.kidId === demoAva.id)
const accepted = run(demo, { type: 'APPROVE_SUBMISSION', submissionId: waiting.id, sticker: 'proud' })
const after = accepted.kids.find((k) => k.id === demoAva.id)
ok(`accepting it levels Ava up (${levelFromXp(demoAva.xp).level} → ${levelFromXp(after.xp).level})`,
  levelFromXp(after.xp).level > levelFromXp(demoAva.xp).level && accepted.pendingLevelUp?.kidId === demoAva.id)
const cheapest = Math.min(...demo.rewards.map((r) => r.cost))
ok('and she has enough to spend on a reward', after.coins >= cheapest, `${after.coins} for ${cheapest}`)

console.log('\n=== With the network paused, nothing reaches fetch ===')
const sent = []
globalThis.fetch = async (url) => { sent.push(String(url)); return new Response('{}', { status: 200 }) }
globalThis.window = globalThis.window || { location: { origin: 'http://localhost', search: '', href: 'http://localhost/' } }
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { transport, freshAccessToken } = await import('../src/lib/sync/transport.js')
const { startCheckout, startGiftCheckout, redeemGift } = await import('../src/lib/billing.js')
const { requestPilot } = await import('../src/lib/schools.js')
const { sendQuote } = await import('../src/lib/districts.js')

transport.pauseNetwork(true)
ok('the switch says it is on', transport.isNetworkPaused())
ok('a read from the database answers nothing', (await transport.rpc('billing_status', {})) === null)
ok('a write to the database is refused, not faked', await transport.upsert('quests', { id: 'x' }).then(() => false, (e) => e.name === 'NetworkPaused'))
ok('an anonymous count is not sent', (await transport.anonymousRpc('count_help_view', {})) === null)
ok('no sign-in token is handed out', (await freshAccessToken()) === null)
ok('checkout (Stripe) goes nowhere', (await startCheckout('elite')).ok === false)
ok('a gift\'s checkout (Stripe, no sign-in) says it is the demo',
  (await startGiftCheckout({ plan: 'elite', delivery: 'email', email: 'buyer@example.com' })).reason === 'demo')
ok('redeeming a gift goes nowhere', (await redeemGift('ABCDE-FGHIJ')).ok === false)
ok('a pilot request is not sent', (await requestPilot({ school: 'Test School', name: 'Test', email: 'office@example.com' })).reason === 'demo')
ok('a district\'s quote is not sent', (await sendQuote({ district: 'Test District', name: 'Test', email: 'office@example.com', schools: 3 })).reason === 'demo')
ok(`and in all of that, fetch was called ${sent.length} times`, sent.length === 0, sent.join(' | '))
transport.pauseNetwork(false)

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
