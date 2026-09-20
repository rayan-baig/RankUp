/**
 * Chores that come back.
 *
 * `recurrence` has been on a quest since the first schema, and for months it
 * did nothing at all: there was no picker for it and nothing ever brought a
 * finished chore back. Every "make your bed" had to be assigned again by hand,
 * every single morning, which is most of the work a parent does in this app.
 *
 * The rule lives here AND in recurring_quest_due() in supabase/sync.sql. Two
 * copies is a real cost, paid on purpose: a phone with no backend at all still
 * has to bring tomorrow's chores back by itself, and a phone WITH one must not
 * be the thing that decides which chores reopen — reopening a quest is how it
 * gets paid a second time. So the device works it out to show it immediately,
 * the database works it out to make it true, and tests/recurrence.mjs runs the
 * two over every combination and fails the build if they ever disagree.
 */

export const RECURRENCES = [
  { id: 'once', label: 'Just once', blurb: 'Disappears when it is done.' },
  { id: 'daily', label: 'Every day', blurb: 'Back tomorrow morning, weekends included.' },
  { id: 'weekdays', label: 'School days', blurb: 'Back each morning, Monday to Friday.' },
  { id: 'weekly', label: 'Every week', blurb: 'Back seven days after it was done.' },
]

export const REPEATS = new Set(['daily', 'weekdays', 'weekly'])

/** A calendar day as YYYY-MM-DD, in the phone's own timezone. */
export function dayOf(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Days between two YYYY-MM-DD strings, positive when `b` is later. */
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** Monday is 1 and Sunday is 7, matching Postgres's isodow. */
function isoWeekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
}

/**
 * Is this chore due to come back?
 *
 * A chore that is not finished is never due. The child still owes it, and
 * bringing it back would quietly wipe a send-back note a parent had just
 * written — which would read, to the child, as the parent changing their mind.
 */
export function recurrenceDue(quest, today = dayOf(new Date())) {
  if (!quest || !REPEATS.has(quest.recurrence)) return false
  if (quest.status !== 'approved') return false
  const last = quest.lastResetOn || dayOf(quest.completedAt)
  if (!last || !today) return false

  if (quest.recurrence === 'daily') return daysBetween(last, today) > 0
  if (quest.recurrence === 'weekdays') {
    return daysBetween(last, today) > 0 && isoWeekday(today) <= 5
  }
  return daysBetween(last, today) >= 7
}

/** Every quest in this state that should be back on the list today. */
export function questsDueToReturn(quests, today = dayOf(new Date())) {
  return (quests || []).filter((q) => recurrenceDue(q, today))
}
