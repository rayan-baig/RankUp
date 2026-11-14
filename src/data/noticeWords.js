/**
 * Every word RankUp puts on a lock screen, in one place.
 *
 * These were in four files (api/send-push.js, api/send-reminders.js,
 * api/send-digests.js and src/lib/notifications.js), two of them copies of
 * each other that had to be kept in step by hand. The server functions and
 * the app both import this file now, so a notice reads the same whether it
 * arrives by push or is shown on the phone where it happened.
 *
 * The rules for the words, which tests/noticewords.mjs holds them to:
 *   - Short. A title fits on one line of a lock screen, a body in two or three
 *     (TITLE_MAX, BODY_MAX, DIGEST_BODY_MAX), with the longest name and chore
 *     title a notice can carry (VALUE_MAX).
 *   - Friendly, and never shaming. A chore sent back is "another go", not a
 *     failure, and nothing is ever said about a child to anybody else.
 *   - True to what happened. A parent taps Accept, so a child is told it was
 *     accepted; a chore sent back without a note does not promise a reason.
 *   - Plain. No "!!!", no shouting, at most one emoji, and no link or number
 *     that could make a notice look like a message from somebody else.
 *
 * Pure: no imports, so a server function can load it without the app.
 */

/** The longest name or chore title a notice carries (api/send-push.js clips to it). */
export const VALUE_MAX = 40
export const TITLE_MAX = 60
export const BODY_MAX = 130
/** The weekly digest says more, and is still cut before a phone would cut it. */
export const DIGEST_BODY_MAX = 200

/** Cut at a word, with an ellipsis, rather than mid-word wherever the phone stops. */
export function clip(text, max) {
  const s = String(text ?? '')
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:—-]+$/, '')}…`
}

/** Every notice, cut to the limits whatever went into it. */
export function fit(notice, bodyMax = BODY_MAX) {
  return { ...notice, title: clip(notice.title, TITLE_MAX), body: clip(notice.body, bodyMax) }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The notices a phone can ask for by name (kind), with at most two values.
 * The server writes the words from these; a phone never sends a sentence.
 */
export const NOTICES = {
  /** A child tapped "I did it!". To the parents. */
  submission: (kidName, choreTitle) => fit({
    title: `${kidName || 'Your child'} finished a chore`,
    body: `“${choreTitle || 'A chore'}” is ready for you to check.`,
    tag: 'submission',
    url: '/#/parent/approvals',
  }),
  /** A parent tapped Accept. To that child. */
  approved: (choreTitle, xp) => fit({
    title: 'Accepted! 🎉',
    body: Number(xp) > 0
      ? `“${choreTitle || 'Your quest'}” earned you ${Number(xp)} XP.`
      : `“${choreTitle || 'Your quest'}” was accepted.`,
    tag: 'decision',
    url: '/#/kid',
  }),
  /**
   * A parent sent it back. To that child. Not "rejected", and no promise of a
   * reason: the note is optional, so "tap to see why" was not always true.
   */
  rejected: (choreTitle) => fit({
    title: 'Back on your list',
    body: `“${choreTitle || 'A quest'}” needs another go. You’ve got this.`,
    tag: 'decision',
    url: '/#/kid/quests',
  }),
  /** A child asked to join a guild. To the parents whose yes is missing. */
  guildRequest: (kidName, guildName) => fit({
    title: 'A guild request needs you',
    body: `${kidName || 'Your child'} wants to join ${guildName || 'a guild'}. Nobody joins without you.`,
    tag: 'guild',
    url: '/#/parent/guilds',
  }),
  /**
   * A daily reminder, shown by the app while it is open. A parent's phone
   * goes to the chores waiting to be checked, a child's to their quests: it
   * sent every phone to a child's quest list.
   */
  reminder: (label, role = 'kid') => fit({
    title: label || 'RankUp',
    body: role === 'parent' ? 'Time to check in on today’s chores.' : 'Time for your quests.',
    tag: 'reminder',
    url: role === 'parent' ? '/#/parent/approvals' : '/#/kid/quests',
  }),
  /** "Send me a test notification", in Settings. Says what it is. */
  test: () => fit({
    title: 'Notifications are on',
    body: 'This is how RankUp tells you a chore is ready for you to check.',
    tag: 'test',
    url: '/#/parent/approvals',
  }),
}

/** The kinds a phone may ask the server to push. Not the test, which is local. */
export const PUSH_KINDS = ['submission', 'approved', 'rejected', 'guildRequest', 'reminder']

/**
 * The Sunday digest, from the week's numbers (due_digests in digests.sql).
 *
 * A bare number says nothing: "nine, up from five" is the message. The child
 * who did most is named only to their own parents, and only when there is
 * more than one child, so nobody is singled out for doing least. A quiet week
 * is said kindly. The one ask is the chores waiting to be checked, and the tap
 * goes there; otherwise to the week's charts.
 */
export function digestNotice(d) {
  const done = Number(d?.approved) || 0
  const before = Number(d?.approved_last_week) || 0
  const kids = d?.kids || []
  const top = kids.find((k) => Number(k.done) > 0)

  let body
  if (done === 0) body = `A quiet week, with no chores finished. ${plural(before, 'was', 'were')} done the week before.`
  else if (before === 0) body = `${plural(done, 'chore', 'chores')} done this week.`
  else if (done > before) body = `${plural(done, 'chore', 'chores')} done, up from ${before} last week.`
  else if (done < before) body = `${plural(done, 'chore', 'chores')} done, down from ${before} last week.`
  else body = `${plural(done, 'chore', 'chores')} done, the same as last week.`

  if (top && kids.length > 1) body += ` ${String(top.name).slice(0, VALUE_MAX)} led with ${top.done}.`
  if (d?.quietest_day && done > 0) body += ` Quietest day: ${d.quietest_day}.`

  const waiting = Number(d?.waiting_for_you) || 0
  // Chores, not photos: RankUp takes none, and a parent checks the chore itself.
  if (waiting > 0) body += ` ${plural(waiting, 'chore is', 'chores are')} waiting for you to check.`

  return fit({
    title: 'Your week in RankUp',
    body,
    tag: 'digest',
    url: waiting > 0 ? '/#/parent/approvals' : '/#/parent/blueprint',
  }, DIGEST_BODY_MAX)
}

/** A reminder sent by the server job, to a parent's or a child's phones. */
export function reminderPush(label, role) {
  return NOTICES.reminder(String(label || 'RankUp').slice(0, VALUE_MAX), role === 'kid' ? 'kid' : 'parent')
}
