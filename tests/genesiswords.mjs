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
 *     service, no AI, and never shown as markup;
 *   - "What's it inspired by?": every alias leads to its topic, a brand or a
 *     game for older players never comes out in the theme, nothing violent
 *     is in any topic, an unknown idea finds the closest topic or "Something
 *     new", a rude idea is refused, and the theme it makes is complete,
 *     still editable and the same size as any other;
 *   - a theme sent in for a Season carries no other company's name: the
 *     phone and the database hold the same list, and ordinary words pass.
 *
 *   node tests/genesiswords.mjs
 */
import { readFileSync } from 'node:fs'
import { wordsOk, brandsOk, plainName, BLOCKED_WORDS, BLOCKED_PARTS, BRAND_NAMES } from '../src/lib/kidWords.js'
import {
  MASCOTS, PATTERN_IDS, VIBES, BASES, NAME_MAX, WORLD_MAX, CURRENCY_MAX, CREDIT_MAX, DESIGN_MAX, PALETTES,
  readablePalette, contrast, buildTheme, designFromVibe, cleanDesign, themeProblem, designBytes, cleanSeasons,
  seasonToCelebrate, SEASON_NEWS_DAYS, seasonProblem, SEASON_BRAND_MESSAGE,
} from '../src/data/themeGenesis.js'
import {
  TOPICS, NEW_TOPIC, BRAND_ALIASES, findTopic, inspire, designFromTopic, IDEA_RUDE,
} from '../src/data/inspirations.js'
import { reducer } from '../src/state/reducer.js'
import { createInitialState } from '../src/state/initialState.js'
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
const curated = [...PALETTES, ...TOPICS].flatMap((p) => unreadable(readablePalette(p).colors).map((x) => `${p.id}: ${x}`))
ok(`every curated palette (${PALETTES.length}) and every inspiration's colours (${TOPICS.length})`, curated.length === 0, curated.join('; '))
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

console.log('\n=== "What\'s it inspired by?": the library ===')
ok(`about fifty to sixty topics (${TOPICS.length})`, TOPICS.length >= 50 && TOPICS.length <= 60)
ok('each with its own id', new Set(TOPICS.map((t) => t.id)).size === TOPICS.length && !TOPICS.some((t) => t.id === NEW_TOPIC.id))
const aliasMiss = Object.entries(BRAND_ALIASES).filter(([alias, id]) => {
  const found = findTopic(alias)
  return found.how !== 'match' || found.topic.id !== id
}).map(([alias, id]) => `${alias} → ${findTopic(alias).topic.id} (want ${id})`)
ok(`every one of the ${Object.keys(BRAND_ALIASES).length} brand and game aliases leads to its topic`, aliasMiss.length === 0, aliasMiss.join('; '))
ok('and every alias points at a topic that exists', Object.values(BRAND_ALIASES).every((id) => TOPICS.some((t) => t.id === id)))
const wordMiss = TOPICS.flatMap((t) => [t.label, ...t.words].map((w) => [w, t.id])).filter(([w, id]) => {
  const found = findTopic(w)
  return found.how !== 'match' || !TOPICS.find((t) => t.id === found.topic.id)[found.topic.id === id ? 'id' : 'words']
    .includes?.(w) && found.topic.id !== id
}).map(([w, id]) => `${w} → ${findTopic(w).topic.id} (listed under ${id})`)
ok('every topic\'s own words lead to a topic that lists them', wordMiss.length === 0, wordMiss.slice(0, 8).join('; '))
const labelMiss = TOPICS.filter((t) => findTopic(t.label).topic.id !== t.id).map((t) => t.label)
ok('and every topic\'s name leads to that topic', labelMiss.length === 0, labelMiss.join(', '))
ok('a brand alias wins over a plain word inside it ("rocket league" is Car Soccer, not Space)',
  findTopic('rocket league').topic.id === 'carsoccer' && findTopic('rocket').topic.id === 'space')
ok('typed any way: capitals, accents, spaces and hyphens',
  ['F1', 'Formula-1', 'FORMULA ONE', 'nascar!!'].every((t) => findTopic(t).topic.id === 'racing')
    && ['Pokémon', 'POKEMON'].every((t) => findTopic(t).topic.id === 'creatures')
    && ['Mine Craft', 'minecraft world'].every((t) => findTopic(t).topic.id === 'blocky')
    && ['fifa', 'EA FC'].every((t) => findTopic(t).topic.id === 'football'))

console.log('\n=== "f1", "gta", and the rest ===')
const f1 = inspire('f1')
ok('"f1" gives Racing, and says so', f1.ok && f1.topic.id === 'racing' && f1.line === 'Racing vibes: checkered flags, red and black, 🏎️', f1.line)
ok('with a racing name, the checkers, red and black, a 🏎️ and racing worlds',
  f1.name === 'Speed Circuit' && f1.design.pat === 'checkers' && f1.design.mascot === '🏎️' && f1.design.a === '#ff1e1e'
    && f1.design.worlds.includes('Pit Lane') && f1.design.cur === 'Turbo Coins', JSON.stringify(f1))
const gta = inspire('gta')
ok('"gta" gives City Nights: a neon city, cars and skyscrapers', gta.ok && gta.topic.id === 'citynights'
  && gta.line === 'City Nights vibes: a neon city, cars and skyscrapers, 🌃' && gta.name === 'City Nights', gta.line)
ok('as do "Grand Theft Auto" and "GTA 5"', ['Grand Theft Auto', 'GTA 5', 'gta v'].every((t) => inspire(t).topic.id === 'citynights'))
const VIOLENT = /\b(weapons?|guns?|gunfire|swords?|knife|knives|daggers?|axes?|spears?|bows? and arrows?|arrows?|bombs?|grenades?|rifles?|pistols?|bullets?|ammo|snipers?|cannons?|shoot\w*|shot|kill\w*|blood\w*|bleed\w*|wars?|battles?|fight\w*|attack\w*|crime\w*|criminals?|steal|steals|stealing|stolen?|theft|thie(f|ves)|robb\w*|heists?|gangs?|gangsters?|mafia|dead|death|dies?|dying|murder\w*|explo(de|sion)\w*|armies|army|soldiers?|punch\w*|zombies?|jail|prison|drugs?|police chase|wanted|violen\w*|shuriken)\b/i
const VIOLENT_EMOJI = ['🔫', '🗡', '⚔', '💣', '🔪', '🪓', '🏹', '🛡', '💥', '🧨', '💀', '☠', '🩸', '⚰', '🚔', '🚨', '🥊', '🪖']
const topicText = (t) => [t.label, t.says, t.cur, ...t.names, ...t.worlds, ...t.words].join(' | ')
const violent = [...TOPICS, NEW_TOPIC].filter((t) => VIOLENT.test(topicText(t))).map((t) => `${t.id}: ${topicText(t).match(VIOLENT)[0]}`)
ok('no topic has a weapon, a fight or a crime in it, in any word', violent.length === 0, violent.join('; '))
ok('nor any such emoji, in a topic or in the mascots',
  ![...TOPICS.map((t) => `${t.mascot}${topicText(t)}`), ...MASCOTS].some((x) => VIOLENT_EMOJI.some((e) => x.includes(e))))
ok('and the City Nights a mature game leads to says nothing violent', !VIOLENT.test(`${gta.line} ${gta.name} ${JSON.stringify(gta.design)}`))
const MATURE = ['gta', 'grand theft auto', 'call of duty', 'mortal kombat', 'red dead redemption', 'the last of us', 'resident evil',
  'god of war', 'cyberpunk', 'hitman', 'battlefield', 'counter strike', 'dead by daylight', 'fnaf', 'mafia']
ok(`every game for older players (${MATURE.length} checked) goes to a gentle topic`, MATURE.every((g) => {
  const r = inspire(g)
  return r.ok && r.how === 'match' && !VIOLENT.test(`${r.line} ${r.name} ${JSON.stringify(r.design)}`)
}), MATURE.filter((g) => findTopic(g).how !== 'match').join(', '))

console.log('\n=== Unknown ideas, rude ideas ===')
const volcanic = inspire('volcanic eruptions')
ok('an idea it does not know finds the closest topic ("volcanic eruptions" is Volcano)', volcanic.ok && volcanic.topic.id === 'volcano', volcanic.topic.id)
ok('and a near spelling too ("dinosaurus", "astronomy")', findTopic('dinosaurus').topic.id === 'dinosaurs' && findTopic('astronomy').topic.id === 'space'
  && findTopic('astronomy').how === 'close')
const none = inspire('xyzzy plover')
ok('with nothing in common, "Something new": "Here\'s a starting point. Make it yours!"',
  none.ok && none.how === 'new' && none.topic.id === 'new' && none.line === "Here's a starting point. Make it yours!", none.line)
ok('a rude idea is refused, gently, and makes nothing', ['big ass cars', 'Sh1t racing', 'f u c k', 'p0rn'].every((t) => {
  const r = inspire(t)
  return !r.ok && r.problem === IDEA_RUDE && !r.design
}))
ok('an empty box asks for an idea', !inspire('  ').ok && /Type an idea/.test(inspire('').problem))

console.log('\n=== What it makes: every field, still editable, the same size ===')
const KEYS = Object.keys(designFromVibe('space').design).sort().join()
const made = [...TOPICS, NEW_TOPIC].map((t) => ({ t, ...designFromTopic(t) }))
const incomplete = made.filter(({ name, design }) => !name || Object.keys(design).sort().join() !== KEYS
  || design.worlds.length !== 4 || design.worlds.some((w) => !w) || !design.cur || !design.mascot || !design.pat).map(({ t }) => t.id)
ok('every topic fills in all of it: a name, the vibe, three colours, a pattern, a mascot, four worlds and the coins', incomplete.length === 0, incomplete.join(', '))
const offList = made.filter(({ design }) => JSON.stringify(cleanDesign(design)) !== JSON.stringify(design)).map(({ t }) => t.id)
ok('from the lists a theme may hold, so nothing is changed when it is saved (the database\'s lists too)', offList.length === 0, offList.join(', '))
const unsaveable = made.filter(({ name, design }) => themeProblem(name, design) || seasonProblem(name, design)).map(({ t, name, design }) => `${t.id}: ${seasonProblem(name, design)}`)
ok('every one can be saved, and sent in for a Season: no rude word and no other company\'s name in any of it', unsaveable.length === 0, unsaveable.join('; '))
ok('every topic gives three names to pick from, each short enough', TOPICS.every((t) => t.names.length === 3 && t.names.every((n) => [...n].length <= NAME_MAX && brandsOk(n) && wordsOk(n))))
const leaks = Object.keys(BRAND_ALIASES).filter((alias) => {
  const r = inspire(alias)
  return !r.ok || !brandsOk(r.name) || !brandsOk(r.line) || !r.design.worlds.every(brandsOk) || !brandsOk(r.design.cur)
    || `${r.name} ${r.line} ${r.design.worlds.join(' ')} ${r.design.cur}`.toLowerCase().includes(alias)
})
ok('a brand typed in never comes out: not in the name, the line, the worlds or the coins', leaks.length === 0, leaks.join(', '))
// Editable afterwards: the reducer saves a changed version of an inspired theme like any other.
let fam = { ...createInitialState(), kids: [{ id: 'kid-1', name: 'Juno', themeId: 'aura' }], kidThemes: [] }
fam = reducer(fam, { type: 'SAVE_KID_THEME', theme: { id: 'th-1', kidId: 'kid-1', name: f1.name, design: f1.design, status: 'draft' } })
const changed = { ...f1.design, bg: '#052a3a', pat: 'waves', mascot: '🐬', cur: 'Pearls', worlds: ['A', 'B', 'C', 'D'] }
fam = reducer(fam, { type: 'SAVE_KID_THEME', theme: { id: 'th-1', kidId: 'kid-1', name: 'My Own Track', design: changed, status: 'ready' } })
const saved = fam.kidThemes.find((t) => t.id === 'th-1')
ok('and stays editable: an inspired theme, changed in Design and Build, is saved with the changes',
  saved?.name === 'My Own Track' && saved.design.pat === 'waves' && saved.design.mascot === '🐬' && saved.design.worlds[2] === 'C',
  JSON.stringify(saved))
const typedMax = designBytes('N'.repeat(NAME_MAX), { ...designFromVibe('space').design, cur: 'W'.repeat(CURRENCY_MAX), worlds: Array(4).fill('W'.repeat(WORLD_MAX)), mascot: '🏎️' })
const biggest = Math.max(...made.map(({ name, design }) => designBytes(name, design)))
ok(`the same size as any theme: the biggest inspired one is ${biggest} characters, never more than a typed one (${typedMax}), under ${DESIGN_MAX}`,
  biggest <= typedMax && typedMax <= DESIGN_MAX && DESIGN_MAX === 700)
ok('it is stored as the same design, with no topic, idea or line kept in it',
  !/topic|idea|line|says/.test(Object.keys(saved.design).join()) && !('idea' in saved))
ok('the library ships in the app and is never in the data: no topic is in the database\'s files',
  !TOPICS.some((t) => sql.includes(`'${t.says}'`) || sql.includes(`'${t.names[1]}'`)) && !/inspir/i.test(fn('kid_theme_design_ok')))

console.log('\n=== A Season theme carries no other company\'s name ===')
const brands = fn('kid_brands_ok')
const sqlBrands = brands.match(/v_brands text\[\] := array\[([^\]]*)\]/)?.[1].match(/'([^']*)'/g)?.map((x) => x.slice(1, -1)) || []
ok(`the phone and the database hold the same ${BRAND_NAMES.length} names`, same(sqlBrands, BRAND_NAMES), `${sqlBrands.length} vs ${BRAND_NAMES.length}`)
ok('the same way of reading them: accents, "&", apostrophes, one to four words run together',
  brands.includes("'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ'") && brands.includes("'aaaaaaeeeeiiiiooooouuuuyyncaaaaaaeeeeiiiiooooouuuuync'")
    && brands.includes("replace(v_norm, '&', ' and ')") && brands.includes('for v_n in 1..4 loop')
    && BRAND_NAMES.every((b) => b.split(' ').length <= 4 && b === b.toLowerCase() && /^[a-z0-9 ]+$/.test(b)))
ok('every name the owner listed is on it', ['F1', 'Formula 1', 'NASCAR', 'GTA', 'Minecraft', 'Fortnite', 'Roblox', 'Pokémon', 'Mario',
  'Rocket League', 'FIFA', 'NBA', 'NFL', 'Disney', 'Marvel', 'Lego'].every((b) => !brandsOk(b)))
const branded = ['F1 Fever', 'Formula-1 Fun', 'Mine Craft Land', 'POKÉMON Park', 'Super Mario Zone', 'Lego City', 'McDonald\'s Diner', 'nba hoops', 'Lego-less Land']
ok('caught however it is written', branded.every((t) => !brandsOk(t)), branded.filter((t) => brandsOk(t)).join(', '))
const ordinary = ['Marvellous Mountains', 'Legolas Woods', 'Gorilla Grove', 'Speed Circuit', 'Grand Prix', 'Formula Fun', 'Disneyish', 'Nikes Cove',
  'Star Voyage', 'Pit Lane', 'Mars Base', 'Fireworks', 'Ferrous', 'Overwatched', 'Marioland', '', null]
ok('and ordinary words pass: only whole words and phrases count', ordinary.every((t) => brandsOk(t)),
  ordinary.filter((t) => !brandsOk(t)).join(', '))
const base = designFromVibe('space').design
ok('a brand in the name, a world or the coins stops a Season send, in a child\'s words',
  seasonProblem('Minecraft Quest', base) === SEASON_BRAND_MESSAGE
    && seasonProblem('Star Voyage', { ...base, worlds: ['Moon', 'F1 Track', 'Ring', 'Edge'] }) === SEASON_BRAND_MESSAGE
    && seasonProblem('Star Voyage', { ...base, cur: 'Roblox Bucks' }) === SEASON_BRAND_MESSAGE
    && SEASON_BRAND_MESSAGE === "Season themes can't use other companies' names. Give it your own name to send it in.")
ok('an ordinary theme is not stopped', seasonProblem('Star Voyage', base) === null)
ok('but their own family theme may carry one: it can still be saved', themeProblem('Minecraft Quest', base) === null)
let fam2 = { ...createInitialState(), kids: [{ id: 'kid-1', name: 'Juno', themeId: 'aura' }], kidThemes: [] }
fam2 = reducer(fam2, { type: 'SAVE_KID_THEME', theme: { id: 'th-b', kidId: 'kid-1', name: 'Minecraft Quest', design: base, status: 'ready' } })
fam2 = reducer(fam2, { type: 'SAVE_KID_THEME', theme: { id: 'th-o', kidId: 'kid-1', name: 'Star Voyage', design: base, status: 'ready' } })
ok('a family theme with a brand in it is saved', fam2.kidThemes.some((t) => t.name === 'Minecraft Quest'))
const asked = reducer(fam2, { type: 'ASK_KID_THEME', id: 'th-b', ask: 'send', on: true })
ok('on the phone, a child cannot ask to send it in', !asked.kidThemes.find((t) => t.id === 'th-b').sendAsk)
const sent = reducer(fam2, { type: 'SEND_KID_THEME', id: 'th-b', credit: '' })
ok('nor can a parent send it: nothing is queued for the server', sent === fam2 && !(sent.syncQueue || []).some((q) => q.fn === 'submit_kid_theme'))
const sentOk = reducer(reducer(fam2, { type: 'ASK_KID_THEME', id: 'th-o', ask: 'send', on: true }), { type: 'SEND_KID_THEME', id: 'th-o', credit: '' })
ok('an ordinary one goes as before', sentOk.syncQueue.some((q) => q.fn === 'submit_kid_theme' && q.args.p_theme_id === 'th-o'))
const refused = reducer({ ...sentOk, syncQueue: [] }, { type: 'RPC_REFUSED', fn: 'submit_kid_theme', args: { p_theme_id: 'th-o' }, reason: 'brand' })
ok('and if the server refuses one for a name, the family is told why, and can send it again',
  refused.syncNotice?.message.includes(SEASON_BRAND_MESSAGE) && refused.kidThemes.find((t) => t.id === 'th-o').sentAt === null,
  refused.syncNotice?.message)
ok('submit_kid_theme asks kid_brands_ok of the name, every world and the coins, and says "brand"',
  /kid_brands_ok\(v_theme\.name\)/.test(fn('submit_kid_theme')) && /kid_brands_ok\(v_theme\.design->>'cur'\)/.test(fn('submit_kid_theme'))
    && /jsonb_array_elements_text\(v_theme\.design->'worlds'\) w where not kid_brands_ok\(w\)/.test(fn('submit_kid_theme'))
    && fn('submit_kid_theme').includes("'reason', 'brand'"))
ok('and only the server can ask it', sql.includes('revoke execute on function kid_brands_ok(text) from public, anon, authenticated;'))

console.log('\n=== Children\'s text goes nowhere but RankUp\'s database ===')
const files = ['src/lib/kidWords.js', 'src/data/themeGenesis.js', 'src/data/inspirations.js', 'src/screens/kid/ThemeGenesis.jsx', 'src/components/ThemePreview.jsx',
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
