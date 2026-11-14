/**
 * The arcade's limits, said to a child in plain words.
 *
 * Two limits, and they work differently, which is exactly why they need
 * saying:
 *
 *   - tokens are not daily. One comes with every chore a parent accepts, a
 *     game uses one, and a child can hold MAX_TOKENS at most;
 *   - winnings ARE daily: at most DAILY_COIN_CAP a day from games, counted on
 *     this phone's own day (the server counts the same day, see
 *     play_minigame), so they come back at midnight.
 *
 * Every number is read from data/minigames.js, never typed here.
 * tests/arcadewords.mjs checks that, and the words for each case.
 */
import { MAX_TOKENS, DAILY_COIN_CAP } from '../data/minigames.js'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** How long until midnight on this phone, said the way a child says it. */
export function untilMidnight(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now)
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  const mins = Math.max(1, Math.round((midnight - d) / 60000))
  if (mins < 60) return `in ${plural(mins, 'minute')}`
  const hours = Math.round(mins / 60)
  if (hours >= 24) return 'in 24 hours'
  return `in about ${plural(hours, 'hour')}`
}

/**
 * `{ tokens, coins }`: one friendly line for each limit, plus the numbers they
 * were made from, so the screen can show both.
 */
export function arcadeLimits({ tokens = 0, earnedToday = 0, unlimited = false, currency = 'coins', now = new Date() } = {}) {
  const held = Math.max(0, Math.min(MAX_TOKENS, Math.floor(tokens || 0)))
  const won = Math.max(0, Math.min(DAILY_COIN_CAP, Math.floor(earnedToday || 0)))
  const left = DAILY_COIN_CAP - won

  let tokenLine
  if (unlimited) tokenLine = 'Play as much as you like. This is the look-around, so tokens never run out.'
  else if (held === 0) tokenLine = `Every chore your parent accepts gives you 1 token, which plays one game (you can keep up to ${MAX_TOKENS}).`
  else if (held === MAX_TOKENS) tokenLine = `You have ${plural(held, 'token')}, the most you can keep. Play one so the next chore's token isn't wasted.`
  else tokenLine = `You have ${plural(held, 'token')} left. A game uses 1, and every chore your parent accepts gives you 1 more (up to ${MAX_TOKENS}).`

  const coinLine = left > 0
    ? `You can still win ${left} ${currency} today${won ? ` (you've won ${won} of ${DAILY_COIN_CAP})` : ` (up to ${DAILY_COIN_CAP} a day)`}.`
    : `You've won all ${DAILY_COIN_CAP} ${currency} for today. You can keep playing for fun; winnings come back at midnight, ${untilMidnight(now)}.`

  return { tokens: tokenLine, coins: coinLine, held, won, left, max: MAX_TOKENS, cap: DAILY_COIN_CAP }
}
