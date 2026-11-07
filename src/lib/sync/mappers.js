/**
 * Translating between the database's shape and the app's.
 *
 * Postgres columns are snake_case and store dates as ISO strings; the app uses
 * camelCase and epoch milliseconds. Rather than sprinkle conversions through
 * twenty screens, every crossing happens here.
 *
 * Each entity has a `toRow` (going up) and a `fromRow` (coming down). Anything
 * the server does not know about — a kid's `bestTimes`, say, which is purely
 * local — is preserved by the merge rather than being wiped by a pull.
 */

const ms = (iso) => (iso ? Date.parse(iso) : null)
const iso = (millis) => (millis ? new Date(millis).toISOString() : null)

/* ------------------------------------------------------------------ */
/* Kids                                                                */
/* ------------------------------------------------------------------ */

/**
 * A kid as this phone keeps it, less `themeBefore`: once the server's row has
 * arrived, the theme it names is the confirmed one (see SET_KID_THEME).
 */
const settledKid = (existing) => {
  if (!existing || !('themeBefore' in existing)) return existing
  const { themeBefore: _settled, ...kept } = existing
  void _settled
  return kept
}

export const kids = {
  fromRow: (row, existing = {}) => ({
    ...settledKid(existing),
    id: row.id,
    name: row.name,
    themeId: row.theme_id,
    /*
     * When the server saw this theme chosen. The dragon fight starts no
     * earlier than this, so every phone has to use the same moment: the
     * server's, null included (the fight then starts at the chore that took
     * the child to the dragon). Only a server too old to send the column
     * leaves this phone's own.
     */
    themeChosenAt: row.theme_chosen_at !== undefined ? ms(row.theme_chosen_at) : existing.themeChosenAt ?? null,
    avatarHue: row.avatar_hue ?? existing.avatarHue ?? 200,
    xp: row.xp,
    coins: row.coins,
    accessibility: {
      hasNeeds: row.has_access_needs,
      notes: row.access_notes || '',
      supports: row.access_supports || [],
    },
    streak: {
      count: row.streak_count ?? 0,
      lastDay: row.streak_last_day || null,
      freezeTokens: row.streak_freezes ?? 0,
    },
    /*
     * The lockout's own id is kept, because the server row has no column for it
     * and both ways of ending a lockout match on it.
     *
     * Rebuilding this object from the row alone dropped overrideId, and then
     * LIFT_OVERRIDE's `k.lockout?.overrideId === override.id` compared
     * undefined to the id and never matched. The parent tapped Lift, the
     * history screen said the override had ended, and the child stayed locked
     * out — for ever, because a red lockdown has no expiry to rescue it either.
     * Any approval bumps the kids row, so one pull was enough to trigger it.
     */
    lockout: row.lockout_kind
      ? {
          ...(existing.lockout?.type === row.lockout_kind ? existing.lockout : {}),
          type: row.lockout_kind,
          until: ms(row.lockout_until),
          reason: row.lockout_reason || '',
        }
      : null,
    profileFrame: row.profile_frame || 'none',
    dropSelector: row.drop_selector || 'standard',
    skins: Array.isArray(row.skins) ? row.skins : [],
    skinId: row.skin_id || null,
    playTokens: row.play_tokens ?? 0,
    gameDay: row.game_day || null,
    gameCoinsToday: row.game_coins_today ?? 0,
    bestScores: row.best_scores || {},
    lastLoginBonus: row.last_login_bonus || null,
    // Local-only, never sent: keep whatever this device already had.
    bestTimes: existing.bestTimes || {},
    storySeen: existing.storySeen || {},
    /*
     * Whether this child has a phone of their own is the server's to say:
     * kids.user_id is that phone's sign-in, set when a parent claims its code
     * and cleared when it is unlinked. Read from it, a co-parent's phone and
     * the first-week checklist agree with the phone that did the pairing.
     * A row without the column (an older snapshot) leaves what was here.
     */
    pairedDeviceAt: row.user_id
      ? (existing.pairedDeviceAt || Date.now())
      : row.user_id === null ? null : (existing.pairedDeviceAt ?? null),
    createdAt: ms(row.created_at) || existing.createdAt || Date.now(),
    rev: row.rev,
  }),

  toRow: (kid, familyId) => ({
    id: kid.id,
    family_id: familyId,
    name: kid.name,
    theme_id: kid.themeId,
    avatar_hue: kid.avatarHue ?? 200,
    xp: kid.xp,
    coins: kid.coins,
    has_access_needs: Boolean(kid.accessibility?.hasNeeds),
    access_notes: kid.accessibility?.notes || '',
    access_supports: kid.accessibility?.supports || [],
    streak_count: kid.streak?.count ?? 0,
    streak_last_day: kid.streak?.lastDay || null,
    streak_freezes: kid.streak?.freezeTokens ?? 0,
    profile_frame: kid.profileFrame || 'none',
    drop_selector: kid.dropSelector || 'standard',
    skins: kid.skins || [],
    skin_id: kid.skinId || null,
    last_login_bonus: kid.lastLoginBonus || null,
    lockout_kind: kid.lockout?.type || null,
    lockout_until: iso(kid.lockout?.until),
    lockout_reason: kid.lockout?.reason || null,
  }),
}

/* ------------------------------------------------------------------ */
/* Quests                                                              */
/* ------------------------------------------------------------------ */

export const quests = {
  fromRow: (row, existing = {}) => ({
    ...existing,
    id: row.id,
    kidId: row.kid_id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    difficulty: row.difficulty,
    xp: row.xp,
    adaptive: row.adaptive,
    doneMeans: row.done_means || '',
    supports: row.supports || [],
    why: row.why || '',
    requiresPhoto: row.requires_photo,
    timerSeconds: row.timer_seconds || 0,
    testScore: row.test_score,
    doubleXp: row.double_xp,
    recurrence: row.recurrence || 'once',
    lastResetOn: row.last_reset_on || null,
    status: row.status,
    redoNote: row.redo_note || undefined,
    redoCount: row.redo_count || 0,
    // Real money, in minor units. See lib/money.js.
    pence: row.pence ?? 0,
    completedAt: ms(row.completed_at),
    createdAt: ms(row.created_at) || Date.now(),
    rev: row.rev,
  }),

  toRow: (q, familyId) => ({
    id: q.id,
    family_id: familyId,
    kid_id: q.kidId,
    title: q.title,
    description: q.description || '',
    category: q.category || 'bedroom',
    difficulty: q.difficulty || 'medium',
    xp: q.xp ?? 30,
    pence: q.pence ?? 0,
    adaptive: Boolean(q.adaptive),
    done_means: q.doneMeans || '',
    supports: q.supports || [],
    why: q.why || '',
    requires_photo: q.requiresPhoto !== false,
    timer_seconds: q.timerSeconds || 0,
    test_score: Boolean(q.testScore),
    double_xp: Boolean(q.doubleXp),
    recurrence: q.recurrence || 'once',
    last_reset_on: q.lastResetOn || null,
    status: q.status || 'assigned',
    redo_note: q.redoNote || null,
    redo_count: q.redoCount || 0,
    completed_at: iso(q.completedAt),
  }),
}

/* ------------------------------------------------------------------ */
/* Submissions                                                         */
/* ------------------------------------------------------------------ */

export const submissions = {
  fromRow: (row, existing = {}) => ({
    ...existing,
    id: row.id,
    questId: row.quest_id,
    kidId: row.kid_id,
    note: row.note || '',
    testScore: row.test_score,
    elapsedMs: row.elapsed_ms,
    onTime: row.on_time,
    status: row.status,
    decidedAt: ms(row.decided_at),
    parentNote: row.parent_note || '',
    // Which adult accepted it or sent it back, and their note on it since:
    // the Chore history screen shows both.
    decidedBy: row.decided_by || null,
    historyNote: row.history_note || '',
    sticker: row.sticker || null,
    awarded:
      row.awarded_xp != null
        ? { xp: row.awarded_xp, coins: row.awarded_coins, lines: existing.awarded?.lines || [] }
        : existing.awarded || null,
    submittedAt: ms(row.submitted_at) || Date.now(),
    rev: row.rev,
  }),

  toRow: (s, familyId) => ({
    id: s.id,
    family_id: familyId,
    quest_id: s.questId,
    kid_id: s.kidId,
    note: s.note || '',
    test_score: typeof s.testScore === 'number' ? s.testScore : null,
    elapsed_ms: s.elapsedMs ?? null,
    on_time: s.onTime !== false,
    status: s.status || 'pending',
    parent_note: s.parentNote || '',
    submitted_at: iso(s.submittedAt),
  }),
}

/* ------------------------------------------------------------------ */
/* The smaller entities                                                */
/* ------------------------------------------------------------------ */

export const rewards = {
  fromRow: (row) => ({
    id: row.id, name: row.name, description: row.description || '',
    icon: row.icon || '🎁', cost: row.cost, createdAt: ms(row.created_at), rev: row.rev,
    // How often one child may take it in any seven days; null is no limit.
    weeklyLimit: row.weekly_limit ?? null,
  }),
  toRow: (r, familyId) => ({
    id: r.id, family_id: familyId, name: r.name,
    description: r.description || '', icon: r.icon || '🎁', cost: r.cost,
    weekly_limit: weeklyLimitOf(r.weeklyLimit),
  }),
}

/** A limit the database will hold: a whole number from 1 to 50, or none. */
export function weeklyLimitOf(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}

export const redemptions = {
  fromRow: (row) => ({
    id: row.id, rewardId: row.reward_id, kidId: row.kid_id, name: row.name,
    cost: row.cost, status: row.status, at: ms(row.created_at),
    givenAt: ms(row.given_at), rev: row.rev,
  }),
  toRow: (r, familyId) => ({
    id: r.id, family_id: familyId, reward_id: r.rewardId, kid_id: r.kidId,
    name: r.name, cost: r.cost, status: r.status || 'requested',
  }),
}

export const notes = {
  fromRow: (row) => ({
    id: row.id, kidId: row.kid_id, from: row.author, text: row.body,
    read: row.read, at: ms(row.created_at), rev: row.rev,
  }),
  toRow: (n, familyId) => ({
    id: n.id, family_id: familyId, kid_id: n.kidId,
    author: n.from, body: n.text, read: Boolean(n.read),
  }),
}

export const overrides = {
  fromRow: (row) => ({
    id: row.id, kidId: row.kid_id, kind: row.kind, reason: row.reason || '',
    consequence: row.consequence || '', percent: row.percent, amount: row.amount,
    minutes: row.minutes, until: ms(row.until), createdAt: ms(row.created_at),
    liftedAt: ms(row.lifted_at), endedBy: row.ended_by || undefined, rev: row.rev,
  }),
  toRow: (o, familyId) => ({
    id: o.id, family_id: familyId, kid_id: o.kidId, kind: o.kind,
    reason: o.reason || '', consequence: o.consequence || '',
    percent: o.percent ?? null, amount: o.amount ?? null, minutes: o.minutes ?? null,
    until: iso(o.until), lifted_at: iso(o.liftedAt),
  }),
}

/**
 * The family goal: one per family, and not diffed like the rows above. It is
 * set by set_family_goal, which decides where the bar starts, and it arrives
 * with `progress` already added up, because a child's phone cannot see its
 * brothers' and sisters' XP to add it up itself.
 */
export const familyGoals = {
  fromRow: (row) => ({
    name: row.name,
    targetXp: row.target_xp,
    startXp: row.start_xp ?? 0,
    setAt: ms(row.created_at),
    progress: row.progress ?? 0,
    shared: true,
    rev: row.rev,
  }),
}

/**
 * A child's own theme (Theme Genesis). The look and the names only: see
 * src/data/themeGenesis.js. `sent_at` and `picked_season` are the server's
 * (submit_kid_theme and the operator's pick write them), so they come down
 * and never go up.
 */
export const kidThemes = {
  fromRow: (row, existing = {}) => ({
    ...existing,
    id: row.id,
    kidId: row.kid_id,
    name: row.name,
    design: row.design || {},
    status: row.status || 'draft',
    useAsk: Boolean(row.use_ask),
    sendAsk: Boolean(row.send_ask),
    sentAt: ms(row.sent_at),
    pickedSeason: row.picked_season ?? null,
    createdAt: ms(row.created_at) || existing.createdAt || Date.now(),
    rev: row.rev,
  }),
  toRow: (t, familyId) => ({
    id: t.id,
    family_id: familyId,
    kid_id: t.kidId,
    name: t.name,
    design: t.design,
    status: t.status || 'draft',
    use_ask: Boolean(t.useAsk),
    send_ask: Boolean(t.sendAsk),
  }),
}

/** Which app collection each snapshot key maps onto. */
export const ENTITIES = {
  kids: { key: 'kids', mapper: kids, table: 'kids' },
  quests: { key: 'quests', mapper: quests, table: 'quests' },
  submissions: { key: 'submissions', mapper: submissions, table: 'submissions' },
  rewards: { key: 'rewards', mapper: rewards, table: 'rewards' },
  redemptions: { key: 'redemptions', mapper: redemptions, table: 'redemptions' },
  notes: { key: 'notes', mapper: notes, table: 'notes' },
  overrides: { key: 'overrides', mapper: overrides, table: 'overrides' },
  kid_themes: { key: 'kidThemes', mapper: kidThemes, table: 'kid_themes' },
}
