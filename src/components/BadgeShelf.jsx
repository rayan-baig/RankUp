import { useMemo } from 'react'
import { badgeState } from '../data/badges.js'
import { SectionTitle } from './ui.jsx'

/**
 * The shelf.
 *
 * Earned badges first, then the closest unearned one, then the rest. That
 * ordering is the whole design: a child should open this and see the next one
 * within reach rather than a wall of locked grey.
 */
export default function BadgeShelf({ state, kid, limit }) {
  const badges = useMemo(() => {
    const all = badgeState(state, kid)
    return all.sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1
      if (a.earned) return 0
      return b.fraction - a.fraction
    })
  }, [state, kid])

  const shown = limit ? badges.slice(0, limit) : badges
  const earned = badges.filter((b) => b.earned).length

  return (
    <>
      <SectionTitle>
        Badges <span className="text-muted font-normal">· {earned} of {badges.length}</span>
      </SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {shown.map((badge) => (
          <div
            key={badge.id}
            className="card-flat p-2.5 text-center"
            style={badge.earned
              ? { borderColor: 'var(--accent)' }
              : { opacity: 0.55 }}
            title={badge.blurb}
          >
            <div
              className="text-2xl leading-none mb-1"
              style={badge.earned ? undefined : { filter: 'grayscale(1)' }}
              aria-hidden="true"
            >
              {badge.emoji}
            </div>
            <div className="text-[11px] font-display font-bold leading-tight">{badge.name}</div>
            {badge.earned ? (
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--accent)' }}>Earned</div>
            ) : (
              <>
                {/* The number, not just a bar: "7 of 10" is a target, a bar is decoration. */}
                <div className="text-[10px] text-muted mt-0.5">{Math.min(badge.have, badge.need)} of {badge.need}</div>
                <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(badge.fraction * 100)}%`, background: 'var(--accent)' }}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
