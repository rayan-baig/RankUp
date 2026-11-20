/**
 * The Skin Market (was the Sunday Market).
 *
 * Cosmetics a child saves up for with the coins their chores earn. Until
 * 0.22.0 it opened for four hours on Sunday evenings, with rarity labels
 * (Common, Rare, Legendary) and a paid Flash Ticket as the way round missing
 * it: a scarcity mechanic aimed at children. Now:
 *
 *   1. It is always open. No opening hours, no countdown, nothing that goes
 *      away: a child saves up and buys when they have enough.
 *   2. No rarity labels. Skins have prices, not ranks.
 *   3. Only a parent can buy a Flash Ticket, behind the parent PIN; a child's
 *      phone never shows what a ticket costs in real money.
 *   4. Nothing sold here affects earning. Skins are paint. A child who never
 *      opens it is never behind one who buys every week.
 */

/**
 * Cosmetics only, on purpose. Each is a CSS treatment applied to the child's
 * avatar ring, so a skin costs the app nothing and gives no advantage.
 *
 * `tickets` is what claiming it with Flash Tickets costs, so a ticket has a
 * size (the whole set costs eleven). Mirrored in buy_market_skin() in
 * supabase/billing.sql, which is the authority on what a claim actually
 * costs; supabase/test/08-billing.sql checks the two agree, because a client
 * that could name its own price would make the dearest skin free.
 */
export const MARKET_SKINS = [
  { id: 'ember', name: 'Ember Halo', cost: 120, tickets: 1, icon: '🔥',
    ring: 'conic-gradient(from 0deg, #ff8a3d, #ffd76f, #ff5f3d, #ff8a3d)' },
  { id: 'tide', name: 'Tide Glass', cost: 120, tickets: 1, icon: '🌊',
    ring: 'conic-gradient(from 0deg, #4fd1e8, #2f7ff0, #7ef0d6, #4fd1e8)' },
  { id: 'orchard', name: 'Orchard Bloom', cost: 150, tickets: 2, icon: '🌸',
    ring: 'conic-gradient(from 0deg, #ff9ec7, #ffd4e6, #b98cff, #ff9ec7)' },
  { id: 'circuit', name: 'Live Circuit', cost: 150, tickets: 2, icon: '🔌',
    ring: 'conic-gradient(from 0deg, #7cf5a0, #22c1a4, #d7ff8a, #7cf5a0)' },
  { id: 'dusk', name: 'Dusk Prism', cost: 200, tickets: 2, icon: '🌆',
    ring: 'conic-gradient(from 0deg, #8b6bff, #ff7ad9, #4fa8ff, #8b6bff)' },
  { id: 'gilded', name: 'Gilded Crown', cost: 260, tickets: 3, icon: '👑',
    ring: 'conic-gradient(from 0deg, #ffd76f, #b8860b, #fff2c4, #ffd76f)' },
]

/** What claiming this skin with tickets costs. */
export function ticketCost(skin) {
  return skin?.tickets ?? 1
}

/** Tickets needed to own every skin in the shop — what the biggest pack targets. */
export const FULL_SET_TICKETS = MARKET_SKINS.reduce((n, s) => n + ticketCost(s), 0)

export function findSkin(id) {
  return MARKET_SKINS.find((s) => s.id === id) || null
}

/** The market's name, wherever it is shown. */
export const MARKET_NAME = 'Skin Market'
