/**
 * Keeping a year of chores from filling the phone.
 *
 * Everything RankUp keeps on a phone is in localStorage (nothing uses
 * IndexedDB), and a busy family fills it: three children doing eight chores a
 * day came to 6.2 million characters in a year, about 12 MB as the browser
 * stores it, where Safari allows about 5 MB in all (tests/storagegrowth.mjs).
 * The finished chores were most of it, and nothing ever let go of one. With
 * this, the same year levels off at about 1.7 million characters.
 *
 * So old, finished things are let go of, on a phone that syncs, once the
 * server has them. The rules, every one of which has to hold:
 *
 *   - Only what the server already has (a row it has sent back, so it has a
 *     `rev`). A phone with no backend holds the only copy, and keeps it all.
 *   - Never anything still waiting to be sent, or that anything waiting to be
 *     sent names: a submission, its chore, a note. The outbox is never
 *     touched at all.
 *   - Only finished things older than KEEP_DAYS: a chore accepted or sent back
 *     two months ago, a one-off chore done two months ago with nothing left
 *     pointing at it, a note read two months ago. Never a chore still waiting.
 *   - Nothing that something on screen is worked out from: the badges keep
 *     the chores that earned them (the first hundred, one per kind of chore,
 *     the timed and boss ones, the best test score), the counts on a child's
 *     profile carry on in `historyTally`, and a child in Block Craft's dragon
 *     fight keeps every chore, because the fight is counted from them.
 *   - Nothing is deleted anywhere but on this phone. Chores and notes are
 *     dropped from the shadow at the same moment as from the state (see
 *     forgetRows), so the next save does not read their absence as a delete.
 *
 * The server keeps everything, and "Download my data" reads it from there.
 */
import { levelFromXp } from './xp.js'
import { DRAGON_LEVEL } from './dragonFight.js'
import { CHORE_EVENT_TYPES } from './activity.js'

export const KEEP_DAYS = 60
const DAY = 86400000

/** How many of each kind of chore a badge needs, at most (data/badges.js). */
const BADGE_KEEPS = { approved: 100, timed: 5, boss: 3, clean: 10 }

/** Every id anything still waiting to be sent mentions, wherever it sits. */
function idsIn(work) {
  const ids = new Set()
  const walk = (value) => {
    if (typeof value === 'string') ids.add(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(work)
  return ids
}

/** The approved chores a child's badges are earned from, which stay. */
function badgeWitnesses(subs, quests) {
  const keep = new Set()
  const approved = subs.filter((s) => s.status === 'approved').sort((a, b) => (a.decidedAt || 0) - (b.decidedAt || 0))
  const take = (list, n) => list.slice(0, n).forEach((s) => keep.add(s.id))
  take(approved, BADGE_KEEPS.approved)
  const firstOfKind = new Map()
  for (const s of approved) {
    const kind = quests.get(s.questId)?.category
    if (kind && !firstOfKind.has(kind)) firstOfKind.set(kind, s.id)
  }
  firstOfKind.forEach((id) => keep.add(id))
  take(approved.filter((s) => (quests.get(s.questId)?.timerSeconds || 0) > 0 && s.onTime !== false), BADGE_KEEPS.timed)
  take(approved.filter((s) => quests.get(s.questId)?.difficulty === 'boss'), BADGE_KEEPS.boss)
  take(approved.filter((s) => !(quests.get(s.questId)?.redoCount > 0)), BADGE_KEEPS.clean)
  const best = approved.reduce((top, s) => (typeof s.testScore === 'number' && s.testScore > (top?.testScore ?? -1) ? s : top), null)
  if (best) keep.add(best.id)
  return keep
}

/**
 * What can go, by id: `{ submissions, quests, notes }`, and `count`.
 *
 * `work` is everything not yet sent: the outbox and the calls the reducer has
 * asked for that are not in it yet.
 */
export function prunable(state, { work = [], now = Date.now(), keepDays = KEEP_DAYS } = {}) {
  const cutoff = now - keepDays * DAY
  const waiting = idsIn(work)
  const quests = new Map((state.quests || []).map((q) => [q.id, q]))
  const subs = state.submissions || []

  const dragonKids = new Set((state.kids || [])
    .filter((k) => k.themeId === 'blockcraft' && levelFromXp(k.xp || 0).level >= DRAGON_LEVEL).map((k) => k.id))

  const byKid = new Map()
  for (const s of subs) byKid.set(s.kidId, [...(byKid.get(s.kidId) || []), s])
  const witnesses = new Set()
  byKid.forEach((list) => badgeWitnesses(list, quests).forEach((id) => witnesses.add(id)))

  const submissions = subs.filter((s) => (s.status === 'approved' || s.status === 'rejected')
    && s.rev != null && s.decidedAt && s.decidedAt < cutoff
    && !waiting.has(s.id)
    && !witnesses.has(s.id) && !dragonKids.has(s.kidId)).map((s) => s.id)

  const going = new Set(submissions)
  const stillPointedAt = new Set(subs.filter((s) => !going.has(s.id)).map((s) => s.questId))
  const questIds = (state.quests || []).filter((q) => (q.recurrence || 'once') === 'once' && q.status === 'approved'
    && q.rev != null && (q.completedAt || q.createdAt || now) < cutoff
    && !stillPointedAt.has(q.id) && !waiting.has(q.id)).map((q) => q.id)

  const notes = (state.notes || []).filter((n) => n.read && n.rev != null && (n.at || now) < cutoff
    && !waiting.has(n.id)).map((n) => n.id)

  return { submissions, quests: questIds, notes, count: submissions.length + questIds.length + notes.length }
}

/**
 * The state without them. Pure, and used by both the save (to write the
 * smaller state) and the reducer (PRUNE_HISTORY), so the two agree.
 *
 * The counts on a child's profile are kept going in `historyTally`, and the
 * phone's own log forgets the chores that went, so none is counted twice.
 */
export function applyPrune(state, dropped) {
  if (!dropped?.count) return state
  const subIds = new Set(dropped.submissions)
  const questIds = new Set(dropped.quests)
  const noteIds = new Set(dropped.notes)
  const tally = { ...(state.historyTally || {}) }
  const goneQuests = new Set()
  const submissions = []
  for (const s of state.submissions || []) {
    if (!subIds.has(s.id)) { submissions.push(s); continue }
    const t = { approved: 0, rejected: 0, ...(tally[s.kidId] || {}) }
    t[s.status] = (t[s.status] || 0) + 1
    tally[s.kidId] = t
    goneQuests.add(s.questId)
  }
  return {
    ...state,
    submissions,
    quests: (state.quests || []).filter((q) => !questIds.has(q.id)),
    notes: (state.notes || []).filter((n) => !noteIds.has(n.id)),
    events: (state.events || []).filter((e) => !(CHORE_EVENT_TYPES.has(e.type) && goneQuests.has(e.meta?.questId))),
    historyTally: tally,
  }
}

/** Both at once: `{ state, dropped }`. */
export function pruneHistory(state, options) {
  const dropped = prunable(state, options)
  return { state: applyPrune(state, dropped), dropped }
}

/** Chores accepted and sent back on this child's profile, the ones let go of included. */
export function choreCounts(state, kidId, feed) {
  const t = state.historyTally?.[kidId] || {}
  return {
    approved: feed.filter((e) => e.type === 'quest_approved').length + (t.approved || 0),
    rejected: feed.filter((e) => e.type === 'quest_rejected').length + (t.rejected || 0),
  }
}
