/**
 * "This week" on the parent's dashboard (0.30.0): what the family got done
 * in the last seven days, beside the seven before, so a parent sees what
 * RankUp is doing for them without opening a chart.
 *
 * Read from the synced submissions, like the activity feed (lib/activity.js),
 * so a co-parent's accepts and a child's own phone count on every phone:
 *   - chores: chores accepted;
 *   - xp: the XP those chores paid;
 *   - streak: the longest run of days in a row with a chore accepted (any
 *     child), inside each seven days.
 */
import { dayKey, addDays } from './dates.js'

/** The seven day-keys ending `end` (a Date), oldest first. */
function sevenDays(end) {
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(end, i - 6)))
}

function tally(subs, days) {
  const inside = new Set(days)
  let chores = 0
  let xp = 0
  const busy = new Set()
  for (const s of subs) {
    const day = dayKey(new Date(s.decidedAt))
    if (!inside.has(day)) continue
    chores += 1
    xp += Number(s.awarded?.xp) || 0
    busy.add(day)
  }
  let streak = 0
  let run = 0
  for (const d of days) {
    run = busy.has(d) ? run + 1 : 0
    streak = Math.max(streak, run)
  }
  return { chores, xp, streak }
}

/**
 * { now: {chores, xp, streak}, before: {...}, any } for the last seven days
 * (today included) and the seven before them. `any` is false when neither
 * has a single accepted chore: a new family, with nothing to compare yet.
 */
export function weekCompare(state, now = Date.now()) {
  const today = new Date(now)
  const subs = (state?.submissions || []).filter((s) => s.status === 'approved' && Number(s.decidedAt) > 0 && Number(s.decidedAt) <= now)
  const current = tally(subs, sevenDays(today))
  const before = tally(subs, sevenDays(addDays(today, -7)))
  return { now: current, before, any: current.chores + before.chores > 0 }
}

/**
 * The change in words: "▲ 3 on last week", "▼ 2 on last week", "Same as
 * last week", or "New this week" when last week had none (a family's first
 * week: "up 2 on nothing" is no comparison).
 */
export function changeWords(now, before) {
  if (now === before) return { words: 'Same as last week', dir: 'same' }
  if (before === 0) return { words: 'New this week', dir: 'up' }
  const up = now > before
  return { words: `${up ? '▲' : '▼'} ${Math.abs(now - before).toLocaleString()} on last week`, dir: up ? 'up' : 'down' }
}
