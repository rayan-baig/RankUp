import { useEffect, useRef } from 'react'
import Avatar, { avatarTier, tiersFor } from './Avatar.jsx'
import { Button, SparkleBurst } from './ui.jsx'
import { CountUp } from './Motion.jsx'
import { nextEvolution, KID_THEME_MAP } from '../data/kidThemes.js'
import { navigate } from '../lib/router.js'
import { LEVEL_UP_MS, NEW_WORLD_MS, STREAK_MS } from '../lib/moments.js'

/**
 * Closes a moment after `ms`, or on the first tap anywhere.
 *
 * The tap is listened for on the window, before anything else sees it, and is
 * not stopped: the button under the finger still gets it. So skipping a moment
 * never costs the tap that was meant for the next thing. A tap inside `inside`
 * (the card itself, with its one button) is left to the card.
 */
function useMoment(ms, onClose, inside) {
  const done = useRef(onClose)
  done.current = onClose
  useEffect(() => {
    const close = () => done.current()
    const timer = setTimeout(close, ms)
    const onTap = (e) => {
      if (inside?.current && inside.current.contains(e.target)) return
      close()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', onTap, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', onTap, true)
      window.removeEventListener('keydown', onKey, true)
    }
    // The timer starts once, when the moment opens. A second level folded in
    // while it is showing changes the numbers, not how long it stays.
  }, [ms, inside])
}

/** A thin bar that empties over the moment's life, so "it goes by itself" is visible. */
function TimeBar({ ms, color }) {
  return (
    <div className="mt-3 mx-auto h-1 w-24 rounded-full overflow-hidden" style={{ background: 'var(--line)' }} aria-hidden="true">
      <div className="h-full" style={{ background: color, animation: `rankup-moment-bar ${ms}ms linear both` }} />
    </div>
  )
}

/**
 * The level-up. The moment the whole loop is built around: loud, and short.
 *
 * About two and a half seconds, three if a new world opened. It does not hold
 * the screen: the page under it can still be tapped, and that tap closes it.
 */
export default function LevelUpOverlay({ levelUp, streak = null, kid, theme, onClose }) {
  const card = useRef(null)
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
  const ms = evolutionHit ? NEW_WORLD_MS : LEVEL_UP_MS
  useMoment(ms, onClose, card)
  const levels = levelUp.to - levelUp.from

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6 pointer-events-none"
         role="status" aria-live="polite" data-testid="level-up">
      <div className="absolute inset-0" style={{ background: `${theme.colors.bg}f2`, backdropFilter: 'blur(3px)' }} />
      <div ref={card} className="relative text-center anim-pop fx-burst pointer-events-auto cursor-pointer"
           onClick={(e) => { if (!e.target.closest('button')) onClose() }}>
        <div className="relative inline-block mb-2">
          <Avatar theme={theme} level={levelUp.to} size={140} companion={Boolean(theme.evolution?.companion)} interactive={false} />
          <SparkleBurst trigger={1} count={20} colors={theme.avatar?.hues || ['#fff']} />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{levels > 1 ? `${levels} levels up` : 'Level up'}</p>
        {/* Counting from the old level to the new one: the number climbing is
            the thing a child remembers. */}
        <h2 className="font-display text-4xl font-extrabold mb-1" style={{ color: theme.colors.accent }}>
          <CountUp value={levelUp.to} from={levelUp.from} duration={800} />
        </h2>
        <p className="text-sm text-muted mb-2">
          {kid.name} went from level {levelUp.from} to {levelUp.to}.
        </p>
        {streak && (
          <p className="text-sm font-semibold mb-2" style={{ color: theme.colors.accent2 }}>
            🔥 {streak.count} days in a row
          </p>
        )}

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
        {evolutionHit?.chapter && window.location.hash.startsWith('#/kid') && (
          <Button
            className="mt-2 px-6"
            onClick={() => {
              onClose()
              navigate(evolutionHit.chapter === 'dragon' ? '/kid/dragon' : `/kid/story/${evolutionHit.chapter}`)
            }}
          >
            ▶ Watch the battle
          </Button>
        )}
        <TimeBar ms={ms} color={theme.colors.accent} />
        <p className="text-[11px] text-muted mt-1">Tap to carry on</p>
      </div>
    </div>
  )
}

/**
 * A streak going up, on its own: a small card near the top for two seconds.
 * Nothing behind it is covered, and a tap anywhere closes it.
 */
export function StreakMoment({ streak, onClose }) {
  const card = useRef(null)
  useMoment(STREAK_MS, onClose, card)
  return (
    <div className="fixed left-0 right-0 top-16 z-[58] flex justify-center px-6 pointer-events-none"
         role="status" aria-live="polite" data-testid="streak-moment">
      <button ref={card} type="button" onClick={onClose}
              className="card anim-pop pointer-events-auto flex items-center gap-3 px-4 py-3 text-left shadow-lg"
              style={{ borderColor: 'var(--accent-2)', background: 'var(--surface)' }}>
        <span className="text-3xl leading-none" aria-hidden="true">🔥</span>
        <span>
          <span className="block font-display font-extrabold text-base" style={{ color: 'var(--accent-2)' }}>
            {streak.count} days in a row!
          </span>
          <span className="block text-xs text-muted">Come back tomorrow to make it {streak.count + 1}.</span>
        </span>
      </button>
    </div>
  )
}
