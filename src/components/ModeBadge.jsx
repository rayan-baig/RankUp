import { useEffect, useState } from 'react'
import { MODES } from '../data/leaderboards.js'
import { cachedMe, leaderboards } from '../lib/leaderboards.js'

/**
 * Adventure or Arena, as a badge: the mode's icon, name and colour.
 * Every child is in Adventure until a parent switches Arena on.
 */
export default function ModeBadge({ mode = 'adventure', size = 'sm', onClick }) {
  const m = MODES[mode] || MODES.adventure
  const big = size === 'lg'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid="mode-badge"
      data-mode={m.id}
      className="inline-flex items-center gap-1.5 rounded-full font-bold shrink-0"
      style={{
        padding: big ? '7px 14px' : '4px 10px',
        fontSize: big ? 14 : 11,
        color: m.color,
        background: `color-mix(in srgb, ${m.color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${m.color} 60%, transparent)`,
        boxShadow: `0 0 16px -8px ${m.color}`,
        letterSpacing: '0.02em',
      }}
    >
      <span aria-hidden="true">{m.icon}</span>
      {m.name}
    </Tag>
  )
}

/** This child's leaderboard self (mode, nickname), asked once a visit. Null until known. */
export function useLeaderboardMe(kid, demo = false) {
  const [me, setMe] = useState(null)
  useEffect(() => {
    if (!kid || demo || !leaderboards.available()) { setMe(null); return undefined }
    let live = true
    cachedMe(kid.id).then((res) => { if (live && res.ok) setMe(res) })
    return () => { live = false }
  }, [kid?.id, demo])
  return [me, setMe]
}
