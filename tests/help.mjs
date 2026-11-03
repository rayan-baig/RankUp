/**
 * The parent help page answers what parents ask, with the app's own numbers.
 *
 * Every price, day count and limit in an answer is read from the code that
 * decides it (src/data/parentHelp.js). This checks the answers still carry
 * those numbers, so a price change in the plan list cannot leave the help
 * page quoting the old one, and that each topic a parent asks about is there:
 * linking a phone, PINs, accepting chores, XP and levels, rewards, the plans
 * and prices, the free trial, cancelling, downloading and deleting the
 * family's data, and the no-photos rule.
 *
 * Runs the app's own code in Node; needs nothing running.
 *
 *   node tests/help.mjs
 */
import { readFileSync } from 'node:fs'
import { parentHelp, planPrices } from '../src/data/parentHelp.js'
import { TIERS, TIER_LADDER, TRIAL_DAYS } from '../src/state/initialState.js'
import { CODE_TTL_MS, MAX_ATTEMPTS } from '../src/lib/pairing.js'
import { DIFFICULTY_LIST, xpToNext } from '../src/lib/xp.js'
import { MAX_TOKENS, DAILY_COIN_CAP } from '../src/data/minigames.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const sections = parentHelp()
const questions = sections.flatMap((s) => s.questions)
const answer = (id) => (questions.find((q) => q.id === id)?.a || []).join(' ')
const everything = questions.map((q) => `${q.q} ${q.a.join(' ')}`).join('\n')

console.log('\n=== About a dozen real questions ===')
ok(`${questions.length} questions, between 12 and 15`, questions.length >= 12 && questions.length <= 15)
ok('each has a question and an answer', questions.every((q) => q.q?.endsWith('?') && q.a?.length && q.a.every((l) => l.trim())))
ok('no two share an id', new Set(questions.map((q) => q.id)).size === questions.length)

console.log('\n=== Every topic a parent asks about ===')
const TOPICS = {
  pairing: /link .*phone|six-digit code/i,
  pin: /PIN/,
  accepting: /Accept/,
  xp: /level/i,
  rewards: /reward/i,
  prices: /cost|\$/,
  trial: /trial/i,
  cancel: /cancel/i,
  download: /download/i,
  delete: /delete/i,
  photos: /photo/i,
}
for (const [id, pattern] of Object.entries(TOPICS)) {
  const q = questions.find((x) => x.id === id)
  ok(`${id}: answered`, Boolean(q) && pattern.test(`${q.q} ${q.a.join(' ')}`), q?.q)
}

console.log('\n=== The prices are the plan list\'s ===')
const usd = (n) => `$${Number(n).toFixed(2)}`
for (const tier of TIER_LADDER) {
  if (tier.price === 0) {
    ok(`${tier.name} is said to be free`, new RegExp(`${tier.name}: free`).test(answer('prices')))
  } else {
    ok(`${tier.name}: ${usd(tier.price)} a month`, answer('prices').includes(`${tier.name}: ${usd(tier.price)} a month`))
    ok(`${tier.name}: ${usd(tier.yearPrice)} a year`, answer('prices').includes(`${usd(tier.yearPrice)} a year`))
  }
}
const quoted = [...everything.matchAll(/\$(\d+\.\d{2})/g)].map((m) => Number(m[1]))
const known = new Set(TIER_LADDER.flatMap((t) => [t.price, t.yearPrice]).filter(Boolean))
const { FLASH_TICKET_PACKS } = await import('../src/lib/billing.js')
FLASH_TICKET_PACKS.forEach((p) => known.add(p.price))
const stray = quoted.filter((p) => !known.has(p))
ok('no price in any answer is one the code does not charge', stray.length === 0, stray.join(', '))
ok('planPrices() lists every plan, cheapest first', planPrices().length === TIER_LADDER.length
  && planPrices()[0].startsWith(TIER_LADDER[0].name))
const source = readFileSync('src/data/parentHelp.js', 'utf8')
ok('and none is typed into the help text by hand', !/\$\d/.test(source.replace(/\$\{[^}]*\}/g, '')))

console.log('\n=== The other numbers are the code\'s too ===')
ok(`the trial is ${TRIAL_DAYS} days of ${TIERS.elite.name}, no card`,
  answer('trial').includes(`${TRIAL_DAYS} days of ${TIERS.elite.name}`) && /No card/i.test(answer('trial')))
ok(`a pairing code lasts ${CODE_TTL_MS / 60000} minutes and ${MAX_ATTEMPTS} tries`,
  answer('pairing').includes(`${CODE_TTL_MS / 60000} minutes`) && answer('pairing').includes(`${MAX_ATTEMPTS} wrong tries`))
ok('the XP for each difficulty', DIFFICULTY_LIST.every((d) => answer('xp').includes(`${d.label} ${d.xp}`)))
ok(`the first level takes ${xpToNext(1)} XP`, answer('xp').includes(`${xpToNext(1)} XP`))
ok(`the arcade: ${MAX_TOKENS} tokens, ${DAILY_COIN_CAP} coins a day`,
  answer('arcade').includes(`up to ${MAX_TOKENS}`) && answer('arcade').includes(`${DAILY_COIN_CAP} a day`))

console.log('\n=== What the answers promise, the app does ===')
ok('no photos: RankUp never takes, sends or keeps one', /never takes, sends or keeps a photo/.test(answer('photos')))
const settings = readFileSync('src/screens/parent/ParentSettings.jsx', 'utf8')
const dataRights = readFileSync('src/components/DataRights.jsx', 'utf8')
const plan = readFileSync('src/screens/parent/ParentPlan.jsx', 'utf8')
ok('"Download my data" is a real button', /Download my data/.test(dataRights) && /Download my data/.test(answer('download')))
ok('"Delete my account" is a real button, and asks for DELETE', /Delete my account/.test(dataRights) && /typed !== 'DELETE'/.test(dataRights))
ok('"Manage billing, cancel, or update card" is the plan page\'s button', plan.includes('Manage billing, cancel, or update card')
  && answer('cancel').includes('Manage billing, cancel, or update card'))
ok('"Erase local data on this device only" is in Settings', settings.includes('Erase local data on this device only'))
ok('"Link a kid\'s device" is in Settings', settings.includes("Link a kid's device") && answer('pairing').includes("Link a kid's device"))
ok('"Rewards catalogue" and "Parent account" are Settings sections',
  settings.includes('title="Rewards catalogue"') && settings.includes('title="Parent account"'))
ok('and Settings links to the help page', /navigate\('\/parent\/help'\)/.test(settings))
const app = readFileSync('src/App.jsx', 'utf8')
ok('which is a route inside Parent Mode', /route === '\/parent\/help'\) return <ParentHelp \/>/.test(app))
const links = questions.filter((q) => q.to).map((q) => q.to.path)
const routed = links.filter((p) => !app.includes(`route === '${p}'`))
ok('every button in an answer opens a screen that exists', routed.length === 0, routed.join(', '))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
