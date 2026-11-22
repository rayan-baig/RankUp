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
export function trialHeadsUp(state, plan, paid, days) {
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
  return `Heads-up: the trial ends ${when}. On ${paid.name}, ${stops.join(' and ')} stop. Everything your children have earned stays theirs.`
}
