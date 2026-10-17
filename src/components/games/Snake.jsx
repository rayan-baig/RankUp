import { useEffect, useRef, useState } from 'react'
import { useArrowKeys, swipeHandlers, DPad } from './controls.jsx'

/**
 * Snake. The actual game, not a tribute to it.
 *
 * It is here because it is the one arcade game nearly every adult in the
 * house already knows how to explain, and because it is genuinely good: the
 * difficulty comes from the board filling up with your own tail rather than
 * from the app speeding up to make you lose.
 */

const SIZE = 15
const START = [{ x: 7, y: 9 }, { x: 7, y: 10 }, { x: 7, y: 11 }]
const TARGET = 25

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export default function Snake({ onDone }) {
  const [snake, setSnake] = useState(START)
  const [food, setFood] = useState({ x: 7, y: 4 })
  const [dead, setDead] = useState(false)

  const dir = useRef('up')
  // A turn is queued rather than applied, or a quick left-then-up inside one
  // tick turns the snake back into itself and kills you for playing well.
  const queued = useRef([])
  const bodyRef = useRef(START)
  const foodRef = useRef(food)
  const done = useRef(false)

  const turn = (next) => {
    const last = queued.current.length ? queued.current[queued.current.length - 1] : dir.current
    if (next === last || next === OPPOSITE[last]) return
    if (queued.current.length < 2) queued.current.push(next)
  }
  useArrowKeys(turn)

  const finish = (len) => {
    if (done.current) return
    done.current = true
    onDone(Math.max(0, Math.min(100, Math.round(((len - START.length) / (TARGET - START.length)) * 100))))
  }

  useEffect(() => {
    let timer = 0
    const tick = () => {
      if (done.current) return
      const body = bodyRef.current
      if (queued.current.length) dir.current = queued.current.shift()
      const [dx, dy] = STEP[dir.current]
      const head = { x: body[0].x + dx, y: body[0].y + dy }

      const offBoard = head.x < 0 || head.y < 0 || head.x >= SIZE || head.y >= SIZE
      // The tail tip moves out of the way this tick, so chasing it is legal.
      const intoSelf = body.slice(0, -1).some((s) => s.x === head.x && s.y === head.y)
      if (offBoard || intoSelf) {
        setDead(true)
        setTimeout(() => finish(body.length), 900)
        return
      }

      const ate = head.x === foodRef.current.x && head.y === foodRef.current.y
      const next = [head, ...(ate ? body : body.slice(0, -1))]
      bodyRef.current = next
      setSnake(next)

      if (ate) {
        if (next.length >= TARGET) { finish(next.length); return }
        // Never drop food under the snake; on a nearly full board, keep looking.
        let spot = null
        for (let i = 0; i < 400 && !spot; i += 1) {
          const c = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) }
          if (!next.some((s) => s.x === c.x && s.y === c.y)) spot = c
        }
        if (!spot) { finish(next.length); return }
        foodRef.current = spot
        setFood(spot)
      }

      // It quickens as you grow, but stops tightening well before it is unfair.
      timer = setTimeout(tick, Math.max(95, 190 - next.length * 4))
    }
    timer = setTimeout(tick, 320)
    return () => clearTimeout(timer)
    // Set up once; everything the loop needs it reads through a ref.
  }, [])

  const cell = 100 / SIZE

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">{dead ? 'Ouch.' : 'Eat the apples. Do not bite yourself.'}</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        Length {snake.length} · best is {TARGET}
      </p>

      <div
        {...swipeHandlers(turn)}
        role="application"
        aria-label="Snake. Swipe or use the arrow keys to turn."
        className="relative mx-auto"
        style={{
          width: '100%',
          maxWidth: 300,
          aspectRatio: '1',
          borderRadius: 16,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
          overflow: 'hidden',
          opacity: dead ? 0.55 : 1,
          transition: 'opacity 200ms ease',
          touchAction: 'none',
        }}
      >
        {snake.map((s, i) => (
          <div
            key={`${s.x}-${s.y}-${i}`}
            className="absolute"
            style={{
              left: `${s.x * cell}%`,
              top: `${s.y * cell}%`,
              width: `${cell}%`,
              height: `${cell}%`,
              padding: 1,
            }}
          >
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: i === 0 ? 6 : 4,
              background: i === 0 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 62%, transparent)',
            }}
            />
          </div>
        ))}
        <div
          className="absolute grid place-items-center"
          style={{
            left: `${food.x * cell}%`,
            top: `${food.y * cell}%`,
            width: `${cell}%`,
            height: `${cell}%`,
            fontSize: 13,
          }}
          aria-hidden="true"
        >
          🍎
        </div>
      </div>

      <DPad onDir={turn} label="Turn the snake" />
      <p className="text-xs text-muted mt-2">Swipe the board, use the pad, or the arrow keys.</p>
    </div>
  )
}
