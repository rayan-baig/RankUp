import { useEffect } from 'react'
import Avatar, { avatarTier } from './Avatar.jsx'
import { Button, SparkleBurst } from './ui.jsx'
import { nextEvolution, KID_THEME_MAP } from '../data/kidThemes.js'

/** The moment the whole loop is built around. Keep it short and loud. */
export default function LevelUpOverlay({ levelUp, kid, theme, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 12000)
    return () => clearTimeout(t)
  }, [onClose])

  const tierBefore = avatarTier(levelUp.from)
  const tierAfter = avatarTier(levelUp.to)
  const newForm = tierAfter > tierBefore
  const evolutionHit = KID_THEME_MAP[kid.themeId]?.evolutions?.find(
    (e) => levelUp.from < e.level && levelUp.to >= e.level,
  )
  const upcoming = nextEvolution(kid.themeId, levelUp.to)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: `${theme.colors.bg}f2` }} onClick={onClose} />
      <div className="relative text-center anim-pop">
        <div className="relative inline-block mb-3">
          <Avatar theme={theme} level={levelUp.to} size={160} companion={Boolean(theme.evolution?.companion)} interactive={false} />
          <SparkleBurst trigger={1} count={20} colors={theme.avatar?.hues || ['#fff']} />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Level up</p>
        <h2 className="font-display text-4xl font-extrabold mb-1" style={{ color: theme.colors.accent }}>
          {levelUp.to}
        </h2>
        <p className="text-sm text-muted mb-4">
          {kid.name} went from level {levelUp.from} to {levelUp.to}.
        </p>

        {newForm && (
          <p className="text-sm mb-2" style={{ color: theme.colors.accent2 }}>
            ✦ New avatar form unlocked — form {tierAfter} of 5.
          </p>
        )}
        {evolutionHit && (
          <p className="text-sm mb-2" style={{ color: theme.colors.accent2 }}>
            ✦ {evolutionHit.label} unlocked{evolutionHit.companion ? ' — and something has joined you.' : '.'}
          </p>
        )}
        {!newForm && !evolutionHit && upcoming && (
          <p className="text-xs text-muted mb-2">Next secret at level {upcoming.level}.</p>
        )}

        <Button className="mt-3 px-8" onClick={onClose}>Nice</Button>
      </div>
    </div>
  )
}
