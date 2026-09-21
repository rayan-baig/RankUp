import { useId, useMemo } from 'react'

/**
 * The animated scene behind every kid screen.
 *
 * One component, one `scene` prop, 19 scenes (15 themes + Block Craft's 4
 * level-gated evolutions). Everything is inline SVG + CSS so there are no image
 * files to load and it re-colours itself from the active theme.
 */

/** Deterministic pseudo-random so a scene doesn't reshuffle on every render. */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function useParticles(seed, count) {
  return useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: count }, (_, i) => ({
      i,
      x: r() * 100,
      y: r() * 100,
      size: 0.4 + r() * 1.8,
      delay: r() * 12,
      duration: 10 + r() * 18,
      rot: r() * 360,
    }))
  }, [seed, count])
}

function Drifters({ seed, count, render }) {
  const parts = useParticles(seed, count)
  return (
    <>
      {parts.map((p) => (
        <g
          key={p.i}
          style={{
            transformOrigin: `${p.x}% ${p.y}%`,
            /*
             * Two animations at different periods rather than one.
             *
             * A single vertical drift is a conveyor belt — everything moving
             * the same way at the same speed, which is what made this read as
             * a repeating pattern instead of weather. The sway runs on its own
             * unrelated period, so no two particles line up for long and the
             * motion stops being predictable.
             *
             * `--drift-scale` is set per parallax layer and inherits down here,
             * so the far layer runs slow and the near layer runs fast without
             * any of the nineteen scenes knowing parallax exists.
             */
            animation: `rankup-drift calc(var(--drift-scale, 1) * ${p.duration}s) linear ${-p.delay}s infinite`,
          }}
        >
          {/*
            The sway is a SEPARATE element on purpose. Two animations on one
            element both writing `transform` do not add up — the later one wins
            outright and the drift simply stops happening. Nesting composes
            them, which is what was wanted in the first place.
          */}
          <g
            style={{
              animation:
                `rankup-sway calc(var(--drift-scale, 1) * ${(p.duration * 0.41).toFixed(1)}s)`
                + ` ease-in-out ${(-p.delay * 0.7).toFixed(1)}s infinite`,
            }}
          >
            {render(p)}
          </g>
        </g>
      ))}
    </>
  )
}

/* ---------------------------------------------------------------- */

function Tetrominoes({ c }) {
  const shapes = [
    'M0 0h6v2H0z', 'M0 0h4v2H0zM0 2h2v2H0z', 'M0 0h2v6H0z', 'M0 0h4v4H0z',
  ]
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.18" stroke={c.accent} strokeWidth="0.15">
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" />
        ))}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} />
        ))}
      </g>
      <Drifters
        seed={7}
        count={14}
        render={(p) => (
          <path
            d={shapes[p.i % shapes.length]}
            transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.size})`}
            fill={p.i % 3 === 0 ? c.accent2 : c.accent}
            opacity="0.5"
          />
        )}
      />
    </>
  )
}

function Voxel({ c, variant }) {
  const sky = { base: c.bg, top: c.surface2 }
  return (
    <>
      <rect width="100" height="100" fill={sky.base} />
      <rect width="100" height="46" fill={sky.top} opacity="0.55" />
      {variant === 'nether' && (
        <g opacity="0.5">
          {Array.from({ length: 26 }, (_, i) => (
            <rect key={i} x={(i * 7.3) % 100} y={(i * 13) % 60} width="2" height="2" fill={c.accent} opacity="0.6">
              <animate attributeName="opacity" values="0.15;0.8;0.15" dur={`${2 + (i % 5)}s`} repeatCount="indefinite" />
            </rect>
          ))}
        </g>
      )}
      {variant === 'end' && (
        <g>
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={(i * 17.3) % 100} cy={(i * 29) % 100} r="0.5" fill={c.accent}>
              <animate attributeName="opacity" values="0;1;0" dur={`${3 + (i % 7)}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
      {/* Pixelated soil strata */}
      {Array.from({ length: 12 }, (_, row) =>
        Array.from({ length: 13 }, (_, col) => {
          const shade = ((row * 7 + col * 3) % 5) / 14
          return (
            <rect
              key={`${row}-${col}`}
              x={col * 8}
              y={46 + row * 4.6}
              width="8"
              height="4.6"
              fill={row < 1 ? (variant === 'volcanic' ? c.accent : c.accent2) : c.surface}
              opacity={row < 1 ? 0.9 : 0.55 + shade}
            />
          )
        }),
      )}
      {variant === 'volcanic' && (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={(i * 8.7) % 100} y={100} width="1.2" height="3" fill={c.accent2} opacity="0.8">
              <animate attributeName="y" values="100;40" dur={`${4 + (i % 4)}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur={`${4 + (i % 4)}s`} repeatCount="indefinite" />
            </rect>
          ))}
        </g>
      )}
    </>
  )
}

function Hud({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g stroke={c.line} strokeWidth="0.2" opacity="0.6">
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x={4 + i * 2} y={4 + i * 2} width={92 - i * 4} height={92 - i * 4} fill="none" />
        ))}
      </g>
      <g stroke={c.accent} strokeWidth="0.5" fill="none">
        <path d="M6 18 V6 H18" />
        <path d="M82 6 H94 V18" />
        <path d="M94 82 V94 H82" />
        <path d="M18 94 H6 V82" />
        <line x1="50" y1="8" x2="50" y2="16" opacity="0.7" />
        <line x1="50" y1="84" x2="50" y2="92" opacity="0.7" />
        <circle cx="50" cy="50" r="14" opacity="0.35" strokeDasharray="2 3">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="26s" repeatCount="indefinite" />
        </circle>
      </g>
      <rect x="0" y="49.6" width="100" height="0.25" fill={c.accent} opacity="0.5">
        <animate attributeName="y" values="0;100;0" dur="9s" repeatCount="indefinite" />
      </rect>
    </>
  )
}

function Slant({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.35">
        {Array.from({ length: 16 }, (_, i) => (
          <path
            key={i}
            d={`M${-20 + i * 9} 100 L${5 + i * 9} 0 L${11 + i * 9} 0 L${-14 + i * 9} 100 Z`}
            fill={i % 3 === 0 ? c.accent : i % 3 === 1 ? c.accent2 : c.surface2}
            opacity={0.25 + (i % 4) * 0.1}
          />
        ))}
      </g>
      <g>
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x="0" y={12 + i * 20} width="100" height="1.2" fill={c.accent2} opacity="0.3">
            <animate attributeName="x" values="-100;100" dur={`${8 + i * 3}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </g>
    </>
  )
}

function Aura({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.45">
        {Array.from({ length: 22 }, (_, i) => (
          <path key={i} d={`M50 50 L${50 + Math.cos((i / 22) * 6.28) * 70} ${50 + Math.sin((i / 22) * 6.28) * 70}`} stroke={i % 2 ? c.accent : c.accent2} strokeWidth="0.5" opacity="0.4">
            <animate attributeName="opacity" values="0.1;0.65;0.1" dur={`${2 + (i % 5) * 0.6}s`} repeatCount="indefinite" />
          </path>
        ))}
      </g>
      <circle cx="50" cy="50" r="18" fill={c.accent} opacity="0.16">
        <animate attributeName="r" values="16;26;16" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0.05;0.2" dur="3.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="50" r="9" fill={c.accent} opacity="0.3">
        <animate attributeName="r" values="8;13;8" dur="1.9s" repeatCount="indefinite" />
      </circle>
    </>
  )
}

function Bows({ c }) {
  const bow = 'M-3 0 L0 -1.4 L3 0 L0 1.4 Z'
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x="0" y={i * 10} width="100" height="5" fill={c.surface2} opacity="0.45" />
        ))}
      </g>
      <Drifters
        seed={21}
        count={16}
        render={(p) => (
          <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${0.7 + p.size * 0.5})`}>
            <path d={bow} fill={p.i % 2 ? c.accent : c.accent2} opacity="0.55" />
            <circle r="0.6" fill={c.accent} opacity="0.7" />
          </g>
        )}
      />
    </>
  )
}

function Stage({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.4">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${10 + i * 10} 0 L${-10 + i * 12} 100 L${10 + i * 12} 100 Z`} fill={i % 2 ? c.accent : c.accent2} opacity="0.16">
            <animate attributeName="opacity" values="0.05;0.28;0.05" dur={`${4 + i}s`} repeatCount="indefinite" />
          </path>
        ))}
      </g>
      {/* friendship-bracelet bead lines */}
      {Array.from({ length: 3 }, (_, row) => (
        <g key={row}>
          {Array.from({ length: 26 }, (_, i) => (
            <circle key={i} cx={i * 4 + 2} cy={22 + row * 30} r="0.9" fill={i % 3 === row % 3 ? c.accent : c.accent2} opacity="0.55" />
          ))}
        </g>
      ))}
    </>
  )
}

function Stardust({ c }) {
  return (
    <>
      <defs>
        <linearGradient id="peg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={c.accent} stopOpacity="0.35" />
          <stop offset="1" stopColor={c.accent2} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={c.bg} />
      <rect width="100" height="100" fill="url(#peg)" />
      <Drifters
        seed={33}
        count={26}
        render={(p) => (
          <path
            d="M0 -1.6 L0.5 -0.5 L1.6 0 L0.5 0.5 L0 1.6 L-0.5 0.5 L-1.6 0 L-0.5 -0.5 Z"
            transform={`translate(${p.x} ${p.y}) scale(${p.size})`}
            fill={p.i % 2 ? c.accent : '#fff'}
            opacity="0.7"
          />
        )}
      />
    </>
  )
}

function Sprinkles({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      {/* dripping icing */}
      <path
        d={`M0 0 H100 V14 ${Array.from({ length: 10 }, (_, i) => `Q${i * 10 + 5} ${20 + (i % 3) * 6} ${i * 10 + 10} 14`).join(' ')} V0 Z`}
        fill={c.accent}
        opacity="0.55"
      />
      <g>
        {Array.from({ length: 34 }, (_, i) => {
          const r = rng(i + 5)
          const x = r() * 100
          const y = 24 + r() * 74
          return (
            <rect key={i} x={x} y={y} width="2.6" height="0.9" rx="0.45" transform={`rotate(${r() * 180} ${x} ${y})`} fill={[c.accent, c.accent2, '#ffd166', '#7cd4ff'][i % 4]} opacity="0.7" />
          )
        })}
      </g>
    </>
  )
}

function Vanity({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={4 + i * 19} y="6" width="15" height="88" rx="7" fill={c.surface} stroke={c.accent} strokeWidth="0.3" opacity="0.55" />
        ))}
      </g>
      <g>
        {Array.from({ length: 18 }, (_, i) => {
          const r = rng(i + 11)
          const x = r() * 100
          const y = r() * 100
          return (
            <path key={i} d="M0 -1.4 L1.1 0 L0 1.4 L-1.1 0 Z" transform={`translate(${x} ${y})`} fill={c.accent2} opacity="0.75">
              <animate attributeName="opacity" values="0.15;0.9;0.15" dur={`${2 + (i % 6) * 0.7}s`} repeatCount="indefinite" />
            </path>
          )
        })}
      </g>
    </>
  )
}

function Leaves({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.35">
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x="0" y={i * 11.5} width="100" height="10" fill={c.surface2} opacity={i % 2 ? 0.5 : 0.28} />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`l${i}`} x1="0" y1={i * 11.5 + 10} x2="100" y2={i * 11.5 + 10} stroke={c.line} strokeWidth="0.2" />
        ))}
      </g>
      <Drifters
        seed={44}
        count={12}
        render={(p) => (
          <path
            d="M0 0 C2 -2 4 -1 4 1 C4 3 2 4 0 3 C-1 2 -1 1 0 0 Z"
            transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${0.6 + p.size * 0.4})`}
            fill={p.i % 2 ? c.accent : c.accent2}
            opacity="0.5"
          />
        )}
      />
    </>
  )
}

function Grid({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g stroke={c.accent2} strokeWidth="0.22" opacity="0.55">
        {Array.from({ length: 15 }, (_, i) => (
          <line key={`v${i}`} x1={i * 7.14} y1="0" x2={i * 7.14} y2="100" />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={50 + i * i * 0.3} x2="100" y2={50 + i * i * 0.3} />
        ))}
      </g>
      <g stroke={c.accent} strokeWidth="0.35" fill="none" opacity="0.75">
        <rect x="14" y="16" width="26" height="20" />
        <rect x="58" y="30" width="30" height="24" />
        <rect x="30" y="58" width="22" height="16" />
        <line x1="40" y1="26" x2="58" y2="42">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="2.6s" repeatCount="indefinite" />
        </line>
      </g>
    </>
  )
}

function Bricks({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <g opacity="0.85">
        {Array.from({ length: 4 }, (_, row) =>
          Array.from({ length: 11 }, (_, col) => (
            <rect
              key={`${row}-${col}`}
              x={col * 10 + (row % 2 ? -5 : 0)}
              y={62 + row * 10}
              width="9"
              height="9"
              rx="1"
              fill={c.accent}
              opacity="0.35"
              stroke={c.line}
              strokeWidth="0.3"
            />
          )),
        )}
      </g>
      <g opacity="0.7">
        {Array.from({ length: 5 }, (_, i) => (
          <ellipse key={i} cx={12 + i * 20} cy={16 + (i % 2) * 10} rx="9" ry="4.5" fill="#fff" opacity="0.55">
            <animate attributeName="cx" values={`${12 + i * 20};${112 + i * 20}`} dur={`${30 + i * 8}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
      </g>
    </>
  )
}

function Triangles({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <Drifters
        seed={55}
        count={18}
        render={(p) => (
          <path
            d="M0 -2 L1.8 1.4 L-1.8 1.4 Z"
            transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.size})`}
            fill="none"
            stroke={p.i % 2 ? c.accent : c.accent2}
            strokeWidth="0.4"
            opacity="0.8"
          />
        )}
      />
      <rect x="0" y="0" width="100" height="0.4" fill={c.accent} opacity="0.6">
        <animate attributeName="y" values="0;100" dur="6s" repeatCount="indefinite" />
      </rect>
    </>
  )
}

function Handheld({ c }) {
  return (
    <>
      <rect width="100" height="100" fill={c.bg} />
      <rect x="6" y="6" width="88" height="88" rx="9" fill={c.surface} stroke={c.line} strokeWidth="1.2" />
      <rect x="14" y="14" width="72" height="46" rx="3" fill={c.surface2} stroke={c.line} strokeWidth="0.6" />
      <g opacity="0.7">
        {['#7ec86b', '#2f7de0', '#e04a2f', '#b06fe0'].map((col, i) => (
          <circle key={col} cx={24 + i * 17} cy={74 } r="4" fill={col} opacity="0.85">
            <animate attributeName="r" values="3.6;4.6;3.6" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
      <g opacity="0.5">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="18" y={19 + i * 5} width={Math.max(8, 62 - i * 7)} height="2" rx="1" fill={c.accent} opacity="0.25" />
        ))}
      </g>
    </>
  )
}

const SCENES = {
  tetrominoes: Tetrominoes,
  voxel: (p) => <Voxel {...p} variant="overworld" />,
  'voxel-volcanic': (p) => <Voxel {...p} variant="volcanic" />,
  'voxel-cream': (p) => <Voxel {...p} variant="cream" />,
  'voxel-nether': (p) => <Voxel {...p} variant="nether" />,
  'voxel-end': (p) => <Voxel {...p} variant="end" />,
  hud: Hud,
  slant: Slant,
  aura: Aura,
  bows: Bows,
  stage: Stage,
  stardust: Stardust,
  sprinkles: Sprinkles,
  vanity: Vanity,
  leaves: Leaves,
  grid: Grid,
  bricks: Bricks,
  triangles: Triangles,
  handheld: Handheld,
}

/**
 * Depth, which is the whole difference between a pattern and a place.
 *
 * The scene is drawn three times over rather than once. The far copy is
 * scaled up, heavily blurred and almost transparent; the middle copy sits
 * where the scene used to be; the near copy is scaled past the edges, lightly
 * blurred, and drifts faster. Nothing in the scenes themselves changed — the
 * parallax comes from the same shapes moving at different rates, which is how
 * distance actually reads to an eye.
 *
 * The blur is what stops it looking blocky. These are 100-unit drawings on an
 * 800-pixel screen, so every edge is magnified about eight times; hard edges at
 * that magnification are exactly what "pixelated" means to somebody looking at
 * it, even though it is vector all the way down. Softening the layers that are
 * meant to be far away removes it and reads as atmosphere at the same time.
 */
const LAYERS = [
  // Blurred AND still, and the stillness is what makes the blur affordable.
  // A blur costs on every repaint, so a blurred layer that also animates is
  // re-blurring the whole screen sixty times a second — measured at six-times
  // CPU throttling it took the median frame from 33ms to 50ms, which is the
  // difference between smooth and visibly stuttering on a mid-range phone.
  // Held still, the browser blurs it once and composites the texture from then
  // on, and it costs nothing.
  { key: 'far', scale: 1.4, blur: 3.2, opacity: 0.4, speed: 1, y: -2, still: true },
  { key: 'mid', scale: 1.0, blur: 0, opacity: 1, speed: 1, y: 0 },
  // Sharp rather than blurred, for the same reason: this one moves.
  { key: 'near', scale: 0.7, blur: 0, opacity: 0.38, speed: 0.6, y: 3 },
]

export default function ThemeBackground({ theme, className = '', glitch = false }) {
  const Scene = SCENES[theme?.scene] || Tetrominoes
  const c = theme?.colors
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (!c) return null

  return (
    <div
      className={`fixed inset-0 -z-10 pointer-events-none ${glitch ? 'anim-glitch' : ''} ${className}`}
      aria-hidden="true"
      style={{ background: c.bg }}
    >
      {/*
        A wash of the theme's own light behind everything, off-centre and
        weighted to the top, the way a room is lit from one side rather than
        evenly. Flat colour behind a flat pattern is what makes a background
        look printed; this is the cheapest thing that stops it.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(110% 70% at 20% 2%, ${c.accent}3d 0%, transparent 64%),`
            + `radial-gradient(90% 58% at 90% 102%, ${c.accent2 || c.accent}33 0%, transparent 60%),`
            + `radial-gradient(70% 44% at 78% 34%, ${c.accent2 || c.accent}1a 0%, transparent 70%)`,
        }}
      />

      {LAYERS.map((layer) => (
        <svg
          key={layer.key}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          className={`absolute inset-0 w-full h-full${layer.still ? ' bg-still' : ''}`}
          /* Forces antialiasing on every edge rather than letting the browser
             decide it can snap these to the pixel grid. */
          shapeRendering="geometricPrecision"
          style={{
            opacity: layer.opacity,
            filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
            transform: `scale(${layer.scale}) translateY(${layer.y}%)`,
            transformOrigin: 'center',
          }}
        >
          <defs>
            {/* A soft vignette so the near layer fades out at the edges
                instead of ending at a hard rectangle. */}
            <radialGradient id={`${id}-${layer.key}-fade`} cx="50%" cy="46%" r="72%">
              <stop offset="0%" stopColor="#fff" stopOpacity="1" />
              <stop offset="70%" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id={`${id}-${layer.key}-mask`}>
              <rect x="-20" y="-20" width="140" height="140" fill={`url(#${id}-${layer.key}-fade)`} />
            </mask>
          </defs>
          <g
            mask={layer.key === 'mid' ? undefined : `url(#${id}-${layer.key}-mask)`}
            /* Inherits down to every drifting particle in the scene, which is
               how one number makes a whole layer move at its own rate. */
            style={{ '--drift-scale': layer.speed }}
          >
            {/*
              The far and near layers are handed a transparent background.
              
              Every scene opens by painting `c.bg` across the whole viewBox,
              which is right when there is one of them and fatal when there are
              three: the middle layer's opaque rectangle hid the far one
              completely, and the near one hid everything. The parallax was
              running the entire time and none of it was visible. Swapping the
              colour is enough — no scene needs to know it is being stacked.
            */}
            <Scene c={layer.key === 'mid' ? c : { ...c, bg: 'transparent' }} />
          </g>
        </svg>
      ))}

      {/*
        Keeps text readable no matter how busy the scene is. Six stops rather
        than four: the banding that showed on darker themes was the gradient
        having too far to travel between them.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            `linear-gradient(to bottom, ${c.bg}cc 0%, ${c.bg}8e 15%, ${c.bg}52 32%,`
            + ` ${c.bg}5e 58%, ${c.bg}a6 80%, ${c.bg}e6 100%)`,
        }}
      />
    </div>
  )
}

export { SCENES }
