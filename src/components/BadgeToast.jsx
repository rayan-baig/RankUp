import { useEffect, useRef, useState } from 'react'
import { earnedBadgeIds, BADGES } from '../data/badges.js'
import { BADGE_MS, foldBadges } from '../lib/moments.js'

const KEY = 'rankup.badges.seen.v1'

/**
 * Where "already celebrated" is remembered.
 *
 * Per device and per child, in the browser's own storage. A badge is a moment
 * rather than a record — the shelf is the record — so this deliberately does
 * NOT sync. If the same badge quietly celebrates once on each of a family's two
 * phones, nothing is lost; if it were synced and a pull happened to land first,
 * a child could earn one and never see it happen at all.
 *
 * Every read and write is wrapped, because a private window can throw on both.
 */
function readSeen(kidId) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}')
    return new Set(all[kidId] || [])
  } catch {
    return new Set()
  }
}

function writeSeen(kidId, ids) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}')
    all[kidId] = [...ids]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Nothing to do. Worst case it celebrates once more on the next visit.
  }
}

const BADGE_MAP = Object.fromEntries(BADGES.map((b) => [b.id, b]))

/**
 * Announces a badge the moment it is earned.
 *
 * The FIRST run for a child records everything already earned without showing
 * anything. Otherwise a family that installs this update would be met with
 * fifteen celebrations at once for chores they finished last month, which is
 * noise rather than a moment.
 */
/**
 * Badges earned at once arrive as ONE toast ("3 badges"), not one after
 * another: a sync that brought a week of chores used to queue a toast per
 * badge, four seconds each. Three seconds, a tap skips it, and it never covers
 * anything but itself.
 */
export default function BadgeToast({ state, kid }) {
  const [showing, setShowing] = useState(null)
  const primed = useRef(new Set())

  useEffect(() => {
    if (!kid) return
    const earned = earnedBadgeIds(state, kid)
    const seen = readSeen(kid.id)

    if (!primed.current.has(kid.id)) {
      primed.current.add(kid.id)
      // Anything already earned when this child was first seen is history.
      const merged = new Set([...seen, ...earned])
      writeSeen(kid.id, merged)
      return
    }

    const fresh = earned.filter((id) => !seen.has(id))
    if (!fresh.length) return
    writeSeen(kid.id, new Set([...seen, ...fresh]))
    setShowing((current) => foldBadges(current, fresh))
  }, [state, kid])

  // Started when the toast opens; badges folded in while it shows do not restart it.
  const open = Boolean(showing)
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => setShowing(null), BADGE_MS)
    return () => clearTimeout(timer)
  }, [open])

  const badges = (showing || []).map((id) => BADGE_MAP[id]).filter(Boolean)
  if (!badges.length) return null
  const one = badges.length === 1 ? badges[0] : null

  return (
    <div
      className="fixed left-0 right-0 bottom-24 z-[55] flex justify-center px-6 pointer-events-none"
      role="status"
      aria-live="polite"
      data-testid="badge-toast"
    >
      <button
        type="button"
        onClick={() => setShowing(null)}
        className="card anim-pop pointer-events-auto flex items-center gap-3 px-4 py-3 text-left shadow-lg"
        style={{ borderColor: 'var(--accent)' }}
      >
        <span className="text-3xl leading-none" aria-hidden="true">
          {one ? one.emoji : badges.slice(0, 3).map((b) => b.emoji).join('')}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-muted">
            {one ? 'Badge earned' : `${badges.length} badges earned`}
          </span>
          <span className="block font-display font-extrabold text-sm" style={{ color: 'var(--accent)' }}>
            {one ? one.name : badges.map((b) => b.name).join(' · ')}
          </span>
          {one && <span className="block text-xs text-muted">{one.blurb}</span>}
        </span>
      </button>
    </div>
  )
}
