/**
 * The impostor puzzle, generated so that it always has exactly one answer.
 *
 * Five crewmates, one impostor. Everybody makes one statement about somebody
 * else: either an accusation ("it was them") or a vouch ("it was not them").
 * The crew tell the truth. The impostor lies.
 *
 * The puzzle is built by picking an impostor, writing statements that fit,
 * and then testing all five candidates against those statements. If more
 * than one candidate survives, the puzzle is thrown away and another is
 * generated. That is the only honest way to do it: a hand-designed pattern
 * looks solvable and quietly is not, and a child who reasons correctly to an
 * answer the game calls wrong learns that thinking does not pay here.
 */

export const CREW = [
  { id: 0, name: 'Red', colour: '#ef4444' },
  { id: 1, name: 'Blue', colour: '#3b82f6' },
  { id: 2, name: 'Green', colour: '#22c55e' },
  { id: 3, name: 'Yellow', colour: '#eab308' },
  { id: 4, name: 'Purple', colour: '#a855f7' },
]

/** Is a statement true, if `suspect` is the impostor? */
const holds = (s, suspect) => (s.kind === 'accuse' ? s.about === suspect : s.about !== suspect)

/**
 * Could `suspect` be the impostor? Only if every crewmate's statement is
 * true and the impostor's own statement is false.
 */
export function consistent(statements, suspect) {
  return statements.every((s) => (
    s.from === suspect ? !holds(s, suspect) : holds(s, suspect)
  ))
}

export function solve(statements) {
  return CREW.map((c) => c.id).filter((id) => consistent(statements, id))
}

export function makePuzzle(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)]

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const impostor = Math.floor(random() * CREW.length)
    const statements = CREW.map(({ id }) => {
      const others = CREW.map((c) => c.id).filter((o) => o !== id)
      if (id === impostor) {
        // The impostor must say something false: accuse somebody innocent,
        // or vouch for themselves. Vouching for yourself is the tell most
        // children spot first, so it is only one of the options.
        return random() < 0.55
          ? { from: id, kind: 'accuse', about: pick(others.filter((o) => o !== impostor)) }
          : { from: id, kind: 'clear', about: impostor }
      }
      // Crew tell the truth, which they can do either way round.
      return random() < 0.4
        ? { from: id, kind: 'accuse', about: impostor }
        : { from: id, kind: 'clear', about: pick(others.filter((o) => o !== impostor)) }
    })

    const answers = solve(statements)
    if (answers.length === 1 && answers[0] === impostor) {
      return { statements, impostor }
    }
  }
  return null
}

export const sentence = (s) => {
  const about = CREW[s.about].name
  return s.kind === 'accuse'
    ? `It was ${about}. I saw them.`
    : `${about} is not the impostor — they were with me.`
}
