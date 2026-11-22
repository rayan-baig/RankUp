/**
 * A level-up the CHILD sees (0.30.0).
 *
 * The level-up moment was raised where the parent tapped Accept, so on a
 * phone the family shares it was the parent who saw it, on Review, and the
 * child opened Home later to a number that had simply changed. Now each
 * phone remembers the last level it showed a child on their own Home
 * (state.seen, "kid-level:<child>:<level>", this phone's alone), and a child
 * whose level has gone up since sees the moment there, the next time they
 * open it.
 *
 * On a child's own phone the level-up already arrives with the sync that
 * brings it (state/reducer.js), so there this only remembers. A child this
 * phone has never shown a level to starts from now, so an update does not
 * celebrate levels reached long ago:
 * only the level-ups this phone logged in the last few days count (on the
 * demo, only those of the last hour: the demo's own history is not news).
 */
import { levelFromXp, totalXpForLevel } from './xp.js'

const DAY = 86400000

/** The name of "this phone showed this child this level". */
export const levelKey = (kidId, level) => `kid-level:${kidId}:${level}`

/** The highest level this phone has shown this child on their Home, or null. */
export function lastSeenLevel(state, kidId) {
  const prefix = `kid-level:${kidId}:`
  let best = null
  for (const key of Object.keys(state?.seen || {})) {
    if (!key.startsWith(prefix)) continue
    const n = Number(key.slice(prefix.length))
    if (Number.isFinite(n) && (best === null || n > best)) best = n
  }
  return best
}

/**
 * { level, news }: the child's level now, and the level-up to show them
 * ({ kidId, from, to }), or null when there is nothing new.
 */
export function levelNews(state, kid, now = Date.now()) {
  const level = levelFromXp(kid?.xp || 0).level
  /* A child's own phone already shows each level-up as it arrives by sync
     (state/reducer.js), and its first pull brings levels reached long ago,
     which are not news: there Home only remembers. */
  if (!kid || state?.device?.role === 'kid') return { level, news: null }
  let from = lastSeenLevel(state, kid.id)
  if (from === null) {
    const since = now - (state?.demo ? DAY / 24 : 3 * DAY)
    const recent = (state?.events || []).filter((e) => e.type === 'level_up' && e.kidId === kid.id
      && Number(e.at) >= since && Number.isFinite(Number(e.meta?.from)))
    from = recent.length ? Math.min(...recent.map((e) => Number(e.meta.from))) : level
  }
  return { level, news: level > from ? { kidId: kid.id, from, to: level, chores: choresBehind(state, kid, from) } : null }
}

/**
 * How many accepted chores took this child up from level `from` (0.33.0), so
 * the moment can say "Your chore was accepted" for one: the most recent
 * accepted chores, newest first, until taking their XP away would leave the
 * child below level `from + 1`. 0 when it can't be told (XP from elsewhere),
 * which reads as "chores".
 */
export function choresBehind(state, kid, from) {
  const below = totalXpForLevel(from + 1)
  let xp = Number(kid?.xp) || 0
  const accepted = (state?.submissions || [])
    .filter((s) => s.kidId === kid?.id && s.status === 'approved' && Number(s.awarded?.xp) > 0)
    .sort((a, b) => (Number(b.decidedAt) || 0) - (Number(a.decidedAt) || 0))
  let n = 0
  for (const s of accepted) {
    if (xp < below) break
    xp -= Number(s.awarded.xp)
    n += 1
  }
  return xp < below ? n : 0
}
