import { useEffect, useState } from 'react'
import { MODES } from '../data/leaderboards.js'
import { arenaMomentSeen, markArenaMomentSeen } from '../lib/leaderboards.js'
import { navigate } from '../lib/router.js'
import { Button } from './ui.jsx'

/**
 * "Enter the Arena": once, on the child's phone, the first time they open
 * RankUp after a grown-up switched Arena on. Remembered per switch-on, so
 * switching off and on again shows it again.
 */
export default function ArenaMoment({ kidId, me }) {
  const since = me?.mode === 'arena' ? me.arena_since : null
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(Boolean(since) && !arenaMomentSeen(kidId, since)) }, [kidId, since])
  if (!open) return null
  const done = (to) => {
    markArenaMomentSeen(kidId, since)
    setOpen(false)
    if (to) navigate(to)
  }
  const arena = MODES.arena
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true"
      aria-label="Enter the Arena" data-testid="arena-moment"
      style={{ background: `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${arena.color} 45%, #000) 0%, rgba(0,0,0,0.92) 70%)` }}>
      <div className="text-center max-w-xs anim-pop">
        <div className="text-7xl mb-3" aria-hidden="true" style={{ filter: `drop-shadow(0 0 24px ${arena.color})` }}>{arena.icon}</div>
        <div className="text-xs uppercase tracking-[0.3em] font-bold mb-1" style={{ color: arena.color }}>Arena mode</div>
        <h2 className="font-display text-3xl font-extrabold text-white mb-2">Enter the Arena</h2>
        <p className="text-sm text-white/80 mb-1">A grown-up switched on Arena for you.</p>
        <p className="text-sm text-white/80 mb-5">
          You are on the worldwide and country leaderboards as{' '}
          <strong style={{ color: arena.color }}>{me.nickname}</strong>. Nobody there sees your real name.
        </p>
        <Button className="w-full mb-2" onClick={() => done('/kid/leaderboards')} data-testid="arena-go">See the leaderboards</Button>
        <button type="button" className="text-xs text-white/70 underline" onClick={() => done(null)}>Later</button>
      </div>
    </div>
  )
}
