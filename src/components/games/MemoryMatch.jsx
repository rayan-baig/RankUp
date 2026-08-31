import { useEffect, useMemo, useRef, useState } from 'react'

const FACES = ['🧦', '🍎', '🪥', '📚', '🧸', '🌿', '🥄', '⭐']

/** Fisher–Yates, so the deal is actually random rather than nearly sorted. */
function shuffled(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Eight pairs. Fewer flips and less time score better. */
export default function MemoryMatch({ onDone }) {
  const deck = useMemo(
    () => shuffled([...FACES, ...FACES].map((face, i) => ({ id: i, face }))),
    [],
  )
  const [found, setFound] = useState([])
  const [open, setOpen] = useState([])
  const [flips, setFlips] = useState(0)
  const started = useRef(Date.now())
  const over = useRef(false)

  useEffect(() => {
    if (found.length !== FACES.length || over.current) return
    over.current = true
    const seconds = (Date.now() - started.current) / 1000
    // Sixteen flips is perfect play; ninety seconds is a gentle pace.
    const flipScore = Math.max(0, 100 - (flips - 16) * 3)
    const timeScore = Math.max(0, 100 - Math.max(0, seconds - 45) * 1.5)
    onDone(Math.round(Math.min(100, flipScore * 0.6 + timeScore * 0.4)))
  }, [found, flips, onDone])

  const flip = (card) => {
    if (over.current || open.length === 2) return
    if (found.includes(card.face) || open.some((c) => c.id === card.id)) return
    const next = [...open, card]
    setOpen(next)
    setFlips((n) => n + 1)
    if (next.length === 2) {
      const match = next[0].face === next[1].face
      setTimeout(() => {
        if (match) setFound((f) => [...f, next[0].face])
        setOpen([])
      }, match ? 320 : 700)
    }
  }

  return (
    <div>
      <div className="flex justify-between text-sm font-semibold mb-2">
        <span>Pairs {found.length}/{FACES.length}</span>
        <span>Flips {flips}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {deck.map((card) => {
          const shown = found.includes(card.face) || open.some((c) => c.id === card.id)
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => flip(card)}
              aria-label={shown ? card.face : 'Face-down card'}
              className="aspect-square grid place-items-center text-2xl card-flat"
              style={{
                background: shown ? 'var(--surface)' : 'var(--accent)',
                opacity: found.includes(card.face) ? 0.45 : 1,
                transition: 'background .18s ease, opacity .18s ease',
              }}
            >
              {shown ? card.face : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
