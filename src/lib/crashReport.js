/**
 * Telling you a crash happened.
 *
 * Nobody files a bug report about a children's chore app. They close it, and if
 * it happens twice they delete it — and you never find out. A crash that only
 * reaches console.error on a stranger's phone is a crash you will never fix.
 *
 * WHAT IS SENT: the route, the error message, and the top of the component
 * stack. Never a name, never anything a child typed. An error string can quote
 * the value that caused it, and those values are family data, so every part is
 * passed through scrub() first: names, emails, tokens, codes and anything in
 * quotes come out, and the route loses its query and its ids.
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

/*
 * The family's own names, so they can be taken out of a report. Set by the
 * app (AppContext) rather than read here, because a crash can happen anywhere
 * and this file must not reach into the app's state.
 */
let namesOf = () => []
export function setCrashNames(getter) {
  namesOf = typeof getter === 'function' ? getter : () => []
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Take anything personal out of a line of text before it leaves the phone.
 *
 * An error message quotes what caused it, and in this app that is family data:
 * a child's name, a parent's email, the note a child typed, a pairing code, a
 * sign-in token from the address bar. What is left is the shape of the error,
 * which is all that is needed to fix it.
 */
export function scrub(text, names = []) {
  let out = String(text || '')
  // Sign-in tokens and keys: three dot-separated base64 runs, or one long run.
  out = out.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
  out = out.replace(/(access_token|refresh_token|token|code|key|password|pin)=[^&\s]+/gi, '$1=[removed]')
  out = out.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
  out = out.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
  // Anything quoted is a value, and values are what a family typed.
  out = out.replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’|`[^`]*`/g, '"…"')
  // Codes, PINs, phone numbers, amounts: any run of four or more digits.
  out = out.replace(/\d[\d\s-]{2,}\d/g, (m) => (m.replace(/\D/g, '').length >= 4 ? '[number]' : m))
  for (const name of names) {
    const n = String(name || '').trim()
    if (n.length < 2) continue
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escape(n)}(?=$|[^\\p{L}])`, 'giu'), '$1[name]')
  }
  return out
}

/** The screen, as its route: never the query, never an id. */
export function scrubWhere(where) {
  return String(where || 'unknown')
    .split(/[?#&]/)[0]
    .split('/')
    .map((part) => (/\d|[A-Za-z0-9_-]{16,}/.test(part) ? ':id' : part))
    .join('/')
}

/** A crash is "the same" as another if it broke on the same screen the same way. */
const fingerprint = (where, message) => `${where}|${String(message).slice(0, 80)}`

export function reportCrash({ where: rawWhere, error, componentStack }) {
  let names = []
  try { names = namesOf() || [] } catch { /* a report must never throw */ }
  const where = scrubWhere(rawWhere)
  const message = scrub(error?.message || String(error || 'unknown'), names)
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
      p_stack: scrub(String(componentStack || '').split('\n').slice(0, 6).join('\n'), names).slice(0, 600),
      p_agent: (navigator.userAgent || '').slice(0, 200),
    })
    .catch(() => {
      // Reporting a crash must never cause one. If it cannot be sent, the
      // console line written by the boundary is all there is, and that is fine.
    })
}
