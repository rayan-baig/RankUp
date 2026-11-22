import { useEffect, useState } from 'react'

/**
 * The whole product, playing by itself, above the fold.
 *
 * A first-time visitor will not read four bullet points about how the loop
 * works, and a screenshot of a chore list looks like every other chore list.
 * This runs the loop in front of them in about eight seconds: a chore is
 * assigned, the child taps "I did it!", sends a photo from their own camera
 * app if the parent wants one, the parent accepts, XP lands. It is the one thing on the front door doing any selling.
 *
 * Since 0.30.0 the phone shows a child's real world screen, not a plain
 * chore card: Noah in Pegasus Horizon (RankUp's own drawing of the world,
 * public/drawn/avatar-pegasus.svg, a small file fetched lazily, never in the
 * first file), his level and XP bar at the top, and on the last beat the bar
 * fills and "Level up!" bursts out. Never Block Craft: those pictures are the
 * owner's, kept for the children who pick that world.
 *
 * There is no camera shutter in it: RankUp takes no photos, and the
 * preview should not suggest that it does.
 *
 * Deliberately not a video and not an image. A video costs a download, needs
 * re-recording every time a screen changes, and is the first thing to look
 * stale; this is drawn from the same tokens as the real app, so it cannot
 * drift from it. Its look is the stylesheet's (.loop-*, index.css), so it
 * weighs almost nothing in the first file.
 *
 * Everything stops for prefers-reduced-motion — the beats still advance so
 * the story is told, but nothing slides, flashes or sweeps (the global rule
 * in index.css, and `still` for the bar). A parent who has turned motion off
 * has done so for a reason and a marketing animation is not an exception to it.
 */

export const BEATS = [
  { label: 'You assign it', ms: 1700 },
  { label: 'They do it', ms: 1900 },
  { label: 'They show you, in a message', ms: 2100 },
  { label: 'You accept. They level up.', ms: 2600 },
]

/** The world's own picture: RankUp's drawing of Pegasus Horizon. */
const WORLD_ART = `${import.meta.env.BASE_URL}drawn/avatar-pegasus.svg`

export default function LoopPreview({ compact = false }) {
  const [beat, setBeat] = useState(0)
  const [still, setStill] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    setStill(mq.matches)
    const onChange = (e) => setStill(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBeat((b) => (b + 1) % BEATS.length), BEATS[beat].ms)
    return () => clearTimeout(t)
  }, [beat])

  const won = beat === 3

  return (
    <div className="loop mx-auto w-full" data-testid="loop-preview" data-beat={beat}>
      {/*
        * A phone, drawn rather than photographed, showing a child's world
        * screen in Pegasus Horizon's own colours.
        */}
      <div className={`loop-phone relative overflow-hidden mx-auto${compact ? ' loop-compact' : ''}`} aria-hidden="true">
        <span className="loop-notch" />
        <span className="loop-star loop-star-a">✦</span>
        <span className="loop-star loop-star-b">✦</span>
        <span className="loop-star loop-star-c">✧</span>

        <div className="absolute inset-0 pt-5 px-3 pb-3 flex flex-col">
          {/* The child's header card: the world's picture, name, level, bar. */}
          <div className="loop-hero">
            <img className="loop-art" src={WORLD_ART} alt="" width="40" height="40" loading="lazy" decoding="async" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="loop-name">Noah</span>
                <span className="loop-level">Level {won ? 4 : 3}</span>
              </div>
              <div className="loop-bar"><span key={won ? 'won' : 'on'} className={won ? 'loop-bar-won' : 'loop-bar-on'} /></div>
              <div className="loop-world">Pegasus Horizon · ✨ {won ? 62 : 47}</div>
            </div>
          </div>

          {/* The chore, then the tap, the message, the level-up. */}
          <div key={`card-${beat === 0 ? 'in' : 'held'}`} className={`loop-quest${beat === 0 ? ' loop-in' : ''}`}>
            <span className="loop-quest-icon">🛏️</span>
            <span className="loop-quest-title">Make your bed</span>
            <span className="loop-quest-xp">+15 XP</span>
          </div>

          <div className="relative flex-1 min-h-0">
            {beat === 0 && <p className="loop-note loop-in">New quest from your parent</p>}
            {beat === 1 && <span className="loop-done">✅ I did it!</span>}
            {beat === 2 && (
              <div className="loop-center">
                <div className="loop-bubble loop-in">📷 Noah sent a photo</div>
                <p className="loop-note">From his own camera app. RankUp keeps no photos.</p>
              </div>
            )}
            {won && (
              <div className="loop-center">
                <div className="loop-levelup">Level up!</div>
                <p className="loop-note loop-strong">+15 XP · Noah reached Level 4 🎉</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The words under it, and the progress through the four beats. */}
      <p className={`loop-label text-center font-display font-bold ${compact ? 'mt-2' : 'mt-3.5'}`} aria-live="polite">
        {BEATS[beat].label}
      </p>
      <div className="flex justify-center gap-1.5 mt-2">
        {BEATS.map((b, i) => (
          <span key={b.label} className={`loop-dot${i === beat ? ' loop-dot-on' : ''}${still ? ' loop-still' : ''}`} />
        ))}
      </div>
    </div>
  )
}
