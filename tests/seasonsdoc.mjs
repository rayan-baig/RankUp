/**
 * docs/SEASONS.md keeps the shape a monthly scheduled task reads (0.23.0):
 *
 *   - one line `Launch date: not yet` or `Launch date: YYYY-MM-DD`;
 *   - the rule, in its own `Rule:` line: each Season starts 4 months after
 *     the previous one;
 *   - a table `| Season | Name | Starts | Built in version |`, one row per
 *     Season, numbered from 1 with no gap, each built in a version that has a
 *     CHANGELOG entry;
 *   - and the database's rule and Season 1's name agree with it.
 */
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const doc = readFileSync(new URL('../docs/SEASONS.md', import.meta.url), 'utf8')
const lines = doc.split('\n')
const sql = readFileSync(new URL('../supabase/sync.sql', import.meta.url), 'utf8')
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

console.log('\n=== The shape the monthly task reads ===')
ok('it says how it is read, at the top', /^## How this file is read/m.test(doc) && doc.indexOf('How this file is read') < doc.indexOf('Launch date: '))
const launch = lines.filter((l) => l.startsWith('Launch date: '))
ok('exactly one "Launch date:" line', launch.length === 1, String(launch.length))
ok('saying "not yet" or a day', /^Launch date: (not yet|\d{4}-\d{2}-\d{2})$/.test(launch[0] || ''), launch[0])
const rule = lines.filter((l) => l.startsWith('Rule: '))
ok('one rule line: each Season starts 4 months after the previous one', rule.length === 1 && /4 months after the previous one/.test(rule[0]))
const header = lines.findIndex((l) => l.trim() === '| Season | Name | Starts | Built in version |')
ok('the table, with exactly these four columns', header > 0 && /^\|(\s*-+\s*\|){4}$/.test(lines[header + 1].replace(/:/g, '')))
const rows = []
for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i += 1) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()))
ok('Season 1 is there, the Founding Season', rows[0]?.[0] === '1' && rows[0]?.[1] === 'Founding Season', JSON.stringify(rows[0]))
ok('numbered from 1 with no gap', rows.every((r, i) => r[0] === String(i + 1)))
ok('each start a day, or "launch date" for Season 1 before launch', rows.every((r, i) => /^\d{4}-\d{2}-\d{2}$/.test(r[2]) || (i === 0 && r[2] === 'launch date')))
ok('each built in a version with a CHANGELOG entry', rows.every((r) => /^\d+\.\d+\.\d+$/.test(r[3]) && changelog.includes(`## ${r[3]} `)), rows.map((r) => r[3]).join(', '))

console.log('\n=== The database follows the same rule ===')
ok('season_start_for adds 4 months a Season', /make_interval\(months => 4 \* \(p_number - 1\)\)/.test(sql))
ok('and calls Season 1 the Founding Season', /when p_number = 1 then 'Founding Season'/.test(sql))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
