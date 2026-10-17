import { useEffect, useRef, useState } from 'react'

/**
 * Brick Breaker. A ball, a paddle, and a wall to get rid of.
 *
 * The one game here with real physics, and the reason it is worth the code is
 * that the angle the ball leaves the paddle depends on where it hits — so a
 * player who is thinking can aim at the last brick in a corner instead of
 * waiting for luck to find it.
 */

const W = 300
const H = 380
const PAD_W = 64
const PAD_Y = H - 26
const R = 6
const COLS = 7
const ROWS = 5
const BRICK_W = (W - 20) / COLS
const BRICK_H = 16
const TOP = 36
const TOTAL = COLS * ROWS
const LIVES = 3

export default function Bricks({ onDone }) {
  const [bricks, setBricks] = useState(() => new Array(TOTAL).fill(true))
  const [paddle, setPaddle] = useState((W - PAD_W) / 2)
  const [ball, setBall] = useState({ x: W / 2, y: PAD_Y - 20 })
  const [lives, setLives] = useState(LIVES)

  const area = useRef(null)
  const padRef = useRef(paddle)
  const ballRef = useRef({ x: W / 2, y: PAD_Y - 20, vx: 2.1, vy: -3.1 })
  const bricksRef = useRef(new Array(TOTAL).fill(true))
  const livesRef = useRef(LIVES)
  const raf = useRef(0)
  const done = useRef(false)

  padRef.current = paddle

  const finish = () => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    const broken = TOTAL - bricksRef.current.filter(Boolean).length
    onDone(Math.max(0, Math.min(100, Math.round((broken / TOTAL) * 100))))
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      const b = ballRef.current
      b.x += b.vx
      b.y += b.vy

      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) }
      if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) }

      // Paddle. Where it hits decides the angle, which is the whole game.
      if (b.vy > 0 && b.y + R >= PAD_Y && b.y - R <= PAD_Y + 10) {
        const p = padRef.current
        if (b.x >= p - R && b.x <= p + PAD_W + R) {
          const hit = (b.x - (p + PAD_W / 2)) / (PAD_W / 2)
          const speed = Math.min(5.4, Math.hypot(b.vx, b.vy) + 0.06)
          const angle = hit * 1.05
          b.vx = Math.sin(angle) * speed
          b.vy = -Math.abs(Math.cos(angle) * speed)
          b.y = PAD_Y - R
        }
      }

      // Bricks.
      if (b.y - R < TOP + ROWS * BRICK_H && b.y + R > TOP) {
        const col = Math.floor((b.x - 10) / BRICK_W)
        const row = Math.floor((b.y - TOP) / BRICK_H)
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
          const i = row * COLS + col
          if (bricksRef.current[i]) {
            bricksRef.current[i] = false
            setBricks([...bricksRef.current])
            b.vy = -b.vy
            if (!bricksRef.current.some(Boolean)) { finish(); return }
          }
        }
      }

      // Off the bottom: a life, then a fresh serve from the middle.
      if (b.y > H + 20) {
        livesRef.current -= 1
        setLives(livesRef.current)
        if (livesRef.current <= 0) { finish(); return }
        ballRef.current = { x: W / 2, y: PAD_Y - 20, vx: 2.1 * (Math.random() < 0.5 ? -1 : 1), vy: -3.1 }
      }

      setBall({ x: ballRef.current.x, y: ballRef.current.y })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const moveTo = (clientX) => {
    const box = area.current?.getBoundingClientRect()
    if (!box) return
    const x = (clientX - box.left) * (W / box.width) - PAD_W / 2
    setPaddle(Math.max(0, Math.min(W - PAD_W, x)))
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">Clear the wall. Do not drop the ball.</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {TOTAL - bricks.filter(Boolean).length}/{TOTAL} · {'❤️'.repeat(Math.max(0, lives))}
      </p>

      <div
        ref={area}
        role="application"
        aria-label="Brick breaker. Drag left and right to move the paddle."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') moveTo(e.clientX) }}
        className="mx-auto"
        style={{
          width: '100%',
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 16,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true">
          {bricks.map((alive, i) => alive && (
            <rect
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              x={10 + (i % COLS) * BRICK_W + 1.5}
              y={TOP + Math.floor(i / COLS) * BRICK_H + 1.5}
              width={BRICK_W - 3}
              height={BRICK_H - 3}
              rx={4}
              fill={Math.floor(i / COLS) < 2 ? 'var(--accent-2)' : 'var(--accent)'}
              opacity={0.55 + (ROWS - Math.floor(i / COLS)) * 0.09}
            />
          ))}
          <circle cx={ball.x} cy={ball.y} r={R} fill="var(--ink)" />
          <rect x={paddle} y={PAD_Y} width={PAD_W} height={10} rx={5} fill="var(--accent)" />
        </svg>
      </div>

      <p className="text-xs text-muted mt-3">
        The edge of the paddle sends the ball off at an angle — use it to reach the corners.
      </p>
    </div>
  )
}
