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

export const kids = {
  fromRow: (row, existing = {}) => ({
    ...existing,
    id: row.id,
    name: row.name,
    themeId: row.theme_id,
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
    lockout: row.lockout_kind
      ? { type: row.lockout_kind, until: ms(row.lockout_until), reason: row.lockout_reason || '' }
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
    pairedDeviceAt: existing.pairedDeviceAt ?? null,
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
    status: row.status,
    redoNote: row.redo_note || undefined,
    redoCount: row.redo_count || 0,
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
    adaptive: Boolean(q.adaptive),
    done_means: q.doneMeans || '',
    supports: q.supports || [],
    why: q.why || '',
    requires_photo: q.requiresPhoto !== false,
    timer_seconds: q.timerSeconds || 0,
    test_score: Boolean(q.testScore),
    double_xp: Boolean(q.doubleXp),
    recurrence: q.recurrence || 'once',
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
    photoId: existing.photoId || null,
    photoData: row.photo_data || null,
    photoUnavailable: existing.photoUnavailable ?? false,
    hash: row.photo_hash || null,
    captureSource: row.capture_source || 'none',
    note: row.note || '',
    testScore: row.test_score,
    elapsedMs: row.elapsed_ms,
    onTime: row.on_time,
    report: row.ai_report || existing.report || null,
    status: row.status,
    decidedAt: ms(row.decided_at),
    parentNote: row.parent_note || '',
    awarded:
      row.awarded_xp != null
        ? { xp: row.awarded_xp, coins: row.awarded_coins, lines: existing.awarded?.lines || [] }
        : existing.awarded || null,
    submittedAt: ms(row.submitted_at) || Date.now(),
    rev: row.rev,
  }),

  toRow: (s, familyId, photoData) => ({
    id: s.id,
    family_id: familyId,
    quest_id: s.questId,
    kid_id: s.kidId,
    photo_hash: s.hash || null,
    photo_data: photoData ?? s.photoData ?? null,
    capture_source: s.captureSource || 'none',
    note: s.note || '',
    test_score: typeof s.testScore === 'number' ? s.testScore : null,
    elapsed_ms: s.elapsedMs ?? null,
    on_time: s.onTime !== false,
    ai_verdict: s.report?.verdict || null,
    ai_score: s.report?.score ?? null,
    ai_report: s.report || null,
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
  }),
  toRow: (r, familyId) => ({
    id: r.id, family_id: familyId, name: r.name,
    description: r.description || '', icon: r.icon || '🎁', cost: r.cost,
  }),
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

/** Which app collection each snapshot key maps onto. */
export const ENTITIES = {
  kids: { key: 'kids', mapper: kids, table: 'kids' },
  quests: { key: 'quests', mapper: quests, table: 'quests' },
  submissions: { key: 'submissions', mapper: submissions, table: 'submissions' },
  rewards: { key: 'rewards', mapper: rewards, table: 'rewards' },
  redemptions: { key: 'redemptions', mapper: redemptions, table: 'redemptions' },
  notes: { key: 'notes', mapper: notes, table: 'notes' },
  overrides: { key: 'overrides', mapper: overrides, table: 'overrides' },
}
