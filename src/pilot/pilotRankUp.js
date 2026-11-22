/**
 * Pilot on RankUp: the per-app config (docs/PILOT.md, and the MTRX Horizyn
 * site's docs/PILOT.md for the shared core).
 *
 * Fetched by lib/pilotGate.js only once Pilot is allowed on the screen and
 * the page has loaded, so it is never on a child's phone and never part of
 * the first load. It:
 *
 *   - adds the core's one script tag (public/pilot/, core 1.4.0, copied
 *     unchanged from the MTRX Horizyn site), which
 *     then loads public/pilot-rankup.js, which calls start() here;
 *   - mounts Pilot with RankUp's config: who is using it, which screen, its
 *     own welcome (tagline and five pills), the suggestions, and kidView, which refuses whenever the gate says no (the
 *     second lock: Pilot.mount refuses on it, and the engine offers no tools);
 *   - answers the common questions itself, with no AI key and nothing sent
 *     (core 1.4.0, pilotAnswers.js): what's waiting, this week's numbers,
 *     this screen explained, and a link to Assign;
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
import { waitingAnswer, weekAnswer, explainAnswer, eliteAnswer, plansAnswer, screenLink, HOW_IT_WORKS, SAFE_FOR_KIDS } from './pilotAnswers.js'

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
  const name = SCREENS[r] || (r === '/welcome' || r === '/' ? 'Setting up a new family (the parent tapped "I\'m a parent")' : document.title)
  const facts = []
  if (!s.onboarded && (r === '/welcome' || r === '/')) facts.push('The person is a parent setting up their family: not signed in yet.')
  else if (!s.onboarded) facts.push('The person is not signed in: a parent, grandparent or teacher reading about RankUp.')
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

/*
 * Answers Pilot gives at once, with no AI key and nothing sent anywhere (core
 * 1.4.0): built in this browser from the family's own chores, when asked
 * (pilotAnswers.js). No child's or family's name is in any of them: the
 * chore titles go through `scrub` as well. The core keeps an answer in the
 * chat, and once a key is added the chat goes with the next question.
 */
const scrub = (text) => withoutNames(text, privateNames())
const answerWaiting = () => waitingAnswer(state(), { scrub })
const answerWeek = () => weekAnswer(state())
const answerExplain = (ctx) => `${explainAnswer(route(), state())}${ctx && ctx.ready ? '\n\nAsk me anything about it in the box below.' : ''}`

/*
 * The suggestions above the chat once it has started (the core shows three,
 * then its own "Summarise this"), and on the welcome (see welcomeChips). In
 * Parent Mode RankUp's own two come first on every screen, in a parent's
 * words: what is waiting (answered at once), and adding a chore (Assign).
 * The third is for the screen: answered at once where RankUp can, an AI
 * prompt where it takes the AI (accepting a chore, the starter chores).
 * `id` ties a suggestion to the welcome pill that does the same.
 */
const WAITING = { id: 'waiting', label: "What's waiting for me?", answer: answerWaiting }
const ADD_CHORE = { id: 'add', label: 'Add a chore for…', link: screenLink('/parent/assign') }
const KIDS_DOING = { id: 'week', label: 'How are the kids doing?', answer: answerWeek }
const WHAT_HERE = { id: 'explain', label: 'What can I do here?', answer: answerExplain }
function screenChips() {
  const r = route()
  if (!state().onboarded && (r === '/welcome' || r === '/')) {
    return [{ label: 'How does RankUp work?', answer: HOW_IT_WORKS },
      { label: 'Is it safe for my kids?', answer: SAFE_FOR_KIDS },
      { label: 'What do the plans cost?', answer: () => plansAnswer() }]
  }
  if (r === '/gift' || r === '/gift/card') return [C('How does a gift work?', 'How does giving a year of RankUp work?'), C('Which plan to give?', 'What is the difference between the plans I can give?')]
  if (r.startsWith('/school') || r === '/district') return [C('What is the School League?', 'What is the School League, and what does a school see?'), C('Is it safe for students?', 'What does a school see about its students on RankUp?')]
  const third = {
    '/parent': KIDS_DOING,
    '/parent/approvals': C('Accept the oldest one', 'Accept the oldest chore that is waiting.'),
    '/parent/assign': C('Add 3 starter chores', 'Add the 3 starter chores.'),
    '/parent/kids': KIDS_DOING,
    '/parent/plan': { label: `What does ${TIERS.elite.name} add?`, answer: () => eliteAnswer() },
    '/parent/settings': C('Add a reward', 'Add a reward: '),
    '/parent/money': C('How does pocket money work?', 'How does pocket money work in RankUp?'),
    '/parent/override': C('How do pauses work?', 'How does Pause and limits work, and what does my child see?'),
    '/parent/pair': C("Link my child's phone", "How does linking my child's phone with a code work?"),
    '/parent/history': KIDS_DOING,
  }[r] || WHAT_HERE
  return [WAITING, ADD_CHORE, third]
}

/*
 * RankUp's own welcome (core 1.2.0, 0.28.0; useful before a key since core
 * 1.4.0, 0.31.0). The five pills a parent sees when Pilot opens, before any
 * chat: the two things a parent does most, how the children are doing, the
 * screen explained, and the key. All but the key work with no AI key and
 * send nothing: three are answered at once from the family's own data, and
 * "Add a chore for…" opens Assign, where the child is picked. Under an answer,
 * while there is no key, the core offers one (answerMore).
 */
export const WELCOME_PILLS = [
  { icon: 'chat', id: 'waiting', label: WAITING.label, answer: answerWaiting },
  { icon: 'bolt', id: 'add', label: ADD_CHORE.label, link: ADD_CHORE.link },
  { icon: 'spark', id: 'week', label: 'How is my kid doing?', answer: answerWeek },
  { icon: 'bars', id: 'explain', label: 'Explain this screen', answer: answerExplain },
  { icon: 'key', label: 'Add my AI key', action: 'settings' },
]

/*
 * The core (1.2.0) shows this screen's suggestions on the welcome too, under
 * the pills. There, the ones a pill already does are left out (on Home all
 * three are pills), and so is one that ends on a gap for the parent to
 * finish ("Add a reward: "): only a pill can leave words in the box. Once a
 * chat has started the pills are gone, and the suggestions are the whole
 * list again.
 */
const PILL_IDS = new Set(WELCOME_PILLS.map((p) => p.id).filter(Boolean))
export function welcomeChips(list) {
  return list.filter((c) => !(c.id && PILL_IDS.has(c.id)) && !/\s$/.test(c.prompt || ''))
}
/* No chat yet: the welcome is what is showing. */
function onWelcome() {
  try { return window.Pilot?.store?.loadChat?.().length === 0 } catch { return false }
}
function chips() {
  const list = screenChips()
  return onWelcome() ? welcomeChips(list) : list
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
  // RankUp's own welcome (core 1.2.0): one line, even on a 320px phone.
  tagline: "Your family's chore helper",
  welcomePills: WELCOME_PILLS,
  // Under an answer Pilot gives itself, while there is no key (core 1.4.0).
  answerMore: 'Want more? Add your AI key to ask anything.',
  // RankUp has no use for pictures or videos made by an AI: chat keys only.
  hideKeySections: ['image', 'video'],
  // Tucked away (on a wide screen or a public page), the robot shrinks into
  // its corner instead of hanging off the screen's edge. In Parent Mode on a
  // phone it is never tucked: it sits in the tab bar's slot (dockedPlace).
  keepInViewport: true,
  // The first look is on (the core's 4 seconds, whole and with a glow, on a
  // visit's first page). 0.28.0 turned it off, because core 1.2.0 marked it
  // with the class of the window's greeting bubble; core 1.2.1 marks it
  // "pilot-revealing", so opening Pilot in those seconds leaves the robot in
  // the tab bar's slot. In the slot it adds only the glow: never tucked there.
  // RankUp's pop-ups are role="dialog" (components/ui.jsx Modal, the
  // moments), which the core already steps back for. The one that isn't, the
  // "sign in again" sheet (components/SyncBadge.jsx), carries data-pilot-modal.
  modals: ['[data-pilot-modal]'],
  storagePrefix: STORAGE_PREFIX,
  compatibleHosts: [...PILOT_COMPATIBLE_HOSTS, ...PILOT_LOCAL_HOSTS],
  privacyUrl: '#/legal/privacy',
  // One plain sentence on what a key is and where a grown-up gets one, then
  // the 18+ line. Shown beside the key settings, in the greeting before a key
  // is added, and in Pilot's help.
  keyNote: 'An AI key is a private code a grown-up makes in the "API keys" part of an AI company\'s website, so Pilot can answer '
    + 'on their account. AI keys are for grown-ups (the AI companies require 18+).',
  // On the welcome (core 1.3.0) a one-line version, so the key is asked for
  // once there: by the "Add my AI key" pill, which since core 1.3.0 also
  // means no "AI key" card under the pills. The whole note stays in the key
  // settings and in help, and on the line's tooltip.
  keyNoteShort: 'AI keys are for grown-ups (18+).',
  audienceNote: 'The person using Pilot here is a grown-up: a parent in RankUp\'s Parent Mode (after their PIN), or a parent, grandparent or teacher reading RankUp\'s public pages. '
    + 'Children never use Pilot: it is never shown on a child\'s screen or a child\'s phone. '
    + 'RankUp is a children\'s app. Never ask for anything about a child: no surname, age, birthday, school, photo or phone. '
    + 'Refer to a child by first name only, and only when the parent used it or a tool returned it. Keep answers suitable for a family.',
  themeClass: 'rk-pilot',
  // The core keeps the robot clear of these (a free corner, or tucked half
  // away), as well as of the page's own words and buttons (core 1.1.1 and
  // later): the tab bar and the sticky set-up bar (data-pilot-avoid), and in
  // Parent Mode the things a parent taps most: the "waiting for you" card,
  // the plan buttons, the rows of Settings, Review's Accept and Send back,
  // and the header buttons in the top corners (data-pilot-primary), and the
  // demo's banner with its "Start for free" (.demo-bar).
  avoid: ['[data-pilot-avoid]', '[data-pilot-primary]', '.demo-bar'],
  // RankUp's screens keep their own side padding: in Parent Mode on a phone
  // the robot is in the tab bar's slot, never tucked at the edge.
  gutter: false,
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
  placeAroundTabBar()
  mounted = window.Pilot.mount(config) === true
  if (mounted) watch()
  return mounted
}

/*
 * Parent Mode's tab bar, as the core's placement sees it (0.26.0).
 *
 * The core decides where the robot sits (PilotMascot.placeNow, core 1.1.1 and later):
 * clear of everything in `avoid`, of the page's words and buttons, and of a
 * box being typed in. On a phone in Parent Mode the robot's place is the tab
 * bar's own slot (.tabbar-dock, index.css): on no tab, and on nothing on the
 * screen, which scrolls behind the bar. The core can't know that what has
 * scrolled behind the bar is hidden by it, and would move the robot off the
 * slot for a card down there; so while the slot is showing, this says "the
 * bottom right corner, not tucked away", without changing the core's files.
 * On a computer (1100px and up, 0.29.0) the tab bar is a sidebar down the
 * left edge with the slot at its foot, so the answer is the bottom left
 * corner, and the chat opens beside the sidebar. Anywhere else (a tablet,
 * the parent's set-up, the gift and School League pages) the core decides
 * on its own.
 *
 * Core 1.2.0's keepInViewport (tucked away, it shrinks into its corner) is an
 * answer placeNow gives; in the slot this answers first and never tucks, so
 * it changes nothing there. Stepping back for a pop-up is decided before
 * placeNow is asked, so the robot still hides behind one in the slot. The
 * first look (core 1.2.1, back on since 0.28.1) only adds its glow here:
 * this answers "not tucked away" with or without it.
 */
let placing = false
export function dockedPlace(doc = document) {
  if (doc.documentElement?.dataset?.pilotTabs !== 'on') return null
  const slot = doc.querySelector('[data-pilot-tabbar] [data-pilot-dock]')
  const box = slot && slot.getBoundingClientRect()
  if (!box || !(box.width > 0)) return null
  // On a phone the slot is at the bar's right end; on a computer (0.29.0)
  // the bar is a sidebar down the left edge and the slot is at its foot.
  const view = doc.defaultView?.innerWidth || 0
  const left = Number.isFinite(box.left) && view > 0 && box.left + box.width / 2 < view / 2
  return { corner: left ? 'bl' : 'br', peek: false, typing: false }
}
function placeAroundTabBar() {
  const mascot = window.PilotMascot
  if (placing || !mascot || typeof mascot.placeNow !== 'function') return
  placing = true
  const place = mascot.placeNow
  mascot.placeNow = (opts) => {
    try { return dockedPlace() || place(opts) } catch { return place(opts) }
  }
}

/* While Pilot is not allowed, its robot is not in the page: one added late
   (its stylesheet arriving after the parent left) is taken out too. */
function watch() {
  if (watching || typeof MutationObserver !== 'function') return
  watching = true
  new MutationObserver(() => { if (!on) park() }).observe(document.body, { childList: true })
  // Parent Mode's layout is chosen on the page's root (data-area, and
  // data-pilot-tabs for the tab bar's slot), which the core doesn't watch:
  // when either changes, it is asked to look again (it re-places on
  // resize), so on a computer the robot goes straight to the sidebar's slot
  // instead of waiting in the corner it started in (0.29.0).
  new MutationObserver(lookAgain).observe(document.documentElement, { attributes: true, attributeFilter: ['data-area', 'data-pilot-tabs'] })
  lookAgain()
}
function lookAgain() {
  try { window.dispatchEvent(new Event('resize')) } catch { /* nothing to place */ }
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

export const _test = { accountOf, chips, screenChips, screen, SCREENS, CORE_FILES, config }
