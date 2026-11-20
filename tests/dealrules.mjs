/**
 * When each deal is on, and what the Founding Season badge counts (0.23.0),
 * in plain Node, from the same code the server and Parent Mode use
 * (src/lib/deals.js, src/data/badges.js).
 *
 *   - every deal is off until its coupon and percent are set;
 *   - end dates are the real ones, the last day included, and never moved;
 *   - Founding Families is off when the database counts no place left;
 *   - the holiday sale runs between its two days, both included;
 *   - the Season's deal runs the Season's first 14 days;
 *   - a public answer never carries a coupon id;
 *   - "Gift a year" waits a month;
 *   - the Founding Season badge is earned only by chores done in Season 1,
 *     is shown only once Season 1 has started, and after it only to a child
 *     who earned it;
 *   - "New Season!" also for a Season with no new theme.
 */
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { foundingDeal, giftSale, seasonDeal, publicDeals, settingDate, settingPercent, giftAYearDue, SEASON_DEAL_DAYS } = await import('../src/lib/deals.js')
const { badgeState, foundingSeason, foundingSeasonChores, FOUNDING_SEASON_CHORES } = await import('../src/data/badges.js')
const { seasonToCelebrate } = await import('../src/data/themeGenesis.js')
const { readFileSync } = await import('node:fs')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const DAY = 86400000
const at = (iso) => Date.parse(iso)

console.log('\n=== The settings ===')
ok('a day is a day, UTC', settingDate('2026-12-31') === at('2026-12-31T00:00:00Z'))
ok('empty or nonsense is no date', settingDate('') === null && settingDate('soon') === null)
ok('a percent is a whole number from 1 to 90', settingPercent('25') === 25 && settingPercent('0') === null && settingPercent('95') === null && settingPercent('2.5') === null)

console.log('\n=== Founding Families ===')
const F = { STRIPE_FOUNDING_COUPON: 'c', FOUNDING_PERCENT: '40', FOUNDING_FAMILIES_LIMIT: '500', FOUNDING_ENDS_AT: '2027-01-31' }
ok('off with no coupon', foundingDeal({ ...F, STRIPE_FOUNDING_COUPON: '' }) === null)
ok('off with no percent to say', foundingDeal({ ...F, FOUNDING_PERCENT: '' }) === null)
ok('on before its last day', foundingDeal(F, { now: at('2027-01-15T12:00:00Z') })?.percent === 40)
ok('on all of its last day', foundingDeal(F, { now: at('2027-01-31T23:59:00Z') }) !== null)
ok('off the day after', foundingDeal(F, { now: at('2027-02-01T00:00:01Z') }) === null)
ok('no end date: on until the places run out', foundingDeal({ ...F, FOUNDING_ENDS_AT: '' }, { now: at('2099-01-01T00:00:00Z') }) !== null)
ok('off when the database counts no place left', foundingDeal(F, { left: 0, now: at('2027-01-01T00:00:00Z') }) === null)
ok('the count is the database\'s, passed through as it is', foundingDeal(F, { left: 312, now: at('2027-01-01T00:00:00Z') })?.left === 312)
ok('500 by default', foundingDeal({ ...F, FOUNDING_FAMILIES_LIMIT: '' }, { now: at('2027-01-01T00:00:00Z') })?.limit === 500)

console.log('\n=== The holiday gift sale ===')
const G = { STRIPE_GIFT_SALE_COUPON: 'g', GIFT_SALE_PERCENT: '25', GIFT_SALE_FROM: '2026-11-27', GIFT_SALE_TO: '2026-12-31' }
ok('off before Black Friday', giftSale(G, { now: at('2026-11-26T23:59:59Z') }) === null)
ok('on from the first day', giftSale(G, { now: at('2026-11-27T00:00:00Z') })?.percent === 25)
ok('on all of the last day', giftSale(G, { now: at('2026-12-31T23:59:59Z') }) !== null)
ok('off on New Year\'s Day', giftSale(G, { now: at('2027-01-01T00:00:00Z') }) === null)
ok('off when the dates are empty', giftSale({ ...G, GIFT_SALE_TO: '' }, { now: at('2026-12-01T00:00:00Z') }) === null)

console.log('\n=== The Season\'s deal ===')
const S = { STRIPE_SEASON_COUPON: 's', SEASON_DEAL_PERCENT: '20' }
const season = { number: 2, name: 'Season 2', startsOn: '2027-07-01' }
ok('off before the Season starts', seasonDeal(S, season, { now: at('2027-06-30T23:00:00Z') }) === null)
ok('on from its first day', seasonDeal(S, season, { now: at('2027-07-01T00:00:00Z') })?.percent === 20)
ok(`on through its ${SEASON_DEAL_DAYS}th day`, seasonDeal(S, season, { now: at('2027-07-14T23:59:00Z') }) !== null)
ok('off after', seasonDeal(S, season, { now: at('2027-07-15T00:00:01Z') }) === null)
ok('on the yearly plan unless the setting says gift', seasonDeal(S, season, { now: at('2027-07-02T00:00:00Z') }).on === 'yearly'
  && seasonDeal({ ...S, SEASON_DEAL_ON: 'gift' }, season, { now: at('2027-07-02T00:00:00Z') }).on === 'gift')
ok('no Season, no deal', seasonDeal(S, null) === null)

console.log('\n=== What anybody may be told ===')
{
  const now = at('2026-12-01T00:00:00Z')
  const answer = JSON.stringify(publicDeals({
    founding: foundingDeal(F, { left: 12, now }), gift: giftSale(G, { now }), season: seasonDeal(S, { ...season, startsOn: '2026-11-25' }, { now }),
  }))
  ok('the percents, the end dates and the places left', /"percent":40/.test(answer) && /"left":12/.test(answer) && /2026-12-31T23:59:59/.test(answer))
  ok('never a coupon id', !/"coupon"/.test(answer) && !/"c"|"g"|"s"/.test(answer), answer)
}

console.log('\n=== "Gift a year" waits a month ===')
ok('not on day 29', giftAYearDue({ createdAt: Date.now() - 29 * DAY }) === false)
ok('from day 30', giftAYearDue({ createdAt: Date.now() - 30 * DAY }) === true)
ok('not without a first day', giftAYearDue({}) === false)

console.log('\n=== The Founding Season badge ===')
{
  const kid = { id: 'k', name: 'Ava', coins: 0, xp: 0 }
  const seasons = [{ number: 1, name: 'Founding Season', startsOn: '2027-03-01', themes: [] }]
  const done = (n, from) => Array.from({ length: n }, (_, i) => ({ id: `s${from}${i}`, kidId: 'k', status: 'approved', decidedAt: at(from) + i * 3600000 }))
  ok('Season 1 runs four months', foundingSeason({ seasons })?.end === at('2027-07-01T00:00:00Z'))
  ok('not on the shelf before Season 1 starts', !badgeState({ seasons: [], submissions: [] }, kid).some((b) => b.id === 'founding-season'))
  const during = { seasons, submissions: [...done(4, '2027-02-20T10:00:00Z'), ...done(10, '2027-03-05T10:00:00Z')] }
  ok('only chores done in Season 1 count', foundingSeasonChores(during, kid) === 10)
  const realNow = Date.now
  Date.now = () => at('2027-04-01T00:00:00Z')
  ok(`${FOUNDING_SEASON_CHORES} of them earn it`, badgeState(during, kid).find((b) => b.id === 'founding-season')?.earned === true)
  ok('nine do not, and the shelf shows how close', badgeState({ seasons, submissions: done(9, '2027-03-05T10:00:00Z') }, kid).find((b) => b.id === 'founding-season')?.have === 9)
  Date.now = () => at('2027-08-01T00:00:00Z')
  ok('after Season 1, kept by a child who earned it', badgeState(during, kid).find((b) => b.id === 'founding-season')?.earned === true)
  ok('and never shown locked to a child who can no longer earn it', !badgeState({ seasons, submissions: done(3, '2027-03-05T10:00:00Z') }, kid).some((b) => b.id === 'founding-season'))
  Date.now = realNow
  const src = readFileSync('src/data/badges.js', 'utf8')
  ok('never bought: counted from accepted chores alone', /approvedFor\(state, kid\.id\)/.test(src.slice(src.indexOf('foundingSeasonChores'))))
}

console.log('\n=== "New Season!" with no new theme ===')
{
  const now = at('2027-07-03T10:00:00Z')
  ok('a Season with no theme queued is still celebrated', seasonToCelebrate({ seasons: [{ number: 2, name: 'Season 2', startsOn: '2027-07-01', themes: [] }], seen: {} }, now)?.number === 2)
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
