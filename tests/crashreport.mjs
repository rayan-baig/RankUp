/**
 * What a crash report may carry off a family's phone: nothing personal.
 *
 * An error message quotes the value that caused it, and here those values are
 * a child's name, a parent's email, a note a child typed, a pairing code, the
 * sign-in token in the address bar. scrub() and scrubWhere() are what every
 * report passes through before it is sent; the database scrubs again
 * (supabase/test/13-crashes.sql).
 */
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.window = globalThis.window || { location: { search: '' }, addEventListener() {}, removeEventListener() {} }
const { scrub, scrubWhere } = await import('../src/lib/crashReport.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const names = ['Ava', 'Noah', 'The Rivera family', 'Sam']
const cases = [
  ['a child\'s name', 'Cannot read properties of undefined (reading Ava)', /Ava/],
  ['a name inside a longer sentence', "Noah's quest failed to load", /Noah/],
  ['the family name', 'No guild for The Rivera family', /Rivera/],
  ['an email', 'Login failed for sam.rivera@example.com', /@|rivera/i],
  ['a note the child typed', 'Unexpected token in "I tidied my room and Mum said"', /tidied|Mum/],
  ['a pairing code', 'code 482913 was rejected', /482913/],
  ['a PIN', 'PIN 4821 did not match', /4821/],
  ['a sign-in token', 'Bad JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl', /eyJ/],
  ['an access token in a URL', 'fetch https://x.test/cb?access_token=abc123def&type=signup', /abc123def/],
  ['an account id', 'No row for 8a444444-0000-4000-8000-0000000000a1', /8a444444/],
]
for (const [what, message, bad] of cases) {
  const out = scrub(message, names)
  ok(`${what} is taken out`, !bad.test(out), out)
}
ok('the shape of the error is kept', scrub('rewards.map is not a function', names) === 'rewards.map is not a function')
ok('a word that only starts like a name is left alone', scrub('Avalanche of renders', names) === 'Avalanche of renders')

ok('the route keeps its screen and loses its id', scrubWhere('/kid/quest/q_8f9a2b3c4d5e6f70') === '/kid/quest/:id', scrubWhere('/kid/quest/q_8f9a2b3c4d5e6f70'))
ok('and its query and anything after a #', scrubWhere('/join?code=123456#access_token=eyJ') === '/join')
ok('a plain route is unchanged', scrubWhere('/parent/assign') === '/parent/assign')

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
