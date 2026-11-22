/**
 * Pilot's RankUp tools, and where Pilot may be, in Node against the app's
 * own reducer and the shared core's own engine.
 *
 *   - every tool is offered by the core's engine, the five read tools and
 *     five change tools exactly, and none has a name for what Pilot must
 *     never do (the plan, buying, Flash Tickets, Pause and limits, deleting,
 *     removing a child, phones, messages);
 *   - a change runs only after Allow: with Cancel the family is untouched;
 *     with Allow it is the same reducer action the parent's own button sends
 *     (a chore from Assign, Accept and Send back from Review, a reward from
 *     Settings, the starter chores from "Getting started");
 *   - Pilot can dispatch those four actions and nothing else;
 *   - what reaches the AI: first names and chore titles, never an id, an
 *     age, accessibility notes or anything a child wrote; names on the
 *     screen are taken out of "Explain this screen";
 *   - Pilot is shown on the parent's screens and the public pages, and on no
 *     child's screen or child's phone in any state, and its config refuses to
 *     mount there (the second lock);
 *   - the knowledge pack has the real facts, with the plan list's prices.
 *
 * Pure Node: no browser, no database.   node tests/pilottools.mjs
 */
import { readFileSync } from 'node:fs'
import { reducer } from '../src/state/reducer.js'
import { createInitialState, TIERS, TRIAL_DAYS } from '../src/state/initialState.js'
import { buildDemoFamily } from '../src/lib/demoFamily.js'
import { blankQuest } from '../src/lib/questDraft.js'
import { priceWords } from '../src/lib/plans.js'
import { FLASH_TICKET_PACKS } from '../src/lib/billing.js'
import { rankUpTools, pilotDispatch, PILOT_ACTIONS, RANKUP_FORBIDDEN } from '../src/pilot/pilotTools.js'
import { knowledge, STRENGTHS } from '../src/pilot/pilotKnowledge.js'
import { pilotRoute, childMayHaveIt, childsPhone, pilotShows, updatePilot, markKidScreen, markParentScreen } from '../src/lib/pilotGate.js'
import { privateNames, withoutNames, connect, _test as bridgeTest } from '../src/pilot/pilotRankUp.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

// The shared core, run the way the copied core tests run it.
function load(file) {
  const m = { exports: {} }
  new Function('module', 'exports', readFileSync(file, 'utf8'))(m, m.exports)
  return m.exports
}
const Store = load('public/pilot/pilot-store.js')
const Providers = load('public/pilot/pilot-providers.js')
globalThis.PilotProviders = Providers
const Engine = load('public/pilot/pilot-engine.js')

/** The app, as the tools see it: the real reducer over a real family. */
function appFor(state, { parent = true } = {}) {
  const app = {
    state,
    sent: [],
    getState: () => app.state,
    dispatch: (action) => { app.sent.push(action.type); app.state = reducer(app.state, action) },
    shows: () => true,
    inParentMode: () => parent,
    screen: () => ({ name: 'Parent dashboard (Home)', facts: '2 children in the family.' }),
    screenText: () => withoutNames('Parent dashboard\nAva level 4\nNoah level 2\nThe Rivera Family', privateNames(app.state)),
  }
  return app
}
const demo = () => buildDemoFamily()
const toolsOf = (app) => Object.fromEntries(rankUpTools(app).map((t) => [t.name, t]))

console.log('\n=== The tools, as the core offers them ===')
let app = appFor(demo())
let tools = toolsOf(app)
const READS = ['whats_waiting_for_review', 'how_is_child_doing', 'rewards_set_up', 'explain_this_screen', 'what_elite_adds']
const CHANGES = ['add_chore', 'accept_chore', 'send_chore_back', 'add_reward', 'add_starter_chores']
ok('the five read tools', JSON.stringify(Object.values(tools).filter((t) => t.kind === 'read').map((t) => t.name)) === JSON.stringify(READS))
ok('and the five change tools, nothing else', JSON.stringify(Object.values(tools).filter((t) => t.kind === 'change').map((t) => t.name)) === JSON.stringify(CHANGES))
ok('the core\'s engine accepts every one', Object.values(tools).every((t) => Engine.checkTool(t)))
ok('every change says in words what it will do, for its card', Object.values(tools).filter((t) => t.kind === 'change').every((t) => typeof t.describe === 'function'))
ok('none is named for anything Pilot must never do', Object.keys(tools).every((n) => !RANKUP_FORBIDDEN.test(n) && !Engine.FORBIDDEN.test(n)))
const NEVER = ['change_plan', 'upgrade_to_elite', 'buy_flash_tickets', 'flash_ticket_pack', 'pause_child', 'set_limits', 'take_back_coins',
  'lock_out_child', 'apply_override', 'delete_chore', 'remove_child', 'pair_device', 'unlink_phone', 'link_child_phone', 'send_message_to_parent',
  'message_child', 'invite_family', 'redeem_gift', 'refund_payment', 'cancel_subscription']
const offered = NEVER.filter((name) => Engine.checkTool({ name, kind: 'change', describe: () => 'x', run: () => {} }) && !RANKUP_FORBIDDEN.test(name))
ok(`a tool for any of ${NEVER.length} forbidden things would be refused by name`, offered.length === 0, offered.join(', '))
const app2 = appFor(demo(), { parent: false })
ok('away from Parent Mode no family tool is available', Object.values(toolsOf(app2)).filter((t) => t.available()).map((t) => t.name).join() === 'explain_this_screen,what_elite_adds')

console.log('\n=== A change only after Allow ===')
function engineFor(appUnder, { replies, allow }) {
  const store = Store.create({ prefix: 'rk', local: memory(), session: memory() })
  store.saveSettings({ provider: 'anthropic', key: 'test-key', model: 'test-model' })
  const sent = []
  const asked = []
  const providers = { ...Providers, chat: async (s, req) => { sent.push(req); return { raw: {}, toolCalls: [], stop: 'done', ...replies.shift() } } }
  const host = { confirm: async (label) => { asked.push(label); return allow }, plan: async () => (allow ? 'all' : 'cancel') }
  const engine = Engine.create({ store, providers, host, config: { appName: 'RankUp', tools: () => rankUpTools(appUnder), kidView: () => false,
    knowledge: 'guide', strengths: [], screen: () => ({ name: 'Home' }) } })
  return { engine, sent, asked }
}
function memory() { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) } }

app = appFor(demo())
const quests = app.state.quests.length
let run = engineFor(app, { allow: false, replies: [{ toolCalls: [{ id: '1', name: 'add_chore', args: { child: 'Ava', title: 'Feed the dog', difficulty: 'easy' } }] }, { text: 'OK' }] })
await run.engine.send('Add a chore for Ava: feed the dog')
ok('the card says exactly what will happen', run.asked[0] === 'Add the chore “Feed the dog” for Ava (15 XP)', run.asked[0])
ok('Cancel: nothing changed, nothing dispatched', app.state.quests.length === quests && app.sent.length === 0)
run = engineFor(app, { allow: true, replies: [{ toolCalls: [{ id: '1', name: 'add_chore', args: { child: 'ava', title: 'Feed the dog', difficulty: 'easy' } }] }, { text: 'Done' }] })
await run.engine.send('Add a chore for Ava: feed the dog')
const added = app.state.quests.find((q) => q.title === 'Feed the dog')
const ava = app.state.kids.find((k) => k.name === 'Ava')
ok('Allow: the chore is on Ava\'s list', added && added.kidId === ava.id && added.xp === 15 && added.status === 'assigned')
ok('made by the same ADD_QUESTS the Assign screen sends, with its fields', app.sent.join() === 'ADD_QUESTS'
  && Object.keys(blankQuest('x', false)).every((k) => k in added))
const toolResult = run.sent[1].messages.find((m) => m.role === 'tool').results[0].content
ok('the AI is told what was done, in first names and titles', /Feed the dog/.test(toolResult) && /Ava/.test(toolResult) && !/kid_|q_|"id"/.test(toolResult), toolResult)

app = appFor(demo())
run = engineFor(app, { allow: true, replies: [{ toolCalls: [{ id: 'p', name: 'pilot_plan', args: { steps: [
  { tool: 'add_reward', args: { name: 'Pancake breakfast', cost: 80, each_child_per_week: 1 } },
  { tool: 'add_starter_chores', args: { child: 'Noah' } }] } }] }, { text: 'Done' }] })
await run.engine.send('Add a reward and the starter chores for Noah')
ok('several changes are one plan, approved first', app.sent.join() === 'ADD_REWARD,ADD_QUESTS', app.sent.join())
const reward = app.state.rewards.find((r) => r.name === 'Pancake breakfast')
ok('the reward is in the catalogue with its cost and weekly limit', reward && reward.cost === 80 && reward.weeklyLimit === 1)

console.log('\n=== Review: accept, and send back with a note ===')
app = appFor(demo())
tools = toolsOf(app)
const waiting = await tools.whats_waiting_for_review.run({})
ok('what\'s waiting: the child, the chore, what it pays', waiting.count >= 1 && waiting.waiting[0].child && waiting.waiting[0].chore && waiting.waiting[0].pays.xp > 0, JSON.stringify(waiting))
const first = waiting.waiting[0]
const kidBefore = app.state.kids.find((k) => k.name === first.child)
ok('the card names it', /^accept \w+'s “.+” \(\+\d+ XP, \d+ coins\)$/.test(tools.accept_chore.describe({ chore: first.chore, child: first.child })),
  tools.accept_chore.describe({ chore: first.chore, child: first.child }))
const accepted = await tools.accept_chore.run({ chore: first.chore, child: first.child })
const kidAfter = app.state.kids.find((k) => k.name === first.child)
ok('accepting pays the XP, through APPROVE_SUBMISSION', accepted.done && app.sent.join() === 'APPROVE_SUBMISSION' && kidAfter.xp === kidBefore.xp + first.pays.xp, JSON.stringify(accepted))
const again = await tools.accept_chore.run({ chore: first.chore, child: first.child })
ok('and never twice', Boolean(again.error), JSON.stringify(again))
// Something to send back: Noah finishes one.
const noah = app.state.kids.find((k) => k.name === 'Noah')
const open = app.state.quests.find((q) => q.kidId === noah.id && q.status === 'assigned')
app.state = reducer(app.state, { type: 'SUBMIT_QUEST', submission: { questId: open.id, kidId: noah.id, note: 'I did my best!', onTime: true } })
ok('send back: the card quotes the note', tools.send_chore_back.describe({ chore: open.title, note: 'Corners too' }) === `send Noah's “${open.title}” back to redo, with the note “Corners too”`)
const back = await tools.send_chore_back.run({ chore: open.title, child: 'Noah', note: 'Corners too' })
const redo = app.state.quests.find((q) => q.id === open.id)
ok('sent back through REJECT_SUBMISSION, with the note on the chore', back.done && redo.status === 'redo' && redo.redoNote === 'Corners too')
ok('a chore that is not waiting is not found', Boolean((await tools.accept_chore.run({ chore: 'Paint the moon' })).error))
ok('an unknown child is answered with the real first names only', /Ava, Noah/.test((await tools.how_is_child_doing.run({ child: 'Zed' })).error || ''))

console.log('\n=== Pilot can do these four things, and nothing else ===')
ok('the four actions', JSON.stringify(PILOT_ACTIONS) === JSON.stringify(['ADD_QUESTS', 'APPROVE_SUBMISSION', 'REJECT_SUBMISSION', 'ADD_REWARD']))
app = appFor(demo())
const kid = app.state.kids[0]
const REFUSED = [
  { type: 'SET_TIER', tier: 'elite' }, { type: 'GRANT_FLASH_TICKETS', count: 5 }, { type: 'BUY_SKIN', kidId: kid.id, skinId: 'ember' },
  { type: 'CLAIM_SKIN_WITH_TICKET', kidId: kid.id, skinId: 'ember' }, { type: 'APPLY_OVERRIDE', kidId: kid.id, kind: 'red', reason: 'x' },
  { type: 'LIFT_OVERRIDE', kidId: kid.id }, { type: 'DELETE_QUEST', questId: app.state.quests[0].id }, { type: 'DELETE_REWARD', rewardId: app.state.rewards[0]?.id },
  { type: 'REMOVE_KID', kidId: kid.id }, { type: 'UNLINK_KID_DEVICE', kidId: kid.id }, { type: 'ADOPT_PAIRED_KID', kid: { id: 'x', name: 'X' } },
  { type: 'START_PAIRING', record: {} }, { type: 'POST_GUILD_MESSAGE', text: 'hi' }, { type: 'INVITE_MATE', name: 'X' }, { type: 'ADD_NOTE', note: {} },
  { type: 'REDEEM_REWARD', kidId: kid.id, rewardId: app.state.rewards[0]?.id }, { type: 'RECORD_MONEY', kidId: kid.id, pence: -100 },
  { type: 'UPDATE_KID', kidId: kid.id, patch: { coins: 0 } }, { type: 'SET_ROLE', role: 'kid' }, { type: 'UNLOCK_PARENT' }, { type: 'SIGN_OUT' },
  { type: 'RESET' }, { type: 'SET_FAMILY_CURRENCY', currency: 'GBP' }, { type: 'UPDATE_FAMILY', patch: { pin: '0000' } },
]
const before = app.state
const slipped = REFUSED.filter((action) => { try { pilotDispatch(app, action); return true } catch { return false } }).map((a) => a.type)
ok(`all ${REFUSED.length} other actions are refused (plan, buying, tickets, pauses, deleting, removing, phones, messages…)`, slipped.length === 0, slipped.join(', '))
ok('and the family is exactly as it was', app.state === before && app.sent.length === 0)
const offModeApp = appFor(demo(), { parent: false })
ok('out of Parent Mode a change refuses even if called', Boolean((await toolsOf(offModeApp).add_chore.run({ title: 'x' })).error) && offModeApp.sent.length === 0)

console.log('\n=== What reaches the AI ===')
app = appFor(demo())
app.state = reducer(app.state, { type: 'UPDATE_KID', kidId: app.state.kids[0].id, patch: { accessibility: { hasNeeds: true, notes: 'private note about needs', supports: [] } } })
{
  const k = app.state.kids[0]
  const q = app.state.quests.find((x) => x.kidId === k.id && x.status === 'assigned')
  app.state = reducer(app.state, { type: 'SUBMIT_QUEST', submission: { questId: q.id, kidId: k.id, note: 'words the child typed', onTime: true } })
}
tools = toolsOf(app)
const outputs = []
for (const t of Object.values(tools).filter((x) => x.kind === 'read')) outputs.push(JSON.stringify(await t.run({ child: 'Ava' })))
const all = outputs.join('\n')
const ids = [...app.state.kids.map((k) => k.id), ...app.state.quests.map((q) => q.id), ...app.state.submissions.map((s) => s.id), app.state.family.id]
ok('no id of any child, chore, submission or family', !ids.some((id) => id && all.includes(id)))
ok('no accessibility notes, ages, photos or devices', !/private note about needs|"age"|birth|photo|device|paired/i.test(all))
ok('nothing a child wrote', !all.includes('words the child typed') && /waiting/.test(all))
ok('first names and chore titles are there, as asked', /Ava/.test(all) && new RegExp(app.state.quests[0].title.replace(/[()]/g, '.')).test(all))
const screenOut = await tools.explain_this_screen.run({})
ok('"Explain this screen" sends no child\'s or family\'s name', !/Ava|Noah|Rivera/.test(JSON.stringify(screenOut)) && /\[name\]/.test(screenOut.words_on_screen), JSON.stringify(screenOut))
ok('names inside words are left alone (Ava is not "Avalanche")', withoutNames('Avalanche Ava, ava!', ['Ava']) === 'Avalanche [name], [name]!')
ok('names in any alphabet', withoutNames('Zoë · Søren', ['Zoë', 'Søren']) === '[name] · [name]')
const names = privateNames({ kids: [{ name: 'Ava' }], family: { name: 'The Rivera Family', parentName: 'Sam' }, pendingPairing: { kidName: 'Mia' } })
ok('the private names are the children, the family and the parent, and each word of the family name', ['Ava', 'Mia', 'The Rivera Family', 'Rivera', 'Sam'].every((n) => names.includes(n)))

console.log('\n=== Where Pilot is, and is not ===')
const parentState = demo()
const visitor = createInitialState()
const KID_ROUTES = ['/kid', '/kid/quests', '/kid/quest/q_1', '/kid/guild', '/kid/shop', '/kid/market', '/kid/arcade', '/kid/profile',
  '/kid/story/ember', '/kid/dragon', '/kid/school', '/kid/leaderboards', '/kid/genesis', '/switch', '/', '/legal/privacy', '/operator']
const PARENT_ROUTES = ['/parent', '/parent/approvals', '/parent/assign?kid=x', '/parent/kids', '/parent/settings', '/parent/plan', '/parent/pair',
  '/parent/override', '/parent/money', '/parent/history', '/parent/help', '/parent/redeem']
const PUBLIC = ['/gift', '/gift/card', '/school', '/school/help', '/school/report', '/district']
const shows = (state, route) => { updatePilot({ state, route, dispatch: () => {} }); return pilotShows() }
ok('on every parent screen in Parent Mode', PARENT_ROUTES.every((r) => shows(parentState, r)))
ok('on the plan, gift and schools pages, for a parent in Parent Mode', ['/parent/plan', ...PUBLIC].every((r) => shows(parentState, r)))
ok('on the public pages, for a visitor', PUBLIC.every((r) => shows(visitor, r)))
ok('never on the front door, where nobody has said whose phone it is (0.26.0)', ['/welcome', '/'].every((r) => !shows(visitor, r)))
ok('nor on a phone nobody has linked or set up yet, before a role is chosen', !shows(createInitialState(), '/welcome') && !pilotRoute('/welcome', visitor))
markParentScreen(1)
ok('after "I\'m a parent": on the family\'s own set-up screens', shows(visitor, '/welcome') && pilotRoute('/welcome', visitor, true))
markKidScreen(1)
ok('but a child\'s set-up screen still wins', !shows(visitor, '/welcome'))
markKidScreen(-1)
markParentScreen(-1)
ok('back on the front door (choosing a role again): gone', !shows(visitor, '/welcome'))
ok('on no child\'s screen, even with Parent Mode open', KID_ROUTES.every((r) => !shows(parentState, r)), KID_ROUTES.filter((r) => shows(parentState, r)).join(', '))
ok('nor a visitor on the child\'s routes, legal pages or the operator page', ['/kid', '/kid/quests', '/legal/terms', '/operator'].every((r) => !shows(visitor, r)))
const handedToAva = reducer(parentState, { type: 'SET_ROLE', role: 'kid', kidId: parentState.kids[0].id })
const locked = reducer(parentState, { type: 'LOCK_PARENT' })
const kidPhone = reducer(createInitialState(), { type: 'LINKED_BY_CODE', kid: { id: 'kid_1', name: 'Ava', themeId: 'blockcraft' }, familyName: 'Fam', real: false })
const settingUp = reducer(createInitialState(), { type: 'START_PAIRING', record: { code: '123456', kidName: 'Ava', themeId: 'blockcraft', createdAt: Date.now() } })
const unlinked = reducer(kidPhone, { type: 'DEVICE_WIPED', reason: 'unlinked' })
const kidPhoneHalf = { ...createInitialState(), device: { role: 'kid', linkedKidId: null } }
const STATES = [
  ['after "Hand to Ava" (the demo\'s child view too)', handedToAva],
  ['with Parent Mode locked (the PIN screen, a child holding a shared phone)', locked],
  ["on a child's phone, set up", kidPhone],
  ["on a phone being set up as a child's (showing its code)", settingUp],
  ["on a phone unlinked from being a child's", unlinked],
  ["on a phone marked a child's before anything else", kidPhoneHalf],
]
for (const [label, state] of STATES) {
  const anywhere = [...PARENT_ROUTES, ...PUBLIC, '/welcome', '/', ...KID_ROUTES].filter((r) => shows(state, r))
  ok(`never ${label}, on any route`, anywhere.length === 0 && childMayHaveIt(state), anywhere.join(', '))
}
markParentScreen(1)
ok('a child\'s phone (set up, being set up, unlinked) never shows it, even on a parent\'s set-up screen',
  [kidPhone, settingUp, unlinked, kidPhoneHalf].every((st) => !shows(st, '/welcome') && !shows(st, '/')))
markParentScreen(-1)
ok('a child\'s phone is known as one in each of those states', [kidPhone, settingUp, unlinked, kidPhoneHalf].every(childsPhone) && !childsPhone(parentState))
markKidScreen(1)
ok('and never while a child\'s set-up screen is open (no state says so yet)', !shows(visitor, '/gift') && !shows(visitor, '/welcome'))
markKidScreen(-1)
ok('the gift page again once it closes, but still not the front door', shows(visitor, '/gift') && !shows(visitor, '/welcome'))
ok('the route check alone: never a child\'s route', ['/kid', '/kid/shop', '/switch'].every((r) => !pilotRoute(r, parentState)))
ok('the parent area needs a family', !pilotRoute('/parent', visitor) && pilotRoute('/parent', parentState))

console.log('\n=== The config refuses to mount on a child\'s view (the second lock) ===')
const config = bridgeTest.config
updatePilot({ state: handedToAva, route: '/parent', dispatch: () => {} })
ok('kidView is true after "Hand to Ava", even on a parent route', config.kidView() === true)
updatePilot({ state: parentState, route: '/kid', dispatch: () => {} })
ok('and on a child\'s route in Parent Mode', config.kidView() === true)
updatePilot({ state: parentState, route: '/parent', dispatch: () => {} })
ok('false in Parent Mode on a parent screen', config.kidView() === false)
const mounts = []
globalThis.window = { Pilot: { mount: (c) => { mounts.push(c.kidView()); return !c.kidView() } }, PilotStore: {}, PilotMascot: {} }
updatePilot({ state: kidPhone, route: '/kid', dispatch: () => {} })
connect()
ok('start() does not mount Pilot on a child\'s phone', window.RankUpPilot.start() === false && mounts.length === 0)
delete globalThis.window
ok('the engine offers no tools when kidView is true', (() => {
  const e = Engine.create({ store: Store.create({ prefix: 'k', local: memory(), session: memory() }), providers: Providers, host: {},
    config: { tools: () => rankUpTools(appFor(demo())), kidView: () => true } })
  return e.tools().length === 0
})())
ok('the storage prefix is RankUp\'s own', config.storagePrefix === 'rankup-pilot')
ok('the window says "Pilot" and RankUp\'s own tagline (0.28.0)', config.name === 'Pilot' && config.tagline === "Your family's chore helper")
ok('the AI keys are for grown-ups line', /AI keys are for grown-ups \(the AI companies require 18\+\)/.test(config.keyNote))
ok('and one plain sentence first: what an AI key is, and where a grown-up gets one (0.26.0)',
  /^An AI key is a private code a grown-up makes in the "API keys" part of an AI company's website/.test(config.keyNote)
  && !/\b(token|endpoint|BYOK|model)\b/i.test(config.keyNote))
console.log('\n=== The suggestions, RankUp\'s own first (0.26.0) ===')
for (const r of ['/parent', '/parent/approvals', '/parent/assign', '/parent/kids', '/parent/settings', '/parent/plan', '/parent/money', '/parent/help']) {
  updatePilot({ state: parentState, route: r, dispatch: () => {} })
  const labels = bridgeTest.chips().map((c) => c.label)
  ok(`${r}: "What's waiting for me?" and "Add a chore for…" lead, then one for the screen`,
    labels[0] === "What's waiting for me?" && labels[1] === 'Add a chore for…' && labels.length === 3 && !/Explain this screen/.test(labels[2]), labels.join(' | '))
}

console.log('\n=== The knowledge pack ===')
const guide = knowledge()
for (const t of [TIERS.starter, TIERS.standard, TIERS.elite]) {
  ok(`${t.name} with its price from the plan list`, guide.includes(t.name) && (t.price === 0 || (guide.includes(priceWords(t)) && guide.includes(priceWords(t, 'year')))))
}
ok(`the ${TRIAL_DAYS}-day trial, from TRIAL_DAYS`, guide.includes(`${TRIAL_DAYS} days of ${TIERS.elite.name} free`))
ok('Flash Tickets with their packs from the price list', FLASH_TICKET_PACKS.every((p) => guide.includes(`${p.tickets} for $${p.price.toFixed(2)}`)))
for (const fact of ['Review', 'Accept', 'Send back', 'XP', 'level', 'coins', 'rewards', 'Pocket money', 'Pocket money is shown in', 'Link a kid\'s device',
  'Pause and limits', 'Sunday Market', 'Flash Tickets', 'Founding Families', 'Season', 'Founding Season badge', 'gift', 'first name', 'No photos',
  'never on a child', 'Starter', 'Elite Pass']) {
  ok(`it covers: ${fact}`, guide.toLowerCase().includes(fact.toLowerCase()))
}
ok('the parent help page\'s answers are in it word for word', guide.includes('How do I link my child\'s phone?') && guide.includes('What do the plans cost?'))
ok('no family\'s data: the guide is the same for everyone', !/Rivera|Ava|Noah/.test(guide))
ok(`"why RankUp": ${STRENGTHS.length} true strengths`, STRENGTHS.length >= 8 && STRENGTHS.every((s) => s.length > 30))
ok('no invented statistics in them (no percentages or "x times" claims)', STRENGTHS.every((s) => !/\d+\s*%|\d+x\b|\bbest\b|#1|number one/i.test(s)))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
