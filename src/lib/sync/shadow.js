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
 * Forget rows this phone has let go of to save space (lib/prune.js), so their
 * absence from the state is not read as a delete. The server keeps them.
 */
export function forgetRows(dropped) {
  const shadow = readShadow()
  let changed = false
  for (const [table, ids] of Object.entries({ quests: dropped?.quests, notes: dropped?.notes })) {
    for (const id of ids || []) {
      if (`${table}:${id}` in shadow || `?${table}:${id}` in shadow) changed = true
      delete shadow[`${table}:${id}`]
      delete shadow[`?${table}:${id}`]
    }
  }
  if (changed) writeShadow(shadow)
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
         // play_minigame keeps the high score, so a device pushing an older
         // copy of it would quietly take a record away.
         'best_scores',
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
  quests: ['status', 'completed_at', 'redo_note', 'redo_count',
           // Part of the same state machine as `status`: it is what stops a
           // repeating chore coming back twice in one morning. A device
           // pushing its own optimistic copy would tell the server the chore
           // had already returned, and it would then never actually return.
           'last_reset_on'],
  submissions: ['status', 'parent_note',
                // What a chore paid is decided by award_for_submission now, so
                // the device must not push its own optimistic copy back over
                // the figure that actually landed.
                'awarded_xp', 'awarded_coins'],
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
const KID_WRITABLE = new Set(['notes',
  // Their own themes (Theme Genesis). Row level security holds a child to
  // their own rows, and a guard trigger to the look and the names: the
  // columns the server writes (sent_at, picked_season) are not theirs.
  'kid_themes'])

/**
 * Tables no device ever writes directly, whatever role it is in.
 *
 * A submission is created by submit_quest and a redemption by redeem_reward —
 * both carry the whole row — because the outcome has to be
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
 */
export function queueChanges(state, { role } = {}) {
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
        mapper.toRow(item, familyId),
      )
      const shadowId = `${table}:${item.id}`
      seen.add(shadowId)
      const serialised = JSON.stringify(row)
      const known = shadow[shadowId]
      if (known === serialised) continue
      // A row this device created, that the server has not yet sent back,
      // may never have arrived (its insert refused, or given up on after a
      // day). Changes to it go whole, so they create it rather than patch
      // nothing: a patch of a missing row "succeeds" and changes nothing.
      const unconfirmed = shadow[`?${shadowId}`]
      // A row the server already has is sent as the columns that changed,
      // never the whole row. The whole row overwrote, column by column, what
      // another parent had changed meanwhile: renaming a child on one phone
      // lifted the lockdown just applied on the other. And a child's phone
      // marking a note read sent an insert-or-update, which row level security
      // refuses for a note the child did not write; an update is allowed.
      let op = { type: 'upsert', table, row }
      if (known && !unconfirmed) {
        const before = JSON.parse(known)
        const changed = { id: row.id }
        for (const [column, value] of Object.entries(row)) {
          if (JSON.stringify(before[column]) !== JSON.stringify(value)) changed[column] = value
        }
        if (Object.keys(changed).length === 1) { shadow[shadowId] = serialised; continue }
        op = { type: 'patch', table, row: changed }
      }
      // Only remember it as sent if it was actually queued. enqueue returns
      // null when localStorage refused the write, and recording the shadow
      // anyway meant the change was skipped from then on — silently lost to a
      // full quota.
      if (!enqueue(op)) continue
      shadow[shadowId] = serialised
      if (op.type === 'upsert') shadow[`?${shadowId}`] = true
      queued += 1
    }

    // Anything the shadow knows about that is no longer here was deleted.
    for (const shadowId of Object.keys(shadow)) {
      if (!shadowId.startsWith(`${table}:`) || seen.has(shadowId)) continue
      const id = shadowId.slice(table.length + 1)
      if (!enqueue({ type: 'delete', table, id })) continue
      delete shadow[shadowId]
      delete shadow[`?${shadowId}`]
      queued += 1
    }
    void snapshotKey
  }

  writeShadow(shadow)
  return queued
}

/**
 * The rows this device has changed and the server has not yet confirmed.
 *
 * A pull that arrives while one of these is waiting must not overwrite it: the
 * server's copy is older than the device's. That was the commonest way an edit
 * disappeared. The cursor deliberately lags, so a pull routinely carries rows
 * changed in the last few seconds, and a child's row changes every time they
 * play or are approved. A parent tapping "Lift now" a moment before such a
 * pull landed saw the lockdown come straight back, and it stayed back.
 */
/** Database functions that move a child's coins (or the arcade balances beside them). */
const BALANCE_CALLS = new Set(['redeem_reward', 'apply_currency_tax', 'buy_market_skin', 'play_minigame',
                               'claim_login_bonus', 'use_streak_freeze'])

export function pendingRows(ops, state = null) {
  const pending = new Set()
  const submission = (id) => (state?.submissions || []).find((s) => s.id === id)
  for (const op of ops) {
    if ((op.type === 'upsert' || op.type === 'patch') && op.row?.id) pending.add(`${op.table}:${op.row.id}`)
    // A delete is marked twice: as a row with a change waiting, and as a
    // delete, so a pull cannot bring the row back while the delete waits.
    else if (op.type === 'delete') { pending.add(`${op.table}:${op.id}`); pending.add(`delete:${op.table}:${op.id}`) }
    // A child's own look travels by function rather than as a row.
    else if (op.type === 'rpc' && op.fn === 'set_kid_look' && op.args?.p_kid_id) pending.add(`kids:${op.args.p_kid_id}`)
    // A goal this phone has just set must not be put back by an older copy.
    else if (op.type === 'rpc' && op.fn === 'set_family_goal') pending.add('family_goals')
    // A parent sending a child's theme to RankUp: an older pull would show
    // the request as still waiting, and invite a second tap.
    else if (op.type === 'rpc' && op.fn === 'submit_kid_theme' && op.args?.p_theme_id) pending.add(`kid_themes:${op.args.p_theme_id}`)
    // A note added in Chore history: an older pull must not wipe it on screen.
    else if (op.type === 'rpc' && op.fn === 'set_history_note' && op.args?.p_submission_id) pending.add(`submissions:${op.args.p_submission_id}`)
    /*
     * A chore sent, accepted or sent back, still on its way. A pull already in
     * flight carries the rows as they were a moment before, and merging it
     * put an accepted chore back in the review queue with the child's XP
     * undone, where a second tap on Accept paid it again on this phone and
     * sent a second "Approved!". Only rows the call itself writes are held,
     * so each comes back with the pull after it lands.
     */
    else if (op.type === 'rpc' && op.fn === 'submit_quest' && op.args?.p_submission_id) {
      pending.add(`submissions:${op.args.p_submission_id}`)
      if (op.args.p_quest_id) pending.add(`quests:${op.args.p_quest_id}`)
    } else if (op.type === 'rpc' && (op.fn === 'approve_submission' || op.fn === 'reject_submission') && op.args?.p_submission_id) {
      pending.add(`submissions:${op.args.p_submission_id}`)
      const decided = submission(op.args.p_submission_id)
      if (decided?.questId) pending.add(`quests:${decided.questId}`)
      // Only an approval writes the child's row (XP, coins, streak).
      if (op.fn === 'approve_submission' && decided?.kidId) pending.add(`kids:${decided.kidId}`)
    } else if (op.type === 'rpc' && BALANCE_CALLS.has(op.fn) && op.args?.p_kid_id) {
      /*
       * A call that moves the child's coins, still on its way. A pull carries
       * the row as it was before the call landed, and merging it put the
       * coins back: a child who had just bought a reward watched their
       * balance jump up again, and could spend the same coins a second time
       * on this phone, to be refused (and refunded on screen) once the second
       * purchase reached the server. The row comes back with the pull after
       * the call lands.
       */
      pending.add(`kids:${op.args.p_kid_id}`)
      if (op.fn === 'redeem_reward' && op.args.p_redemption_id) pending.add(`redemptions:${op.args.p_redemption_id}`)
    } else if (op.type === 'rpc' && op.fn === 'mark_redemption_given' && op.args?.p_redemption_id) {
      // "Mark given" on its way: an older pull would show the reward as owed
      // again, and invite a second tap.
      pending.add(`redemptions:${op.args.p_redemption_id}`)
    }
  }
  return pending
}

/**
 * Record the rows a pull delivered as what the server holds, from the rows
 * themselves.
 *
 * This used to record the device's state AFTER the merge, a quarter of a
 * second later. An edit made in that quarter second was in that state, so it
 * was written down as already on the server and never sent. Taking the
 * server's own row, laid over the local item so local-only fields are there,
 * records exactly what the server said and nothing the device did since.
 *
 * Rows in `skip` have a change of the device's own still waiting to go; their
 * shadow already describes that change and is left alone.
 */
export function recordDelivered(state, snapshot, { skip = new Set() } = {}) {
  if (!state.family?.id || !snapshot) return
  const shadow = readShadow()
  const familyId = state.family.id
  for (const [snapshotKey, { key: stateKey, mapper, table }] of Object.entries(ENTITIES)) {
    // A device never writes these (see FUNCTION_OWNED), so nothing ever reads
    // their shadow. Keeping one anyway doubled what a family with a year of
    // chores held in the phone's storage, and pushed it towards full.
    if (FUNCTION_OWNED.has(table)) {
      for (const id of Object.keys(shadow)) {
        if (id.startsWith(`${table}:`) || id.startsWith(`?${table}:`)) delete shadow[id]
      }
      continue
    }
    const rows = snapshot[snapshotKey]
    if (!Array.isArray(rows) || !rows.length) continue
    const local = new Map((state[stateKey] || []).map((item) => [item.id, item]))
    for (const delivered of rows) {
      if (!delivered?.id || skip.has(`${table}:${delivered.id}`)) continue
      const item = mapper.fromRow(delivered, local.get(delivered.id) || {})
      const row = stripServerOwned(
        table,
        mapper.toRow(item, familyId),
      )
      shadow[`${table}:${item.id}`] = JSON.stringify(row)
      delete shadow[`?${table}:${item.id}`]   // the server has it
      if (table === 'kids' && item.id === state.device?.linkedKidId) {
        shadow[`kids-look:${item.id}`] = JSON.stringify(lookOf(item, familyId))
      }
    }
  }
  // Gone on the server: nothing left to send a delete for.
  for (const deletion of snapshot.deletions || []) {
    if (deletion?.table_name && deletion?.row_id) {
      delete shadow[`${deletion.table_name}:${deletion.row_id}`]
      delete shadow[`?${deletion.table_name}:${deletion.row_id}`]
    }
  }
  writeShadow(shadow)
}

/** After a pull, record what the server now holds so we do not echo it back. */
export function recordServerState(state, { only } = {}) {
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
        mapper.toRow(item, familyId),
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
