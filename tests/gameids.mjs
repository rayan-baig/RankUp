/**
 * The app's game list and the database's game list must be the same list.
 *
 * play_minigame() in supabase/sync.sql refuses any game id it does not
 * recognise. That is right — it stops a crafted request claiming a score in
 * a game that does not exist — but it means a game added to the app and not
 * to that list can be played and finished while the server quietly declines
 * to pay for it. To a child that is indistinguishable from the app eating
 * their winnings, and nothing in the app would show it: the call fails in
 * the background and the screen has already said "+4 coins".
 *
 * It happened. Ten games were added and the list was not touched. So this
 * reads both files and compares them, and it is deliberately dumb about it —
 * a test that parsed the SQL cleverly could be fooled by the same edit that
 * breaks the thing.
 */
import { readFileSync } from 'node:fs'
import { MINIGAMES } from '../src/data/minigames.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const sql = readFileSync(new URL('../supabase/sync.sql', import.meta.url), 'utf8')

// The guard reads `if p_game not in ( ... ) then`.
const guard = sql.match(/if p_game not in \(([\s\S]*?)\) then/)
ok('the guard is still there to check', Boolean(guard))

if (guard) {
  const inSql = new Set([...guard[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
  const inApp = new Set(MINIGAMES.map((g) => g.id))

  const missing = [...inApp].filter((id) => !inSql.has(id))
  ok(`every one of the ${inApp.size} games the app ships is accepted by the database`,
    missing.length === 0,
    missing.length ? `the database would refuse to pay for: ${missing.join(', ')}` : '')

  const extra = [...inSql].filter((id) => !inApp.has(id))
  ok('and the database accepts nothing the app does not ship',
    extra.length === 0,
    extra.length ? `left behind after a game was removed: ${extra.join(', ')}` : '')
}

console.log('\n=== Every game is wired up in the app too ===')
const screen = readFileSync(new URL('../src/screens/kid/KidArcade.jsx', import.meta.url), 'utf8')
const wired = MINIGAMES.filter((g) => !new RegExp(`\\b${g.id}:`).test(screen)).map((g) => g.id)
ok('every listed game has a component behind its card', wired.length === 0,
  wired.length ? `listed but would open nothing: ${wired.join(', ')}` : '')

const ids = MINIGAMES.map((g) => g.id)
ok('and no id is used twice', new Set(ids).size === ids.length)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
