import { useId } from 'react'

/**
 * The RankUp mark, inline.
 *
 * Two rank chevrons climbing, the upper one gold because it is the rank just
 * earned. It is drawn here rather than loaded from /icon.svg so it can sit in
 * a button, take a size in props, and — the reason that matters — animate with
 * the rest of the screen instead of popping in separately once the network
 * hands the file over.
 *
 * The geometry is the same 512 grid as public/icon.svg. If you change one,
 * change both; `node icons.mjs` regenerates every raster from the file.
 */
export default function Logo({ size = 72, className = '', glow = false }) {
  // Two logos on one screen would otherwise share a gradient id, and the second
  // one would quietly paint itself with the first one's colours.
  const id = useId().replace(/:/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="RankUp"
      style={glow ? { filter: 'drop-shadow(0 10px 30px rgba(124, 92, 255, 0.45))' } : undefined}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="0.55" stopColor="#4A22C9" />
          <stop offset="1" stopColor="#1B0B48" />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="0.32" cy="0.12" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="114" fill={`url(#${id}-bg)`} />
      <rect width="512" height="512" rx="114" fill={`url(#${id}-gloss)`} />
      <g fill="none" strokeWidth="50" strokeLinecap="round" strokeLinejoin="round">
        <path d="M158 358 L256 300 L354 358" stroke="#FFFFFF" strokeOpacity="0.92" />
        <path d="M158 212 L256 154 L354 212" stroke="#FFC93D" />
      </g>
    </svg>
  )
}

/** What RankUp is, in four words. The same line the logo files carry. */
export const SLOGAN = 'Chores, but a game.'

/**
 * Mark plus name, for the top of a screen. The word is set in the app's display
 * face so it matches the headings underneath it rather than floating free.
 */
export function Wordmark({ size = 56, className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <Logo size={size} />
      <span className="font-display font-extrabold tracking-tight" style={{ fontSize: size * 0.62 }}>
        Rank<span style={{ color: '#FFC93D' }}>Up</span>
      </span>
    </div>
  )
}
