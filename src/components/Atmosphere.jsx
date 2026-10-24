import { useMemo } from 'react'

/**
 * The air in front of the scene.
 *
 * Each theme already paints a parallax of flat shapes — mountains, towers,
 * islands. That is the right base and it reads as a printed backdrop on
 * its own, because nothing in it moves the way air moves. This adds the
 * two things that make a place feel alive: light that shifts, and dust
 * that drifts up.
 *
 * There was a third — a beam sweeping across — and it is gone. However
 * faint it was made, it read as a bright band lying across whichever card
 * it happened to be behind rather than as light passing through the
 * scene. An effect that looks like a rendering fault is worse than no
 * effect.
 *
 * All of it is transform and opacity, which the compositor handles on its
 * own thread, so it costs nothing measurable on a phone. Everything stops
 * under prefers-reduced-motion through the global rule in index.css.
 *
 * Colours come from the theme, so the aurora over Block Craft is green and
 * over Coquette Circuit is pink without this file knowing either exists.
 */

/** Deterministic, so the dust does not reshuffle on every render. */
function motes(seed, count) {
  let s = seed
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  return Array.from({ length: count }, (_, i) => ({
    i,
    left: next() * 100,
    // Start spread down the screen and below it, so the first frame is
    // already full of dust rather than empty until they drift up.
    bottom: -20 + next() * 110,
    size: 1.5 + next() * 3.5,
    duration: 26 + next() * 34,
    delay: -next() * 40,
    drift: -30 + next() * 60,
    peak: 0.25 + next() * 0.5,
  }))
}

export default function Atmosphere({ theme }) {
  const c = theme?.colors
  const dust = useMemo(() => motes(7, 16), [])
  if (!c) return null

  const accent = c.accent || '#6cf'
  const accent2 = c.accent2 || accent

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Two slow washes of the theme's light, drifting out of step. */}
      <div
        className="absolute atmos-aurora-a"
        style={{
          left: '-20%',
          top: '-30%',
          width: '90%',
          height: '90%',
          background: `radial-gradient(circle, ${accent}59 0%, transparent 62%)`,
          filter: 'blur(42px)',
        }}
      />
      <div
        className="absolute atmos-aurora-b"
        style={{
          right: '-25%',
          bottom: '-25%',
          width: '95%',
          height: '85%',
          background: `radial-gradient(circle, ${accent2}4d 0%, transparent 60%)`,
          filter: 'blur(52px)',
        }}
      />

      {/* Dust. */}
      {dust.map((m) => (
        <span
          key={m.i}
          className="atmos-mote"
          style={{
            left: `${m.left}%`,
            bottom: `${m.bottom}%`,
            width: m.size,
            height: m.size,
            background: m.i % 3 === 0 ? accent2 : accent,
            boxShadow: `0 0 ${m.size * 3}px ${accent}`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
            '--mote-drift': `${m.drift}px`,
            '--mote-peak': m.peak,
          }}
        />
      ))}

      {/* A vignette, so the edges fall away instead of ending at the frame. */}
      <div
        className="absolute inset-0"
        style={{
          // Light. At 70% it turned the corners to mud and took the
          // scene with them; the point is to soften the frame, not to
          // close it.
          background: `radial-gradient(130% 100% at 50% 38%, transparent 55%, ${c.bg}73 100%)`,
        }}
      />
    </div>
  )
}
