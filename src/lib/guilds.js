/**
 * Guilds, from the app's side.
 *
 * Every call here goes to a database function rather than a table, because a
 * guild spans families and the checks that keep it safe have to run somewhere a
 * device cannot reach. See supabase/guilds.sql for the rules themselves.
 *
 * With no backend configured these all report `unavailable` — a guild is
 * inherently multi-device, so unlike the rest of the app there is no sensible
 * offline version of it.
 */

import { transport } from './sync/transport.js'
import { uid } from './id.js'

export const GUILD_ERRORS = {
  unavailable: 'Guilds need the sync service. This device is not connected to one yet.',
  no_guild: "No guild has that code. Check the letters and try again.",
  already_requested: 'You have already asked to join that guild.',
  full: 'That guild is full.',
  not_a_member: 'You are not in that guild.',
  contact_details: "You can't share phone numbers or email addresses here.",
  link: "You can't share links here.",
  too_long: 'That message is too long.',
  empty: 'Type something first.',
  no_kid: 'That kid profile no longer exists.',
  no_request: 'That request is no longer waiting.',
}

export function guildError(reason) {
  return GUILD_ERRORS[reason] || 'That did not work. Please try again.'
}

const call = async (fn, args) => {
  if (!transport.isConfigured()) return { ok: false, reason: 'unavailable' }
  try {
    return (await transport.rpc(fn, args)) || { ok: false, reason: 'unavailable' }
  } catch (err) {
    console.warn(`[RankUp] ${fn}:`, err.message)
    return { ok: false, reason: 'unavailable', message: err.message }
  }
}

export const guilds = {
  available: () => transport.isConfigured(),

  /** Parent only — a child cannot open a space for other people's children. */
  create: (kidId, name, crest = '🛡️') =>
    call('create_guild', { p_kid_id: kidId, p_name: name, p_crest: crest }),

  /** Creates a REQUEST. Two parents have to approve before anyone is a member. */
  requestJoin: (kidId, inviteCode) =>
    call('request_guild_join', { p_kid_id: kidId, p_invite_code: inviteCode }),

  approveMember: (guildId, kidId) =>
    call('approve_guild_member', { p_guild_id: guildId, p_kid_id: kidId }),

  leave: (guildId, kidId) => call('leave_guild', { p_guild_id: guildId, p_kid_id: kidId }),

  mine: (kidId) => call('my_guild', { p_kid_id: kidId }),

  roster: (guildId, kidId) => call('guild_roster', { p_guild_id: guildId, p_kid_id: kidId }),

  messages: (guildId, kidId, limit = 50) =>
    call('guild_messages_for', { p_guild_id: guildId, p_kid_id: kidId, p_limit: limit }),

  post: (guildId, kidId, body) =>
    call('post_guild_message', {
      p_message_id: uid('msg'),
      p_guild_id: guildId,
      p_kid_id: kidId,
      p_body: body,
    }),

  report: (messageId, kidId) =>
    call('report_guild_message', { p_message_id: messageId, p_kid_id: kidId }),

  /** For the parent dashboard. */
  pendingRequests: async () => {
    if (!transport.isConfigured()) return []
    try {
      return (await transport.rpc('pending_guild_requests', {})) || []
    } catch {
      return []
    }
  },

  reportedMessages: async () => {
    if (!transport.isConfigured()) return []
    try {
      return (await transport.rpc('reported_guild_messages', {})) || []
    } catch {
      return []
    }
  },
}
