import { dayKey, daysBetween } from './dates.js'

/**
 * Levelling, XP and currency rules — the numbers that make the game a game.
 *
 * The curve is deliberately gentle at the start (a kid should see a level-up in
 * the first day or two) and flattens out to a fixed 400 XP per level so the very
 * high Block Craft evolutions stay meaningful without becoming impossible.
 */

export const DIFFICULTY = {
  easy: { id: 'easy', label: 'Easy', xp: 15, color: '#1baf7a' },
  medium: { id: 'medium', label: 'Medium', xp: 30, color: '#2a78d6' },
  hard: { id: 'hard', label: 'Hard', xp: 55, color: '#eb6834' },
  boss: { id: 'boss', label: 'Boss', xp: 100, color: '#e34948' },
}

export const DIFFICULTY_LIST = Object.values(DIFFICULTY)

/** XP required to go from `level` to `level + 1`. */
export function xpToNext(level) {
  return Math.min(400, 80 + 12 * (Math.max(1, level) - 1))
}

/** Total XP required to reach `level` from zero. */
export function totalXpForLevel(level) {
  let total = 0
  for (let l = 1; l < level; l += 1) total += xpToNext(l)
  return total
}

/** Turn a lifetime XP number into { level, intoLevel, needed, progress }. */
export function levelFromXp(totalXp) {
  let level = 1
  let remaining = Math.max(0, Math.round(totalXp || 0))
  while (remaining >= xpToNext(level) && level < 999) {
    remaining -= xpToNext(level)
    level += 1
  }
  const needed = xpToNext(level)
  return { level, intoLevel: remaining, needed, progress: needed ? remaining / needed : 0 }
}

export const ELITE_XP_MULTIPLIER = 1.5

/**
 * Work out what a completed quest is actually worth.
 * Returns the XP and currency along with a human-readable breakdown so the kid
 * can see exactly where each number came from.
 */
export function calcReward(quest, { elite = false, streak = 0, onTime = true } = {}) {
  const baseXp = quest.xp ?? DIFFICULTY[quest.difficulty]?.xp ?? DIFFICULTY.medium.xp
  const lines = [{ label: 'Base quest XP', value: baseXp }]
  let xp = baseXp

  if (quest.doubleXp) {
    lines.push({ label: 'Surprise 2× XP!', value: baseXp })
    xp += baseXp
  }
  if (quest.timerSeconds && onTime) {
    const bonus = Math.round(baseXp * 0.25)
    lines.push({ label: 'Beat the clock', value: bonus })
    xp += bonus
  }
  const streakBonus = streakMultiplier(streak)
  if (streakBonus > 0) {
    const bonus = Math.round(xp * streakBonus)
    lines.push({ label: `${streak}-day streak (+${Math.round(streakBonus * 100)}%)`, value: bonus })
    xp += bonus
  }
  if (elite) {
    const bonus = Math.round(xp * (ELITE_XP_MULTIPLIER - 1))
    lines.push({ label: 'Elite Pass 1.5× boost', value: bonus })
    xp += bonus
  }

  const coins = Math.max(1, Math.round(xp / 5))
  return { xp, coins, lines }
}

/**
 * What accepting this submission pays: the quest's reward plus, for a
 * test-score quest, the bonus for the score reported.
 *
 * One function for the reducer that pays it and the review screen that shows
 * it. The screen used calcReward alone, so a parent was told "+30 XP" for a
 * test-score chore that then paid 60.
 */
export function submissionReward(quest, submission, { elite = false, streak = 0 } = {}) {
  const reward = calcReward(quest, { elite, streak, onTime: submission?.onTime !== false })
  let { xp, coins } = reward
  const lines = [...reward.lines]
  if (quest.testScore && typeof submission?.testScore === 'number') {
    const bonus = testScoreBonus(submission.testScore, quest.xp || 30)
    if (bonus > 0) {
      lines.push({ label: `Scored ${submission.testScore}%`, value: bonus })
      xp += bonus
      coins += Math.max(1, Math.round(bonus / 5))
    }
  }
  return { xp, coins, lines }
}

/**
 * The streak as it stands today: its count while it is alive (a chore was
 * approved today or yesterday), nothing once it has lapsed.
 *
 * The stored count only resets at the next approval, so a child who stopped a
 * week ago still saw their old number, and the first chore back was paid a
 * streak bonus. MIRRORED in award_for_submission in supabase/schema.sql.
 */
export function liveStreak(streak, today = dayKey()) {
  if (!streak?.count || !streak.lastDay) return 0
  return daysBetween(streak.lastDay, today) <= 1 ? streak.count : 0
}

/** Streaks add up to +25%, capped so they never dwarf the quest itself. */
export function streakMultiplier(streak) {
  if (!streak || streak < 3) return 0
  return Math.min(0.25, Math.floor(streak / 3) * 0.05)
}

/** A test-score quest: 80%+ earns a bonus on top of the base reward. */
export function testScoreBonus(scorePercent, baseXp) {
  if (scorePercent >= 95) return Math.round(baseXp * 1.0)
  if (scorePercent >= 90) return Math.round(baseXp * 0.6)
  if (scorePercent >= 80) return Math.round(baseXp * 0.3)
  return 0
}

export function formatXp(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n || 0))
}
