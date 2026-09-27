import { useEffect, useState } from 'react'

/**
 * The whole product, playing by itself, above the fold.
 *
 * A first-time visitor will not read four bullet points about how the loop
 * works, and a screenshot of a chore list looks like every other chore list.
 * This runs the loop in front of them in about seven seconds: a chore is
 * assigned, a photo is taken, the app checks it, the parent approves, XP
 * lands. It is the one thing on the front door doing any selling.
 *
 * Deliberately not a video and not an image. A video costs a download, needs
 * re-recording every time a screen changes, and is the first thing to look
 * stale; this is drawn from the same tokens as the real app, so it cannot
 * drift from it. It also weighs nothing.
 *
 * Everything stops for prefers-reduced-motion — the beats still advance so
 * the story is told, but nothing slides, flashes or sweeps. A parent who has
 * turned motion off has done so for a reason and a marketing animation is not
 * an exception to it.
 */

const BEATS = [
  { label: 'You assign it', ms: 1700 },
  { label: 'They photograph it', ms: 1900 },
  { label: 'The app checks the photo', ms: 2100 },
  { label: 'You approve. They level up.', ms: 2400 },
]

export default function LoopPreview() {
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

  const anim = (name) => (still ? undefined : name)

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 300 }}>
      {/*
        * A phone, drawn rather than photographed. A device mockup image would
        * be a megabyte and would date the moment handset bezels change.
        */}
      <div
        className="relative overflow-hidden mx-auto"
        style={{
          width: 206,
          height: 252,
          borderRadius: 26,
          border: '2px solid var(--line)',
          background: 'linear-gradient(170deg, var(--surface), var(--bg))',
          boxShadow: 'var(--shadow)',
        }}
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 rounded-full"
          style={{
            top: 8, width: 52, height: 4, marginLeft: -26,
            background: 'var(--line)',
          }}
        />

        <div className="absolute inset-0 pt-6 px-3.5 pb-3.5 flex flex-col">
          {/* The chore itself, on screen for every beat. */}
          <div
            key={`card-${beat === 0 ? 'in' : 'held'}`}
            className="rounded-xl p-2.5 mb-2"
            style={{
              background: 'color-mix(in srgb, var(--accent) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              animation: beat === 0 ? anim('rankup-slide-up 420ms ease-out') : undefined,
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>🛏️</span>
              <span className="font-display font-bold" style={{ fontSize: 12 }}>Make your bed</span>
              <span
                className="ml-auto font-display font-extrabold"
                style={{ fontSize: 11, color: 'var(--accent)' }}
              >
                +30
              </span>
            </div>
          </div>

          {/* The proof. A viewfinder, a shutter, then a verdict. */}
          <div
            className="relative flex-1 rounded-xl overflow-hidden"
            style={{
              border: '1px dashed var(--line)',
              background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            }}
          >
            {beat === 1 && (
              <>
                <Viewfinder still={still} />
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'white',
                    animation: anim('rankup-shutter 900ms ease-out 700ms both'),
                    opacity: still ? 0 : undefined,
                  }}
                />
              </>
            )}

            {beat === 2 && <Checking still={still} />}

            {beat === 3 && <Approved still={still} />}

            {beat === 0 && <Assigned still={still} />}
          </div>
        </div>
      </div>

      {/* The words under it, and the progress through the four beats. */}
      <p
        className="text-center font-display font-bold mt-3.5"
        style={{ fontSize: 14, minHeight: 20 }}
        aria-live="polite"
      >
        {BEATS[beat].label}
      </p>
      <div className="flex justify-center gap-1.5 mt-2">
        {BEATS.map((b, i) => (
          <span
            key={b.label}
            className="rounded-full"
            style={{
              width: i === beat ? 18 : 6,
              height: 6,
              background: i === beat ? 'var(--accent)' : 'var(--line)',
              transition: still ? undefined : 'width 260ms ease, background 260ms ease',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/*
 * Beat one is the only one with no event in it, so it gets the queue instead —
 * the same screen a parent actually sees, with today's chores sitting on it.
 * An empty box for a second and a half read as a bug.
 */
function Assigned({ still }) {
  const rest = [['🍽️', 'Load the dishwasher', 30], ['📚', 'Read for 20 minutes', 30]]
  return (
    <div className="absolute inset-0 p-2">
      {rest.map(([icon, title, xp], i) => (
        <div
          key={title}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 mb-1"
          style={{
            background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
            opacity: 0.55,
            animation: still ? undefined : `rankup-slide-up 380ms ${120 + i * 90}ms both`,
          }}
        >
          <span style={{ fontSize: 12 }}>{icon}</span>
          <span style={{ fontSize: 10 }}>{title}</span>
          <span className="ml-auto font-display font-bold" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
            +{xp}
          </span>
        </div>
      ))}
      <p
        className="text-center mt-2"
        style={{ fontSize: 10, color: 'var(--ink-muted)' }}
      >
        3 quests for Ava today
      </p>
    </div>
  )
}

function Viewfinder({ still }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden="true">
        {[[6, 6, 1, 1], [80, 6, -1, 1], [6, 80, 1, -1], [80, 80, -1, -1]].map(([x, y, dx, dy]) => (
          <path
            key={`${x}-${y}`}
            d={`M ${x} ${y + 18 * dy} L ${x} ${y} L ${x + 18 * dx} ${y}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span
        className="absolute rounded-full"
        style={{
          width: 30, height: 30,
          border: '3px solid var(--ink)',
          animation: still ? undefined : 'rankup-pulse 900ms ease-in-out infinite',
        }}
      />
    </div>
  )
}

function Checking({ still }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-3">
      <div className="w-full">
        <div
          className="w-full rounded-full overflow-hidden mb-2"
          style={{ height: 5, background: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--accent)',
              width: still ? '100%' : undefined,
              animation: still ? undefined : 'rankup-sweep 1400ms ease-out both',
            }}
          />
        </div>
        <p className="text-center" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
          Checking it is a real photo, taken now
        </p>
        <p
          className="text-center font-display font-extrabold mt-1.5"
          style={{ fontSize: 12, color: 'var(--good)', animation: still ? undefined : 'rankup-pop 400ms 1300ms both' }}
        >
          Looks genuine · 94
        </p>
      </div>
    </div>
  )
}

function Approved({ still }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-3">
      <div className="w-full text-center">
        <div
          className="font-display font-extrabold"
          style={{ fontSize: 26, color: 'var(--accent)', animation: still ? undefined : 'rankup-pop 460ms both' }}
        >
          +30 XP
        </div>
        <div
          className="w-full rounded-full overflow-hidden mt-2 mb-1.5"
          style={{ height: 6, background: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}
        >
          <div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent), #7C5CFF)',
              width: still ? '72%' : undefined,
              animation: still ? undefined : 'rankup-fill 1100ms 260ms ease-out both',
            }}
          />
        </div>
        <p className="font-display font-bold" style={{ fontSize: 11 }}>
          Ava reached Level 4 🎉
        </p>
      </div>
    </div>
  )
}
