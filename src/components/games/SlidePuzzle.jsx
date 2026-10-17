import { useRef, useState } from 'react'

/**
 * The fifteen puzzle. Slide the tiles until they are in order.
 *
 * Scrambled by making legal moves from the solved board, never by shuffling
 * the numbers: exactly half of all arrangements of a fifteen puzzle cannot be
 * solved, and there is no way to tell by looking. A board that cannot be
 * finished is the same bug as a game that cheats.
 */

const N = 4
const LAST = N * N - 1
const SOLVED = [...Array(N * N).keys()].map((i) => (i + 1) % (N * N))
const SCRAMBLE = 80

const rowOf = (i) => Math.floor(i / N)
const colOf = (i) => i % N

const neighbours = (i) => {
  const out = []
  if (rowOf(i) > 0) out.push(i - N)
  if (rowOf(i) < N - 1) out.push(i + N)
  if (colOf(i) > 0) out.push(i - 1)
  if (colOf(i) < N - 1) out.push(i + 1)
  return out
}

function scramble() {
  const tiles = [...SOLVED]
  let hole = LAST
  let last = -1
  for (let n = 0; n < SCRAMBLE; n += 1) {
    // Never undo the move just made, or eighty random moves barely move it.
    const options = neighbours(hole).filter((i) => i !== last)
    const pick = options[Math.floor(Math.random() * options.length)]
    tiles[hole] = tiles[pick]
    tiles[pick] = 0
    last = hole
    hole = pick
  }
  if (tiles.every((v, i) => v === SOLVED[i])) return scramble()
  return tiles
}

export default function SlidePuzzle({ onDone }) {
  const [tiles, setTiles] = useState(scramble)
  const [moves, setMoves] = useState(0)
  const done = useRef(false)

  const inPlace = tiles.filter((v, i) => v !== 0 && v === SOLVED[i]).length

  const slide = (i) => {
    if (done.current) return
    const hole = tiles.indexOf(0)
    if (!neighbours(hole).includes(i)) return
    const next = [...tiles]
    next[hole] = next[i]
    next[i] = 0
    const count = moves + 1
    setTiles(next)
    setMoves(count)

    if (next.every((v, j) => v === SOLVED[j])) {
      done.current = true
      // Solving it is worth most of the score; doing it tidily is the rest.
      const tidiness = Math.max(0, Math.min(1, (260 - count) / 200))
      onDone(Math.round(72 + tidiness * 28))
    }
  }

  const give = () => {
    if (done.current) return
    done.current = true
    onDone(Math.round((inPlace / LAST) * 45))
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">Get 1 to 15 in order, gap at the end.</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {inPlace}/{LAST} in place · {moves} {moves === 1 ? 'move' : 'moves'}
      </p>

      <div
        className="grid gap-2 mx-auto p-2"
        style={{
          maxWidth: 290,
          gridTemplateColumns: `repeat(${N}, 1fr)`,
          borderRadius: 16,
          background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
        }}
      >
        {tiles.map((v, i) => (v === 0 ? (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`hole-${i}`} style={{ aspectRatio: '1' }} />
        ) : (
          <button
            key={v}
            type="button"
            onClick={() => slide(i)}
            aria-label={`Tile ${v}`}
            className="grid place-items-center font-display font-extrabold transition-transform active:scale-95"
            style={{
              aspectRatio: '1',
              borderRadius: 12,
              fontSize: 22,
              border: '2px solid rgb(255 255 255 / 0.12)',
              color: v === SOLVED[i] ? '#fff' : 'var(--ink)',
              background: v === SOLVED[i]
                ? 'var(--good)'
                : 'color-mix(in srgb, var(--accent) 22%, transparent)',
              transition: 'background 160ms ease, color 160ms ease',
            }}
          >
            {v}
          </button>
        )))}
      </div>

      <button type="button" className="btn btn-ghost mt-4" onClick={give}>
        I&apos;m stuck — take what I&apos;ve got
      </button>
      <p className="text-xs text-muted mt-2">
        Green means that tile is already home. No timer.
      </p>
    </div>
  )
}
