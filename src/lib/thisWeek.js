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

/* ---------------------------------------------------------------- what the plan gave (0.32.0) */

/** The boost's line in a chore's breakdown ("1.5× XP boost", lib/xp.js calcReward). */
const BOOST_LINE = /×\s*XP boost$/

/**
 * The extra XP a boosted plan's multiplier paid on one accepted chore.
 *
 * From the chore's own breakdown when this phone has it (the phone that
 * accepted it). A chore accepted on another phone arrives by sync with its
 * XP but not its breakdown (lib/sync/mappers.js), so for those, while the
 * family's plan has a boost now, the boost's share is worked back from the
 * XP paid: the multiplier is applied last (calcReward), so the extra is
 * xp − xp ÷ multiplier, to the nearest point.
 */
export function boostOf(sub, { multiplier = 1, lines = null } = {}) {
  const breakdown = lines ?? sub?.awarded?.lines
  if (Array.isArray(breakdown) && breakdown.length) {
    return breakdown.filter((l) => BOOST_LINE.test(String(l?.label || ''))).reduce((t, l) => t + (Number(l.value) || 0), 0)
  }
  const xp = Number(sub?.awarded?.xp) || 0
  if (!(multiplier > 1) || xp <= 0) return 0
  return xp - Math.round(xp / multiplier)
}

/**
 * Each child's last seven days: chores accepted, XP earned, and how much of
 * that XP the plan's boost added. `multiplier` is the boost the family has
 * now (1 for none), used only for chores whose breakdown this phone lacks.
 * In the order of state.kids; a child with nothing this week is left out.
 */
export function kidsThisWeek(state, now = Date.now(), multiplier = 1) {
  const days = new Set(sevenDays(new Date(now)))
  const per = new Map()
  for (const s of state?.submissions || []) {
    if (s.status !== 'approved' || !(Number(s.decidedAt) > 0) || Number(s.decidedAt) > now) continue
    if (!days.has(dayKey(new Date(s.decidedAt)))) continue
    const row = per.get(s.kidId) || { chores: 0, xp: 0, boost: 0 }
    row.chores += 1
    row.xp += Number(s.awarded?.xp) || 0
    row.boost += boostOf(s, { multiplier })
    per.set(s.kidId, row)
  }
  return (state?.kids || []).filter((k) => per.has(k.id)).map((k) => ({ kidId: k.id, name: k.name, ...per.get(k.id) }))
}

const list = (words) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`)

/**
 * What the boost gave this week, in one line for a parent: "The 1.5× XP
 * boost gave Ava 60 extra XP this week." Null when it gave nothing. Names
 * are the family's own, shown only on the parent's screens.
 */
export function boostWords(kids, multiplier) {
  const got = kids.filter((k) => k.boost > 0)
  if (!got.length) return null
  const parts = got.map((k, i) => (i === 0 ? `${k.name} ${k.boost.toLocaleString()} extra XP` : `${k.name} ${k.boost.toLocaleString()}`))
  return `The ${multiplier}× XP boost gave ${list(parts)} this week.`
}

/** "16–22 Nov": the seven days ending `now`. */
export function weekRange(now = Date.now()) {
  const end = new Date(now)
  const start = addDays(end, -6)
  const fmt = (d, opts) => d.toLocaleDateString('en-GB', opts)
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${fmt(end, { day: 'numeric', month: 'short' })}`
    : `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short' })}`
}

/**
 * The week in a few lines a parent can send to the other grown-ups (0.32.0):
 * the family's numbers against last week, each child's chores and XP, and
 * what the boost gave. Made on the phone; it goes nowhere until the parent
 * presses Share or Copy. No family name, no surname, nothing else.
 */
export function weekShareText(state, now = Date.now(), multiplier = 1) {
  const week = weekCompare(state, now)
  const kids = kidsThisWeek(state, now, multiplier)
  const vs = (n, before) => {
    if (n === before) return 'same as last week'
    if (before === 0) return 'new this week'
    return `${Math.abs(n - before).toLocaleString()} ${n > before ? 'more' : 'fewer'} than last week`
  }
  const lines = [
    `Our week on RankUp (${weekRange(now)})`,
    `- ${week.now.chores.toLocaleString()} ${week.now.chores === 1 ? 'chore' : 'chores'} done (${vs(week.now.chores, week.before.chores)})`,
    `- ${week.now.xp.toLocaleString()} XP earned`,
    `- ${week.now.streak.toLocaleString()} ${week.now.streak === 1 ? 'day' : 'days'} in a row`,
  ]
  if (kids.length) lines.push(kids.map((k) => `${k.name}: ${k.chores} ${k.chores === 1 ? 'chore' : 'chores'}, ${k.xp.toLocaleString()} XP`).join('. ') + '.')
  const boost = boostWords(kids, multiplier)
  if (boost) lines.push(boost)
  return lines.join('\n')
}
