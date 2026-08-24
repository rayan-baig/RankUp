import { useEffect, useState } from 'react'
import { SparkleBurst } from './ui.jsx'

/**
 * The 5-tier avatar.
 *
 * Every theme uses the same underlying character so progress reads the same way
 * across the app; the `motif` in the theme file changes the silhouette, and the
 * tier (driven by level) changes colour, aura and accessories.
 *
 * Tap it and it reacts — a small squash-and-stretch plus a sparkle burst. Kids
 * poke things; the app should poke back.
 */

export const TIER_THRESHOLDS = [1, 10, 25, 50, 100]

export function avatarTier(level) {
  let tier = 1
  TIER_THRESHOLDS.forEach((t, i) => {
    if (level >= t) tier = i + 1
  })
  return tier
}

export function nextTierLevel(level) {
  return TIER_THRESHOLDS.find((t) => t > level) ?? null
}

const MOTIFS = {
  block: (col) => <rect x="-9" y="-9" width="18" height="18" fill={col} />,
  visor: (col) => (
    <g>
      <rect x="-10" y="-8" width="20" height="16" rx="3" fill={col} />
      <rect x="-11" y="-4" width="22" height="4" fill="#0006" />
    </g>
  ),
  chevron: (col) => <path d="M0 -11 L10 4 L0 0 L-10 4 Z" fill={col} />,
  flame: (col) => <path d="M0 -12 C7 -5 9 2 4 8 C2 4 0 4 0 8 C-2 4 -4 4 -4 8 C-9 2 -7 -5 0 -12 Z" fill={col} />,
  bow: (col) => (
    <g>
      <circle r="8" fill={col} />
      <path d="M-12 -8 L-4 -4 L-12 0 Z M12 -8 L4 -4 L12 0 Z" fill={col} opacity="0.85" />
    </g>
  ),
  star: (col) => <path d="M0 -11 L2.8 -3.4 L11 -3.4 L4.4 1.6 L6.8 9.4 L0 4.6 L-6.8 9.4 L-4.4 1.6 L-11 -3.4 L-2.8 -3.4 Z" fill={col} />,
  wing: (col) => (
    <g>
      <circle r="7.5" fill={col} />
      <path d="M-7 -2 C-15 -8 -16 2 -8 5 Z M7 -2 C15 -8 16 2 8 5 Z" fill={col} opacity="0.8" />
    </g>
  ),
  cupcake: (col) => (
    <g>
      <path d="M-8 1 L8 1 L6 10 L-6 10 Z" fill={col} opacity="0.7" />
      <path d="M-9 1 C-9 -8 9 -8 9 1 Z" fill={col} />
    </g>
  ),
  diamond: (col) => <path d="M0 -11 L9 -2 L0 11 L-9 -2 Z" fill={col} />,
  leaf: (col) => <path d="M0 10 C-10 4 -10 -8 0 -11 C10 -8 10 4 0 10 Z" fill={col} />,
  wire: (col) => (
    <g fill="none" stroke={col} strokeWidth="1.6">
      <rect x="-8.5" y="-8.5" width="17" height="17" />
      <path d="M-8.5 -8.5 L8.5 8.5 M8.5 -8.5 L-8.5 8.5" opacity="0.5" />
    </g>
  ),
  cap: (col) => (
    <g>
      <circle r="8" fill={col} />
      <path d="M-10 -2 C-10 -11 10 -11 10 -2 Z" fill={col} />
      <rect x="-12" y="-3" width="16" height="3" rx="1.5" fill={col} opacity="0.85" />
    </g>
  ),
  triangle: (col) => <path d="M0 -11 L10 8 L-10 8 Z" fill={col} />,
  monster: (col) => (
    <g>
      <circle r="9" fill={col} />
      <path d="M-9 -4 L-5 -11 L-2 -6 Z M9 -4 L5 -11 L2 -6 Z" fill={col} />
    </g>
  ),
}

/** Block Craft's secret companion, revealed by the level 51 evolution. */
function Boarling({ colors }) {
  return (
    <g transform="translate(24 22) scale(0.85)" className="anim-float">
      <ellipse cx="0" cy="2" rx="9" ry="7" fill={colors.accent2} />
      <circle cx="-6" cy="-1" r="5.5" fill={colors.accent2} />
      <circle cx="-9" cy="0" r="2.2" fill={colors.accent} />
      <circle cx="-9.6" cy="-0.4" r="0.4" fill="#000" opacity="0.6" />
      <circle cx="-8.4" cy="-0.4" r="0.4" fill="#000" opacity="0.6" />
      <path d="M-7 -5 L-5 -8 L-3.5 -4.6 Z" fill={colors.accent2} />
      <circle cx="-4.5" cy="-2.5" r="0.8" fill="#1a0f0a" />
      <path d="M-2 -6 L0 -9 L2 -5.6 Z" fill={colors.accent2} opacity="0.9" />
      <rect x="-5" y="7" width="2" height="4" fill={colors.accent2} />
      <rect x="3" y="7" width="2" height="4" fill={colors.accent2} />
      <path d="M8 0 q4 -1 3 3" stroke={colors.accent2} strokeWidth="1.4" fill="none" />
    </g>
  )
}

export default function Avatar({ theme, level = 1, size = 120, companion = false, frame = 'none', onTap, interactive = true }) {
  const [reacting, setReacting] = useState(false)
  const [burst, setBurst] = useState(0)
  const tier = avatarTier(level)
  const hues = theme?.avatar?.hues || ['#888', '#999', '#aaa', '#bbb', '#ccc']
  const colour = hues[Math.min(tier, hues.length) - 1]
  const motif = MOTIFS[theme?.avatar?.motif] || MOTIFS.block
  const c = theme?.colors || {}

  useEffect(() => {
    if (!reacting) return undefined
    const t = setTimeout(() => setReacting(false), 420)
    return () => clearTimeout(t)
  }, [reacting])

  const handleTap = () => {
    if (!interactive) return
    setReacting(true)
    setBurst((b) => b + 1)
    onTap?.()
  }

  const auraOpacity = 0.06 + tier * 0.05
  const Wrapper = interactive ? 'button' : 'div'

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {frame !== 'none' && <ProfileFrame frame={frame} size={size} colors={c} />}
      <Wrapper
        type={interactive ? 'button' : undefined}
        onClick={handleTap}
        aria-label={interactive ? `Your avatar, level ${level}. Tap to react.` : `Avatar, level ${level}`}
        className="w-full h-full block relative"
        style={{
          transition: 'transform 180ms cubic-bezier(0.3, 1.6, 0.5, 1)',
          transform: reacting ? 'scale(1.12) rotate(-4deg)' : 'scale(1)',
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          <defs>
            <radialGradient id={`aura-${theme?.id}-${tier}`}>
              <stop offset="0%" stopColor={colour} stopOpacity={auraOpacity * 4} />
              <stop offset="100%" stopColor={colour} stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="50" cy="50" r="46" fill={`url(#aura-${theme?.id}-${tier})`} />

          {/* Tier rings — one more ring per tier, so progress is visible at a glance. */}
          {Array.from({ length: tier }, (_, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={30 + i * 5}
              fill="none"
              stroke={hues[Math.min(i, hues.length - 1)]}
              strokeWidth={0.9}
              opacity={0.25 + i * 0.12}
              strokeDasharray={i % 2 ? '3 4' : undefined}
            >
              {i === tier - 1 && (
                <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur={`${30 - tier * 3}s`} repeatCount="indefinite" />
              )}
            </circle>
          ))}

          <circle cx="50" cy="50" r="26" fill={c.surface || '#222'} stroke={colour} strokeWidth="1.4" />

          <g transform="translate(50 48) scale(1.28)">{motif(colour)}</g>

          {/* Eyes, so it reads as a character rather than an icon. */}
          <g fill={c.bg || '#000'} opacity="0.85">
            <circle cx="44" cy="47" r={reacting ? 1.4 : 2.2} />
            <circle cx="56" cy="47" r={reacting ? 1.4 : 2.2} />
          </g>
          {reacting && <path d="M44 55 Q50 60 56 55" stroke={c.bg || '#000'} strokeWidth="1.6" fill="none" opacity="0.8" />}

          {tier >= 4 && (
            <g opacity="0.85">
              {Array.from({ length: 6 }, (_, i) => (
                <circle key={i} cx={50 + Math.cos((i / 6) * 6.28) * 38} cy={50 + Math.sin((i / 6) * 6.28) * 38} r="1.4" fill={hues[4] || colour}>
                  <animate attributeName="opacity" values="0.2;1;0.2" dur={`${1.6 + i * 0.3}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </g>
          )}

          {companion && <Boarling colors={c} />}
        </svg>
        <SparkleBurst trigger={burst} colors={hues} />
      </Wrapper>
    </div>
  )
}

/** Animated profile card frames — an Elite-only cosmetic. */
function ProfileFrame({ frame, size, colors }) {
  const common = 'absolute inset-0 pointer-events-none rounded-full'
  if (frame === 'pulse') {
    return (
      <span
        className={common}
        style={{ border: `2px solid ${colors.accent}`, animation: 'rankup-pulse 2s ease-in-out infinite' }}
      />
    )
  }
  if (frame === 'aurora') {
    return (
      <span
        className={common}
        style={{
          background: `conic-gradient(from 0deg, ${colors.accent}, ${colors.accent2}, ${colors.accent})`,
          mask: 'radial-gradient(circle, transparent 46%, #000 48%)',
          WebkitMask: 'radial-gradient(circle, transparent 46%, #000 48%)',
          animation: 'rankup-spin 7s linear infinite',
        }}
      />
    )
  }
  if (frame === 'circuit') {
    return (
      <svg className={common} viewBox="0 0 100 100" style={{ width: size, height: size }}>
        <circle cx="50" cy="50" r="48" fill="none" stroke={colors.accent} strokeWidth="1" strokeDasharray="6 4 2 4" opacity="0.8">
          <animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="12s" repeatCount="indefinite" />
        </circle>
      </svg>
    )
  }
  if (frame === 'prism') {
    return (
      <span
        className={common}
        style={{
          border: '2px solid transparent',
          backgroundImage: `linear-gradient(${colors.surface}, ${colors.surface}), linear-gradient(120deg, ${colors.accent}, ${colors.accent2}, ${colors.accent})`,
          backgroundOrigin: 'border-box',
          backgroundClip: 'content-box, border-box',
          animation: 'rankup-pulse 3.2s ease-in-out infinite',
        }}
      />
    )
  }
  return null
}
