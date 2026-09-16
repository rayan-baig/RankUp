/**
 * Telling you a crash happened.
 *
 * Nobody files a bug report about a children's chore app. They close it, and if
 * it happens twice they delete it — and you never find out. A crash that only
 * reaches console.error on a stranger's phone is a crash you will never fix.
 *
 * WHAT IS SENT: the route, the error message, and the top of the component
 * stack. Never a name, never a photo, never anything a child typed. The message
 * is truncated hard, because an error string can contain the value that caused
 * it and those values are family data.
 *
 * WHAT IT COSTS: nothing worth measuring. At most three reports per device per
 * day, deduplicated so one screen crashing in a loop writes one row, and
 * dropped entirely when no backend is configured. A crash-reporting path that
 * could itself flood the database would be a worse bug than the one it reports.
 */

import { transport } from './sync/transport.js'

const KEY = 'rankup.crashes.v1'
const MAX_PER_DAY = 3

const today = () => new Date().toISOString().slice(0, 10)

function ledger() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!saved || saved.day !== today()) return { day: today(), count: 0, seen: [] }
    return saved
  } catch {
    return { day: today(), count: 0, seen: [] }
  }
}

function remember(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode */ }
}

/** A crash is "the same" as another if it broke on the same screen the same way. */
const fingerprint = (where, message) => `${where}|${String(message).slice(0, 80)}`

export function reportCrash({ where, error, componentStack }) {
  const message = error?.message || String(error || 'unknown')
  const print = fingerprint(where, message)

  const state = ledger()
  // One row for a screen crashing over and over, and a hard daily ceiling.
  if (state.seen.includes(print) || state.count >= MAX_PER_DAY) return
  remember({ ...state, count: state.count + 1, seen: [...state.seen, print].slice(-20) })

  if (!transport.isConfigured()) return
  transport
    .rpc('record_crash', {
      p_where: String(where || 'unknown').slice(0, 80),
      p_message: message.slice(0, 300),
      p_stack: String(componentStack || '').split('\n').slice(0, 6).join('\n').slice(0, 600),
      p_agent: (navigator.userAgent || '').slice(0, 200),
    })
    .catch(() => {
      // Reporting a crash must never cause one. If it cannot be sent, the
      // console line written by the boundary is all there is, and that is fine.
    })
}
