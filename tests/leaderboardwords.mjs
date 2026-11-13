/**
 * The leaderboards' lists, on the phone and in the database, agree; and
 * nothing a stranger can see can be rude or personal.
 *
 *   - the nickname word lists (src/data/nicknames.js) are the database's
 *     (leaderboard_first_words / leaderboard_second_words), with no repeats,
 *     and EVERY first word with EVERY second word and EVERY number from 00
 *     to 99 passes the rude-word filter: all 640,000 nicknames;
 *   - the countries (src/data/countries.js) are the database's list;
 *   - the boards and their periods are the database's (leaderboard_boards);
 *   - the per-chore XP cap and the daily cap are the database's;
 *   - Adventure shows no public board; the modes are called Adventure and
 *     Arena, exactly.
 *
 * Reads files; needs nothing running.   node tests/leaderboardwords.mjs
 */
import { readFileSync } from 'node:fs'
import { FIRST_WORDS, SECOND_WORDS, NICKNAME_CHANGE_DAYS, nicknameFrom, nicknamePieces, shuffleNickname } from '../src/data/nicknames.js'
import { COUNTRY_CODES, countryFlag } from '../src/data/countries.js'
import { BOARDS, MODES, SCOPES, BOARD_XP_PER_CHORE, BOARD_CHORES_PER_DAY, scopesFor, boardsFor, resetWords, BOARD_ERRORS } from '../src/data/leaderboards.js'
import { SCHOOL_DAILY_CHORES } from '../src/lib/schools.js'
import { wordsOk } from '../src/lib/kidWords.js'
import { totalXpForLevel } from '../src/lib/xp.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const sql = readFileSync('supabase/leaderboards.sql', 'utf8')
const sqlArray = (fn) => {
  const body = sql.match(new RegExp(`function ${fn}\\([^)]*\\)[\\s\\S]*?array\\[([\\s\\S]*?)\\]`))?.[1] || ''
  return [...body.matchAll(/'([^']*)'/g)].map((m) => m[1])
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

console.log('\n=== Nicknames: the same pieces on the phone and in the database ===')
ok(`${FIRST_WORDS.length} first words and ${SECOND_WORDS.length} second words`, FIRST_WORDS.length >= 60 && SECOND_WORDS.length >= 60)
ok('the first words are the database\'s, in order', same(FIRST_WORDS, sqlArray('leaderboard_first_words')))
ok('the second words are the database\'s, in order', same(SECOND_WORDS, sqlArray('leaderboard_second_words')))
ok('no word is repeated in either list', new Set(FIRST_WORDS).size === FIRST_WORDS.length && new Set(SECOND_WORDS).size === SECOND_WORDS.length)
ok('every word is one capitalised word of letters', [...FIRST_WORDS, ...SECOND_WORDS].every((w) => /^[A-Z][a-z]{1,11}$/.test(w)))
let bad = []
let checked = 0
for (const a of FIRST_WORDS) {
  for (const b of SECOND_WORDS) {
    if (!wordsOk(`${a} ${b}`)) bad.push(`${a} ${b}`)
    for (let n = 0; n < 100; n += 1) {
      checked += 1
      const name = nicknameFrom(a, b, n)
      if (!wordsOk(name)) bad.push(name)
    }
  }
}
ok(`all ${checked.toLocaleString('en-GB')} nicknames pass the rude-word filter`, bad.length === 0, bad.slice(0, 10).join(', '))
ok('a nickname is two words and two digits', nicknameFrom('Swift', 'Comet', 42) === 'SwiftComet42' && nicknameFrom('Swift', 'Comet', 7) === 'SwiftComet07')
ok('and reads back into its pieces', JSON.stringify(nicknamePieces('SwiftComet42')) === JSON.stringify({ first: 'Swift', second: 'Comet', number: 42 }))
ok('a name off the lists has no pieces', nicknamePieces('ArabellaComet42') === null && nicknamePieces('SwiftComet') === null && nicknamePieces('') === null)
const shuffled = Array.from({ length: 500 }, () => shuffleNickname())
ok('a shuffle only ever picks from the lists', shuffled.every((p) => nicknamePieces(nicknameFrom(p.first, p.second, p.number))))
ok('once a week, as the database says', NICKNAME_CHANGE_DAYS === 7 && sql.includes(`interval '${NICKNAME_CHANGE_DAYS} days'`))

console.log('\n=== Countries: one list ===')
ok(`${COUNTRY_CODES.length} countries, the database's, in order`, same(COUNTRY_CODES, sqlArray('leaderboard_country_ok')))
ok('each a two-letter code, once', COUNTRY_CODES.every((c) => /^[A-Z]{2}$/.test(c)) && new Set(COUNTRY_CODES).size === COUNTRY_CODES.length)
ok('a flag for each', countryFlag('GB') === '🇬🇧' && countryFlag('nope') === '🏳️')
ok('no location is ever asked for', !/geolocation|getCurrentPosition/.test(readFileSync('src/screens/parent/ParentLeaderboards.jsx', 'utf8') + readFileSync('src/data/countries.js', 'utf8')))

console.log('\n=== Boards: the same on the phone and the server ===')
const serverBoards = [...(sql.match(/function leaderboard_boards\(\)[\s\S]*?values([\s\S]*?)\$\$/)?.[1] || '').matchAll(/\('([a-z_]+)', '([a-z]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort()
const appBoards = BOARDS.flatMap((b) => b.periods.map((p) => `${b.id}:${p}`)).sort()
ok(`${appBoards.length} boards and periods, the server's`, same(appBoards, serverBoards), `app ${appBoards.join(' ')} / server ${serverBoards.join(' ')}`)
ok('at least the ones asked for', ['chores', 'xp', 'level', 'streak_best', 'streak_now', 'badges', 'arcade', 'seasons', 'guilds', 'rising'].every((b) => BOARDS.some((x) => x.id === b)))
ok('the XP cap per chore is the server\'s', sql.includes(`returns int language sql immutable as $$ select ${BOARD_XP_PER_CHORE} $$`))
ok('and the daily cap is the School League\'s own', BOARD_CHORES_PER_DAY === SCHOOL_DAILY_CHORES && sql.includes('c.n <= school_daily_chores()'))
ok('weeks say when they reset', resetWords('week') === 'Resets Monday' && resetWords('month') === 'Resets on the 1st' && resetWords('all') === null)
ok('guild boards only when guilds are on', !boardsFor({ guildsOn: false }).some((b) => b.id === 'guilds') && boardsFor({ guildsOn: true }).some((b) => b.id === 'guilds'))
ok('every refusal the server gives a board has words', ['adventure', 'no_country', 'not_a_member', 'no_board', 'not_in_list', 'name_cooldown', 'parent_only', 'no_mode', 'not_a_country']
  .every((r) => BOARD_ERRORS[r] && sql.includes(`'reason', '${r}'`) || (r === 'not_a_member' && BOARD_ERRORS[r])))

ok('the badge shelf\'s level badges are counted at the XP those levels start at, with no second curve',
  sql.includes(`(k.xp >= ${totalXpForLevel(5)})::int + (k.xp >= ${totalXpForLevel(20)})::int`) && !/least\(400/.test(sql))

console.log('\n=== Adventure and Arena ===')
ok('the two modes are called exactly Adventure and Arena', MODES.adventure.name === 'Adventure' && MODES.arena.name === 'Arena' && Object.keys(MODES).length === 2)
const adventureScopes = BOARDS.flatMap((b) => scopesFor(b.id, { mode: 'adventure', guildsOn: true }))
ok('an Adventure child is offered no public board', adventureScopes.every((s) => !SCOPES[s].public), adventureScopes.join(', '))
ok('but their family board, and their guild\'s when guilds are on', scopesFor('chores', { mode: 'adventure', guildsOn: true }).join() === 'guild,family'
  && scopesFor('chores', { mode: 'adventure', guildsOn: false }).join() === 'family')
ok('an Arena child has the worldwide and country boards', scopesFor('chores', { mode: 'arena' }).slice(0, 2).join() === 'world,country')
ok('everyone starts in Adventure, in the database', /mode\s+text not null default 'adventure'/.test(sql))
ok('only a parent switches Arena on, in the database', /if p_mode = 'arena' then\s+if not exists \(select 1 from parents where user_id = auth\.uid\(\) and family_id = v\.family_id and role = 'parent'\)/.test(sql))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
