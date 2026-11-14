/**
 * The leaderboards: which boards there are, their periods and scopes, and
 * the words for each.
 *
 * The same boards and periods as leaderboard_boards() in
 * supabase/leaderboards.sql; tests/leaderboardwords.mjs fails if they differ.
 *
 * Two modes, per child:
 *   Adventure (every child starts here): play at your own pace. On no public
 *     board, and none is shown. Family and guild boards still show: they are
 *     among people the family already approved.
 *   Arena: on the worldwide and country boards, by nickname and flag. Only a
 *     parent switches a child into Arena; a parent or the child can switch
 *     back to Adventure at any time, and that takes them off at once.
 */
import { SCHOOL_DAILY_CHORES } from '../lib/schools.js'

export const MODES = {
  adventure: {
    id: 'adventure',
    name: 'Adventure',
    icon: '🧭',
    color: '#1baf7a',
    line: 'Play at your own pace. Only your family and your guild see your scores.',
  },
  arena: {
    id: 'arena',
    name: 'Arena',
    icon: '⚔️',
    color: '#f05a28',
    line: 'You are on the worldwide and country leaderboards, by your nickname.',
  },
}

/** The most XP one accepted chore counts for on a board (leaderboard_xp_per_chore). */
export const BOARD_XP_PER_CHORE = 200
/** Accepted chores counted a day: the School League's cap, the same number. */
export const BOARD_CHORES_PER_DAY = SCHOOL_DAILY_CHORES

export const PERIODS = {
  week: { id: 'week', label: 'This week', resets: 'Resets Monday' },
  month: { id: 'month', label: 'This month', resets: 'Resets on the 1st' },
  all: { id: 'all', label: 'All time', resets: null },
}

export const SCOPES = {
  world: { id: 'world', label: 'Worldwide', icon: '🌍', public: true },
  country: { id: 'country', label: 'My country', icon: '📍', public: true },
  guild: { id: 'guild', label: 'My guild', icon: '🛡️', public: false },
  family: { id: 'family', label: 'My family', icon: '🏠', public: false },
}

const KID_SCOPES = ['world', 'country', 'guild', 'family']

export const BOARDS = [
  { id: 'chores', icon: '✅', title: 'Chores done', unit: 'chores', periods: ['week', 'month', 'all'], scopes: KID_SCOPES,
    explain: `Accepted chores. At most ${SCHOOL_DAILY_CHORES} count each day, so it is about doing them, not how fast a grown-up taps.` },
  { id: 'xp', icon: '⚡', title: 'XP earned', unit: 'XP', periods: ['week', 'month', 'all'], scopes: KID_SCOPES,
    explain: `XP from accepted chores, before any Elite boost, so nobody can buy a place. At most ${BOARD_XP_PER_CHORE} a chore and ${SCHOOL_DAILY_CHORES} chores a day.` },
  { id: 'level', icon: '⭐', title: 'Highest level', unit: 'level', periods: ['all'], scopes: KID_SCOPES,
    explain: 'The level your board XP reaches: no Elite boost, so it can be a little lower than on your Home.' },
  { id: 'streak_best', icon: '🔥', title: 'Longest streak', unit: 'days', periods: ['all'], scopes: KID_SCOPES,
    explain: 'The most days in a row you have ever had a chore accepted.' },
  { id: 'streak_now', icon: '📆', title: 'Current streak', unit: 'days', periods: ['all'], scopes: KID_SCOPES, periodLabel: 'Right now',
    explain: 'Days in a row, still going today.' },
  { id: 'badges', icon: '🏅', title: 'Badges earned', unit: 'badges', periods: ['all'], scopes: KID_SCOPES,
    explain: 'Badges on your shelf, counted by RankUp\'s server.' },
  { id: 'rising', icon: '🚀', title: 'Rising stars', unit: 'XP', periods: ['week'], scopes: KID_SCOPES,
    explain: 'The biggest jump in board XP this week compared with last week.' },
  { id: 'arcade', icon: '🕹️', title: 'Arcade high scores', unit: 'points', periods: ['week', 'month', 'all'], scopes: KID_SCOPES,
    explain: 'Your best score in one game, as the arcade recorded it (out of 100).' },
  { id: 'seasons', icon: '🎨', title: 'Season themes', unit: 'themes', periods: ['all'], scopes: KID_SCOPES,
    explain: 'Themes you made that were picked for a RankUp Season.' },
  { id: 'guilds', icon: '🛡️', title: 'Top guilds', unit: 'XP each', periods: ['week'], scopes: ['world', 'country'], guilds: true,
    explain: 'Guilds by their members\' average board XP this week, so a big guild cannot win on size alone. Shown by a team name, never the guild\'s own name or anyone in it.' },
]

export const BOARD_MAP = Object.fromEntries(BOARDS.map((b) => [b.id, b]))

/** The boards a child can see right now. */
export function boardsFor({ guildsOn = false } = {}) {
  return BOARDS.filter((b) => !b.guilds || guildsOn)
}

/** The scopes a child can open on a board. Adventure: family and guild only. */
export function scopesFor(board, { mode = 'adventure', guildsOn = false } = {}) {
  return (BOARD_MAP[board]?.scopes || []).filter((s) => {
    if (SCOPES[s].public && mode !== 'arena') return false
    if (s === 'guild' && !guildsOn) return false
    return true
  })
}

/** "Resets Monday" / "Resets on the 1st", in plain words. Weeks and months change at midnight UTC. */
export function resetWords(period) {
  return PERIODS[period]?.resets || null
}

/** What a server refusal means to a child. */
export const BOARD_ERRORS = {
  adventure: 'You are in Adventure mode, so you are not on the worldwide boards. Ask a grown-up about Arena.',
  no_country: 'A grown-up has not picked your country yet. They can do it in Parent Mode.',
  not_a_member: 'Join a guild to see a guild board.',
  no_board: 'That board does not exist.',
  unavailable: 'Leaderboards need the sync service. This phone is not connected to one yet.',
  not_in_list: 'Pick each part of your nickname from the lists.',
  name_cooldown: 'You can change your nickname once a week.',
  parent_only: 'Only a grown-up can switch on Arena.',
  no_mode: 'That is not a mode.',
  not_a_country: 'Pick a country from the list.',
}

export function boardError(reason) {
  return BOARD_ERRORS[reason] || 'That did not work. Please try again.'
}

/** A family board worked out on this phone, for a phone with no server. */
export function localFamilyBoard(state, kidId, board, period) {
  const now = Date.now()
  const weekStart = startOfWeekUtc(now)
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)
  const since = period === 'week' ? weekStart : period === 'month' ? monthStart : 0
  const rows = (state.kids || []).map((kid) => {
    const approved = (state.submissions || []).filter((s) => s.kidId === kid.id && s.status === 'approved'
      && (s.decidedAt || s.submittedAt || 0) >= since)
    const perDay = new Map()
    let chores = 0
    let xp = 0
    for (const s of approved.sort((a, b) => (a.decidedAt || 0) - (b.decidedAt || 0))) {
      const day = new Date(s.decidedAt || s.submittedAt || 0).toISOString().slice(0, 10)
      const n = (perDay.get(day) || 0) + 1
      perDay.set(day, n)
      if (n > SCHOOL_DAILY_CHORES) continue
      chores += 1
      xp += Math.min(BOARD_XP_PER_CHORE, s.baseXp ?? s.awardedXp ?? 0)
    }
    const score = board === 'chores' ? chores
      : board === 'xp' ? xp
        : board === 'streak_best' ? Math.max(kid.streak?.best || 0, kid.streak?.count || 0)
          : board === 'streak_now' ? (kid.streak?.count || 0)
            : 0
    return { name: kid.name, score, you: kid.id === kidId }
  })
  rows.sort((a, b) => b.score - a.score)
  let rank = 0
  rows.forEach((r, i) => { rank = i > 0 && rows[i - 1].score === r.score ? rank : i + 1; r.rank = rank })
  return { ok: true, rows, me: rows.find((r) => r.you) || null, local: true }
}

/** Monday 00:00 UTC of the week holding `ms`. */
export function startOfWeekUtc(ms) {
  const d = new Date(ms)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}
