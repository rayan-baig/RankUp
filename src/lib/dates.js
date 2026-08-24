/** Small date helpers. Everything in the app keys off a local YYYY-MM-DD string. */

export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(date, n) {
  const d = new Date(date instanceof Date ? date.getTime() : new Date(date).getTime())
  d.setDate(d.getDate() + n)
  return d
}

export function daysBetween(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00`)
  const b = new Date(`${bKey}T00:00:00`)
  return Math.round((b - a) / 86400000)
}

/** The 7 day-keys ending today, oldest first. */
export function lastSevenDays(from = new Date()) {
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(from, i - 6)))
}

export function shortDayName(key) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

export function relativeTime(ts) {
  const diff = Date.now() - ts
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function formatDuration(ms) {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}
