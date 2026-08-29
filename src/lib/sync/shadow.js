/**
 * Deciding what actually needs sending.
 *
 * Rather than making twenty reducer cases each remember to queue an operation —
 * which is exactly the kind of thing that gets forgotten in the twenty-first —
 * the app diffs its own state after every change and queues whatever moved.
 *
 * The "shadow" is a record of each row as the server last knew it. A row is
 * queued only when it differs from its shadow, so changes that arrived FROM the
 * server do not immediately bounce back to it.
 */

import { ENTITIES } from './mappers.js'
import { enqueue } from './outbox.js'

const SHADOW_KEY = 'rankup.sync.shadow.v1'

function key() {
  try {
    const device = new URLSearchParams(window.location.search).get('device')
    return device ? `${SHADOW_KEY}.${device.replace(/[^a-z0-9_-]/gi, '')}` : SHADOW_KEY
  } catch {
    return SHADOW_KEY
  }
}

function readShadow() {
  try {
    return JSON.parse(localStorage.getItem(key()) || '{}')
  } catch {
    return {}
  }
}

function writeShadow(shadow) {
  try {
    localStorage.setItem(key(), JSON.stringify(shadow))
  } catch (err) {
    console.warn('[RankUp] Could not save the sync shadow:', err)
  }
}

export function clearShadow() {
  localStorage.removeItem(key())
}

/**
 * XP, currency and streaks are NOT in this list on purpose.
 *
 * They move only through approve_submission and its siblings, which run inside
 * the database where a tampered client cannot reach them. If a device could
 * push its own `xp` column, every one of those guarantees would be worth
 * nothing — a kid could edit the number in their browser and upload it.
 */
const SERVER_OWNED = {
  // A family's tier is decided by Stripe's webhook. The database refuses a
  // direct write anyway, but pushing it would fill the outbox with rejections.
  families: ['tier', 'subscription_status', 'stripe_customer_id', 'stripe_subscription_id'],
  kids: ['xp', 'coins', 'streak_count', 'streak_last_day', 'streak_freezes'],
  // A quest's status and a submission's verdict are decided by submit_quest,
  // approve_submission and reject_submission. If a device could push these
  // directly it could mark its own work approved.
  quests: ['status', 'completed_at', 'redo_note', 'redo_count'],
  submissions: ['status', 'parent_note'],
}

function stripServerOwned(table, row) {
  const owned = SERVER_OWNED[table]
  if (!owned) return row
  const copy = { ...row }
  owned.forEach((col) => delete copy[col])
  return copy
}

/**
 * The only table a kid's device may write to directly.
 *
 * Everything else a kid does — submitting a quest, redeeming a reward,
 * claiming a login bonus — goes through a database function, so the server
 * decides the outcome rather than the phone. Row level security already
 * refuses the rest (see supabase/test/01-security.sql), so pushing them would
 * achieve nothing except a rejected round trip per change and a red line in
 * the console. Left out on purpose: submissions, which a kid does create — but
 * through submit_quest, so the row is already there by the time this runs and
 * the upsert would arrive as an update, which only a parent may do.
 */
const KID_WRITABLE = new Set(['notes'])

/**
 * Tables no device ever writes directly, whatever role it is in.
 *
 * A submission is created by submit_quest and a redemption by redeem_reward —
 * both carry the whole row, photo included — because the outcome has to be
 * decided by the server rather than by the phone claiming it. Pushing the same
 * row again afterwards can only be an update, which row level security allows
 * to a parent and refuses to a kid; either way it changes nothing. It matters
 * most on a shared phone, where one parent account plays both roles and the
 * insert is refused outright.
 */
const FUNCTION_OWNED = new Set(['submissions', 'redemptions'])

/**
 * Compare state against the shadow and queue whatever changed.
 * `photoFor` supplies a submission's image, which lives outside the state object.
 */
export function queueChanges(state, { photoFor, role } = {}) {
  if (!state.family?.id) return 0
  const shadow = readShadow()
  const familyId = state.family.id
  let queued = 0

  for (const [snapshotKey, { key: stateKey, mapper, table }] of Object.entries(ENTITIES)) {
    if (FUNCTION_OWNED.has(table)) continue
    if (role === 'kid' && !KID_WRITABLE.has(table)) continue
    const rows = state[stateKey] || []
    const seen = new Set()

    for (const item of rows) {
      const row = stripServerOwned(
        table,
        table === 'submissions'
          ? mapper.toRow(item, familyId, photoFor?.(item))
          : mapper.toRow(item, familyId),
      )
      const shadowId = `${table}:${item.id}`
      seen.add(shadowId)
      const serialised = JSON.stringify(row)
      if (shadow[shadowId] === serialised) continue
      enqueue({ type: 'upsert', table, row })
      shadow[shadowId] = serialised
      queued += 1
    }

    // Anything the shadow knows about that is no longer here was deleted.
    for (const shadowId of Object.keys(shadow)) {
      if (!shadowId.startsWith(`${table}:`) || seen.has(shadowId)) continue
      const id = shadowId.slice(table.length + 1)
      enqueue({ type: 'delete', table, id })
      delete shadow[shadowId]
      queued += 1
    }
    void snapshotKey
  }

  writeShadow(shadow)
  return queued
}

/** After a pull, record what the server now holds so we do not echo it back. */
export function recordServerState(state, { photoFor } = {}) {
  if (!state.family?.id) return
  const shadow = readShadow()
  const familyId = state.family.id
  for (const [, { key: stateKey, mapper, table }] of Object.entries(ENTITIES)) {
    for (const item of state[stateKey] || []) {
      const row = stripServerOwned(
        table,
        table === 'submissions'
          ? mapper.toRow(item, familyId, photoFor?.(item))
          : mapper.toRow(item, familyId),
      )
      shadow[`${table}:${item.id}`] = JSON.stringify(row)
    }
  }
  writeShadow(shadow)
}
