/**
 * The Sunday Market.
 *
 * A shop that opens for four hours a week — Sunday 20:00 until midnight, on the
 * device's own clock — and sells cosmetics you cannot get anywhere else.
 *
 * WHAT THIS IS, PLAINLY: a scarcity mechanic aimed at children, and the Flash
 * Ticket beside it is a paid way out of missing one. That combination is
 * exactly the pattern the FTC, the UK CMA and both app stores' family policies
 * look hardest at. Three things keep it on the right side of the line, and all
 * three are enforced in code rather than promised here:
 *
 *   1. Only a parent can buy a Flash Ticket — it lives behind the parent PIN,
 *      and a kid's device cannot reach the purchase at all.
 *   2. Nothing sold here affects earning. Skins are paint. A child who never
 *      sees the market is never behind one who buys every week.
 *   3. No countdown timer is shown to the child. The market is either open or
 *      it is shut, and a shut market says when it opens next — once.
 */

export const MARKET_OPENS_HOUR = 20 // 8pm, device local time
export const MARKET_CLOSES_HOUR = 24

/**
 * Cosmetics only, on purpose. Each is a CSS treatment applied to the child's
 * avatar ring, so a skin costs the app nothing and gives no advantage.
 */
export const MARKET_SKINS = [
  { id: 'ember', name: 'Ember Halo', cost: 120, icon: '🔥',
    ring: 'conic-gradient(from 0deg, #ff8a3d, #ffd76f, #ff5f3d, #ff8a3d)' },
  { id: 'tide', name: 'Tide Glass', cost: 120, icon: '🌊',
    ring: 'conic-gradient(from 0deg, #4fd1e8, #2f7ff0, #7ef0d6, #4fd1e8)' },
  { id: 'orchard', name: 'Orchard Bloom', cost: 150, icon: '🌸',
    ring: 'conic-gradient(from 0deg, #ff9ec7, #ffd4e6, #b98cff, #ff9ec7)' },
  { id: 'circuit', name: 'Live Circuit', cost: 150, icon: '🔌',
    ring: 'conic-gradient(from 0deg, #7cf5a0, #22c1a4, #d7ff8a, #7cf5a0)' },
  { id: 'dusk', name: 'Dusk Prism', cost: 200, icon: '🌆',
    ring: 'conic-gradient(from 0deg, #8b6bff, #ff7ad9, #4fa8ff, #8b6bff)' },
  { id: 'gilded', name: 'Gilded Crown', cost: 260, icon: '👑',
    ring: 'conic-gradient(from 0deg, #ffd76f, #b8860b, #fff2c4, #ffd76f)' },
]

export function findSkin(id) {
  return MARKET_SKINS.find((s) => s.id === id) || null
}

/** Sunday is day 0. Open from 20:00 to midnight, on the device's own clock. */
export function isMarketOpen(now = new Date()) {
  return now.getDay() === 0 && now.getHours() >= MARKET_OPENS_HOUR
}

/**
 * When it next opens, as a plain sentence rather than a ticking clock.
 *
 * A countdown is the part of a scarcity mechanic that actually pressures a
 * child, so this deliberately rounds to days and never counts seconds.
 */
export function nextOpeningLabel(now = new Date()) {
  if (isMarketOpen(now)) return 'Open now'
  const isSundayBefore = now.getDay() === 0 && now.getHours() < MARKET_OPENS_HOUR
  if (isSundayBefore) return 'Opens tonight at 8pm'
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7
  if (daysUntilSunday === 1) return 'Opens tomorrow at 8pm'
  return `Opens Sunday at 8pm · ${daysUntilSunday} days`
}
