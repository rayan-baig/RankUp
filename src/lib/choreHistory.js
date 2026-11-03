/**
 * Every chore's history, for the parent's Chore history screen.
 *
 * Read from the submissions themselves, which travel between phones and carry
 * everything there is to say: which child, when it was sent, whether it was
 * accepted or sent back, when and by whom, what it paid, and why it was sent
 * back. The activity log on the dashboard is the same thing cut to eight
 * lines and mixed with everything else; this is the whole of it, per chore.
 *
 * Nothing here changes a figure. What a chore paid was decided by the
 * database (award_for_submission) and has been spent, levelled and streaked
 * on since; see ParentHistory for why it is not editable.
 */
import { dayKey } from './dates.js'

export const OUTCOMES = [
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Accepted' },
  { id: 'rejected', label: 'Sent back' },
  { id: 'pending', label: 'Waiting' },
]

/** The longest note a parent may add to a past chore (the database holds the same). */
export const HISTORY_NOTE_MAX = 300

/**
 * One line per time a chore was sent in, newest first. `kidId` null is every
 * child; `outcome` is one of OUTCOMES' ids. `adults` names who decided, from
 * family_adults(), when the phone has it.
 */
export function choreHistory(state, { kidId = null, outcome = 'all', adults = [] } = {}) {
  const quests = new Map((state.quests || []).map((q) => [q.id, q]))
  const kids = new Map((state.kids || []).map((k) => [k.id, k]))
  const who = new Map((adults || []).map((a) => [a.id, a.name]))
  return (state.submissions || [])
    .filter((s) => kids.has(s.kidId))
    .filter((s) => !kidId || s.kidId === kidId)
    .filter((s) => outcome === 'all' || s.status === outcome)
    .map((s) => {
      const quest = quests.get(s.questId)
      const decided = s.status === 'approved' || s.status === 'rejected'
      return {
        id: s.id,
        kidId: s.kidId,
        kidName: kids.get(s.kidId)?.name || 'A child',
        title: quest?.title || 'A chore',
        status: s.status,
        submittedAt: s.submittedAt || null,
        decidedAt: decided ? s.decidedAt || null : null,
        decidedBy: decided ? who.get(s.decidedBy) || null : null,
        xp: s.status === 'approved' ? s.awarded?.xp || 0 : 0,
        coins: s.status === 'approved' ? s.awarded?.coins || 0 : 0,
        reason: s.status === 'rejected' ? s.parentNote || '' : '',
        sticker: s.status === 'approved' ? s.sticker || null : null,
        note: s.historyNote || '',
        at: (decided ? s.decidedAt : null) || s.submittedAt || 0,
      }
    })
    .sort((a, b) => b.at - a.at)
}

/** What the lines on screen add up to. */
export function historyTotals(entries) {
  return entries.reduce((t, e) => ({
    accepted: t.accepted + (e.status === 'approved' ? 1 : 0),
    sentBack: t.sentBack + (e.status === 'rejected' ? 1 : 0),
    waiting: t.waiting + (e.status === 'pending' ? 1 : 0),
    xp: t.xp + e.xp,
    coins: t.coins + e.coins,
  }), { accepted: 0, sentBack: 0, waiting: 0, xp: 0, coins: 0 })
}

/** The lines under a heading per day, newest day first. */
export function byDay(entries) {
  const days = []
  for (const e of entries) {
    const key = dayKey(new Date(e.at || 0))
    if (days.at(-1)?.key !== key) days.push({ key, at: e.at, entries: [] })
    days.at(-1).entries.push(e)
  }
  return days
}
