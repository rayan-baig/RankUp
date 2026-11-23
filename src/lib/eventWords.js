/**
 * Recent activity's words (screens/parent/ParentDashboard.jsx): one short line
 * for each thing the app logs in state.events (state/reducer.js, logEvent).
 *
 * In its own file since 0.33.0, so tests/fixes33.mjs can check that every
 * event type the reducer logs has words of its own. "quests_returned" (the
 * repeating chores coming back each morning) had none, and a parent's feed
 * said "• Something happened" every day.
 */
import { findGame } from '../data/minigames.js'
import { MARKET_SKINS } from '../data/marketSkins.js'
import { TIERS } from '../state/initialState.js'
import { plural } from './plural.js'

// The words for what the events store as ids: "Plan changed to elite" and
// "Override (red)" were the database's words on a parent's screen.
const OVERRIDE_NAMES = { tax: 'Coins taken back', dimension: 'A short break', red: 'A pause until lifted' }

/** "3 daily chores are back for today": the repeating chores the morning brought back. */
function returnedWords(meta) {
  const n = Number(meta?.count) || 0
  const kind = meta?.daily ? 'daily chore' : 'repeating chore'
  return `🔁 ${plural(n, kind)} ${n === 1 ? 'is' : 'are'} back for today`
}

/** Every event type with words of its own (tests/fixes33.mjs holds the reducer to it). */
export const EVENT_TYPES = [
  'quest_approved', 'quest_rejected', 'quest_submitted', 'quests_assigned', 'quests_returned', 'quest_edited',
  'level_up', 'reward_redeemed', 'override_applied', 'override_lifted', 'login_bonus', 'tier_changed',
  'theme_changed', 'kid_added', 'alliance_joined', 'streak_freeze', 'family_created', 'device_paired',
  'device_linked', 'device_unlinked', 'minigame_played', 'skin_bought',
]

export function describeEvent(e, kid) {
  const who = kid?.name || 'Someone'
  switch (e?.type) {
    case 'quest_approved': return `✅ ${who} earned ${e.meta?.xp} XP`
    case 'quest_rejected': return `↩️ You sent a quest back to ${who}`
    case 'quest_submitted': return `🙋 ${who} finished ${e.meta?.title ? `“${e.meta.title}”` : 'a quest'}`
    case 'quests_assigned': return `📋 ${plural(e.meta?.count || 0, 'quest')} assigned to ${who}`
    case 'quests_returned': return returnedWords(e.meta)
    case 'quest_edited': return kid ? `✏️ A quest of ${who}'s was changed` : '✏️ A quest was changed'
    case 'level_up': return `🎉 ${who} reached level ${e.meta?.to}`
    case 'reward_redeemed': return `🎁 ${who} redeemed ${e.meta?.name}`
    case 'override_applied': return `🛡️ ${OVERRIDE_NAMES[e.meta?.kind] || 'An override'} applied to ${who}`
    case 'override_lifted': return `▶️ ${who} can use the app again`
    case 'login_bonus': return `🎁 ${who} claimed the daily bonus`
    case 'tier_changed': return `💳 Plan changed to ${TIERS[e.meta?.tier]?.name || 'a new plan'}`
    case 'theme_changed': return `🎨 ${who} changed theme`
    case 'kid_added': return `👶 ${who} was added`
    case 'alliance_joined': return '🏆 Joined a Parent Alliance'
    case 'streak_freeze': return `🧊 ${who} used a streak freeze`
    case 'family_created': return '🏠 Your family was created'
    case 'device_paired': return `📱 ${who}'s phone was linked`
    case 'device_linked': return `📱 ${who}'s phone joined the family`
    case 'device_unlinked': return `📵 ${who}'s phone was unlinked`
    case 'minigame_played': return `🎮 ${who} played ${findGame(e.meta?.game)?.name || 'a game'}`
    case 'skin_bought':
      return `✨ ${who} unlocked ${MARKET_SKINS.find((s) => s.id === e.meta?.skin)?.name || 'a skin'}`
    // Never show the raw event key. It is a database word, and a parent reading
    // "family_created" in their activity feed is reading a bug.
    default: return '• Something happened'
  }
}
