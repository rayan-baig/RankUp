/** "1 chore", "3 chores": a count with its word, singular for exactly one. */
export const plural = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`
