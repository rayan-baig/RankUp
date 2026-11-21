/**
 * "Sent!": the moment after a child taps Send to parent.
 *
 * The quest page goes straight back to the list (so nothing waits on it),
 * and leaves a note here for the list to show once: a short, cheerful card
 * saying it reached the parent, or that it is saved on the phone until there
 * is signal. In memory only: a reload is not the moment any more.
 */
let pending = null

/** The quest page: this was just sent. */
export function noteSent(title, { queued = false } = {}) {
  pending = { title: String(title || ''), queued: Boolean(queued), at: Date.now() }
}

/**
 * The list: what was just sent, or null. A note older than a few seconds is
 * stale. Reading leaves it (React may render the list twice to check it);
 * the list clears it once it is on the screen.
 */
export function peekSent(now = Date.now()) {
  return pending && now - pending.at < 5000 ? pending : null
}

/** Shown: the next visit to the list is not the moment any more. */
export function clearSent() {
  pending = null
}

/** How long the moment stays on the screen. */
export const SENT_MS = 2200
