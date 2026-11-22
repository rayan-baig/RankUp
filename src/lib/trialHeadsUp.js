import { TRIAL_DAYS } from '../state/initialState.js'
import { boostSince, soFarWords } from './thisWeek.js'

/*
 * The trial banner's heads-up (components/TrialBanner.jsx, 0.30.0), in the
 * last three days of a free trial: which of its extras stop when it ends, by
 * name, on the plan the family pays for, and that nothing earned goes.
 * Parent Mode only, never a price, never a warning.
 */
/**
 * What stops when the trial ends, said kindly and by name: the children's
 * boost (with their names), the Elite tools, the Elite look. Null when the
 * plan they pay for already has all of it.
 */
/** When this family's free trial began: its end less the trial's length. */
export function trialStart(family) {
  const end = Number(family?.trialEndsAt)
  return Number.isFinite(end) ? end - TRIAL_DAYS * 86400000 : null
}

/**
 * What the trial's boost has given so far, child by child (0.33.0): "Mia
 * +15 XP". From the chores accepted since the trial began. Null when the
 * trial has no boost over the plan they pay for, or it has given nothing yet.
 * Parent Mode only (the Elite card on Plans, the heads-up); never a price.
 */
export function trialBoostSoFar(state, plan, paid, now = Date.now()) {
  if (!(plan?.xpMultiplier > (paid?.xpMultiplier || 1))) return null
  const since = trialStart(state?.family)
  if (since === null) return null
  return soFarWords(boostSince(state, since, now, plan.xpMultiplier))
}

export function trialHeadsUp(state, plan, paid, days, now = Date.now()) {
  const stops = []
  const names = (state.kids || []).map((k) => k.name).filter(Boolean)
  if (plan.xpMultiplier > paid.xpMultiplier) {
    const whose = names.length === 1 ? `${names[0]}'s` : names.length === 2 ? `${names[0]} and ${names[1]}'s` : "the children's"
    stops.push(`${whose} ${plan.xpMultiplier}× boost`)
  }
  const tools = ['consequenceEngine', 'blueprints', 'alliances'].some((k) => plan.limits[k] && !paid.limits[k])
  if (tools) stops.push('the Elite tools')
  else if (plan.limits.overdrive && !paid.limits.overdrive) stops.push('the Overdrive look')
  if (!stops.length) return null
  const when = days === 1 ? 'within a day' : `in ${days} days`
  const soFar = trialBoostSoFar(state, plan, paid, now)
  return `Heads-up: the trial ends ${when}. On ${paid.name}, ${stops.join(' and ')} stop.${soFar ? ` The boost so far: ${soFar}.` : ''} Everything your children have earned stays theirs.`
}
