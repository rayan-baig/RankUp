/**
 * What Pilot can do in RankUp, as the tools its engine offers the AI.
 *
 * Every tool works through the app's own state and actions: it reads the
 * same state the parent screens read, and a change dispatches the same
 * reducer action the parent's own button dispatches (ParentAssign,
 * ParentApprovals, Settings → Rewards, the first-week card), so it is saved
 * and synced exactly as if the parent had tapped it, with the parent's own
 * session. Before dispatching, the action is run through the reducer once
 * on its own: if the app's rules refuse it, Pilot says so instead of
 * pretending.
 *
 *   Read (no card):    what's waiting, how a child is doing this week, the
 *                      rewards, this screen, what Elite adds.
 *   Change (a card):   add a chore, accept a chore, send one back with a
 *                      note, add a reward, add the starter chores.
 *   Never:             anything about the plan or buying (Flash Tickets
 *                      included), Pause and limits, deleting, removing a
 *                      child, linking or unlinking phones, messaging anyone.
 *                      No tool exists for them, and pilotDispatch refuses
 *                      every action but the four below.
 *
 * What goes to the AI: children's first names and chore titles, with
 * numbers (XP, coins, counts). Never an id, an age, a photo, a phone, a
 * note a child wrote, or a child's accessibility notes.
 */
import { reducer, isElite } from '../state/reducer.js'
import { TIERS, PLAN_COMPARISON, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../state/initialState.js'
import { DIFFICULTY, levelFromXp, submissionReward, liveStreak } from '../lib/xp.js'
import { priceWords } from '../lib/plans.js'
import { starterChores } from '../lib/firstWeek.js'
import { blankQuest } from '../lib/questDraft.js'
import { relativeTime } from '../lib/dates.js'

/** The only reducer actions Pilot may ever dispatch. */
export const PILOT_ACTIONS = Object.freeze(['ADD_QUESTS', 'APPROVE_SUBMISSION', 'REJECT_SUBMISSION', 'ADD_REWARD'])

/*
 * Names no RankUp tool may have, on top of the core's own list (payments,
 * deleting, plan changes, messages): the plan, Flash Tickets, Pause and
 * limits, coins, and phones.
 */
export const RANKUP_FORBIDDEN = /plan|tier|buy|flash|ticket|pause|limit|lock|override|coin|pair|link|device|phone|remove|delete|unlink|chat|notif|message|invite|gift|refund/i

const LIMITS = { title: 80, note: 200, reward: 60, xp: 9999, cost: 100000, weekly: 50 }
const DAY = 86400000

/** Refuses anything but the four actions above. */
export function pilotDispatch(app, action) {
  if (!action || !PILOT_ACTIONS.includes(action.type)) {
    throw new Error(`Pilot can't do that in RankUp (${action?.type || 'nothing'}). Only a parent can, on their own screens.`)
  }
  const before = app.getState()
  const after = reducer(before, action)
  if (after === before) return false
  app.dispatch(action)
  return true
}

/** Wait for the app to show a change Pilot just made (the next render). */
const settle = (app) => (typeof app.settled === 'function' ? app.settled() : Promise.resolve())

const clean = (v, most) => String(v ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, most)
const norm = (v) => clean(v, 100).toLowerCase()
const firstNames = (state) => (state.kids || []).map((k) => k.name)

/** One child by first name, or the only child when there is one. */
export function findKid(state, name) {
  const kids = state.kids || []
  if (!kids.length) return { error: 'There are no children in this family yet. Add one under Kids first.' }
  const want = norm(name)
  if (!want) return kids.length === 1 ? { kid: kids[0] } : { error: `Which child? ${firstNames(state).join(', ')}.` }
  const hit = kids.filter((k) => norm(k.name) === want)
  if (hit.length === 1) return { kid: hit[0] }
  return { error: `There's no child called “${clean(name, 30)}”. The children are: ${firstNames(state).join(', ')}.` }
}

const pending = (state) => (state.submissions || []).filter((s) => s.status === 'pending')
  .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
const questOf = (state, id) => (state.quests || []).find((q) => q.id === id)
const kidOf = (state, id) => (state.kids || []).find((k) => k.id === id)

/** One chore waiting for review, by its title (and the child, if given). */
export function findWaiting(state, chore, child) {
  let list = pending(state).map((s) => ({ s, q: questOf(state, s.questId), k: kidOf(state, s.kidId) })).filter((x) => x.q && x.k)
  if (!list.length) return { error: 'Nothing is waiting for review right now.' }
  if (child) {
    const found = findKid(state, child)
    if (found.error) return found
    list = list.filter((x) => x.k.id === found.kid.id)
    if (!list.length) return { error: `Nothing from ${found.kid.name} is waiting for review.` }
  }
  const want = norm(chore)
  const exact = list.filter((x) => norm(x.q.title) === want)
  const hits = exact.length ? exact : want ? list.filter((x) => norm(x.q.title).includes(want)) : list
  if (hits.length === 1) return { item: hits[0] }
  const names = list.map((x) => `${x.k.name}: “${x.q.title}”`).join(', ')
  return { error: hits.length ? `More than one chore matches. Waiting: ${names}.` : `No waiting chore is called “${clean(chore, 60)}”. Waiting: ${names}.` }
}

function pays(state, item) {
  const r = submissionReward(item.q, item.s, { elite: isElite(state), streak: liveStreak(item.k.streak) })
  return { xp: r.xp, coins: r.coins }
}

const noun = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What the screens a family has look like for "explain this screen". */
function screenTool(app) {
  return {
    name: 'explain_this_screen', kind: 'read', available: () => app.shows(),
    description: "The screen the parent is on: its name, a few facts, and the words on it (children's names left out). Use it to explain what they're looking at.",
    parameters: { type: 'object', properties: {} },
    run: () => {
      const s = app.screen()
      return { screen: s.name, facts: s.facts || undefined, words_on_screen: app.screenText() }
    },
  }
}

/** The tools, given the app: { getState, dispatch, shows, inParentMode, screen, screenText }. */
export function rankUpTools(app) {
  const st = () => app.getState()
  const parent = () => app.inParentMode()

  return [
    {
      name: 'whats_waiting_for_review', kind: 'read', available: parent,
      description: "The chores the children have finished that are waiting for the parent to accept or send back, with what each pays. First names and chore titles only.",
      parameters: { type: 'object', properties: {} },
      run: () => {
        const s = st()
        const list = pending(s).map((x) => ({ s: x, q: questOf(s, x.questId), k: kidOf(s, x.kidId) })).filter((x) => x.q && x.k)
        const themes = (s.kidThemes || []).filter((t) => t.useAsk || (t.sendAsk && !t.sentAt)).length
        return {
          waiting: list.slice(0, 30).map((x) => ({ child: x.k.name, chore: x.q.title, sent: relativeTime(x.s.submittedAt), pays: pays(s, x) })),
          count: list.length,
          theme_questions_waiting: themes || undefined,
          where: 'Review (the 📥 tab)',
        }
      },
    },
    {
      name: 'how_is_child_doing', kind: 'read', available: parent,
      description: "How one child is doing over the last 7 days: chores accepted and sent back, XP earned, level, streak, chores still to do. Give the child's first name (optional when there is one child).",
      parameters: { type: 'object', properties: { child: { type: 'string', maxLength: 40, description: "The child's first name." } } },
      run: (args) => {
        const s = st()
        const found = findKid(s, args.child)
        if (found.error) return { error: found.error }
        const kid = found.kid
        const since = Date.now() - 7 * DAY
        const mine = (s.submissions || []).filter((x) => x.kidId === kid.id && (x.decidedAt || x.submittedAt || 0) >= since)
        const accepted = mine.filter((x) => x.status === 'approved')
        const xp = accepted.reduce((n, x) => n + (Number(x.awarded?.xp) || 0), 0)
        const open = (s.quests || []).filter((q) => q.kidId === kid.id && (q.status === 'assigned' || q.status === 'redo'))
        const { level } = levelFromXp(kid.xp || 0)
        return {
          child: kid.name,
          last_7_days: {
            chores_accepted: accepted.length,
            chores_sent_back: mine.filter((x) => x.status === 'rejected').length,
            xp_earned: xp || undefined,
            accepted: accepted.slice(-10).map((x) => questOf(s, x.questId)?.title).filter(Boolean),
          },
          waiting_for_review: pending(s).filter((x) => x.kidId === kid.id).length,
          chores_to_do: open.length,
          to_do: open.slice(0, 10).map((q) => q.title),
          level,
          streak_days: liveStreak(kid.streak) || 0,
          coins: kid.coins || 0,
        }
      },
    },
    {
      name: 'rewards_set_up', kind: 'read', available: parent,
      description: 'The rewards the family has set up (what each costs in coins, and any weekly limit), and how many are waiting to be given.',
      parameters: { type: 'object', properties: {} },
      run: () => {
        const s = st()
        const waiting = (s.redemptions || []).filter((r) => r.status === 'requested')
        return {
          rewards: (s.rewards || []).map((r) => ({ reward: r.name, cost: r.cost, each_child_per_week: r.weeklyLimit || undefined })),
          waiting_to_be_given: waiting.map((r) => ({ child: kidOf(s, r.kidId)?.name || 'a child', reward: r.name })),
          where: 'Settings → Rewards catalogue',
        }
      },
    },
    screenTool(app),
    {
      name: 'what_elite_adds', kind: 'read', available: () => app.shows(),
      description: `What ${TIERS.elite.name} adds over ${TIERS.standard.name} and ${TIERS.starter.name}, with the prices from RankUp's own plan list.`,
      parameters: { type: 'object', properties: {} },
      run: () => {
        // Guilds are switched off, so their lines are left out, as on the plan screen.
        const differs = PLAN_COMPARISON.filter((row) => !row.needs)
          .map((row) => ({ row, e: row.value(TIERS.elite), s: row.value(TIERS.standard), f: row.value(TIERS.starter) }))
          .filter((x) => JSON.stringify(x.e) !== JSON.stringify(x.s))
          .map((x) => ({ feature: x.row.label, elite: x.e, standard: x.s, starter: x.f }))
        return {
          prices: [TIERS.starter, TIERS.standard, TIERS.elite].map((t) => ({ plan: t.name, price: t.price ? `${priceWords(t)} or ${priceWords(t, 'year')}` : 'free' })),
          elite_adds: differs,
          for_children: ELITE_KID_PERKS.filter((p) => !p.needs).map((p) => `${p.title}: ${p.body}`),
          for_parents: ELITE_PARENT_PERKS.map((p) => `${p.title}: ${p.body}`),
          where: 'Settings → Plan, or the plan screen',
        }
      },
    },
    {
      name: 'add_chore', kind: 'change', available: parent,
      description: "Add one chore (a quest) for a child, as the Assign screen does. Give the child's first name, the chore's title, and either a difficulty or an XP amount. Asks the parent first.",
      parameters: {
        type: 'object',
        properties: {
          child: { type: 'string', maxLength: 40, description: "The child's first name (optional when there is one child)." },
          title: { type: 'string', maxLength: LIMITS.title, description: 'What to do, like “Feed the dog”.' },
          difficulty: { type: 'string', enum: Object.keys(DIFFICULTY), description: `Sets the usual XP: ${Object.values(DIFFICULTY).map((d) => `${d.id} ${d.xp}`).join(', ')}.` },
          xp: { type: 'integer', description: `XP it pays, 1 to ${LIMITS.xp} (overrides the difficulty).` },
        },
        required: ['title'],
      },
      describe: (args) => {
        const found = findKid(st(), args.child)
        const plan = choreFrom(args)
        return `add the chore “${plan.title || '(no title)'}” for ${found.kid ? found.kid.name : clean(args.child, 30) || 'your child'} (${plan.xp} XP)`
      },
      run: async (args) => {
        if (!parent()) return { error: 'Pilot can only change things in Parent Mode.' }
        const found = findKid(st(), args.child)
        if (found.error) return { error: found.error }
        const plan = choreFrom(args)
        if (!plan.title) return { error: 'The chore needs a title.' }
        const kid = found.kid
        const quest = { ...blankQuest(kid.id, Boolean(kid.accessibility?.hasNeeds)), kidId: kid.id, title: plan.title,
          difficulty: plan.difficulty, xp: plan.xp, pence: 0 }
        if (!pilotDispatch(app, { type: 'ADD_QUESTS', quests: [quest] })) return { error: 'RankUp did not add it.' }
        await settle(app)
        return { done: true, said: `“${plan.title}” added for ${kid.name}, ${plan.xp} XP. It's on their quest list now.` }
      },
    },
    {
      name: 'accept_chore', kind: 'change', available: parent,
      description: "Accept a finished chore that is waiting for review, as the Accept button in Review does: the child gets its XP and coins. Name the chore (and the child if two could match). Asks the parent first.",
      parameters: {
        type: 'object',
        properties: {
          chore: { type: 'string', maxLength: LIMITS.title, description: "The chore's title." },
          child: { type: 'string', maxLength: 40, description: "The child's first name." },
        },
        required: ['chore'],
      },
      describe: (args) => {
        const s = st()
        const found = findWaiting(s, args.chore, args.child)
        if (found.error) return `accept “${clean(args.chore, 60)}” (${found.error})`
        const p = pays(s, found.item)
        return `accept ${found.item.k.name}'s “${found.item.q.title}” (+${p.xp} XP, ${p.coins} coins)`
      },
      run: async (args) => {
        if (!parent()) return { error: 'Pilot can only change things in Parent Mode.' }
        const s = st()
        const found = findWaiting(s, args.chore, args.child)
        if (found.error) return { error: found.error }
        const p = pays(s, found.item)
        if (!pilotDispatch(app, { type: 'APPROVE_SUBMISSION', submissionId: found.item.s.id, sticker: null })) {
          return { error: 'RankUp did not accept it (it may have been reviewed already).' }
        }
        await settle(app)
        return { done: true, said: `Accepted ${found.item.k.name}'s “${found.item.q.title}”: +${p.xp} XP and ${p.coins} coins.` }
      },
    },
    {
      name: 'send_chore_back', kind: 'change', available: parent,
      description: "Send a finished chore back to be done again, with a short note saying what to change, as Send back in Review does. Asks the parent first.",
      parameters: {
        type: 'object',
        properties: {
          chore: { type: 'string', maxLength: LIMITS.title, description: "The chore's title." },
          child: { type: 'string', maxLength: 40, description: "The child's first name." },
          note: { type: 'string', maxLength: LIMITS.note, description: 'What needs to change, kindly put. The child sees it.' },
        },
        required: ['chore'],
      },
      describe: (args) => {
        const found = findWaiting(st(), args.chore, args.child)
        const note = clean(args.note, LIMITS.note)
        if (found.error) return `send back “${clean(args.chore, 60)}” (${found.error})`
        return `send ${found.item.k.name}'s “${found.item.q.title}” back to redo${note ? `, with the note “${note}”` : ', with no note'}`
      },
      run: async (args) => {
        if (!parent()) return { error: 'Pilot can only change things in Parent Mode.' }
        const found = findWaiting(st(), args.chore, args.child)
        if (found.error) return { error: found.error }
        const note = clean(args.note, LIMITS.note)
        if (!pilotDispatch(app, { type: 'REJECT_SUBMISSION', submissionId: found.item.s.id, note })) {
          return { error: 'RankUp did not send it back (it may have been reviewed already).' }
        }
        await settle(app)
        return { done: true, said: `Sent “${found.item.q.title}” back to ${found.item.k.name}${note ? ' with your note' : ''}. It's on their list again.` }
      },
    },
    {
      name: 'add_reward', kind: 'change', available: parent,
      description: 'Add a reward to the family’s rewards catalogue, which children buy with their coins, as Settings → Rewards catalogue does. Asks the parent first.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: LIMITS.reward, description: 'The reward, like “Pick Friday’s film”.' },
          cost: { type: 'integer', description: `What it costs in coins, 1 to ${LIMITS.cost}.` },
          each_child_per_week: { type: 'integer', description: `At most this many a week for each child, 1 to ${LIMITS.weekly} (leave out for no limit).` },
        },
        required: ['name', 'cost'],
      },
      describe: (args) => {
        const r = rewardFrom(args)
        return `add the reward “${r.name || '(no name)'}” for ${r.cost} coins${r.weeklyLimit ? ` (each child up to ${r.weeklyLimit} a week)` : ''}`
      },
      run: async (args) => {
        if (!parent()) return { error: 'Pilot can only change things in Parent Mode.' }
        const r = rewardFrom(args)
        if (!r.name) return { error: 'The reward needs a name.' }
        if (!(r.cost >= 1)) return { error: `The cost must be 1 to ${LIMITS.cost} coins.` }
        if (!pilotDispatch(app, { type: 'ADD_REWARD', reward: { name: r.name, cost: r.cost, description: '', icon: '🎁', weeklyLimit: r.weeklyLimit } })) {
          return { error: 'RankUp did not add it.' }
        }
        await settle(app)
        return { done: true, said: `“${r.name}” is in the rewards catalogue for ${r.cost} coins.` }
      },
    },
    {
      name: 'add_starter_chores', kind: 'change', available: parent,
      description: "Add RankUp's three starter chores for one child (the same three as the “Getting started” card). Asks the parent first.",
      parameters: { type: 'object', properties: { child: { type: 'string', maxLength: 40, description: "The child's first name." } } },
      describe: (args) => {
        const found = findKid(st(), args.child)
        if (found.error) return `add the starter chores (${found.error})`
        const list = starterChores(found.kid)
        return `add ${list.length} starter chores for ${found.kid.name}: ${list.map((q) => q.title).join(', ')}`
      },
      run: async (args) => {
        if (!parent()) return { error: 'Pilot can only change things in Parent Mode.' }
        const found = findKid(st(), args.child)
        if (found.error) return { error: found.error }
        const quests = starterChores(found.kid)
        if (!quests.length) return { error: 'There are no starter chores for this child.' }
        if (!pilotDispatch(app, { type: 'ADD_QUESTS', quests })) return { error: 'RankUp did not add them.' }
        await settle(app)
        return { done: true, said: `Added for ${found.kid.name}: ${quests.map((q) => q.title).join(', ')}.` }
      },
    },
  ].filter((t) => !RANKUP_FORBIDDEN.test(t.name))
}

function choreFrom(args) {
  const difficulty = DIFFICULTY[args.difficulty] ? args.difficulty : 'medium'
  const typed = Number(args.xp)
  const xp = Number.isInteger(typed) && typed >= 1 && typed <= LIMITS.xp ? typed : DIFFICULTY[difficulty].xp
  return { title: clean(args.title, LIMITS.title), difficulty, xp }
}

function rewardFrom(args) {
  const cost = Number(args.cost)
  const weekly = Number(args.each_child_per_week)
  return {
    name: clean(args.name, LIMITS.reward),
    cost: Number.isInteger(cost) && cost >= 1 && cost <= LIMITS.cost ? cost : 0,
    weeklyLimit: Number.isInteger(weekly) && weekly >= 1 && weekly <= LIMITS.weekly ? weekly : null,
  }
}

/** For the tests: how many of a thing, in words. */
export const _test = { noun, choreFrom, rewardFrom, LIMITS }
