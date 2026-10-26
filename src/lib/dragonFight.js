/**
 * The Block Craft dragon fight, worked out from the chores.
 *
 * Nothing about the fight is stored. Every number on the dragon screen is
 * recomputed from things every device already has after a sync — which
 * chores were approved or sent back, and when — plus the clock. So the
 * parent's phone and the child's phone always agree about the dragon's
 * health, and there is no new column for the database to get wrong.
 *
 * The rules, as the child is told them:
 *
 *   - A chore approved is a hit. Harder chores hit harder.
 *   - A chore sent back lets the dragon strike.
 *   - 48 hours with no chore approved, and it dives at you.
 *   - Now and then it uses a special attack on its own.
 *   - At zero health you are knocked back to the village to rest: your
 *     health refills and the dragon gets a little back. Nothing else is
 *     lost — no XP, no level, no coins. This is a game a child plays by
 *     doing chores, and it must never feel like a punishment for being ill
 *     for two days.
 *   - When the dragon's health reaches zero it is beaten, for good, and
 *     Hero's Return opens.
 */

import { levelFromXp, totalXpForLevel } from './xp.js'

export const DRAGON_LEVEL = 399
export const DRAGON_HP = 1000
export const HERO_HP = 100

/** Damage by chore difficulty — the same ladder that sets a chore's XP. */
export const HIT = { easy: 40, medium: 80, hard: 150, boss: 300 }
export const SENT_BACK = 15
export const IDLE = 25
export const IDLE_MS = 48 * 3600 * 1000
export const KNOCKOUT_HEAL = 100

export const SPECIALS = [
  { id: 'wings', name: 'Wing Storm', dmg: 10 },
  { id: 'breath', name: 'Void Breath', dmg: 20 },
  { id: 'quake', name: 'Tail Quake', dmg: 15 },
]
/** Roughly one day in four brings a special attack. */
const SPECIAL_CHANCE = 0.25
const DAY = 86400000

/**
 * A number in [0, 1) from a string, the same on every device. The specials
 * have to look random to the child and still come out identical on the
 * parent's phone, so they cannot use Math.random.
 */
function chance(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/** How hard a chore hits: its difficulty, or failing that, what it paid. */
function damageFor(quest, submission) {
  if (quest && HIT[quest.difficulty]) return HIT[quest.difficulty]
  const xp = submission.awarded?.xp ?? 0
  if (xp >= 100) return HIT.boss
  if (xp >= 55) return HIT.hard
  if (xp >= 30) return HIT.medium
  return HIT.easy
}

/**
 * When the child reached the dragon: walk their approvals backwards from
 * today's XP and find the one that carried them past its level. Falls back
 * to the moment they chose Block Craft, for a child who arrived some other
 * way (switching theme at a high level, say).
 */
function fightStart(kid, approvals) {
  const threshold = totalXpForLevel(DRAGON_LEVEL)
  let xpAfter = kid.xp
  let crossing = null
  for (let i = approvals.length - 1; i >= 0; i--) {
    const before = xpAfter - (approvals[i].awarded?.xp ?? 0)
    if (before < threshold && xpAfter >= threshold) { crossing = approvals[i].decidedAt; break }
    xpAfter = before
  }
  return Math.max(crossing ?? 0, kid.themeChosenAt ?? 0)
}

/**
 * The fight as it stands at `now`.
 *
 * Returns `{ active }` false for a child who is not on Block Craft or has
 * not reached the dragon. Otherwise the two health bars, whether and when
 * the dragon fell, and every event in order (newest last) for the screen to
 * replay.
 */
export function dragonFight(state, kid, now = Date.now()) {
  if (!kid || kid.themeId !== 'blockcraft' || levelFromXp(kid.xp).level < DRAGON_LEVEL) {
    return { active: false }
  }

  const questOf = new Map((state.quests || []).map((q) => [q.id, q]))
  const mine = (state.submissions || []).filter((s) => s.kidId === kid.id && s.decidedAt)
  const approvals = mine.filter((s) => s.status === 'approved').sort((a, b) => a.decidedAt - b.decidedAt)
  const start = fightStart(kid, approvals)

  const events = []
  for (const s of mine) {
    if (s.decidedAt <= start) continue
    if (s.status === 'approved') {
      const quest = questOf.get(s.questId)
      events.push({
        at: s.decidedAt, kind: 'hit', dmg: damageFor(quest, s),
        difficulty: quest?.difficulty || null, title: quest?.title || 'A chore',
      })
    } else if (s.status === 'rejected') {
      const quest = questOf.get(s.questId)
      events.push({ at: s.decidedAt, kind: 'sentBack', dmg: SENT_BACK, title: quest?.title || 'A chore' })
    }
  }

  // Every full 48 hours with no approval, starting from the fight itself.
  const hitTimes = [start, ...events.filter((e) => e.kind === 'hit').map((e) => e.at)].sort((a, b) => a - b)
  for (let i = 0; i < hitTimes.length; i++) {
    const until = i + 1 < hitTimes.length ? hitTimes[i + 1] : now
    for (let t = hitTimes[i] + IDLE_MS; t <= until; t += IDLE_MS) events.push({ at: t, kind: 'idle', dmg: IDLE })
  }

  // Specials: one roll per day, at midday, from the child's id and the date.
  for (let day = Math.floor(start / DAY) + 1; day * DAY + DAY / 2 <= now; day++) {
    const roll = chance(`${kid.id}:${day}`)
    if (roll < SPECIAL_CHANCE) {
      const special = SPECIALS[Math.floor(chance(`${kid.id}:${day}:which`) * SPECIALS.length)]
      events.push({ at: day * DAY + DAY / 2, kind: 'special', dmg: special.dmg, special: special.id, name: special.name })
    }
  }

  events.sort((a, b) => a.at - b.at)

  let dragon = DRAGON_HP
  let hero = HERO_HP
  let defeatedAt = null
  let knockouts = 0
  const played = []
  for (const e of events) {
    if (e.at > now) break
    if (e.kind === 'hit') {
      dragon = Math.max(0, dragon - e.dmg)
      played.push({ ...e, dragon, hero })
      if (dragon === 0) { defeatedAt = e.at; break }
    } else {
      hero = Math.max(0, hero - e.dmg)
      if (hero === 0) {
        knockouts += 1
        hero = HERO_HP
        dragon = Math.min(DRAGON_HP, dragon + KNOCKOUT_HEAL)
        played.push({ ...e, dragon, hero, knockout: true })
      } else {
        played.push({ ...e, dragon, hero })
      }
    }
  }

  return { active: true, start, dragon, hero, defeatedAt, knockouts, events: played }
}

/**
 * The story milestones resolveKidTheme needs for this child — today only
 * whether the dragon has fallen, which opens Hero's Return.
 */
export function storyProgress(state, kid, now = Date.now()) {
  if (!kid || kid.themeId !== 'blockcraft') return null
  const fight = dragonFight(state, kid, now)
  return fight.active && fight.defeatedAt ? { dragonDefeated: true } : null
}
