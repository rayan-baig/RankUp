/**
 * Pilot's own answers in RankUp (core 1.4.0, RankUp 0.31.0): what a parent
 * gets from the welcome's buttons and the screen's suggestions with no AI key
 * at all, and nothing sent anywhere.
 *
 * Each answer is built in the parent's browser, at the moment it is asked,
 * from what the app already has: the family's own chores and submissions
 * (the same state the parent screens draw), the plan list and the app's own
 * words. The core shows it as Pilot's message through its safe renderer
 * (markdown, never HTML), and may link to RankUp's own screens.
 *
 * No child's name, the family's name or a grown-up's name is ever in one.
 * The answer stays on the phone when it is shown, but the core keeps it as
 * part of the chat, and once a key is added the chat goes with the next
 * question to the parent's AI company. So the answers use counts and chore
 * titles only, and every title goes through `scrub` (pilotRankUp.js replaces
 * any family name in it with "[name]") and loses markdown of its own.
 *
 * Pure functions of the state, so tests/fixes31.mjs runs them in Node.
 */
import { TIERS, TIER_LADDER, TRIAL_DAYS, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../state/initialState.js'
import { priceWords } from '../lib/plans.js'
import { weekCompare, changeWords } from '../lib/thisWeek.js'
import { formatXp } from '../lib/xp.js'

/** RankUp's own address for a screen, as a path the core accepts in an answer ("/#/parent/approvals"). */
export function screenLink(route) {
  let base = '/'
  try { base = import.meta.env?.BASE_URL || '/' } catch { base = '/' }
  if (!base.startsWith('/')) base = '/'
  return `${base.endsWith('/') ? base : `${base}/`}#${route}`
}

/** Words from the family's own data, kept as plain words in Pilot's markdown. */
export function plainWords(text) {
  return String(text ?? '').replace(/\p{Cc}/gu, ' ').replace(/[*_`[\]#<>|\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

const noun = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
const keep = (scrub) => (typeof scrub === 'function' ? scrub : (t) => t)
const hasFamily = (state) => Boolean(state?.onboarded)
const SET_UP_FIRST = 'Once your family is set up, this answers from your own chores, right here on your phone.'

// ---------------------------------------------------------------- "What's waiting for me?"

/** The chores waiting for review, by chore name with how many of each, oldest first. */
export function waitingList(state, scrub) {
  const clean = keep(scrub)
  const quests = new Map((state?.quests || []).map((q) => [q.id, q]))
  const waiting = (state?.submissions || []).filter((s) => s.status === 'pending')
    .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
  const byTitle = new Map()
  for (const s of waiting) {
    const title = clean(plainWords(quests.get(s.questId)?.title || '')) || 'A chore'
    byTitle.set(title, (byTitle.get(title) || 0) + 1)
  }
  return { count: waiting.length, chores: [...byTitle].map(([title, count]) => ({ title, count })) }
}

export function waitingAnswer(state, { scrub } = {}) {
  if (!hasFamily(state)) return `Nothing yet. ${SET_UP_FIRST}`
  const { count, chores } = waitingList(state, scrub)
  const review = screenLink('/parent/approvals')
  if (!count) {
    return `Nothing is waiting for you right now. When a child taps "I did it!" on a chore, it shows up in [Review](${review}) for you to accept.`
  }
  const MOST = 8
  const lines = chores.slice(0, MOST).map((c) => `- ${c.title}${c.count > 1 ? ` (${c.count})` : ''}`)
  const rest = chores.slice(MOST).reduce((n, c) => n + c.count, 0)
  if (rest) lines.push(`- and ${noun(rest, 'more chore')}`)
  return `**${noun(count, 'chore')}** ${count === 1 ? 'is' : 'are'} waiting for you to review:\n\n${lines.join('\n')}\n\n`
    + `[Open Review](${review}) to accept ${count === 1 ? 'it' : 'them'} or send one back. Nothing is paid until you accept.`
}

// ---------------------------------------------------------------- "How is my kid doing?"

/** The dashboard's "This week" numbers in words: the family's last seven days against the seven before. */
export function weekAnswer(state, { now = Date.now() } = {}) {
  if (!hasFamily(state)) return `Nothing to show yet. ${SET_UP_FIRST}`
  const week = weekCompare(state, now)
  const kids = (state.kids || []).length
  if (!week.any) {
    return 'No chores have been accepted in the last two weeks, so there is nothing to compare yet. '
      + `Once you accept one in [Review](${screenLink('/parent/approvals')}), this shows chores done, XP earned and days in a row.`
  }
  const row = (label, n, before, show) => `- **${label}:** ${show(n)} (${changeWords(n, before).words.replace(/^▲ /, 'up ').replace(/^▼ /, 'down ')})`
  const count = (n) => n.toLocaleString('en-US')
  const lines = [
    row('Chores done', week.now.chores, week.before.chores, count),
    row('XP earned', week.now.xp, week.before.xp, formatXp),
    row('Days in a row', week.now.streak, week.before.streak, count),
  ]
  const waiting = (state.submissions || []).filter((s) => s.status === 'pending').length
  const who = kids > 1 ? `That is ${kids === 2 ? 'both children' : `all ${kids} children`} together; each child's own level and coins are on [Kids](${screenLink('/parent/kids')}).`
    : `Their level and coins are on [Kids](${screenLink('/parent/kids')}).`
  return `**This week** (the last 7 days, against the 7 before):\n\n${lines.join('\n')}\n\n${who}`
    + (waiting ? ` ${noun(waiting, 'chore')} ${waiting === 1 ? 'is' : 'are'} waiting for you in [Review](${screenLink('/parent/approvals')}).` : '')
}

// ---------------------------------------------------------------- "Explain this screen"

const EXPLAIN = {
  '/parent': 'This is **Home**, your family at a glance: chores waiting for you, "Getting started" while the family is new, **This week**, and how each child is doing. Tap a card to open it. The tabs (along the bottom on a phone, down the left on a computer) go to Review, Assign, Kids and Settings.',
  '/parent/approvals': 'This is **Review**. When a child taps "I did it!", the chore comes here with what it will pay. **Accept** pays the XP and coins; **Send back** puts it back on their list to redo, with a note if you like. Nothing is paid until you accept.',
  '/parent/assign': 'This is **Assign**, where chores (quests) are added: pick the child, write what to do (or pick a ready-made pack), choose how hard it is, which sets the XP, and how often it repeats. It goes straight onto the child\'s list.',
  '/parent/kids': 'This is **Kids**: each child\'s profile, with their world, level, coins and open chores. Add a child here.',
  '/parent/settings': 'This is **Settings**: your parent account, the rewards children spend coins on, the weekly and family goals, your kids\' phones and worlds, reminders, the look, the plan, help and your data.',
  '/parent/plan': `This is the **plan screen**: what ${TIER_LADDER.map((t) => t.name).join(', ')} each give, side by side, with their prices. Children keep everything they have earned whichever plan you are on.`,
  '/parent/pair': 'This is where a **child\'s phone is linked**: tap the code button for a child, then type the digits on their phone after "I\'m a kid". A code is short-lived and works once.',
  '/parent/override': `This is **Pause and limits** (${TIERS.elite.name}): your house rules in your own words, and a way to give the app a rest. XP, levels and streaks are never taken away.`,
  '/parent/blueprint': `This is **Behaviour Blueprints** (${TIERS.elite.name}): weekly charts built from the chores you actually accepted.`,
  '/parent/alliance': `This is **Parent Alliances** (${TIERS.elite.name}): a friendly monthly contest with other families, counted on chores accepted.`,
  '/parent/school': 'This is the **School League** for your family: whether your children\'s accepted chores count for their school. You choose for each child.',
  '/parent/guilds': 'This is **Guilds**: small teams children can join to do chores together.',
  '/parent/leaderboards': 'These are the **leaderboards**. Children start in Adventure, off public boards; in Arena other families see only a made-up nickname, a flag and the numbers.',
  '/parent/redeem': 'This is where a **gift code is redeemed**: type the code from the gift card and the plan it gives starts.',
  '/parent/help': 'This is **Help**: plain answers to the questions parents ask most.',
  '/parent/history': 'This is the **chore history**: every chore sent in, and whether it was accepted or sent back.',
  '/parent/money': 'This is the **pocket money record**: what each child earned from chores that pay money, and what was handed over. RankUp never holds money; tap "Paid" when you hand some over.',
  '/parent/genesis': 'This is **Theme Genesis**: a world a child designed. You decide whether they can use it.',
  '/gift': 'This is the **Give page**: buy a year of RankUp for another family. No account is needed, and you get a printable gift card.',
  '/gift/card': 'This is a **printable gift card** with the code the family types in to start their year.',
  '/school': 'This is the **School League** page for teachers and principals: how a school joins and what it sees.',
  '/school/help': 'This is the **School League help**: answers for teachers and principals.',
  '/school/report': 'This is a **school\'s trial report**, made to print for the school office.',
  '/district': 'This is the page for **school districts**: one plan for many schools.',
  '/welcome': 'This is **setting up your family**: your account, then your first child and the world they pick. It takes a couple of minutes, and every new family gets the top plan free to start.',
}

/** What this screen is for, in a few plain sentences, and what is on it now (counts only). */
export function explainAnswer(route, state) {
  const r = String(route || '').split('?')[0]
  const what = EXPLAIN[r] || (r === '/' ? EXPLAIN['/welcome'] : 'This is a RankUp screen for grown-ups. The tabs go to Home, Review, Assign, Kids and Settings, and [Help](' + screenLink('/parent/help') + ') answers the questions parents ask most.')
  if (!hasFamily(state) || !r.startsWith('/parent')) return what
  const kids = (state.kids || []).length
  const waiting = (state.submissions || []).filter((s) => s.status === 'pending').length
  const open = (state.quests || []).filter((q) => q.status === 'assigned' || q.status === 'redo').length
  const now = [noun(kids, 'child', 'children'), `${noun(open, 'chore')} to do`, `${waiting.toLocaleString('en-US')} waiting for review`]
  return `${what}\n\nRight now: ${now.join(', ')}.`
}

// ---------------------------------------------------------------- the plans, and RankUp itself

export function eliteAnswer() {
  const kids = ELITE_KID_PERKS.filter((p) => !p.needs).map((p) => `- ${p.title}`)
  const parents = ELITE_PARENT_PERKS.map((p) => `- ${p.title}`)
  return `**${TIERS.elite.name}** adds, for children:\n\n${kids.join('\n')}\n\nAnd for you:\n\n${parents.join('\n')}\n\n`
    + `Every plan keeps the whole loop: assign, "I did it!", accept, XP, levels and rewards. The [plan screen](${screenLink('/parent/plan')}) has the rest side by side.`
}

export const HOW_IT_WORKS = 'RankUp turns chores into a game, with you in charge:\n\n'
  + '1. You add a chore for your child.\n'
  + '2. They do it and tap "I did it!".\n'
  + '3. You accept it (or send it back to redo).\n'
  + '4. They earn XP and coins, level up in the world they picked, and spend coins on rewards you set.\n\n'
  + 'Nothing is paid until you accept. It works on any phone, tablet or computer, and children can share a grown-up\'s phone or have their own.'

export const SAFE_FOR_KIDS = 'RankUp keeps a child\'s **first name only**: no surname, birthday, email, address or photo, and it never takes a photo at all.\n\n'
  + '- Children never see prices, deals or anything to buy.\n'
  + '- A child\'s phone is linked with a short code from yours: no email or password for them.\n'
  + '- You can download everything, or delete it all at once, from Settings.\n'
  + '- Pilot, this helper, is for grown-ups only and is never on a child\'s screen.'

export function plansAnswer() {
  const lines = TIER_LADDER.map((t) => (t.price
    ? `- **${t.name}**: ${priceWords(t)}, or ${priceWords(t, 'year')}`
    : `- **${t.name}**: free, for one child, with the whole loop`))
  return `${lines.join('\n')}\n\nEvery new family gets ${TRIAL_DAYS} days of ${TIERS.elite.name} free, with no card. When it ends you are on ${TIERS.starter.name} unless you chose a plan: nothing is charged by itself.`
}
