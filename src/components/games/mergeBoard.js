/**
 * The 2048 board, as maths with no React in it.
 *
 * Kept separate from the screen so it can be tested directly — the two rules
 * that make the game honest (a dead move is not a move, and a fresh merge
 * cannot merge again) are invisible on screen and are checked exhaustively in
 * tests/merge.mjs.
 */
export const N = 4
// 2048 itself is 2^11. Reaching it is a perfect score; every doubling before
// it is worth ten points, so a child who gets to 256 still scores 70.
export const TOP = 11

export const EMPTY = () => new Array(N * N).fill(0)

export function spawn(cells) {
  const free = cells.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)
  if (!free.length) return cells
  const next = [...cells]
  next[free[Math.floor(Math.random() * free.length)]] = Math.random() < 0.9 ? 2 : 4
  return next
}

/** One row slid left, with merges. Every direction is this plus rotation. */
export function slideRow(row) {
  const tight = row.filter((v) => v !== 0)
  const out = []
  for (let i = 0; i < tight.length; i += 1) {
    // A tile that has just merged cannot merge again in the same move, which
    // is why this skips ahead rather than looping back over `out`.
    if (tight[i] === tight[i + 1]) { out.push(tight[i] * 2); i += 1 } else out.push(tight[i])
  }
  while (out.length < N) out.push(0)
  return out
}

export const rowOf = (cells, r) => cells.slice(r * N, r * N + N)
export const colOf = (cells, c) => [0, 1, 2, 3].map((r) => cells[r * N + c])

export function move(cells, dir) {
  const next = EMPTY()
  for (let i = 0; i < N; i += 1) {
    const line = dir === 'left' || dir === 'right' ? rowOf(cells, i) : colOf(cells, i)
    const back = dir === 'right' || dir === 'down'
    const slid = back ? slideRow([...line].reverse()).reverse() : slideRow(line)
    for (let j = 0; j < N; j += 1) {
      if (dir === 'left' || dir === 'right') next[i * N + j] = slid[j]
      else next[j * N + i] = slid[j]
    }
  }
  return next
}

export const same = (a, b) => a.every((v, i) => v === b[i])
export const stuck = (cells) => ['left', 'right', 'up', 'down'].every((d) => same(move(cells, d), cells))
