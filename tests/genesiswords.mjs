/**
 * Theme Genesis, the rules that need nothing running.
 *
 *   - the rude-word filter: what it stops, and what it lets through;
 *   - the phone and the database hold the same lists (the words, the
 *     mascots, the patterns, the vibes, the base themes, the lengths), so a
 *     changed app cannot store anything the database would not;
 *   - whatever colours a child picks, every word stays readable;
 *   - a child's theme has exactly the structure of the built-in theme it is
 *     made from: the same forms at the same levels, the same worlds at the
 *     same levels. A look and some names, never a rule;
 *   - a theme is small, and the Seasons the app keeps hold only what it reads;
 *   - no child's text goes anywhere but RankUp's own database: no outside
 *     service, no AI, and never shown as markup.
 *
 *   node tests/genesiswords.mjs
 */
import { readFileSync } from 'node:fs'
import { wordsOk, plainName, BLOCKED_WORDS, BLOCKED_PARTS } from '../src/lib/kidWords.js'
import {
  MASCOTS, PATTERN_IDS, VIBES, BASES, NAME_MAX, WORLD_MAX, CURRENCY_MAX, CREDIT_MAX, DESIGN_MAX, PALETTES,
  readablePalette, contrast, buildTheme, designFromVibe, cleanDesign, themeProblem, designBytes, cleanSeasons,
  seasonToCelebrate, SEASON_NEWS_DAYS,
} from '../src/data/themeGenesis.js'
import { KID_THEME_MAP } from '../src/data/kidThemes.js'
import { tiersFor } from '../src/lib/avatarTiers.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== The rude-word filter ===')
const clean = ['Star Voyage', 'Class Act', 'Scrap Yard', 'Grass Lands', 'Cocktail Island', 'Dickens Town', 'Assemble', 'Hello Kitty', 'Bass Drop', '']
const rude = ['big ass', 'Sh1t World', 'f u c k', 'FUUUCK land', '$h!t', 'Nazis', 'bitchy', 'p0rn', 'WhoreHouse', 'kys']
for (const t of clean) ok(`"${t}" passes`, wordsOk(t))
for (const t of rude) ok(`"${t}" is stopped`, !wordsOk(t))
ok('a rude name cannot be saved, and says why in a child\'s words',
  /does not allow/.test(themeProblem('Poo Sh1t', designFromVibe('space').design) || ''))
ok('nor a rude world name', /World 3/.test(themeProblem('Fine', { ...designFromVibe('space').design, worlds: ['A', 'B', 'Big Ass', 'D'] }) || ''))
ok('nor a rude coin name', /coin/.test(themeProblem('Fine', { ...designFromVibe('space').design, cur: 'Shitcoins' }) || ''))
ok('a name is plain text: no markup, no control characters, single spaces',
  plainName('  <b>Bold</b>\u0007  World ', 24) === 'bBold/b World')
ok('and held to its length, an emoji counted as one', [...plainName('🚀'.repeat(40), NAME_MAX)].length === NAME_MAX)

console.log('\n=== The phone and the database hold the same lists ===')
const sql = readFileSync(new URL('../supabase/sync.sql', import.meta.url), 'utf8')
const fn = (name) => sql.slice(sql.indexOf(`create or replace function ${name}`), sql.indexOf('end $$;', sql.indexOf(`create or replace function ${name}`)))
const arr = (text, varName) => {
  const m = text.match(new RegExp(`${varName} text\\[\\] := array\\[([^\\]]*)\\]`))
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : []
}
const words = fn('kid_words_ok')
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
ok('the whole words', same(arr(words, 'v_words'), BLOCKED_WORDS), `${arr(words, 'v_words').length} vs ${BLOCKED_WORDS.length}`)
ok('the pieces', same(arr(words, 'v_parts'), BLOCKED_PARTS))
ok('the same look-alike letters', words.includes("translate(lower(p_text), '013457@$!', 'oieastasi')"))
const design = fn('kid_theme_design_ok')
const inList = (key) => {
  const m = design.match(new RegExp(`p_design->>'${key}', ''\\) not in \\(([^)]*)\\)`))
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : []
}
ok('the mascots', same(inList('mascot'), MASCOTS), inList('mascot').join(' '))
ok('the patterns', same(inList('pat'), PATTERN_IDS))
ok('the vibes', same(inList('vibe'), VIBES.map((v) => v.id)))
ok('the base themes', same(inList('base'), BASES))
ok('the keys a design may have', same(design.match(/k not in \(([^)]*)\)/)?.[1].match(/'[^']*'/g).map((x) => x.slice(1, -1)) || [],
  Object.keys(designFromVibe('space').design)))
ok(`the lengths: name ${NAME_MAX}, world ${WORLD_MAX}, coins ${CURRENCY_MAX}, design ${DESIGN_MAX}, credit ${CREDIT_MAX}`,
  sql.includes(`kid_theme_name_ok(new.name, ${NAME_MAX})`) && sql.includes(`kid_theme_name_ok(v_world #>> '{}', ${WORLD_MAX})`)
    && sql.includes(`kid_theme_name_ok(p_design->>'cur', ${CURRENCY_MAX})`) && sql.includes(`length(p_design::text) > ${DESIGN_MAX}`)
    && sql.includes(`length(credit) <= ${CREDIT_MAX}`))
ok('and five themes a child', sql.includes('>= 5 then') && /MAX_KID_THEMES = 5\b/.test(readFileSync(new URL('../src/data/themeGenesis.js', import.meta.url), 'utf8')))

console.log('\n=== Whatever colours are picked, the words stay readable ===')
const floors = [['ink', 'bg', 4.5], ['ink', 'surface', 4.5], ['inkMuted', 'surface', 4.5], ['accent', 'surface', 3], ['accent2', 'surface', 3], ['accent', 'bg', 3]]
const unreadable = (c) => floors.filter(([f, b, floor]) => contrast(c[f], c[b]) < floor).map(([f, b]) => `${f} on ${b}`)
const curated = PALETTES.flatMap((p) => unreadable(readablePalette(p).colors).map((x) => `${p.id}: ${x}`))
ok(`every curated palette (${PALETTES.length})`, curated.length === 0, curated.join('; '))
let seed = 7
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return `#${Math.floor((seed / 2147483648) * 0xffffff).toString(16).padStart(6, '0')}` }
const bad = []
for (let i = 0; i < 3000 && bad.length < 5; i += 1) {
  const picked = { bg: rnd(), a: rnd(), a2: rnd() }
  const theme = buildTheme({ id: 'custom-x', name: 'x', design: { ...designFromVibe('space').design, ...picked } })
  for (const c of [theme.colors, ...theme.evolutions.map((e) => e.colors)]) {
    const u = unreadable(c)
    if (u.length) bad.push(`${JSON.stringify(picked)}: ${u.join(', ')}`)
  }
}
ok('3,000 random mixes, at every world', bad.length === 0, bad.join('; '))

console.log('\n=== A look and some names, over a built-in theme\'s structure ===')
for (const vibe of VIBES) {
  const { name, design: d } = designFromVibe(vibe.id)
  const theme = buildTheme({ id: 'custom-x', name, design: d })
  const base = KID_THEME_MAP[d.base]
  ok(`${vibe.label}: the forms and worlds of ${base.name}, at the same levels`,
    JSON.stringify(tiersFor(theme)) === JSON.stringify(tiersFor(base))
      && JSON.stringify(theme.evolutions.map((e) => e.level)) === JSON.stringify(base.evolutions.map((e) => e.level))
      && theme.evolutions.every((e, i) => e.label === d.worlds[i]) && !theme.evolutions.some((e) => e.requires || e.chapter))
}
ok('a theme carries no rules: nothing about XP, coins or rewards in it', !/xp|reward|multiplier|price|cost/i.test(Object.keys(buildTheme({ id: 'x', name: 'x', design: {} })).join(' ')))
ok('anything unknown in a design is replaced, never kept', JSON.stringify(cleanDesign({ mascot: '💩', pat: 'hack', bg: 'red', note: 'x' })).match(/💩|hack|red|note/) === null)

console.log('\n=== Small ===')
const longest = { ...designFromVibe('space').design, cur: 'W'.repeat(CURRENCY_MAX), worlds: Array(4).fill('W'.repeat(WORLD_MAX)) }
ok(`the longest theme a child can make is ${designBytes('N'.repeat(NAME_MAX), longest)} characters (under 700)`,
  JSON.stringify(cleanDesign(longest)).length <= DESIGN_MAX)
ok('and five of them are under 4 KB', designBytes('N'.repeat(NAME_MAX), longest) * 5 < 4096)
const seasons = cleanSeasons([{ number: 2, name: 'Frost', starts_on: '2026-12-01', family_id: 'x', themes: [{ id: 't1', name: 'Snow', design: longest, credit: 'Sam', kid_id: 'k' }] }])
ok('the Seasons kept on a phone hold only what the app reads', !/family_id|kid_id/.test(JSON.stringify(seasons)) && seasons[0].themes[0].credit === 'Sam')
const now = Date.parse('2026-12-03T10:00:00Z')
ok('"New Season!" once, for a Season that started in the last fortnight',
  seasonToCelebrate({ seasons, seen: {} }, now)?.number === 2
    && seasonToCelebrate({ seasons, seen: { 'season:2': 1 } }, now) === null
    && seasonToCelebrate({ seasons, seen: {} }, Date.parse('2026-11-30T10:00:00Z')) === null
    && seasonToCelebrate({ seasons, seen: {} }, now + (SEASON_NEWS_DAYS + 1) * 86400000) === null)

console.log('\n=== Children\'s text goes nowhere but RankUp\'s database ===')
const files = ['src/lib/kidWords.js', 'src/data/themeGenesis.js', 'src/screens/kid/ThemeGenesis.jsx', 'src/components/ThemePreview.jsx',
  'src/components/KidThemesParent.jsx', 'src/components/SeasonMoment.jsx', 'src/screens/OperatorThemes.jsx', 'api/operator-themes.js']
const code = files.map((f) => [f, readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')])
const bare = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
ok('no outside address anywhere in them', code.every(([, t]) => !/https?:\/\//i.test(bare(t))),
  code.filter(([, t]) => /https?:\/\//i.test(bare(t))).map(([f]) => f).join(', '))
ok('and the child\'s side makes no request of its own: it only saves to the family\'s sync',
  code.filter(([f]) => !/operator/i.test(f)).every(([, t]) => !/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(bare(t))))
ok('and never as markup', code.every(([, t]) => !/dangerouslySetInnerHTML|innerHTML/.test(t)))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
