/**
 * The match-three board, as maths with no React in it.
 *
 * Kept separate so the two rules that decide whether the game is playable
 * can be tested directly, because neither is visible in a screenshot:
 *
 *  - A fresh board must contain no matches already. Otherwise it detonates
 *    the moment it appears and the player is handed points they did not earn.
 *  - A board must always have at least one legal swap. A board with no move
 *    is a dead end, and the player has no way of knowing it is not their
 *    fault.
 *
 * Both are checked in tests/sweets.mjs over thousands of generated boards.
 */

export const SIZE = 7
export const KINDS = 6

export const at = (board, r, c) => board[r * SIZE + c]
const put = (board, r, c, v) => { board[r * SIZE + c] = v }

/** Every run of three or more in a row or column, as a set of indexes. */
export function findMatches(board) {
  const hit = new Set()
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = at(board, r, c)
      if (v === null) continue
      if (c + 2 < SIZE && at(board, r, c + 1) === v && at(board, r, c + 2) === v) {
        let k = c
        while (k < SIZE && at(board, r, k) === v) { hit.add(r * SIZE + k); k += 1 }
      }
      if (r + 2 < SIZE && at(board, r + 1, c) === v && at(board, r + 2, c) === v) {
        let k = r
        while (k < SIZE && at(board, k, c) === v) { hit.add(k * SIZE + c); k += 1 }
      }
    }
  }
  return hit
}

export const swapped = (board, a, b) => {
  const next = [...board]
  const tmp = next[a]
  next[a] = next[b]
  next[b] = tmp
  return next
}

export const adjacent = (a, b) => {
  const ra = Math.floor(a / SIZE)
  const ca = a % SIZE
  const rb = Math.floor(b / SIZE)
  const cb = b % SIZE
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1
}

/** Is there any swap at all that would match something? */
export function hasMove(board) {
  for (let i = 0; i < board.length; i += 1) {
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    // Only right and down: every pair gets looked at once this way.
    for (const j of [c + 1 < SIZE ? i + 1 : -1, r + 1 < SIZE ? i + SIZE : -1]) {
      if (j < 0) continue
      if (findMatches(swapped(board, i, j)).size) return true
    }
  }
  return false
}

/** A board with nothing already matching, and at least one move in it. */
export function makeBoard(random = Math.random) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const board = new Array(SIZE * SIZE).fill(null)
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        // Choose from the kinds that would not complete a run, so the board
        // comes out clean instead of being generated and thrown away.
        const banned = new Set()
        if (c >= 2 && at(board, r, c - 1) === at(board, r, c - 2)) banned.add(at(board, r, c - 1))
        if (r >= 2 && at(board, r - 1, c) === at(board, r - 2, c)) banned.add(at(board, r - 1, c))
        const allowed = [...Array(KINDS).keys()].filter((k) => !banned.has(k))
        put(board, r, c, allowed[Math.floor(random() * allowed.length)])
      }
    }
    if (hasMove(board)) return board
  }
  // Unreachable in practice; a clean board without a move is vanishingly rare.
  return new Array(SIZE * SIZE).fill(0).map((_, i) => i % KINDS)
}

/**
 * Clear the matched cells, drop everything above them down, and refill the
 * top. Returns the new board and how many were cleared.
 */
export function collapse(board, hit, random = Math.random) {
  const next = [...board]
  hit.forEach((i) => { next[i] = null })
  for (let c = 0; c < SIZE; c += 1) {
    const column = []
    for (let r = SIZE - 1; r >= 0; r -= 1) {
      const v = at(next, r, c)
      if (v !== null) column.push(v)
    }
    for (let r = SIZE - 1; r >= 0; r -= 1) {
      const v = column[SIZE - 1 - r]
      put(next, r, c, v === undefined ? Math.floor(random() * KINDS) : v)
    }
  }
  return { board: next, cleared: hit.size }
}
