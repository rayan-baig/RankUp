/**
 * The rules behind the product review's fixes (0.22.0), in plain Node.
 *
 *   - the money sign: US dollars by default, a first guess from the phone's
 *     region, a parent's choice saved to the account;
 *   - the Sunday Market kept as it is, with gem prices only for a child;
 *   - the daily bonus is for a chore done today, never for opening the app;
 *   - the next goal shown to a child is the nearer one;
 *   - the legal pages' way back, and how to reach the company;
 *   - the consent notice describes only what is on (guilds are off);
 *   - the demo's words about payments;
 *   - a phone linked by a code the parent made becomes that child.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { reducer, choreSentToday } = await import('../src/state/reducer.js')
const { createInitialState, makeKid, PLAN_COMPARISON, ELITE_PARENT_PERKS } = await import('../src/state/initialState.js')
const { currencyForRegion, familyCurrency, formatMoney, CURRENCIES, DEFAULT_CURRENCY } = await import('../src/lib/money.js')
const { MARKET_SKINS, ticketCost, FULL_SET_TICKETS } = await import('../src/data/marketSkins.js')
const marketModule = await import('../src/data/marketSkins.js')
const { nextMilestone, milestoneWords } = await import('../src/lib/avatarTiers.js')
const { legalBack } = await import('../src/lib/support.js')
const { CONSENT_NOTICE, CONSENT_VERSION, PRIVACY_POLICY, TERMS, OPERATOR, UNFILLED } = await import('../src/data/legalText.js')
const { noPaymentsWords } = await import('../src/lib/billing.js')
const { planLines } = await import('../src/lib/plans.js')
const { TIERS } = await import('../src/state/initialState.js')
const { readFileSync } = await import('node:fs')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== The money sign ===')
ok('US dollars are the default', DEFAULT_CURRENCY === 'USD' && CURRENCIES[0].code === 'USD')
ok('a family with none set shows dollars, not pounds', familyCurrency({}) === 'USD' && familyCurrency(null) === 'USD')
ok('a family that chose pounds keeps them', familyCurrency({ currency: 'GBP' }) === 'GBP')
ok('a code not on the list falls back to dollars', familyCurrency({ currency: 'XYZ' }) === 'USD')
ok('formatMoney with no currency is dollars', formatMoney(250).includes('$') && !formatMoney(250).includes('£'), formatMoney(250))
for (const [loc, want] of [['en-US', 'USD'], ['en-GB', 'GBP'], ['en-CA', 'CAD'], ['fr-CA', 'CAD'], ['en-AU', 'AUD'],
  ['en-NZ', 'NZD'], ['ja-JP', 'JPY'], ['ja', 'JPY'], ['de-DE', 'EUR'], ['fr-BE', 'EUR'], ['en-IE', 'EUR'], ['en', 'USD'], ['', 'USD'], ['es-MX', 'USD']]) {
  ok(`a phone set to "${loc}" starts in ${want}`, currencyForRegion(loc) === want, currencyForRegion(loc))
}
{
  const s = reducer(createInitialState(), { type: 'SET_FAMILY_CURRENCY', currency: 'gbp' })
  ok('choosing pounds in Settings changes the sign at once', s.family.currency === 'GBP')
  ok('and saves it to the account', s.syncQueue.some((c) => c.fn === 'set_family_currency' && c.args.p_currency === 'GBP'))
  const t = reducer(createInitialState(), { type: 'SET_FAMILY_CURRENCY', currency: 'XYZ' })
  ok('a code not on the list is ignored', !t.syncQueue?.some((c) => c.fn === 'set_family_currency'))
}
{
  const kid = makeKid({ name: 'Ava', themeId: 'blockcraft' })
  const us = reducer(createInitialState(), { type: 'COMPLETE_ONBOARDING', family: { name: 'F', currency: 'USD' }, kid })
  ok('a new US family is in dollars and nothing extra is sent', us.family.currency === 'USD' && !us.syncQueue?.some((c) => c.fn === 'set_family_currency'))
  const uk = reducer(createInitialState(), { type: 'COMPLETE_ONBOARDING', family: { name: 'F', currency: 'GBP' }, kid })
  ok('a family made on a UK phone is in pounds, saved to the account', uk.family.currency === 'GBP'
    && uk.syncQueue.some((c) => c.fn === 'set_family_currency' && c.args.p_currency === 'GBP'))
}
{
  // The family row from the server carries the sign; a choice still on its way wins.
  const base = { ...createInitialState(), family: { ...createInitialState().family, id: 'f1', currency: 'EUR' } }
  const pulled = reducer(base, { type: 'MERGE_SNAPSHOT', snapshot: { families: [{ id: 'f1', name: 'F', tier: 'starter', currency: 'USD' }] }, pending: [] })
  ok('the server\'s sign arrives with the family', pulled.family.currency === 'USD')
  const waiting = reducer(base, { type: 'MERGE_SNAPSHOT', snapshot: { families: [{ id: 'f1', name: 'F', tier: 'starter', currency: 'USD' }] }, pending: ['family_currency'] })
  ok('but not over a choice still being saved', waiting.family.currency === 'EUR')
}
{
  const src = ['src/components/KidPot.jsx', 'src/components/PocketMoney.jsx', 'src/screens/parent/ParentAssign.jsx', 'src/screens/parent/ParentMoney.jsx', 'src/lib/money.js', 'src/lib/allowance.js']
    .map((f) => readFileSync(f, 'utf8')).join('\n')
  ok('no screen falls back to pounds', !/\|\|\s*'GBP'|=\s*'GBP'\)/.test(src))
  ok('the database starts families in dollars', /currency\s+text not null default 'USD'/.test(readFileSync('supabase/schema.sql', 'utf8')))
}

console.log('\n=== The Sunday Market, kept as it is (the owner\'s choice) ===')
ok('its Sunday window, rarity labels and gem prices stay', 'isMarketOpen' in marketModule && 'RARITY' in marketModule && MARKET_SKINS.every((s) => s.cost > 0))
ok('every skin still has its ticket price for the server to check', MARKET_SKINS.every((s) => ticketCost(s) >= 1) && FULL_SET_TICKETS === 11)
{
  const market = readFileSync('src/screens/kid/KidMarket.jsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  ok('a child sees gem prices only: no ticket price beside each skin', !/🎟️ \{ticketCost\(skin\)\}<\/span>/.test(market))
  ok('no real-money price anywhere on it', !/\$\d|FLASH_TICKET_PACKS|\.price\b|perTicket/.test(market))
  ok('and tickets are "ask a grown-up"', /Ask a grown-up/.test(market))
}
ok('the plan list still calls it the Sunday Market', PLAN_COMPARISON.some((r) => r.label === 'Sunday Market'))

console.log('\n=== The daily bonus is for doing a chore ===')
{
  const kid = { ...makeKid({ name: 'Ava', themeId: 'blockcraft' }), id: 'k1', coins: 10 }
  const s = { ...createInitialState(), kids: [kid], submissions: [] }
  ok('no chore today: no bonus', choreSentToday(s, 'k1') === false && reducer(s, { type: 'CLAIM_LOGIN_BONUS', kidId: 'k1' }).kids[0].coins === 10)
  const done = { ...s, submissions: [{ id: 's', kidId: 'k1', questId: 'q', status: 'pending', submittedAt: Date.now() }] }
  ok('a chore sent today: the bonus', choreSentToday(done, 'k1') && reducer(done, { type: 'CLAIM_LOGIN_BONUS', kidId: 'k1' }).kids[0].coins === 15)
  const sibling = { ...s, submissions: [{ id: 's', kidId: 'k2', questId: 'q', status: 'pending', submittedAt: Date.now() }] }
  ok('a brother\'s chore does not count', choreSentToday(sibling, 'k1') === false)
}

console.log('\n=== The next goal is the nearer one ===')
{
  const theme = { tiers: [1, 10, 25, 50, 100] }
  ok('level 12, a form at 25 and a world at 125: the form', nextMilestone(12, theme, { level: 125 })?.level === 25)
  ok('level 60, a world at 75 and a form at 100: the world', nextMilestone(60, theme, { level: 75 })?.kind === 'world')
  ok('every form reached, a world at 125: the world', nextMilestone(110, theme, { level: 125 })?.level === 125)
  ok('nothing left but the dragon', nextMilestone(130, theme, { requires: 'dragonDefeated' })?.kind === 'dragon')
  ok('nothing at all', nextMilestone(130, theme, null) === null)
  ok('in plain words', milestoneWords({ kind: 'form', level: 25 }) === 'Next form at level 25')
}

console.log('\n=== The legal pages ===')
ok('a visitor goes back to the front door', legalBack({ onboarded: false }).to === '/welcome')
ok('a child\'s phone to its home', legalBack({ onboarded: true, device: { role: 'kid' } }).to === '/kid')
ok('a parent to Settings', legalBack({ onboarded: true, device: { role: 'parent' } }).to === '/parent/settings')
{
  const all = JSON.stringify([PRIVACY_POLICY, TERMS])
  ok('no placeholder on either page', !/\[YOUR|\[[A-Z ]{6,}\]/.test(all))
  ok('both end with how to reach the company', [PRIVACY_POLICY, TERMS].every((d) => d.sections.at(-1).heading === 'Contact us'
    && d.sections.at(-1).body.join(' ').includes(OPERATOR.email)))
  ok('the missing postal address is the owner\'s to fill in, not shown', UNFILLED.includes('address') ? !all.includes('By post') : true)
  const doc = readFileSync('src/screens/LegalDoc.jsx', 'utf8')
  ok('the public page has no "not finished" banner', !/Not finished|UNFILLED/.test(doc))
}

console.log('\n=== The consent notice describes only what is on ===')
{
  const words = JSON.stringify(CONSENT_NOTICE)
  ok('a new version, 2026-12', CONSENT_VERSION === '2026-12')
  ok('no guild chat, no short messages', !/guild chat|short messages/i.test(words))
  ok('it says guilds are switched off', /Guilds are switched off/.test(words))
}

console.log('\n=== Plain names, and no loss-fear ===')
{
  const words = JSON.stringify([PLAN_COMPARISON.map((r) => r.label), ELITE_PARENT_PERKS, planLines(TIERS.elite, { guilds: false })])
  ok('no Consequence Engine, Override Protocol, Currency Tax, Lockdown or Discount Tournament',
    !/Consequence Engine|Override Protocol|Currency Tax|Lockdown|Discount Tournament|Megacluster/.test(words), words.match(/Consequence Engine|Override Protocol|Currency Tax|Lockdown|Discount Tournament|Megacluster/)?.[0])
  ok('lock-outs and taking coins are not sold as a perk', !/lock ?out|coin|tax/i.test(JSON.stringify(ELITE_PARENT_PERKS.find((p) => p.id === 'override'))))
  ok('"Pause and limits" instead', words.includes('Pause and limits'))
}

console.log('\n=== The demo\'s words about payments ===')
{
  for (const where of ['plan', 'elite', 'gift', 'flash']) {
    const w = noPaymentsWords({ demo: true }, where)
    ok(`demo, ${where}: says nothing is charged, in a visitor's words`, /pretend family/.test(w.body) && !/Stripe|configured|test|switched off/i.test(JSON.stringify(w)))
  }
  ok('outside the demo it names no company', !/Stripe/.test(JSON.stringify(noPaymentsWords({}, 'flash'))))
}

console.log('\n=== A phone linked by a code the parent made ===')
{
  const s = { ...createInitialState(), family: { ...createInitialState().family, id: 'local-fiction' } }
  const linked = reducer(s, { type: 'LINKED_BY_CODE', kid: { id: 'kid-ava', name: 'Ava', themeId: 'blockcraft' }, familyName: 'The Riveras', real: true })
  ok('the phone is that child', linked.onboarded && linked.device.role === 'kid' && linked.device.linkedKidId === 'kid-ava')
  ok('in the parent\'s world', linked.kids[0].themeId === 'blockcraft' && linked.kids.length === 1)
  ok('with the family\'s name, and the made-up family id dropped for the first pull', linked.family.name === 'The Riveras' && linked.family.id === null)
  ok('and nothing happens without a child', reducer(s, { type: 'LINKED_BY_CODE', kid: null }) === s)
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
