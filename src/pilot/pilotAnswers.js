/**
 * Pilot's own answers in RankUp (core 1.4.0, RankUp 0.31.0; core 1.4.1, 0.32.0): what a parent
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
 * Since core 1.4.1 (RankUp 0.32.0) an answer of RankUp's own never leaves
 * the phone, not even once a key is added: the core sends the AI company a
 * short stand-in in its place. The answers still use counts and chore
 * titles only, as a second guard, and every title goes through `scrub`
 * (pilotRankUp.js replaces any family name in it with "[name]") and loses
 * markdown of its own.
 *
 * Since 0.32.0 every parent screen has its own words and its own "Right
 * now" counts (SCREEN_HELP), "Summarise this" has an answer with no key
 * (summaryAnswer), and so does each screen's own suggestion.
 *
 * Pure functions of the state, so tests/fixes31.mjs runs them in Node.
 */
import { TIERS, TIER_LADDER, TRIAL_DAYS, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../state/initialState.js'
import { priceWords } from '../lib/plans.js'
import { weekCompare, changeWords } from '../lib/thisWeek.js'
import { formatXp, levelFromXp } from '../lib/xp.js'
import { weeklyGoalOf } from '../lib/weeklyGoal.js'

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

const DAY = 86400000
const count = (n) => Number(n || 0).toLocaleString('en-US')
const pendingOf = (state) => (state.submissions || []).filter((x) => x.status === 'pending')
const openChores = (state) => (state.quests || []).filter((q) => q.status === 'assigned' || q.status === 'redo')
const kidsOf = (state) => (state.kids || []).length
const linkedOf = (state) => (state.kids || []).filter((k) => k.pairedDeviceAt).length
const owedOf = (state) => (state.redemptions || []).filter((r) => r.status === 'requested').length
/** How long ago, in words a parent says: "2 hours ago", "3 days ago". */
function ago(at, now = Date.now()) {
  const ms = now - Number(at || 0)
  if (!(ms >= 0) || !at) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${noun(hours, 'hour')} ago`
  return `${noun(Math.round(hours / 24), 'day')} ago`
}
const coinRange = (list) => {
  const costs = list.map((r) => Number(r.cost)).filter((n) => n > 0).sort((a, b) => a - b)
  if (!costs.length) return ''
  return costs[0] === costs[costs.length - 1] ? `${count(costs[0])} coins each` : `${count(costs[0])} to ${count(costs[costs.length - 1])} coins`
}
const planName = (state) => (TIERS[state.family?.tier] || TIERS.starter).name
const trialLeft = (state, now = Date.now()) => {
  const f = state.family || {}
  if (!f.trialTier || !(f.trialEndsAt > now)) return 0
  return Math.max(1, Math.ceil((f.trialEndsAt - now) / DAY))
}

/*
 * Every parent screen (and the public pages Pilot is on): what it is for, in
 * plain words, and (`now`) what is on it at this moment, as the counts that
 * fit that screen: Review's waiting chores and the oldest, Rewards' rewards
 * and what they cost, the plan screen's plan and days left (0.32.0; before,
 * every screen gave the same three counts, and a screen missing from the
 * list was "a RankUp screen for grown-ups"). Counts only: never a child's
 * or the family's name.
 */
const SCREEN_HELP = {
  '/parent': {
    title: 'Home',
    what: 'This is **Home**, your family at a glance: chores waiting for you, "Getting started" while the family is new, **This week**, and how each child is doing. Tap a card to open it. The tabs (along the bottom on a phone, down the left on a computer) go to Review, Assign, Kids and Settings.',
    now: (s, t) => {
      const week = weekCompare(s, t)
      return [noun(kidsOf(s), 'child', 'children'), `${count(pendingOf(s).length)} waiting for review`,
        `${noun(week.now.chores, 'chore')} accepted in the last 7 days`, owedOf(s) ? `${noun(owedOf(s), 'reward')} to hand over` : '']
    },
  },
  '/parent/approvals': {
    title: 'Review',
    what: 'This is **Review**. When a child taps "I did it!", the chore comes here with what it will pay. **Accept** pays the XP and coins; **Send back** puts it back on their list to redo, with a note if you like. Nothing is paid until you accept.',
    now: (s, t) => {
      const waiting = pendingOf(s).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
      if (!waiting.length) return ['nothing waiting for review']
      const oldest = ago(waiting[0].submittedAt, t)
      return [`${noun(waiting.length, 'chore')} waiting for review`, oldest ? `the oldest sent ${oldest}` : '']
    },
  },
  '/parent/assign': {
    title: 'Assign',
    what: 'This is **Assign**, where chores (quests) are added: pick the child, write what to do (or pick a ready-made pack), choose how hard it is, which sets the XP, and how often it repeats. It goes straight onto the child\'s list.',
    now: (s) => {
      const open = openChores(s)
      const repeating = (s.quests || []).filter((q) => q.recurrence && q.recurrence !== 'once').length
      return [noun(kidsOf(s), 'child', 'children') + ' to assign to', `${noun(open.length, 'chore')} on their lists now`, repeating ? `${noun(repeating, 'repeating chore')}` : '']
    },
  },
  '/parent/kids': {
    title: 'Kids',
    what: 'This is **Kids**: each child\'s profile, with their world, level, coins and open chores. Add a child here, change a world, or make a code to link a child\'s phone.',
    now: (s) => {
      const levels = (s.kids || []).map((k) => levelFromXp(k.xp || 0).level).sort((a, b) => a - b)
      const span = levels.length ? (levels[0] === levels[levels.length - 1] ? `level ${levels[0]}` : `levels ${levels[0]} to ${levels[levels.length - 1]}`) : ''
      return [noun(kidsOf(s), 'child', 'children'), span, `${count(linkedOf(s))} with a phone of their own`, `${noun(openChores(s).length, 'chore')} open`]
    },
  },
  '/parent/settings': {
    title: 'Settings',
    what: 'This is **Settings**: your parent account, the rewards children spend coins on, the weekly and family goals, your kids\' phones and worlds, reminders, the look, the plan, help and your data. Tap a heading to open it.',
    now: (s) => [noun((s.rewards || []).length, 'reward'), `a weekly goal of ${noun(weeklyGoalOf(s), 'chore')} each`,
      `${noun(linkedOf(s), 'child\'s phone', 'children\'s phones')} linked`, `the ${planName(s)} plan`],
  },
  '/parent/rewards': {
    title: 'Rewards',
    what: 'These are your family\'s **Rewards**: what children save their coins for (a film night, a later bedtime, a day out). You choose each one and what it costs; a child picks one on their Rewards tab, and you **Mark given** when you hand it over. Coins come only from chores you accept.',
    now: (s) => {
      const list = s.rewards || []
      if (!list.length) return ['no rewards yet: "Add 3 starter rewards" on Home adds three in one tap']
      const range = coinRange(list)
      return [`${noun(list.length, 'reward')}${range ? `, costing ${range}` : ''}`, `${count(owedOf(s))} waiting to be handed over`]
    },
  },
  '/parent/plan': {
    title: 'Plans',
    what: `This is the **plan screen**: what ${TIER_LADDER.map((t) => t.name).join(', ')} each give, side by side, with their prices. Children keep everything they have earned whichever plan you are on.`,
    now: (s, t) => {
      const days = trialLeft(s, t)
      const max = (TIERS[s.family?.tier] || TIERS.starter).limits?.maxKids
      return [`you pay for ${planName(s)}`, days ? `${noun(days, 'day')} left of the free ${TIERS[s.family.trialTier]?.name || TIERS.elite.name} trial` : '',
        Number.isFinite(max) ? `${noun(kidsOf(s), 'child', 'children')}, and ${planName(s)} has room for ${count(max)}` : noun(kidsOf(s), 'child', 'children')]
    },
  },
  '/parent/pair': {
    title: 'Link a phone',
    what: 'This is where a **child\'s phone is linked**: tap the code button for a child, then type the digits on their phone after "I\'m a kid". A code is short-lived and works once. A family that shares one phone needs none of this.',
    now: (s) => [noun(kidsOf(s), 'child', 'children'), `${count(linkedOf(s))} with a linked phone`],
  },
  '/parent/override': {
    title: 'Pause and limits',
    what: `This is **Pause and limits** (${TIERS.elite.name}): your house rules in your own words, and a way to give the app a rest. XP, levels and streaks are never taken away.`,
    now: (s) => {
      const t = Date.now()
      const paused = (s.kids || []).filter((k) => k.lockout && !(k.lockout.until && k.lockout.until < t)).length
      return [`${noun(paused, 'child', 'children')} paused right now`, `${noun((s.overrides || []).length, 'rule')} written`]
    },
  },
  '/parent/blueprint': {
    title: 'Behaviour Blueprints',
    what: `This is **Behaviour Blueprints** (${TIERS.elite.name}): weekly charts built from the chores you actually accepted, so you can see which days and which kinds of chore go well.`,
    now: (s, t) => [`${noun(weekCompare(s, t).now.chores, 'chore')} accepted in the last 7 days`, `${noun(weekCompare(s, t).before.chores, 'chore')} the 7 before`],
  },
  '/parent/alliance': {
    title: 'Parent Alliances',
    what: `This is **Parent Alliances** (${TIERS.elite.name}): a friendly monthly contest with other families, counted on chores accepted.`,
    now: (s, t) => [`${noun(weekCompare(s, t).now.chores, 'chore')} accepted in the last 7 days counts for your family`],
  },
  '/parent/school': {
    title: 'School League',
    what: 'This is the **School League** for your family: whether your children\'s accepted chores count for their school. You choose for each child, and the school sees only totals.',
    now: (s) => [noun(kidsOf(s), 'child', 'children')],
  },
  '/parent/guilds': {
    title: 'Guilds',
    what: 'This is **Guilds**: small teams children can join to do chores together.',
    now: (s) => [noun(kidsOf(s), 'child', 'children')],
  },
  '/parent/leaderboards': {
    title: 'Leaderboards',
    what: 'These are the **leaderboards**. Children start in Adventure, off public boards; in Arena other families see only a made-up nickname, a flag and the numbers.',
    now: (s) => [noun(kidsOf(s), 'child', 'children')],
  },
  '/parent/redeem': {
    title: 'Redeem a gift',
    what: 'This is where a **gift code is redeemed**: type the code from the gift card and the plan it gives starts.',
    now: (s) => [`you are on ${planName(s)} now`],
  },
  '/parent/help': {
    title: 'Help',
    what: 'This is **Help**: plain answers to the questions parents ask most, from linking a phone to what each plan gives.',
  },
  '/parent/history': {
    title: 'Chore history',
    what: 'This is the **chore history**: every chore sent in, and whether it was accepted or sent back, with your notes.',
    now: (s, t) => {
      const subs = s.submissions || []
      return [`${noun(subs.filter((x) => x.status === 'approved').length, 'chore')} accepted in all`, `${count(subs.filter((x) => x.status === 'rejected').length)} sent back`,
        `${count(weekCompare(s, t).now.chores)} in the last 7 days`]
    },
  },
  '/parent/money': {
    title: 'Pocket money',
    what: 'This is the **pocket money record**: what each child earned from chores that pay money, and what was handed over. RankUp never holds money; tap "Paid" when you hand some over.',
    now: (s) => [`${noun((s.quests || []).filter((q) => Number(q.pence) > 0 && q.status !== 'approved').length, 'chore')} to do that pay money`, `${noun((s.allowance || []).length, 'line')} in the record`],
  },
  '/parent/genesis': {
    title: 'Theme Genesis',
    what: 'This is **Theme Genesis**: a world a child designed. You decide whether they can use it.',
    now: (s) => [`${noun((s.kidThemes || []).filter((t) => t.useAsk || (t.sendAsk && !t.sentAt)).length, 'world')} waiting for your answer`],
  },
  '/gift': { title: 'Give RankUp', what: 'This is the **Give page**: buy a year of RankUp for another family. No account is needed, and you get a printable gift card.' },
  '/gift/card': { title: 'Gift card', what: 'This is a **printable gift card** with the code the family types in to start their year.' },
  '/school': { title: 'School League', what: 'This is the **School League** page for teachers and principals: how a school joins and what it sees.' },
  '/school/help': { title: 'School League help', what: 'This is the **School League help**: answers for teachers and principals.' },
  '/school/report': { title: 'Trial report', what: 'This is a **school\'s trial report**, made to print for the school office.' },
  '/district': { title: 'School districts', what: 'This is the page for **school districts**: one plan for many schools.' },
  '/welcome': { title: 'Setting up', what: 'This is **setting up your family**: your account, then your first child and the world they pick. It takes a couple of minutes, and every new family gets the top plan free to start.' },
}

/** The words each screen is explained with (kept for tests and older callers). */
export const EXPLAIN = Object.fromEntries(Object.entries(SCREEN_HELP).map(([r, h]) => [r, h.what]))

/** Which screen's help: Settings opened at its rewards is Rewards. Null for a screen RankUp has not got. */
export function screenHelp(route) {
  const full = String(route || '')
  const r = full.split('?')[0]
  if (r === '/parent/settings' && /[?&]open=rewards\b/.test(full)) return { route: '/parent/rewards', ...SCREEN_HELP['/parent/rewards'] }
  if (r === '/') return { route: '/welcome', ...SCREEN_HELP['/welcome'] }
  return SCREEN_HELP[r] ? { route: r, ...SCREEN_HELP[r] } : null
}

/** What is on the screen now, as that screen's own counts. */
function nowFacts(help, state, now) {
  if (!help?.now || !hasFamily(state)) return []
  try { return help.now(state, now).filter(Boolean) } catch { return [] }
}

const NOT_A_SCREEN = 'This page is not one of RankUp\'s screens: an old or mistyped link, perhaps. '
  + `[Home](${screenLink('/parent')}) has your family at a glance, and [Help](${screenLink('/parent/help')}) answers the questions parents ask most.`

/** What this screen is for, in a few plain sentences, and what is on it now (that screen's own counts). */
export function explainAnswer(route, state, { now = Date.now() } = {}) {
  const help = screenHelp(route)
  if (!help) return NOT_A_SCREEN
  const facts = String(route || '').startsWith('/parent') ? nowFacts(help, state, now) : []
  return facts.length ? `${help.what}\n\nRight now: ${facts.join(', ')}.` : help.what
}

/**
 * "Summarise this" with no AI key (0.32.0): the core's own follow-up sends
 * the screen to the AI, which with no key meant the key settings. RankUp
 * answers it here instead, in a few short points: the screen in one line,
 * then its own counts, then where to go. Built on the phone; nothing sent.
 */
export function summaryAnswer(route, state, { now = Date.now() } = {}) {
  const help = screenHelp(route)
  if (!help) return NOT_A_SCREEN
  const first = help.what.replace(/\*\*/g, '').split(/(?<=\.)\s/)[0]
  const facts = String(route || '').startsWith('/parent') ? nowFacts(help, state, now) : []
  const points = [first, ...facts.map((f) => f.charAt(0).toUpperCase() + f.slice(1) + '.')]
  return `**${help.title}, in short:**\n\n${points.map((p) => `- ${p}`).join('\n')}`
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

// ---------------------------------------------------------------- each screen's own suggestion, with no key (0.32.0)

/** "Accept the oldest one", with no key: which chore it is, how long it has waited, and where to accept it. */
export function oldestAnswer(state, { scrub, now = Date.now() } = {}) {
  if (!hasFamily(state)) return `Nothing yet. ${SET_UP_FIRST}`
  const waiting = pendingOf(state).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
  const review = screenLink('/parent/approvals')
  if (!waiting.length) return `Nothing is waiting for you right now. A chore a child sends with "I did it!" shows up in [Review](${review}).`
  const quest = (state.quests || []).find((q) => q.id === waiting[0].questId)
  const title = keep(scrub)(plainWords(quest?.title || '')) || 'A chore'
  const when = ago(waiting[0].submittedAt, now)
  return `The oldest chore waiting is **${title}**${when ? `, sent ${when}` : ''}. It is at the top of [Review](${review}): **Accept** pays its XP and coins, **Send back** returns it to redo, with a note if you like.`
    + (waiting.length > 1 ? `\n\n${noun(waiting.length - 1, 'more chore')} ${waiting.length === 2 ? 'is' : 'are'} waiting after it.` : '')
}

export const STARTERS_ANSWER = 'Ready-made chores are one tap away: on this screen choose **Quest packs**, pick the child, and **Add all** puts a pack (bedroom, kitchen, around the house and more, each for an age) on their list. '
  + `On [Home](${screenLink('/parent')}), while the family is new, "Getting started" also has **Add 3 starter chores** for your first child. You can change or remove any of them later.`

export const REWARD_ANSWER = `Open [Rewards](${screenLink('/parent/rewards')}) (it is in Settings too), tap **Add reward** and give it a name and a cost in coins (a film night about 60, a later bedtime about 90, a day out about 250), and it shows on your children's Rewards tab. `
  + 'A child spends coins they earned from chores you accepted, and you tap **Mark given** when you hand it over.'

export const MONEY_ANSWER = 'Pocket money is optional, chore by chore. When you add a chore you can give it a price; when you accept it, that amount is added to the child\'s record here. '
  + '**RankUp never holds or moves money**: you hand it over yourself, then tap **Paid** so the record matches. Most chores pay only XP and coins, and that is fine.'

export const PAUSE_ANSWER = `**Pause and limits** (${TIERS.elite.name}) holds your house rules, in your own words, and can give the app a rest for a while: a paused child sees a calm screen with your reason and how long is left. `
  + 'XP, levels, coins and streaks are never taken away, and a pause ends by itself when its time is up.'

export const PAIR_ANSWER = 'Linking a child\'s phone takes a minute: on this screen tap the code button for the child, then on their phone open RankUp, tap **I\'m a kid** and type the digits. '
  + 'The code works once, for a few minutes. Their phone then shows only their own screens: no Parent Mode, no prices. A family that shares one phone doesn\'t need this.'

export const GIFT_ANSWER = 'You pay once, with no account, for a year of RankUp for another family. You get a printable gift card with a code; they type it in RankUp\'s Parent Mode (Settings, then Redeem a gift), and their year starts that day. One payment: nothing renews.'
export const GIFT_PLANS_ANSWER = `${plansAnswer()}\n\nA gift is a year of a paid plan, and the family keeps everything their children earn when it ends.`
export const SCHOOL_ANSWER = 'The **School League** lets a school\'s families count their accepted chores for the school, in a friendly league with other schools. Only a parent can put a child in, and the school sees totals and each house or class\'s average, never a list of its students.'
export const SCHOOL_SAFE_ANSWER = 'A school sees totals only: how many chores were done, and each house or class\'s average once enough students take part. It never sees a list of its students, a child\'s chores or a photo, and only a parent can put a child in.'
