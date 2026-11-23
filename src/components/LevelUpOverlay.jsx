import { useEffect, useRef, useState } from 'react'
import Avatar, { avatarTier, tiersFor } from './Avatar.jsx'
import { Button, SparkleBurst } from './ui.jsx'
import { CountUp, useStillness } from './Motion.jsx'
import { nextEvolution, themeById } from '../data/kidThemes.js'
import { nextMilestone, milestoneWords } from '../lib/avatarTiers.js'
import { navigate } from '../lib/router.js'
import { useApp } from '../state/AppContext.jsx'
import { useMedia } from '../lib/useMedia.js'
import { chime } from '../lib/chime.js'
import { LEVEL_UP_MS, NEW_WORLD_MS, LEVEL_UP_GRACE_MS, STREAK_MS } from '../lib/moments.js'
// The level-up's confetti and burst (0.32.0), fetched with this file.
import '../styles/levelup.css'

/**
 * Closes a moment after `ms`, or on the first tap anywhere.
 *
 * The tap is listened for on the window, before anything else sees it, and is
 * not stopped: the button under the finger still gets it. So skipping a moment
 * never costs the tap that was meant for the next thing. A tap inside `inside`
 * (the card itself, with its one button) is left to the card.
 *
 * `grace` (the level-up, 0.32.0): a tap in the first `grace` ms still reaches
 * the screen below but does not close the moment, so the second tap of a
 * double tap on Accept cannot end it unseen. Returns whether the grace is over.
 */
function useMoment(ms, onClose, inside, grace = 0) {
  const done = useRef(onClose)
  done.current = onClose
  const [ready, setReady] = useState(grace <= 0)
  const open = useRef(grace <= 0)
  useEffect(() => {
    const close = () => done.current()
    const timer = setTimeout(close, ms)
    const settle = grace > 0 ? setTimeout(() => { open.current = true; setReady(true) }, grace) : 0
    const onTap = (e) => {
      if (inside?.current && inside.current.contains(e.target)) return
      if (open.current) close()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', onTap, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(timer)
      clearTimeout(settle)
      window.removeEventListener('pointerdown', onTap, true)
      window.removeEventListener('keydown', onKey, true)
    }
    // The timer starts once, when the moment opens. A second level folded in
    // while it is showing changes the numbers, not how long it stays.
  }, [ms, inside, grace])
  return ready
}

/** A thin bar that empties over the moment's life, so "it goes by itself" is visible. */
function TimeBar({ ms, color }) {
  return (
    <div className="mt-3 mx-auto h-1 w-24 rounded-full overflow-hidden" style={{ background: 'var(--line)' }} aria-hidden="true">
      <div className="h-full" style={{ background: color, animation: `rankup-moment-bar ${ms}ms linear both` }} />
    </div>
  )
}

/** Confetti from the top of the screen and a burst of light behind the avatar (styles/levelup.css). */
function Confetti() {
  return (
    <span className="levelup-confetti" aria-hidden="true" data-testid="level-up-confetti">
      {Array.from({ length: 36 }, (_, i) => <span key={i} />)}
    </span>
  )
}

/**
 * The level-up. The moment the whole loop is built around.
 *
 * Since 0.32.0 it is as big as the other celebrations: confetti down the
 * whole screen, a burst of light and stars behind the avatar, the new level
 * as a big number counting up, and a chime (lib/chime.js, only while Sounds
 * is on). It stays about five and a half seconds (six and a half if a new
 * world opened), or until it is tapped: "Awesome!" (a parent's screen: "Carry
 * on"), the card, or anywhere else, after its first 0.6 seconds. It still
 * does not hold the screen: the page under it can be tapped, and that tap
 * closes it. On a computer the card, the avatar and the number are larger.
 *
 * Under reduce motion (RankUp's setting or the device's) it is words only:
 * no confetti, no burst, no sparkles, no counting, no bar emptying; the
 * avatar, the number and the words simply show.
 *
 * `away` (0.30.0): shown on the child's own Home for a level reached since
 * they last looked (lib/kidLevel.js), so it speaks to them.
 *
 * It is marked data-pilot-modal (0.30.0): on a parent's screen Pilot's robot
 * steps back while it shows, as it does for every other pop-up, instead of
 * sitting on top of the celebration.
 */
export default function LevelUpOverlay({ levelUp, streak = null, kid, theme, onClose, away = false }) {
  const { state } = useApp()
  const card = useRef(null)
  const deviceStill = useStillness()
  const still = deviceStill || Boolean(state?.settings?.reduceMotion)
  const wide = useMedia('(min-width: 1024px)')
  const tierBefore = avatarTier(levelUp.from, theme)
  const tierAfter = avatarTier(levelUp.to, theme)
  const formCount = tiersFor(theme).length
  const newForm = tierAfter > tierBefore
  // Worlds opened by a story milestone (Block Craft's last, by beating the
  // dragon) arrive with that milestone, not with a level.
  const evolutionHit = themeById(kid.themeId)?.evolutions?.find(
    (e) => !e.requires && levelUp.from < e.level && levelUp.to >= e.level,
  )
  const milestone = nextMilestone(levelUp.to, theme, nextEvolution(kid.themeId, levelUp.to))
  const ms = evolutionHit ? NEW_WORLD_MS : LEVEL_UP_MS
  const ready = useMoment(ms, onClose, card, LEVEL_UP_GRACE_MS)
  const levels = levelUp.to - levelUp.from
  // A child's own screen ("away" on Home, or the child's half of the app).
  const forChild = away || window.location.hash.startsWith('#/kid')

  // Its chime, once, as it opens; quiet while Sounds is off.
  useEffect(() => { chime(state, 'level') }, [])

  const tap = () => { if (ready) onClose() }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6 pointer-events-none"
         role="status" aria-live="polite" data-testid="level-up" data-pilot-modal="" data-still={still ? '' : undefined}>
      <div className="absolute inset-0" style={{ background: `${theme.colors.bg}f2`, backdropFilter: 'blur(3px)' }} />
      {!still && <Confetti />}
      <div ref={card} className={`levelup-card relative text-center pointer-events-auto cursor-pointer${still ? '' : ' anim-pop fx-burst'}`}
           onClick={(e) => { if (!e.target.closest('button')) tap() }}>
        <div className="relative inline-block mb-2">
          {!still && <span className="levelup-rays" aria-hidden="true" />}
          {!still && (
            <span className="levelup-stars" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => <span key={i}>✦</span>)}
            </span>
          )}
          <Avatar theme={theme} level={levelUp.to} size={wide ? 184 : 140} companion={Boolean(theme.evolution?.companion)} interactive={false} />
          {!still && <SparkleBurst trigger={1} count={20} colors={theme.avatar?.hues || ['#fff']} />}
        </div>
        <p className="levelup-kicker uppercase text-muted">{levels > 1 ? `${levels} levels up` : 'Level up'}</p>
        {/* Counting from the old level to the new one: the number climbing is
            the thing a child remembers. Under reduce motion it simply shows. */}
        <h2 className="levelup-number font-display font-extrabold" style={{ color: theme.colors.accent }}>
          {still ? levelUp.to : <CountUp value={levelUp.to} from={levelUp.from} duration={900} />}
        </h2>
        <p className="levelup-words text-muted mb-2">
          {away
            ? `${levelUp.chores === 1 ? 'Your chore was accepted' : 'Your chores were accepted'}. You went from level ${levelUp.from} to ${levelUp.to}!`
            : `${kid.name} went from level ${levelUp.from} to ${levelUp.to}.`}
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
        {/* The nearer of the next form and the next world, never a level
            so far away it means nothing (lib/avatarTiers.js). */}
        {!newForm && !evolutionHit && milestone && (
          <p className="text-xs text-muted mb-2" data-testid="level-up-next">
            {milestoneWords(milestone)}.
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {/* Only in the child's half: a parent's phone has no story to watch. */}
          {evolutionHit?.chapter && window.location.hash.startsWith('#/kid') && (
            <Button
              className="px-6"
              onClick={() => {
                onClose()
                navigate(evolutionHit.chapter === 'dragon' ? '/kid/dragon' : `/kid/story/${evolutionHit.chapter}`)
              }}
            >
              ▶ Watch the battle
            </Button>
          )}
          <Button variant={evolutionHit?.chapter && forChild ? 'soft' : 'primary'} className="px-7 levelup-ok" data-testid="level-up-ok" onClick={tap}>
            {forChild ? 'Awesome!' : 'Carry on'}
          </Button>
        </div>
        {!still && <TimeBar ms={ms} color={theme.colors.accent} />}
        <p className="text-[11px] text-muted mt-1">Or tap anywhere</p>
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
