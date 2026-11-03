/**
 * The one usage count the app sends itself: a help page was opened.
 *
 * Every other daily count (families, chores accepted, rewards, games,
 * schools) is kept by the database as the thing happens, so the app sends
 * nothing for them. This is a number and nothing else: no id, no cookie,
 * nothing stored on the phone, nothing sent anywhere but RankUp's own
 * database, and sent with the public key rather than the sign-in, so the
 * request cannot say who asked. See supabase/health.sql.
 */
import { transport } from './sync/transport.js'

let last = 0

export function countHelpView() {
  // A screen drawn twice in a row (React does that while developing) is one view.
  const now = Date.now()
  if (now - last < 2000) return
  last = now
  try {
    transport.anonymousRpc('count_help_view').catch(() => {})
  } catch {
    // Counting must never break the help page.
  }
}
