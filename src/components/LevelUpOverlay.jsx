import { useEffect } from 'react'
import Avatar, { avatarTier, tiersFor } from './Avatar.jsx'
import { Button, SparkleBurst } from './ui.jsx'
import { CountUp } from './Motion.jsx'
import { nextEvolution, KID_THEME_MAP } from '../data/kidThemes.js'
import { navigate } from '../lib/router.js'

/** The moment the whole loop is built around. Keep it short and loud. */
export default function LevelUpOverlay({ levelUp, kid, theme, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 12000)
    return () => clearTimeout(t)
  }, [onClose])

  const tierBefore = avatarTier(levelUp.from, theme)
  const tierAfter = avatarTier(levelUp.to, theme)
  const formCount = tiersFor(theme).length
  const newForm = tierAfter > tierBefore
  // Worlds opened by a story milestone (Block Craft's last, by beating the
  // dragon) arrive with that milestone, not with a level.
  const evolutionHit = KID_THEME_MAP[kid.themeId]?.evolutions?.find(
    (e) => !e.requires && levelUp.from < e.level && levelUp.to >= e.level,
  )
  const upcoming = nextEvolution(kid.themeId, levelUp.to)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: `${theme.colors.bg}f2` }} onClick={onClose} />
      <div className="relative text-center anim-pop fx-burst">
        <div className="relative inline-block mb-3">
          <Avatar theme={theme} level={levelUp.to} size={160} companion={Boolean(theme.evolution?.companion)} interactive={false} />
          <SparkleBurst trigger={1} count={20} colors={theme.avatar?.hues || ['#fff']} />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Level up</p>
        {/*
          * Counting from the old level to the new one, not just showing the
          * new one. This is the single moment the whole loop is built around
          * and the number climbing is the thing a child remembers.
          */}
        <h2 className="font-display text-4xl font-extrabold mb-1" style={{ color: theme.colors.accent }}>
          <CountUp value={levelUp.to} from={levelUp.from} duration={900} />
        </h2>
        <p className="text-sm text-muted mb-4">
          {kid.name} went from level {levelUp.from} to {levelUp.to}.
        </p>

        {newForm && (
          <p className="text-sm mb-2" style={{ color: theme.colors.accent2 }}>
            ✦ New avatar form unlocked — form {tierAfter} of {formCount}.
          </p>
        )}
        {evolutionHit && (
          <>
            <p className="text-sm mb-1" style={{ color: theme.colors.accent2 }}>
              ✦ {evolutionHit.label} unlocked{evolutionHit.companion ? ' — and something has joined you.' : '.'}
            </p>
            {/* The line of story that goes with the world. This is the one
                moment it lands hardest: the screen has just changed colour
                around the child and this says what the new place is. */}
            {evolutionHit.story && (
              <p className="text-xs text-muted mb-2 max-w-[22rem] mx-auto">{evolutionHit.story}</p>
            )}
          </>
        )}
        {!newForm && !evolutionHit && upcoming && (
          <p className="text-xs text-muted mb-2">
            {upcoming.requires === 'dragonDefeated' ? 'Next secret: beat the dragon.' : `Next secret at level ${upcoming.level}.`}
          </p>
        )}

        {/* Only in the child's half: a parent's phone has no story to watch. */}
        {evolutionHit?.chapter && window.location.hash.startsWith('#/kid') ? (
          <div className="flex gap-2 justify-center mt-3">
            <Button variant="soft" onClick={onClose}>Later</Button>
            <Button
              onClick={() => {
                onClose()
                navigate(evolutionHit.chapter === 'dragon' ? '/kid/dragon' : `/kid/story/${evolutionHit.chapter}`)
              }}
            >
              ▶ Watch the battle
            </Button>
          </div>
        ) : (
          <Button className="mt-3 px-8" onClick={onClose}>Nice</Button>
        )}
      </div>
    </div>
  )
}
