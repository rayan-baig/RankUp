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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@example.com'

const ALLOWED_ROLES = new Set(['parent', 'kid'])

/**
 * The wording lives here, not in the request.
 *
 * This endpoint used to take a title and body straight from the caller and push
 * them to every phone in the family. Membership was checked; the CONTENT was
 * not. A child's own device is in the family, so a child — or anything running
 * on their phone — could put any sentence it liked on a parent's lock screen,
 * under the app's name. For a children's app that is the wrong side of a line.
 *
 * So a caller names a notice and supplies at most two short values to slot into
 * it. Everything a phone finally displays is written here, and the values are
 * clipped and stripped of newlines so they cannot forge a second line.
 *
 * Mirrors NOTICES in src/lib/notifications.js, which still renders the local
 * copy on the device that already has the data.
 */
const NOTICES = {
  submission: (who, what) => ({
    title: `${who} finished a quest`,
    body: `"${what}" is waiting for you to review.`,
    tag: 'submission',
    url: '/#/parent/approvals',
  }),
  approved: (what, xp) => ({
    title: 'Approved! 🎉',
    body: `"${what}" earned you ${xp} XP.`,
    tag: 'decision',
    url: '/#/kid',
  }),
  rejected: (what) => ({
    title: 'Sent back to redo',
    body: `"${what}" needs another go. Tap to see why.`,
    tag: 'decision',
    url: '/#/kid/quests',
  }),
  guildRequest: (who, what) => ({
    title: 'A guild request needs you',
    body: `${who} wants to join ${what}. Nobody joins without you.`,
    tag: 'guild',
    url: '/#/parent/guilds',
  }),
  reminder: () => ({
    title: 'RankUp',
    body: 'Time to check in on today\u2019s quests.',
    tag: 'reminder',
    url: '/#/kid/quests',
  }),
}

/** One line, bounded. A name or a quest title, never a paragraph. */
const clean = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60)

function configured() {
  return Boolean(SUPABASE_URL && SERVICE_KEY && VAPID_PUBLIC && VAPID_PRIVATE)
}

async function rpc(fn, args, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: token,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/**
 * Confirm the caller is really in this family, using THEIR token — so row level
 * security answers the question rather than this function trusting the request.
 */
async function callerBelongsToFamily(token, familyId) {
  try {
    const snapshot = await rpc('family_snapshot', { p_since: 0 }, token)
    const families = snapshot?.families || []
    // An empty list means the caller has no rows in that family at all.
    if (!families.length) return false
    return families.some((f) => f.id === familyId)
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
  const { familyId, role, kidId, kind, args } = body || {}
  if (!familyId || !ALLOWED_ROLES.has(role) || !NOTICES[kind]) {
    return res.status(400).json({ error: 'familyId, role and a known kind are required.' })
  }
  const message = NOTICES[kind](...(Array.isArray(args) ? args.slice(0, 2).map(clean) : []))

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  if (!(await callerBelongsToFamily(token, familyId))) {
    return res.status(403).json({ error: 'Not your family.' })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

  let targets
  try {
    targets = await rpc('push_targets', { p_family_id: familyId, p_role: role, p_kid_id: kidId || null }, SERVICE_KEY)
  } catch (err) {
    console.error('[send-push] could not read targets:', err.message)
    return res.status(502).json({ error: 'lookup_failed' })
  }

  const wire = JSON.stringify(message)

  const results = await Promise.allSettled(
    (targets || []).map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, wire),
    ),
  )

  // A 404 or 410 means that phone is gone for good — drop it rather than
  // retrying forever.
  await Promise.allSettled(
    results.map((result, i) => {
      if (result.status === 'fulfilled') return null
      const status = result.reason?.statusCode
      const gone = status === 404 || status === 410
      return rpc('record_push_failure', { p_endpoint: targets[i].endpoint, p_gone: gone }, SERVICE_KEY)
    }),
  )

  return res.status(200).json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  })
}
