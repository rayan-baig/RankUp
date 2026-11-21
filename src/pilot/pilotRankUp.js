/**
 * Pilot on RankUp: the per-app config (docs/PILOT.md, and the MTRX Horizyn
 * site's docs/PILOT.md for the shared core).
 *
 * Fetched by lib/pilotGate.js only once Pilot is allowed on the screen and
 * the page has loaded, so it is never on a child's phone and never part of
 * the first load. It:
 *
 *   - adds the core's one script tag (public/pilot/, core 1.1.0, copied
 *     unchanged from the MTRX Horizyn site), which
 *     then loads public/pilot-rankup.js, which calls start() here;
 *   - mounts Pilot with RankUp's config: who is using it, which screen, the
 *     suggestions, and kidView, which refuses whenever the gate says no (the
 *     second lock: Pilot.mount refuses on it, and the engine offers no tools);
 *   - takes the robot off the page the moment Pilot is not allowed (leaving
 *     Parent Mode, "Hand to Ava") and puts it back when it is;
 *   - forgets the chat, the memory and any key kept for this tab only when
 *     the family on this phone changes (signing out, deleting the account,
 *     leaving the demo). A key the parent chose to remember stays.
 *
 * The knowledge pack and the tools are in pilotKnowledge.js and
 * pilotTools.js; public/pilot-rankup-pack.js hands them to the core when
 * Pilot is first opened.
 */
import { pilotShows, pilotSnapshot, childsPhone } from '../lib/pilotGate.js'
import { PILOT_COMPATIBLE_HOSTS, PILOT_LOCAL_HOSTS } from '../lib/pilotHosts.js'
import { APP_VERSION } from '../lib/version.js'
import { transport } from '../lib/sync/transport.js'
import { TIERS } from '../state/initialState.js'
import { isElite } from '../state/reducer.js'
import { rankUpTools } from './pilotTools.js'
import { knowledge, STRENGTHS } from './pilotKnowledge.js'

export const STORAGE_PREFIX = 'rankup-pilot'
const ACCOUNT_MARK = `${STORAGE_PREFIX}-account`

/* The core's files, as the one script tag names them (docs/PILOT.md). */
const CORE_FILES = {
  store: 'pilot/pilot-store.js',
  mascot: 'pilot/pilot-mascot.js',
  app: 'pilot-rankup.js',
  pack: 'pilot-rankup-pack.js',
  css: 'pilot/pilot.css',
  panelCss: 'pilot/pilot-panel.css',
  robot: 'pilot/pilot-robot-128.webp',
  robot2x: 'pilot/pilot-robot-256.webp',
  render: 'pilot/pilot-render.js',
  providers: 'pilot/pilot-providers.js',
  engine: 'pilot/pilot-engine.js',
  media: 'pilot/pilot-media.js',
  panel: 'pilot/pilot-panel.js',
  // The moving robot (core 1.1.0), fetched by the core once the page is idle
  // and never under "reduce motion".
  motion: 'pilot/pilot-motion.js',
  actor: 'pilot/pilot-actor.js',
  actorCss: 'pilot/pilot-actor.css',
  restBody: 'pilot/pilot-rest-body.webp',
  restHead: 'pilot/pilot-rest-head.webp',
  restEyes: 'pilot/pilot-rest-eyes.webp',
}

/* The pose pictures in public/pilot/poses/ (tests/pilot.mjs checks the list
   matches the folder), each fetched only when a move first needs it. */
export const POSES = [
  'arms-crossed', 'celebrate', 'climb1', 'flip', 'fly', 'kick', 'land', 'love', 'point', 'power', 'run1', 'sitting', 'slide', 'standing', 'tennis', 'throw', 'walk1', 'wave',
]

/* The moving robot's files: left out under RankUp's own "Reduce motion". */
const MOVING = ['motion', 'actor', 'actorCss', 'restBody', 'restHead', 'restEyes']

const route = () => String(pilotSnapshot()?.route || '').split('?')[0]
const reduceMotion = () => Boolean(pilotSnapshot()?.state?.settings?.reduceMotion)
const state = () => pilotSnapshot()?.state || {}
const shows = () => pilotShows()
const inParentMode = () => shows() && route().startsWith('/parent')

// ---------------------------------------------------------------- the screen

const SCREENS = {
  '/parent': 'Parent dashboard (Home)',
  '/parent/approvals': 'Review: finished chores waiting to be accepted or sent back',
  '/parent/assign': 'Assign: add chores (quests) for a child',
  '/parent/kids': "Kids: the children's profiles",
  '/parent/settings': 'Settings',
  '/parent/plan': `The plan screen (${TIERS.starter.name}, ${TIERS.standard.name}, ${TIERS.elite.name})`,
  '/parent/pair': "Link a kid's device (pairing with a code)",
  '/parent/override': `Pause and limits (${TIERS.elite.name})`,
  '/parent/blueprint': `Behaviour Blueprints (${TIERS.elite.name})`,
  '/parent/alliance': `Parent Alliances (${TIERS.elite.name})`,
  '/parent/school': 'The School League, for this family',
  '/parent/guilds': 'Guilds',
  '/parent/leaderboards': 'Leaderboards (Adventure and Arena)',
  '/parent/redeem': 'Redeem a gift',
  '/parent/help': 'Help',
  '/parent/history': 'Chore history',
  '/parent/money': 'Pocket money',
  '/parent/genesis': "Theme Genesis (a child's own theme)",
  '/gift': 'Give RankUp: a year of RankUp as a gift',
  '/gift/card': 'A printable RankUp gift card',
  '/school': 'The School League, for teachers and principals',
  '/school/help': 'School League help',
  '/school/report': "A school's trial report, for its office",
  '/district': 'School districts: one plan for many schools',
}

function screen() {
  const r = route()
  const s = state()
  const name = SCREENS[r] || (r === '/welcome' || r === '/' ? "RankUp's front door (not signed in)" : document.title)
  const facts = []
  if (!s.onboarded) facts.push('The person is not signed in: a parent or a visitor reading about RankUp.')
  else {
    facts.push('The person is a parent in Parent Mode (after their PIN).')
    if (s.demo) facts.push('This is the demo family (pretend children): nothing is saved to a server and nothing is charged.')
    const plan = TIERS[s.family?.tier] || TIERS.starter
    const trial = s.family?.trialEndsAt && s.family.trialEndsAt > Date.now()
    facts.push(`Plan: ${plan.name}${trial ? `, with the ${TIERS.elite.name} free trial until ${new Date(s.family.trialEndsAt).toLocaleDateString()}` : ''}${isElite(s) ? ` (${TIERS.elite.name} features are on)` : ''}.`)
    const kids = (s.kids || []).length
    facts.push(`${kids} ${kids === 1 ? 'child' : 'children'} in the family.`)
    const waiting = (s.submissions || []).filter((x) => x.status === 'pending').length
    if (waiting) facts.push(`${waiting} finished ${waiting === 1 ? 'chore is' : 'chores are'} waiting in Review.`)
  }
  return { name, facts: facts.join('\n') }
}

const C = (label, prompt) => ({ label, prompt })
function chips() {
  const r = route()
  if (!state().onboarded && (r === '/welcome' || r === '/')) {
    return [C('How does RankUp work?', 'In plain words, how does RankUp work for a family?'),
      C('What do the plans cost?', 'What do the RankUp plans cost, and what does each give?'),
      C('Is it safe for my kids?', 'What does RankUp keep about my children, and what does it never do?')]
  }
  if (r === '/gift' || r === '/gift/card') return [C('How does a gift work?', 'How does giving a year of RankUp work?'), C('Which plan to give?', 'What is the difference between the plans I can give?')]
  if (r.startsWith('/school') || r === '/district') return [C('What is the School League?', 'What is the School League, and what does a school see?'), C('Is it safe for students?', 'What does a school see about its students on RankUp?')]
  if (r === '/parent/approvals') return [C("What's waiting?", "What's waiting for review?"), C('Accept one', 'Accept the oldest chore that is waiting.'), C('How does accepting work?', 'What happens when I accept or send back a chore?')]
  if (r === '/parent/assign') return [C('Add a chore', 'Add a chore: '), C('3 starter chores', 'Add the 3 starter chores.'), C('How much XP?', 'How much XP should a chore pay?')]
  if (r === '/parent/plan') return [C('What does Elite add?', `What does ${TIERS.elite.name} add?`), C('Any deals on?', 'Are there any deals on right now, and how do they work?'), C('Pause instead?', 'Can I pause my plan instead of cancelling?')]
  if (r === '/parent/settings') return [C('What rewards are set up?', 'What rewards are set up?'), C('Add a reward', 'Add a reward: '), C("Link a kid's phone", "How do I link my child's phone?")]
  if (r === '/parent/money') return [C('How does pocket money work?', 'How does pocket money work in RankUp?'), C('Change the currency', 'How do I change the money sign?')]
  if (r === '/parent/override') return [C('How do pauses work?', 'How does Pause and limits work, and what does my child see?')]
  if (r === '/parent/pair') return [C('How does pairing work?', "How does linking my child's phone with a code work?")]
  if (r === '/parent') return [C("What's waiting?", "What's waiting for review?"), C('How are the kids doing?', 'How is each of my children doing this week?'), C('What rewards are set up?', 'What rewards are set up?')]
  return [C('Explain this screen', 'Explain this screen.')]
}

function taskPrompt() {
  const r = route()
  if (r === '/parent/assign' || r === '/parent') return 'Add a chore for '
  if (r === '/parent/approvals') return "Accept the chore that's waiting from "
  if (r === '/parent/settings') return 'Add a reward: '
  return inParentMode() ? 'Help me with this screen.' : 'Help me understand RankUp: '
}

// ---------------------------------------------------------------- children's names, kept private

/* Words in a family's name that say nothing about who they are. */
const PLAIN_WORDS = new Set(['the', 'family', 'familys', "family's", 'house', 'household', 'home', 'and', 'of', 'our', 'crew', 'team', 'clan', 'gang'])

/** Every name in this family: never sent with "Explain this screen". */
export function privateNames(s = state()) {
  const whole = [
    ...(s.kids || []).map((k) => k.name),
    s.pendingPairing?.kidName,
    s.family?.name,
    s.family?.parentName,
    ...(s.adults || []).map((a) => a?.name),
  ].map((n) => String(n || '').trim()).filter((n) => n.length >= 2)
  // Each word of a family's or grown-up's name too ("The Rivera Family" is
  // also shown as "Rivera family"), apart from plain words like "family".
  const words = [s.family?.name, s.family?.parentName, ...(s.adults || []).map((a) => a?.name)]
    .flatMap((n) => String(n || '').split(/[\s'’-]+/))
    .map((w) => w.trim()).filter((w) => w.length >= 3 && !PLAIN_WORDS.has(w.toLowerCase()))
  return [...new Set([...whole, ...words])]
}

/** The text with every one of those names replaced. */
export function withoutNames(text, names) {
  let out = String(text || '')
  // Longest first, so "Ava Rose" goes before "Ava".
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${safe}(?=[^\\p{L}\\p{N}]|$)`, 'giu'), '$1[name]')
    } catch {
      out = out.split(name).join('[name]')
    }
  }
  return out
}

/*
 * What "Analyze & explain" sends: the core's outline of the screen, which
 * already skips everything marked data-pilot-private (the children's names
 * on the parent screens), with any name left over taken out as well. Never
 * empty, or the core would fall back to its own outline.
 */
function screenText() {
  const raw = window.PilotPanel && typeof window.PilotPanel.screenText === 'function' ? window.PilotPanel.screenText() : ''
  return withoutNames(raw, privateNames()).trim() || '(No other words on this screen.)'
}

// ---------------------------------------------------------------- the tools' view of the app

let waiters = []
const app = {
  getState: state,
  dispatch: (action) => pilotSnapshot()?.dispatch?.(action),
  // Resolves on the next render, so a plan's next step sees this one's change.
  settled: () => new Promise((resolve) => { waiters.push(resolve); setTimeout(resolve, 1500) }),
  shows,
  inParentMode,
  screen,
  screenText,
}

let tools = null
let guide = null
const pack = () => ({
  get knowledge() { if (!guide) guide = knowledge(); return guide },
  strengths: STRENGTHS,
  tools: () => { if (!tools) tools = rankUpTools(app); return tools },
  screenText,
})

// ---------------------------------------------------------------- mounting, hiding, forgetting

const config = {
  appName: 'RankUp',
  name: 'Pilot',
  tagline: 'Your AI copilot. Powered by you.',
  storagePrefix: STORAGE_PREFIX,
  compatibleHosts: [...PILOT_COMPATIBLE_HOSTS, ...PILOT_LOCAL_HOSTS],
  privacyUrl: '#/legal/privacy',
  keyNote: 'Pilot uses your own AI key. AI keys are for grown-ups (the AI companies require 18+).',
  audienceNote: 'The person using Pilot here is a grown-up: a parent in RankUp\'s Parent Mode (after their PIN), or a parent, grandparent or teacher reading RankUp\'s public pages. '
    + 'Children never use Pilot: it is never shown on a child\'s screen or a child\'s phone. '
    + 'RankUp is a children\'s app. Never ask for anything about a child: no surname, age, birthday, school, photo or phone. '
    + 'Refer to a child by first name only, and only when the parent used it or a tool returned it. Keep answers suitable for a family.',
  themeClass: 'rk-pilot',
  // Core 1.1.0 keeps the robot clear of these (a free corner, or tucked half
  // away): a screen marks a bar the robot must not cover with data-pilot-avoid.
  avoid: ['[data-pilot-avoid]'],
  // The second lock: true whenever the gate says no (a child's screen or
  // phone, Parent Mode locked). Pilot.mount refuses, and no tools are offered.
  kidView: () => !shows(),
  screen,
  chips,
  taskPrompt,
}

let mounted = false
let parked = null
let on = false
let watching = false

/** Called by public/pilot-rankup.js once the core has loaded, and again whenever Pilot is allowed. */
function start() {
  if (mounted || !window.Pilot || !window.PilotStore || !window.PilotMascot) return mounted
  if (!shows()) return false
  mounted = window.Pilot.mount(config) === true
  if (mounted) watch()
  return mounted
}

/* While Pilot is not allowed, its robot is not in the page: one added late
   (its stylesheet arriving after the parent left) is taken out too. */
function watch() {
  if (watching || typeof MutationObserver !== 'function') return
  watching = true
  new MutationObserver(() => { if (!on) park() }).observe(document.body, { childList: true })
}

/*
 * The moving robot (core 1.1.0) lives inside Pilot's own element, so it goes
 * wherever Pilot goes: never on a child's screen. It is also sent home and
 * kept still whenever Pilot is put away, and while RankUp's own "Reduce
 * motion" is on (the core already keeps it still for the browser's).
 */
let restingFor = null
let stillNow = null
function robotStill(still) {
  const robot = window.Pilot?.robot
  const store = window.Pilot?.store
  if (!robot || !store || still === stillNow) return
  stillNow = still
  try {
    if (still) {
      robot.settle()
      robot.actor?.idle(false)
      if (reduceMotion() && restingFor === null) {
        restingFor = store.ui().energy
        store.setUi({ energy: 'calm' })
      }
    } else {
      if (restingFor !== null) { store.setUi({ energy: restingFor }); restingFor = null }
      robot.actor?.idle(true)
      robot.reschedule?.()
    }
  } catch { /* an older core: the robot just keeps to its corner */ }
}

function park() {
  robotStill(true)
  const root = document.querySelector('.pilot-root')
  if (!root) return
  try { if (root.querySelector('.pilot-launcher')) window.Pilot?.close() } catch { /* not built yet */ }
  parked = root
  root.remove()
}

function unpark() {
  if (parked && !parked.isConnected) document.body.appendChild(parked)
  parked = null
}

function addCoreTag() {
  if (document.getElementById('pilot-core')) return
  const base = import.meta.env?.BASE_URL || '/'
  const at = (file) => `${base}${file}?v=${encodeURIComponent(APP_VERSION)}`
  const tag = document.createElement('script')
  tag.id = 'pilot-core'
  // RankUp's own "Reduce motion" setting counts like the browser's: the
  // moving robot is then never fetched, and the robot sits still.
  const still = reduceMotion()
  for (const [key, file] of Object.entries(CORE_FILES)) {
    if (still && MOVING.includes(key)) continue
    tag.dataset[key] = at(file)
  }
  if (!still) tag.dataset.poses = POSES.map((pose) => `${pose}=${at(`pilot/poses/${pose}.webp`)}`).join(' ')
  tag.dataset.hosts = config.compatibleHosts.join(' ')
  tag.src = at('pilot/pilot.js')
  document.head.appendChild(tag)
}

/** The family this tab's chat belongs to: '' for nobody (signed out, the front door). */
function accountOf(s) {
  if (!s?.onboarded || childsPhone(s)) return ''
  let user = ''
  try { user = transport.currentUserId?.() || '' } catch { user = '' }
  return `${user || 'here'}:${s.family?.id || ''}`
}

/*
 * A different family in this tab (signed out, account deleted, the demo
 * left): the last family's chat, memory and any key kept for this tab only
 * go. A key the parent ticked "Remember on this device" for stays.
 */
function checkAccount(s) {
  const now = accountOf(s)
  let before = null
  try { before = window.sessionStorage.getItem(ACCOUNT_MARK) } catch { before = null }
  if (before && before !== now) forgetFamily()
  if (before !== now) { try { window.sessionStorage.setItem(ACCOUNT_MARK, now) } catch { /* nothing kept */ } }
}

function forgetFamily() {
  const key = (k) => `${STORAGE_PREFIX}-${k}`
  let remembered = false
  try { remembered = Boolean(window.localStorage.getItem(key('settings'))) } catch { remembered = false }
  for (const [where, names] of [['sessionStorage', ['chat', 'settings', 'ui']], ['localStorage', ['chat', 'memory']]]) {
    try { names.forEach((n) => window[where].removeItem(key(n))) } catch { /* blocked */ }
  }
  // An open Pilot (in this tab or another) clears its window too, through
  // the core's own channel between tabs.
  if (typeof BroadcastChannel === 'function') {
    try {
      const channel = new BroadcastChannel(`${STORAGE_PREFIX}-sync`)
      channel.postMessage({ type: 'chat', messages: [], from: 'rankup' })
      if (!remembered) channel.postMessage({ type: 'settings', settings: null, from: 'rankup' })
      channel.close()
    } catch { /* an old browser: the next page load starts clean */ }
  }
  try { if (document.querySelector('.pilot-root .pilot-launcher')) window.Pilot?.close() } catch { /* not built */ }
}

/** The gate's handle: told about every render while the app runs. */
export function connect() {
  window.RankUpPilot = { start, pack }
  return {
    update(snapshot, allowed) {
      on = allowed
      const done = waiters
      waiters = []
      done.forEach((resolve) => resolve())
      checkAccount(snapshot.state)
      if (!allowed) { park(); return }
      addCoreTag()
      if (!start()) return
      unpark()
      robotStill(reduceMotion())
    },
  }
}

export const _test = { accountOf, chips, screen, SCREENS, CORE_FILES, config }
