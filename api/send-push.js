/**
 * Serverless function: send a push notification.
 *
 * Runs on the server because two things here must never reach a browser — the
 * VAPID private key, which signs pushes, and the Supabase service role key,
 * which can read every subscription endpoint in the database.
 *
 * WHO IS ALLOWED TO TRIGGER ONE
 * The caller sends their own access token. This function checks, against the
 * database and as that user, that they really belong to the family they are
 * trying to notify. Without that check the endpoint would let anyone on the
 * internet buzz any family's phone by guessing a uuid.
 *
 * See docs/NOTIFICATIONS.md for the keys and the deployment steps.
 */

import webpush from 'web-push'
import { sendPush, failureFor } from './_shared/push.js'
import { reportError, userHeaders } from './_shared/job.js'
import { NOTICES, PUSH_KINDS, VALUE_MAX, reminderPush } from '../src/data/noticeWords.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@example.com'

const ALLOWED_ROLES = new Set(['parent', 'kid'])

/**
 * The wording is the server's, not the request's.
 *
 * This endpoint used to take a title and body straight from the caller and push
 * them to every phone in the family. Membership was checked; the CONTENT was
 * not. A child's own device is in the family, so a child — or anything running
 * on their phone — could put any sentence it liked on a parent's lock screen,
 * under the app's name. For a children's app that is the wrong side of a line.
 *
 * So a caller names a notice and supplies at most two short values to slot into
 * it. Everything a phone finally displays is written in src/data/noticeWords.js
 * (the app shows the same words when it notifies locally), and the values are
 * clipped and stripped of newlines so they cannot forge a second line.
 */
const noticeFor = (kind, role, args) => (kind === 'reminder' ? reminderPush(args[0], role) : NOTICES[kind](...args))

/**
 * One line, bounded. A name or a quest title, never a paragraph, and never a
 * phone number or a link: those were how a value could make a notice read like
 * a message from somebody else ("Bank: card locked, call 0800 ...").
 */
const clean = (value) => String(value ?? '')
  .replace(/[\r\n]+/g, ' ')
  .replace(/https?:\/\/\S+|www\.\S+/gi, '')
  .replace(/[+()\d][\d\s().-]{6,}\d/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .slice(0, VALUE_MAX)

/** Telling a child their work was approved or sent back is a parent's to do. */
const PARENT_ONLY = new Set(['approved', 'rejected'])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One notice against a family's hourly ceiling (claim_push_send). Not being
 * able to count is not a reason to stop a real notice.
 */
async function claimSend(familyId) {
  try {
    return (await rpc('claim_push_send', { p_family_id: familyId }, SERVICE_KEY)) !== false
  } catch (err) {
    await reportError('send-push', `could not count sends: ${err.message}`)
    return true
  }
}

function configured() {
  return Boolean(SUPABASE_URL && SERVICE_KEY && VAPID_PUBLIC && VAPID_PRIVATE)
}

async function rpc(fn, args, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    // The service key speaks for itself; a person's token goes with the
    // project's public key (see userHeaders).
    headers: token === SERVICE_KEY
      ? { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      : userHeaders(token),
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/**
 * Confirm the caller is really in this family, using THEIR token — so the
 * database answers the question rather than this function trusting the request.
 *
 * This used to ask family_snapshot(0), which hands back every row the caller
 * can see — including every pending proof photo as base64 — just to compare one
 * id. A push goes out on every submission and every decision, so that was
 * megabytes of a child's photographs crossing the wire, again, to answer a
 * yes-or-no question. current_family_id returns the id and nothing else, and
 * answers for a child's device as well as a parent's.
 */
async function callerBelongsToFamily(token, familyId) {
  try {
    const mine = await rpc('current_family_id', {}, token)
    return Boolean(mine) && mine === familyId
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(204).end()
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  if (!configured()) {
    // Not an error the app should surface as a failure: it falls back to
    // showing the notification locally and says push is not set up.
    return res.status(503).json({ error: 'not_configured' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const { familyId, role, kidId, kind, args, guildId } = body || {}
  if (!familyId || !ALLOWED_ROLES.has(role) || !PUSH_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'familyId, role and a known kind are required.' })
  }
  if (kind === 'guildRequest' && !(UUID.test(String(guildId)) && UUID.test(String(kidId)))) {
    return res.status(400).json({ error: 'A guild request names the guild and the child.' })
  }
  const notice = noticeFor(kind, role, Array.isArray(args) ? args.slice(0, 2).map(clean) : [])

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  if (!(await callerBelongsToFamily(token, familyId))) {
    return res.status(403).json({ error: 'Not your family.' })
  }
  // A child's device could send a sibling "Approved! 🎉" for work nobody had
  // looked at. The database says whether the caller is a parent.
  if (PARENT_ONLY.has(kind)) {
    let parent = false
    try { parent = Boolean(await rpc('is_parent', {}, token)) } catch { parent = false }
    if (!parent) return res.status(403).json({ error: 'Only a parent can send that.' })
  }

  if (kind === 'guildRequest') return sendGuildRequest(res, token, { familyId, kidId, guildId })

  // A ceiling per family per hour, kept in the database so every instance
  // shares it. A stuck loop, or a child who has found the button, would
  // otherwise put hundreds of notices on a parent's phone.
  if (!(await claimSend(familyId))) return res.status(429).json({ error: 'too_many_notices' })

  let targets
  try {
    targets = await rpc('push_targets', { p_family_id: familyId, p_role: role, p_kid_id: kidId || null }, SERVICE_KEY)
  } catch (err) {
    await reportError('send-push', `could not read targets: ${err.message}`)
    return res.status(502).json({ error: 'lookup_failed' })
  }

  return res.status(200).json(await deliver(targets || [], notice))
}

/**
 * One notice to these phones. A 404 or 410 means that phone is gone for good:
 * it is dropped rather than tried for ever.
 */
async function deliver(targets, message) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const wire = JSON.stringify(message)

  const results = await Promise.allSettled(
    targets.map((t) => sendPush({ endpoint: t.endpoint, keys: t.keys }, wire)),
  )

  await Promise.allSettled(
    results.map((result, i) => {
      if (result.status === 'fulfilled') return null
      const failure = failureFor(result.reason)
      if (!failure) return null
      return rpc('record_push_failure', { p_endpoint: targets[i].endpoint, p_gone: failure.gone }, SERVICE_KEY)
    }),
  )

  return {
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}

/**
 * "A guild request needs you", to the parents who have to say yes.
 *
 * A guild spans families: a child asking to join needs a parent of their own
 * AND a parent of the family whose guild it is. The asking phone is in only
 * one of them, so it cannot name the other family, the parents, or the words.
 * It names the guild and the child; the database says whether that child's
 * request is really waiting, whose yes is still missing, and what the child
 * and the guild are called. It also marks the request as told, so asking for
 * the notice again buzzes nobody.
 *
 * Counted against the asking family's hourly ceiling, like any notice it
 * sends; and the guild's family is told only while that family is under its
 * own, so no family's phones get more than the ceiling in an hour.
 */
async function sendGuildRequest(res, token, { familyId, kidId, guildId }) {
  // A parent, or the child themselves; not a supporter, and not another child.
  let mayAct = false
  try { mayAct = Boolean(await rpc('may_act_for_kid', { p_kid_id: kidId }, token)) } catch { mayAct = false }
  if (!mayAct) return res.status(403).json({ error: 'Not your child.' })

  if (!(await claimSend(familyId))) return res.status(429).json({ error: 'too_many_notices' })

  let claim
  try {
    claim = await rpc('claim_guild_request_notice',
      { p_guild_id: guildId, p_kid_id: kidId, p_family_id: familyId }, SERVICE_KEY)
  } catch (err) {
    await reportError('send-push', `could not read the guild request: ${err.message}`)
    return res.status(502).json({ error: 'lookup_failed' })
  }
  // Nothing waiting, or already told: an answer, not a failure to retry.
  if (!claim?.ok) return res.status(200).json({ sent: 0, failed: 0, skipped: claim?.reason || 'no_request' })

  const message = NOTICES.guildRequest(clean(claim.kid_name), clean(claim.guild_name))
  const approvers = new Set(claim.approvers || [])
  const targets = []
  for (const family of claim.families || []) {
    if (family !== familyId && !(await claimSend(family))) continue
    try {
      const phones = await rpc('push_targets', { p_family_id: family, p_role: 'parent', p_kid_id: null }, SERVICE_KEY)
      targets.push(...(phones || []).filter((t) => approvers.has(t.user_id)))
    } catch (err) {
      await reportError('send-push', `could not read targets: ${err.message}`)
    }
  }
  return res.status(200).json(await deliver(targets, message))
}
