/**
 * The furniture every sport is played in: a crowd, floodlights, and people
 * with something in their hands.
 *
 * Drawn once here rather than in each game, because a stadium is not part of
 * how a sport plays — it is what makes it look like the sport instead of
 * coloured rectangles. Keeping it in one file also means the games cannot
 * drift apart visually, which is the usual way a set of minigames ends up
 * looking like a set of different apps.
 *
 * All of it is inline SVG with no images: it has to recolour with the
 * child's theme, scale to any phone, and add nothing to what the app
 * downloads.
 */

/** A bank of spectators. Deterministic from `seed`, so it never flickers. */
export function Crowd({ y = 0, height = 22, rows = 4, seed = 1 }) {
  const dots = []
  // A tiny repeatable pseudo-random: the same seed always draws the same
  // crowd, so a re-render does not reshuffle everybody's shirt.
  let n = seed * 9301
  const next = () => {
    n = (n * 9301 + 49297) % 233280
    return n / 233280
  }
  const shirts = ['#f87171', '#60a5fa', '#fbbf24', '#4ade80', '#c084fc', '#fb923c', '#f1f5f9']
  for (let r = 0; r < rows; r += 1) {
    for (let i = 0; i < 26; i += 1) {
      dots.push({
        x: (i + (r % 2 ? 0.5 : 0)) * 4 + next() * 1.2,
        y: y + 3 + r * (height / rows),
        r: 1.25 + next() * 0.35,
        fill: shirts[Math.floor(next() * shirts.length)],
      })
    }
  }
  return (
    <g opacity="0.85">
      <rect x="0" y={y} width="100" height={height} fill="#1f2937" opacity="0.55" />
      {dots.map((d) => (
        <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={d.r} fill={d.fill} opacity="0.9" />
      ))}
      <rect x="0" y={y + height - 1.2} width="100" height="1.2" fill="#0f172a" opacity="0.6" />
    </g>
  )
}

/** Four floodlight towers across the back of a stadium. */
export function Floodlights({ y = 2 }) {
  return (
    <g opacity="0.9">
      {[12, 38, 62, 88].map((x) => (
        <g key={x}>
          <rect x={x - 0.4} y={y + 2} width="0.8" height="7" fill="#64748b" />
          <rect x={x - 4} y={y - 1.5} width="8" height="4" rx="0.8" fill="#475569" />
          {[-2.6, -0.9, 0.9, 2.6].map((o) => (
            <circle key={o} cx={x + o} cy={y + 0.5} r="0.9" fill="#fef9c3" opacity="0.95" />
          ))}
        </g>
      ))}
    </g>
  )
}

/**
 * A person, seen from the side or behind.
 *
 * Head, body, two arms, two legs — enough that it reads as a human being at
 * thumbnail size, which is all it needs to do. `swing` from 0 to 1 moves the
 * racket arm through a stroke; `run` sways the legs.
 */
export function Person({
  x, y, scale = 1, shirt = '#3b82f6', shorts = '#1e293b', skin = '#e9b08a',
  facing = 1, swing = 0, run = 0, racket = null, flip = false,
}) {
  const s = scale
  const armAngle = -60 + swing * 150
  const rad = (armAngle * Math.PI) / 180
  const handX = Math.cos(rad) * 5.4 * facing
  const handY = Math.sin(rad) * 5.4
  const legSway = Math.sin(run * Math.PI * 2) * 2.2

  return (
    <g transform={`translate(${x} ${y}) scale(${s * (flip ? -1 : 1)} ${s})`}>
      {/* legs */}
      <line x1="0" y1="0" x2={-1.6 + legSway} y2="6.5" stroke={shorts} strokeWidth="2.1" strokeLinecap="round" />
      <line x1="0" y1="0" x2={1.6 - legSway} y2="6.5" stroke={shorts} strokeWidth="2.1" strokeLinecap="round" />
      {/* body */}
      <rect x="-2.2" y="-6.5" width="4.4" height="7" rx="1.8" fill={shirt} />
      {/* off arm */}
      <line x1="0" y1="-5" x2={-4 * facing} y2="-1.5" stroke={skin} strokeWidth="1.5" strokeLinecap="round" />
      {/* racket arm */}
      <line x1="0" y1="-5" x2={handX} y2={-5 + handY} stroke={skin} strokeWidth="1.6" strokeLinecap="round" />
      {racket === 'tennis' && (
        <g transform={`translate(${handX} ${-5 + handY}) rotate(${armAngle + 90})`}>
          <line x1="0" y1="0" x2="0" y2="-2.4" stroke="#334155" strokeWidth="0.9" />
          <ellipse cx="0" cy="-4.6" rx="2.2" ry="2.9" fill="none" stroke="#334155" strokeWidth="0.9" />
          <ellipse cx="0" cy="-4.6" rx="1.7" ry="2.4" fill="#e2e8f0" opacity="0.45" />
        </g>
      )}
      {racket === 'bat' && (
        <g transform={`translate(${handX} ${-5 + handY}) rotate(${armAngle + 90})`}>
          <line x1="0" y1="0" x2="0" y2="-1.6" stroke="#92400e" strokeWidth="1" />
          <circle cx="0" cy="-3.3" r="2.1" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.4" />
        </g>
      )}
      {/* head */}
      <circle cx="0" cy="-8.6" r="2.3" fill={skin} />
      <path d={`M -2.3 -9.6 a 2.3 2.3 0 0 1 4.6 0 z`} fill="#3f2d20" />
    </g>
  )
}

/** A goal, seen from behind the striker: posts, bar and a net. */
export function GoalNet({ x = 14, y = 16, w = 72, h = 38 }) {
  const lines = []
  for (let i = 1; i < 12; i += 1) lines.push(x + (w / 12) * i)
  const rows = []
  for (let i = 1; i < 7; i += 1) rows.push(y + (h / 7) * i)
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#0f172a" opacity="0.18" />
      {lines.map((lx) => (
        <line key={`v${lx}`} x1={lx} y1={y} x2={lx} y2={y + h} stroke="#f8fafc" strokeWidth="0.25" opacity="0.6" />
      ))}
      {rows.map((ly) => (
        <line key={`h${ly}`} x1={x} y1={ly} x2={x + w} y2={ly} stroke="#f8fafc" strokeWidth="0.25" opacity="0.6" />
      ))}
      <rect x={x - 1.4} y={y - 1.4} width="2.4" height={h + 1.4} fill="#f8fafc" />
      <rect x={x + w - 1} y={y - 1.4} width="2.4" height={h + 1.4} fill="#f8fafc" />
      <rect x={x - 1.4} y={y - 1.4} width={w + 2.8} height="2.2" rx="0.8" fill="#f8fafc" />
    </g>
  )
}
