import { useEffect, useRef, useState } from 'react'

/**
 * Catcher. Things fall; move the basket under the good ones and out from
 * under the bad ones.
 *
 * The arcade's three original games are all "hit the thing at the right
 * moment" in different clothes. This one asks a child to track several
 * objects at once and choose between them, which is a genuinely different
 * skill and the reason it earns a slot rather than being a fourth tapper.
 *
 * Dragging, not tapping. A finger already on the screen moving left and right
 * is the one control that works the same on a phone a child is holding in one
 * hand and a tablet flat on a table, and it needs no buttons taking up the
 * play area.
 */

const W = 300
const H = 360
const BASKET_W = 68
const RUN_MS = 30000

// Catching twenty good ones in thirty seconds is a very strong run.
const TARGET = 20

export default function Catcher({ onDone }) {
  const [basket, setBasket] = useState((W - BASKET_W) / 2)
  const [items, setItems] = useState([])
  const [caught, setCaught] = useState(0)
  // The loop needs the live count to settle up with, and reading it out of a
  // state updater meant calling onDone during a render — which updates a
  // different component mid-render and is exactly what React warns about.
  const caughtRef = useRef(0)
  const [missed, setMissed] = useState(0)
  const [left, setLeft] = useState(Math.round(RUN_MS / 1000))

  const area = useRef(null)
  const basketRef = useRef(basket)
  const raf = useRef(0)
  const done = useRef(false)
  const started = useRef(Date.now())
  const nextDrop = useRef(0)
  const nextId = useRef(1)

  basketRef.current = basket

  const finish = (hits) => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    onDone(Math.max(0, Math.min(100, Math.round((hits / TARGET) * 100))))
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      const now = Date.now()
      const elapsed = now - started.current

      if (elapsed >= RUN_MS) {
        finish(caughtRef.current)
        return
      }
      setLeft(Math.max(0, Math.ceil((RUN_MS - elapsed) / 1000)))

      // Drops come faster as the run goes on, and the bad ones get commoner.
      if (now >= nextDrop.current) {
        const progress = elapsed / RUN_MS
        nextDrop.current = now + 760 - progress * 360
        setItems((list) => [...list, {
          id: nextId.current++,
          x: 16 + Math.random() * (W - 32 - 26),
          y: -26,
          // A third bad by the end, a tenth at the start: enough to make you
          // look before you move, never enough to feel unfair.
          bad: Math.random() < 0.1 + progress * 0.22,
          speed: 1.7 + progress * 1.9 + Math.random() * 0.6,
        }])
      }

      setItems((list) => {
        const kept = []
        for (const it of list) {
          const y = it.y + it.speed
          // The catch line is the top of the basket.
          if (y + 26 >= H - 34 && y < H - 6) {
            const bx = basketRef.current
            if (it.x + 26 > bx && it.x < bx + BASKET_W) {
              if (it.bad) {
                setMissed((m) => m + 1)
              } else {
                caughtRef.current += 1
                setCaught(caughtRef.current)
              }
              continue
            }
          }
          if (y > H) {
            // A good one hitting the floor is a miss; a bad one is a relief.
            if (!it.bad) setMissed((m) => m + 1)
            continue
          }
          kept.push({ ...it, y })
        }
        return kept
      })

      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // Set up once: the loop reads everything it needs through refs, and
    // re-creating it on each render would restart the run every frame.
  }, [])

  /** One handler for mouse and touch, so there is no duplicated maths. */
  const moveTo = (clientX) => {
    const box = area.current?.getBoundingClientRect()
    if (!box) return
    const scale = W / box.width
    const x = (clientX - box.left) * scale - BASKET_W / 2
    setBasket(Math.max(0, Math.min(W - BASKET_W, x)))
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        Catch the stars. Dodge the rocks.
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {caught} caught · {left}s
      </p>

      <div
        ref={area}
        role="application"
        aria-label="Catcher. Drag left and right to move the basket."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') moveTo(e.clientX) }}
        className="relative mx-auto overflow-hidden"
        style={{
          width: '100%',
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 18,
          border: '2px solid var(--line)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent)',
          touchAction: 'none',
        }}
      >
        <div className="absolute inset-0" style={{ containerType: 'size' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true">
            {items.map((it) => (
              <text
                key={it.id}
                x={it.x}
                y={it.y + 20}
                style={{ fontSize: 24 }}
              >
                {it.bad ? '🪨' : '⭐'}
              </text>
            ))}
            <rect
              x={basket}
              y={H - 34}
              width={BASKET_W}
              height={18}
              rx={9}
              fill="var(--accent)"
            />
          </svg>
        </div>
      </div>

      <p className="text-xs text-muted mt-3">
        {missed > 0 ? `${missed} missed or dropped. ` : ''}
        Drag anywhere in the box to move.
      </p>
    </div>
  )
}
