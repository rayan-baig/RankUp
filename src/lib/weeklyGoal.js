/**
 * A child's weekly goal (0.26.0): chores a parent ACCEPTED this week, out of
 * a number the parent sets in Settings (the same for every child).
 *
 * The card on a child's Home used to be called "Weekly goal" and counted
 * nothing of the kind: chores sent against chores still open, right now. It
 * went down when a parent added a chore and had no target at all.
 *
 * "This week" starts at midnight on the family's weekly day (the day weekly
 * chores come back, Settings), or on Monday when they have not picked one.
 * The goal is kept on the family row (families.weekly_chore_goal, set by
 * set_weekly_chore_goal in supabase/sync.sql), so a child's own phone shows
 * the number the parent picked on theirs.
 */
import { now as clock } from './id.js'

export const DEFAULT_WEEKLY_GOAL = 5
export const MIN_WEEKLY_GOAL = 1
export const MAX_WEEKLY_GOAL = 50
/** The choices offered in Settings. */
export const WEEKLY_GOAL_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 20, 25, 30]

/** A goal as a whole number in range, or the default for anything else. */
export function cleanWeeklyGoal(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < MIN_WEEKLY_GOAL || n > MAX_WEEKLY_GOAL) return null
  return n
}

/** The family's goal: what the parent set, else the default. */
export function weeklyGoalOf(state) {
  return cleanWeeklyGoal(state?.family?.weeklyChoreGoal) ?? DEFAULT_WEEKLY_GOAL
}

/**
 * Midnight (this phone's time) at the start of the week holding `now`.
 * `weekDay` is ISO: Monday 1 to Sunday 7; anything else means Monday.
 */
export function weekStartOf(now = clock(), weekDay = null) {
  const start = Number.isInteger(weekDay) && weekDay >= 1 && weekDay <= 7 ? weekDay : 1
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const iso = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - ((iso - start + 7) % 7))
  return d.getTime()
}

/** Chores of this child's a parent accepted since the week began. */
export function acceptedThisWeek(state, kidId, now = clock()) {
  const since = weekStartOf(now, state?.family?.weekResetsOn ?? null)
  return (state?.submissions || []).filter((s) => s.kidId === kidId && s.status === 'approved'
    && Number(s.decidedAt) >= since && Number(s.decidedAt) <= now).length
}

/** { done, goal, met } for a child's Home. */
export function weeklyGoalProgress(state, kidId, now = clock()) {
  const goal = weeklyGoalOf(state)
  const done = acceptedThisWeek(state, kidId, now)
  return { done, goal, met: done >= goal }
}
