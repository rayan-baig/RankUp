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
  kids: ['xp', 'coins', 'streak_count', 'streak_last_day', 'streak_freezes',
         // Arcade tokens and the day's winnings are balances too: play_minigame
         // and approve_submission are the only things allowed to move them.
         'play_tokens', 'game_day', 'game_coins_today',
         // Skins are bought, so the list of them is a balance as well.
         // buy_market_skin is what adds one, and a device pushing its own copy
         // of the list could hand over a paid skin for nothing — or, pushing a
         // stale copy, take back one the child had just paid for.
         'skins',
         // The mark that says the daily bonus has been claimed. Pushing a stale
         // one moved it back to yesterday, and the bonus could be claimed again.
         'last_login_bonus'],
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
 * The columns of their own row a child is allowed to change.
 *
 * Their theme, their frame, their drop selector, the skin they have equipped.
 * These live in the kids table next to XP and currency, which is why a child's
 * device cannot write the row — so they go through set_kid_look instead, which
 * writes these five columns and refuses everything else.
 *
 * Without this the choice never left the phone, and the pull eight seconds
 * later handed the old row back. The child picked a theme and watched it snap
 * straight back, every time.
 */
const KID_LOOK = ['theme_id', 'profile_frame', 'drop_selector', 'skin_id', 'avatar_hue']

function lookOf(kid, familyId) {
  const row = ENTITIES.kids.mapper.toRow(kid, familyId)
  const look = {}
  KID_LOOK.forEach((column) => { look[column] = row[column] ?? null })
  return look
}

/** Queue the child's own appearance, if this device is a child's and it moved. */
function queueKidLook(state, shadow, familyId) {
  const kidId = state.device?.linkedKidId
  const kid = kidId && (state.kids || []).find((k) => k.id === kidId)
  if (!kid) return 0

  const look = lookOf(kid, familyId)
  const shadowId = `kids-look:${kidId}`
  const serialised = JSON.stringify(look)
  if (shadow[shadowId] === serialised) return 0

  const queued = enqueue({
    type: 'rpc',
    fn: 'set_kid_look',
    // Toggling a theme twice should send one call, not two.
    foldKey: `set_kid_look:${kidId}`,
    args: {
      p_kid_id: kidId,
      p_theme_id: look.theme_id,
      p_profile_frame: look.profile_frame,
      p_drop_selector: look.drop_selector,
      // Empty string is how the function is told to take a skin OFF; null
      // means "leave whatever is there", which is not the same thing.
      p_skin_id: look.skin_id ?? '',
      p_avatar_hue: look.avatar_hue,
    },
  })
  if (!queued) return 0
  shadow[shadowId] = serialised
  return 1
}

/**
 * Compare state against the shadow and queue whatever changed.
 * `photoFor` supplies a submission's image, which lives outside the state object.
 */
export function queueChanges(state, { photoFor, role } = {}) {
  if (!state.family?.id) return 0
  const shadow = readShadow()
  const familyId = state.family.id
  let queued = 0

  if (role === 'kid') queued += queueKidLook(state, shadow, familyId)

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
      // Only remember it as sent if it was actually queued. enqueue returns
      // null when localStorage refused the write, and recording the shadow
      // anyway meant the change was skipped from then on — silently lost to a
      // full quota, which this app hits routinely because photos live there.
      if (!enqueue({ type: 'upsert', table, row })) continue
      shadow[shadowId] = serialised
      queued += 1
    }

    // Anything the shadow knows about that is no longer here was deleted.
    for (const shadowId of Object.keys(shadow)) {
      if (!shadowId.startsWith(`${table}:`) || seen.has(shadowId)) continue
      const id = shadowId.slice(table.length + 1)
      if (!enqueue({ type: 'delete', table, id })) continue
      delete shadow[shadowId]
      queued += 1
    }
    void snapshotKey
  }

  writeShadow(shadow)
  return queued
}

/** After a pull, record what the server now holds so we do not echo it back. */
export function recordServerState(state, { photoFor, only } = {}) {
  if (!state.family?.id) return
  const shadow = readShadow()
  const familyId = state.family.id
  for (const [, { key: stateKey, mapper, table }] of Object.entries(ENTITIES)) {
    for (const item of state[stateKey] || []) {
      // `only` is the set of ids the snapshot actually delivered.
      //
      // Without it this wrote the ENTIRE state into the shadow as "the server
      // has this" — including a local edit made in the same 250ms debounce
      // window as the pull, which was then never sent and, because a matching
      // shadow entry suppresses every future attempt, never sent again either.
      // Pulls run every 8-20 seconds, so that window was hit routinely.
      if (only && !only.has(`${table}:${item.id}`)) continue
      const row = stripServerOwned(
        table,
        table === 'submissions'
          ? mapper.toRow(item, familyId, photoFor?.(item))
          : mapper.toRow(item, familyId),
      )
      shadow[`${table}:${item.id}`] = JSON.stringify(row)
      // The look is tracked separately because it is pushed separately. Without
      // this, a theme the PARENT changed would arrive here and be pushed
      // straight back by the child's device as if the child had chosen it.
      if (table === 'kids' && item.id === state.device?.linkedKidId) {
        shadow[`kids-look:${item.id}`] = JSON.stringify(lookOf(item, familyId))
      }
    }
  }
  writeShadow(shadow)
}
