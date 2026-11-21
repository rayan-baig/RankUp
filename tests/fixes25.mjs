/**
 * The fixes from the strict re-review (0.25.0), in plain Node: the rules,
 * and the files that carry them. tests/fixes25ui.mjs walks the same fixes in
 * a real browser.
 *
 *   1. one pay calculation for "Do this next", the quest cards and the quest
 *      page;
 *   2. an original drawn picture for each of the fourteen worlds that had
 *      none, and a tile for each arcade game, each small, each overridden by
 *      the owner's file of the same name; Block Craft's own pictures kept;
 *   3. the parent PIN kept as a salted hash, never as typed, moved over from
 *      an older phone, and a wait after five wrong tries that doubles and
 *      survives a reload, with no network;
 *   4. the stale words: linking from the parent's phone, no guilds where
 *      guilds are off, no guild in setup, no developer note in the demo;
 *   5. NEW only on new games, difficulty colours that read on every world,
 *      headers that follow the world, plurals.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => readFileSync(f, 'utf8')

// A browser's storage, for lib/parentPin.js.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
}

const { questPay, calcReward, DIFFICULTY } = await import('../src/lib/xp.js')
const { dayKey } = await import('../src/lib/dates.js')
const { KID_THEMES } = await import('../src/data/kidThemes.js')
const { MINIGAMES, isNewGame, NEW_GAME_DAYS } = await import('../src/data/minigames.js')

console.log('\n=== 1. One pay calculation everywhere ===')
const today = dayKey()
const kid = { streak: { count: 6, lastDay: today } }
const quest = { difficulty: 'medium', doubleXp: true }
const pay = questPay(quest, kid, { elite: true })
ok('an Elite child on a 6-day streak, a surprise double: the real pay, not the base 30',
  pay.xp > DIFFICULTY.medium.xp * 2 && pay.coins === Math.max(1, Math.round(pay.xp / 5)), JSON.stringify(pay))
ok('the same as the reducer\'s calcReward with the live streak',
  JSON.stringify(pay) === JSON.stringify(calcReward(quest, { elite: true, streak: 6, onTime: false })))
ok('plain Elite medium is +45 XP and +9, as the quest cards say',
  questPay({ difficulty: 'medium' }, { streak: {} }, { elite: true }).xp === 45
  && questPay({ difficulty: 'medium' }, { streak: {} }, { elite: true }).coins === 9)
ok('a race-the-clock bonus is not promised up front',
  questPay({ difficulty: 'medium', timerSeconds: 300 }, kid, { elite: false }).xp
  === questPay({ difficulty: 'medium' }, kid, { elite: false }).xp)
const home = read('src/screens/kid/KidHome.jsx')
const card = read('src/components/QuestCard.jsx')
const detail = read('src/screens/kid/QuestDetail.jsx')
ok('"Do this next" on Home uses questPay', /questPay\(nextQuest, kid, \{ elite \}\)/.test(home) && /nextPay\.xp/.test(home) && /nextPay\.coins/.test(home))
ok('and works out nothing of its own (no "/ 5", no bare DIFFICULTY xp)', !/\/ 5\)/.test(home) && !/DIFFICULTY\[nextQuest/.test(home))
ok('the quest cards use questPay', /questPay\(quest, kid, \{ elite \}\)/.test(card) && !/calcReward\(/.test(card))
ok('the quest page uses questPay', /questPay\(quest, kid, \{ elite, onTime \}\)/.test(detail) && !/calcReward\(/.test(detail))

console.log('\n=== 2. A picture for every world, a tile for every game ===')
const DRAWN = 'src/assets/drawn'
const ART = 'src/assets/art'
const drawnFiles = readdirSync(DRAWN)
const artFiles = readdirSync(ART)
const others = KID_THEMES.filter((t) => t.id !== 'blockcraft')
ok(`${others.length} worlds besides Block Craft`, others.length === 14)
const BRANDS = /mario|luigi|bowser|nintendo|pok[eé]mon|pikachu|minecraft|creeper|fortnite|roblox|sanrio|hello ?kitty|my little pony|sonic|tetris|candy crush|geometry dash|zelda|disney|barbie|hasbro|connect ?four|simon says/i
for (const t of others) {
  const f = `${DRAWN}/avatar-${t.id}.svg`
  const svg = existsSync(f) ? read(f) : ''
  ok(`${t.name}: its own drawn picture`, svg.startsWith('<svg') && svg.trim().endsWith('</svg>'), f)
  ok(`  small (${svg.length} bytes, under 4 KB)`, svg.length > 600 && svg.length < 4096)
  ok('  drawn in the world\'s own colours', [t.colors.accent, t.colors.accent2, t.colors.bg].some((c) => svg.toLowerCase().includes(c.toLowerCase())))
  ok('  nothing but shapes: no script, no style, no outside address, no brand',
    !/<script|style=|<style|href="http|xlink:href="http|<image/i.test(svg) && !BRANDS.test(svg))
  ok('  and no placeholder of the same name left in art/ to hide it',
    !artFiles.some((a) => a.replace(/\.[^.]+$/, '').toLowerCase() === `avatar-${t.id}`))
}
const portraits = others.map((t) => createHash('sha256').update(read(`${DRAWN}/avatar-${t.id}.svg`)).digest('hex'))
ok('fourteen different pictures, not one picture fourteen times', new Set(portraits).size === 14)
ok('Block Craft keeps the owner\'s pictures: all nine forms, untouched, none drawn over them',
  ['1', '10', '25', '50', '100', '125', '175', '250', '399'].every((l) => existsSync(`${ART}/avatar-blockcraft-${l}.jpg`))
  && !drawnFiles.some((f) => f.includes('blockcraft')))
for (const g of MINIGAMES) {
  const f = `${DRAWN}/game-${g.id}.svg`
  const svg = existsSync(f) ? read(f) : ''
  ok(`${g.name}: its own tile (${svg.length} bytes)`, svg.startsWith('<svg') && svg.length < 4096 && !/<script|style=|<image|href="http/i.test(svg) && !BRANDS.test(svg), f)
}
const tiles = MINIGAMES.map((g) => createHash('sha256').update(read(`${DRAWN}/game-${g.id}.svg`)).digest('hex'))
ok(`${MINIGAMES.length} different tiles`, new Set(tiles).size === MINIGAMES.length)
ok('no shared placeholder tile left in art/', !artFiles.some((a) => /^game-/.test(a)))
ok('every drawn file is a world, a game or the banner skyline',
  drawnFiles.every((f) => /^avatar-[a-z]+\.svg$|^game-[a-z]+\.svg$|^hero-city\.svg$/.test(f) && statSync(`${DRAWN}/${f}`).size < 12 * 1024))
const artJs = read('src/data/art.js')
ok('the owner\'s file wins over the drawn one (picture(): art first, then drawn)',
  /export function picture\(\.\.\.slots\) \{\s*const own = artAny\(\.\.\.slots\)\s*if \(own\) return \{ url: own, drawn: false \}/.test(artJs))
ok('the drawn ones are found by name, like the owner\'s', /import\.meta\.glob\('\.\.\/assets\/drawn\/\*\.svg'/.test(artJs))
ok('the avatar, the theme picker and the arcade all ask picture()',
  /picture\(\s*`avatar-\$\{theme\?\.id\}-/.test(read('src/components/Avatar.jsx'))
  && /picture\(`avatar-\$\{theme\.id\}-\$\{tiersFor\(theme\)\[0\]\}`, `avatar-\$\{theme\.id\}`\)/.test(read('src/components/ThemePicker.jsx'))
  && /tileArt\(`game-\$\{g\.id\}`\)/.test(read('src/screens/kid/KidArcade.jsx')))
const { inlineAsset } = await import('../vite.config.js')
ok('drawn pictures are files of their own, never written into the code (fetched when shown)',
  inlineAsset('/repo/src/assets/drawn/avatar-pegasus.svg') === false)
ok('the README tells the owner how to replace a drawn picture', /avatar-pegasus\.png/.test(read(`${ART}/README.md`)))

console.log('\n=== 3. The parent PIN: a salted hash, a limit, offline ===')
const pin = await import('../src/lib/parentPin.js')
const bad = [0, 1, 55, 56, 63, 64, 119, 200].filter((n) => {
  const s = 'q'.repeat(n)
  return Buffer.from(pin.sha256(new TextEncoder().encode(s))).toString('hex') !== createHash('sha256').update(s).digest('hex')
})
ok('its SHA-256 is SHA-256 (against node:crypto, padding edges included), with no network and no crypto.subtle',
  bad.length === 0, bad.join(','))
const stored = pin.makePinHash('4321')
const [v, rounds, length, salt, hash] = stored.split('$')
ok('what is kept is "v1$rounds$length$salt$hash": a 16-byte random salt and a 32-byte hash',
  v === 'v1' && Number(rounds) >= 1000 && length === '4' && /^[0-9a-f]{32}$/.test(salt) && /^[0-9a-f]{64}$/.test(hash))
let d = createHash('sha256').update(Buffer.concat([Buffer.from(salt, 'hex'), Buffer.from('4321')])).digest()
for (let i = 1; i < Number(rounds); i += 1) d = createHash('sha256').update(Buffer.concat([Buffer.from(salt, 'hex'), d])).digest()
ok('the hash is the salt and the PIN stirred, checkable by anyone', d.toString('hex') === hash)
ok('a new salt every time, so the same PIN is never stored the same way twice', pin.makePinHash('4321') !== stored)
ok('the right PIN matches; a wrong one, a longer one and an empty box do not',
  pin.pinMatches({ pinHash: stored }, '4321') && !pin.pinMatches({ pinHash: stored }, '1234')
  && !pin.pinMatches({ pinHash: stored }, '43210') && !pin.pinMatches({ pinHash: stored }, '') && !pin.pinMatches({ pinHash: '' }, ''))
const old = { name: 'Rivera', pin: '4321' }
const moved = pin.securePin(old)
ok('an older phone\'s plain PIN is moved over: the hash kept, the PIN gone',
  !('pin' in moved) && moved.name === 'Rivera' && pin.pinMatches(moved, '4321') && !JSON.stringify(moved).includes('"pin"'))
ok('a family already moved over is left exactly as it is', pin.securePin(moved) === moved)
ok('no PIN at all stays no PIN (an empty box never opens it)', !pin.hasPin(pin.securePin({ pin: '' })) && !pin.pinMatches(pin.securePin({ pin: '' }), ''))
const reducer = read('src/state/reducer.js')
ok('setup, joining, Settings and the reset store it through securePin',
  /family: securePin\(\{ \.\.\.state\.family, \.\.\.family, currency \}\)/.test(reducer)
  && /case 'UPDATE_FAMILY':\s*return \{ \.\.\.state, family: securePin\(/.test(reducer)
  && /family: securePin\(\{\s*\.\.\.state\.family,\s*id: familyId/.test(reducer))
ok('moved over as the app opens, and on the first unlock',
  /family: saved\.family \? securePin\(saved\.family\)/.test(read('src/state/AppContext.jsx'))
  && /case 'UNLOCK_PARENT': \{\s*const family = securePin\(state\.family\)/.test(reducer))
ok('the initial state has no pin field, only pinHash', /pinHash: ''/.test(read('src/state/initialState.js')) && !/^\s*pin: '',/m.test(read('src/state/initialState.js')))
ok('no screen compares a typed PIN with a stored one any more',
  !/family\.pin\b/.test(['src/screens/RoleSwitch.jsx', 'src/screens/kid/KidProfile.jsx', 'src/screens/kid/ThemeGenesis.jsx', 'src/screens/parent/ParentSettings.jsx'].map(read).join('\n')))

// Wrong tries, against the clock.
pin.clearPinLock()
let t = 1_000_000
const fam = { pinHash: stored }
for (let i = 1; i <= 4; i += 1) ok(`wrong try ${i}: "not right", no wait`, pin.tryPin(fam, '0000', t).result === 'wrong')
let r = pin.tryPin(fam, '0000', t)
ok('the fifth wrong try: a wait of one minute', r.result === 'locked' && r.wait === 60_000, JSON.stringify(r))
ok('said calmly, with the wait', pin.lockMessage(r.wait) === 'Too many wrong PINs. Take a breather and try again in 1 minute.', pin.lockMessage(r.wait))
ok('while it waits, even the right PIN is refused', pin.tryPin(fam, '4321', t + 30_000).result === 'locked')
// A reload: a fresh copy of the module, the same storage.
const again = await import('../src/lib/parentPin.js?reload')
ok('a reload does not start the count again: still waiting, about 30 seconds left',
  again.pinLockedFor(t + 30_000) === 30_000 && again.tryPin(fam, '0000', t + 30_000).result === 'locked')
t += 61_000
for (let i = 1; i <= 4; i += 1) pin.tryPin(fam, '0000', t)
r = pin.tryPin(fam, '0000', t)
ok('five more wrong tries after the wait: two minutes', r.result === 'locked' && r.wait === 120_000, JSON.stringify(r))
t += 121_000
for (let i = 1; i <= 5; i += 1) r = pin.tryPin(fam, '0000', t)
ok('then four minutes (doubling each time)', r.wait === 240_000 && pin.waitWords(r.wait) === '4 minutes')
ok('never more than a day', pin.lockLength(30) === 24 * 60 * 60 * 1000)
t += 241_000
ok('after the wait the right PIN opens it', pin.tryPin(fam, '4321', t).result === 'ok')
ok('and starts the count again from nothing', pin.wrongTriesLeft() === pin.MAX_WRONG && pin.pinLockedFor(t) === 0)
ok('two tries from the wait, the box says so', (() => {
  for (let i = 1; i <= 3; i += 1) pin.tryPin(fam, '0000', t)
  return /2 more tries before a short wait/.test(pin.wrongMessage())
})())
pin.clearPinLock()
ok('the wait is kept beside the app\'s state, in this device\'s storage', /rankup\.pinlock\.v1/.test(read('src/lib/parentPin.js')))
ok('every PIN box counts through the same limit',
  ['src/screens/RoleSwitch.jsx', 'src/screens/kid/KidProfile.jsx', 'src/screens/kid/ThemeGenesis.jsx'].every((f) => /usePinLock\(\)/.test(read(f))))
ok('a PIN reset proved with the account password ends the wait', /clearPinLock\(\)/.test(read('src/components/PinReset.jsx')))

console.log('\n=== 4. The words ===')
const { firstWeekSteps } = await import('../src/lib/firstWeek.js').catch(() => ({}))
const fw = read('src/lib/firstWeek.js')
ok('first week: "In Settings, Link a kid\'s device, tap “Code for Mia”"',
  /line: `In Settings, Link a kid's device, tap “Code for \$\{firstKid\}”\.`/.test(fw) && !/I'm a kid” for a code/.test(fw))
if (firstWeekSteps) {
  const steps = firstWeekSteps({ kids: [{ name: 'Mia' }], quests: [], submissions: [], settings: {} })
  ok('  and with a child called Mia it says exactly that', steps.some((s) => s.line === 'In Settings, Link a kid\'s device, tap “Code for Mia”.'))
}
const lb = await import('../src/data/leaderboards.js')
ok('leaderboards with guilds off name no guild', !/guild/i.test(lb.boardsIntro({ guildsOn: false }) + lb.modeLine('adventure', { guildsOn: false })))
ok('and with them on, they do', /guild/.test(lb.boardsIntro({ guildsOn: true })) && /guild/.test(lb.modeLine('adventure', { guildsOn: true })))
const kidBoards = read('src/screens/kid/KidLeaderboards.jsx')
ok('the leaderboard page\'s banners name guild boards only when guilds are on',
  !/>\s*A real family also gets guild boards/.test(kidBoards) && /guildsOn\s*\? 'A real family also gets guild boards/.test(kidBoards))
ok('the child\'s Profile and the parent\'s page say only what is on',
  /modeLine\(mode, \{ guildsOn: guildsEnabled\(\) \}\)/.test(read('src/components/LeaderboardCard.jsx'))
  && /guildsEnabled\(\) \? 'Family and guild boards only' : 'The family board only'/.test(read('src/screens/parent/ParentLeaderboards.jsx')))
ok('setup step 1 no longer mentions the guild', !/the guild/.test(read('src/screens/Onboarding.jsx').match(/label="Family name" hint="[^"]*"/)?.[0] || 'the guild'))
ok('the developer note (?device=kid) is never shown in the demo', /!canSyncAcrossDevices && !state\.demo/.test(read('src/screens/parent/ParentPairKid.jsx')))

console.log('\n=== 5. The smaller fixes ===')
ok('no game is NEW today: every one came with the first arcade', MINIGAMES.every((g) => !isNewGame(g)))
ok(`a game added today is NEW, and stops being NEW after ${NEW_GAME_DAYS} days`,
  isNewGame({ addedOn: '2026-11-01' }, Date.parse('2026-11-02T12:00:00Z'))
  && !isNewGame({ addedOn: '2026-11-01' }, Date.parse('2026-11-01T00:00:00Z') + NEW_GAME_DAYS * 86400000))
ok('the tile shows NEW only for isNewGame', /isNewGame\(g\) && \(/.test(read('src/screens/kid/KidArcade.jsx')))

// Contrast of "Medium" and "+45 XP" on every world: the CSS mixes 35% of the
// difficulty colour with 65% of the theme's ink (srgb), on a background of 14%
// difficulty over surface-2 (the chip) or 16% over surface (the XP box).
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (a, b, p) => a.map((x, i) => x * p + b[i] * (1 - p))
const lum = (c) => {
  const [r, g, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
const css = read('src/styles/index.css')
ok('the chip and the XP box take the difficulty colour toward the ink (35% colour, 65% ink)',
  /\.diff-chip \{[^}]*color-mix\(in srgb, var\(--diff\) 35%, var\(--ink\)\)/.test(css) && /\.pay-box \{[^}]*color-mix\(in srgb, var\(--diff\) 35%, var\(--ink\)\)/.test(css))
let worst = { ratio: 99 }
for (const th of KID_THEMES) {
  for (const dfc of Object.values(DIFFICULTY)) {
    const text = mix(hex(dfc.color), hex(th.colors.ink), 0.35)
    for (const [bg, p] of [[th.colors.surface2, 0.14], [th.colors.surface, 0.16]]) {
      const ratio = contrast(text, mix(hex(dfc.color), hex(bg), p))
      if (ratio < worst.ratio) worst = { ratio, theme: th.id, diff: dfc.id }
    }
  }
}
ok(`"Medium" and "+45 XP" read at 4.5:1 or better on all ${KID_THEMES.length} worlds (worst ${worst.ratio.toFixed(2)}:1, ${worst.theme} ${worst.diff})`, worst.ratio >= 4.5)
ok('the quest card and page use them, not the bare colour',
  /diff-chip diff-\$\{diff\.id\}/.test(card) && /pay-box diff-\$\{diff\.id\}/.test(card) && /diff-chip diff-\$\{diff\.id\}/.test(detail) && !/color: diff\.color/.test(card))

const { isLightTheme } = await import('../src/lib/themeTone.js')
const light = KID_THEMES.filter(isLightTheme).map((x) => x.id).sort()
ok(`the light worlds are told apart (${light.join(', ')})`,
  ['campfire', 'coquette', 'monstertamer', 'pegasus', 'plumber', 'sugarrush'].every((id) => light.includes(id)) && !light.includes('blockcraft') && !light.includes('aura'))
const heroArt = read('src/components/HeroArt.jsx')
ok('the tab banner: the owner\'s picture as it is; the drawn skyline only on a dark world, in its colours',
  /const city = !own && !isLightTheme\(theme\) \? drawn\('hero-city'\) : null/.test(heroArt) && /mix-blend-mode: luminosity/.test(css))
ok('no city placeholder is left as the owner\'s banner for every tab', !artFiles.some((a) => /^hero-/.test(a)))

const src = []
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(n)) src.push(p) } }
walk('src')
const PLURAL = /\b(quest|chore|kid|child|game|day|reward|badge|point|token|theme|minute|hour|week|month|school|student|famil[a-z]*|item|message|note|level|world)\(s\)/i
const brackets = src.filter((f) => PLURAL.test(read(f).split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n')))
ok('no "quest(s)"-style plural anywhere a person reads', brackets.length === 0, brackets.join(', '))
ok('"1 chore", "3 chores" on the leaderboards', lb.scoreWithUnit(1, 'chores') === '1 chore' && lb.scoreWithUnit(3, 'chores') === '3 chores' && lb.scoreWithUnit(1, 'streak_best') === '1 day')
const { plural } = await import('../src/lib/plural.js')
ok('and the shared plural says "1 quest", "3 quests"', plural(1, 'quest') === '1 quest' && plural(3, 'quest') === '3 quests')
ok('the parent dashboard\'s history uses it', /plural\(e\.meta\?\.count \|\| 0, 'quest'\)/.test(read('src/screens/parent/ParentDashboard.jsx')))

ok('"Sent!" after Send to parent: noted by the quest page, shown by the list for a moment',
  /noteSent\(quest\.title/.test(detail) && /peekSent\(\)/.test(read('src/screens/kid/KidQuests.jsx')) && /data-testid="sent-moment"/.test(read('src/screens/kid/KidQuests.jsx')))
const { SENT_MS } = await import('../src/lib/sentFlash.js')
const { MOMENT_MAX_MS } = await import('../src/lib/moments.js')
ok(`a moment, not a stop: ${SENT_MS} ms, within the ${MOMENT_MAX_MS} ms every moment keeps to`, SENT_MS <= MOMENT_MAX_MS)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
