/**
 * Serverless function: which deals are on right now (0.23.0).
 *
 * GET, no sign-in: the Give page reads it before anybody has an account. It
 * answers only what a parent's screen shows: each deal's percent, its real
 * end date, and for Founding Families the places left, counted in the
 * database. Never a coupon id, never anything about a family. A child's
 * phone never asks (src/lib/billing.js, fetchDeals).
 *
 * The rules for when each deal is on are in src/lib/deals.js, shared with
 * create-checkout and gift-checkout, so what this says and what a checkout
 * charges cannot drift apart. Kept 60 seconds, so a busy day costs the
 * database one count a minute.
 */
import { makeServiceRpc, reportError } from './_shared/job.js'
import { foundingDeal, giftSale, seasonDeal, publicDeals, settingCount, FOUNDING_DEFAULT_LIMIT } from '../src/lib/deals.js'

/** The settings the deals read, as they are now. */
export function dealSettings() {
  // Each by its own name, so tests/config.mjs can check they are documented.
  return {
    STRIPE_FOUNDING_COUPON: process.env.STRIPE_FOUNDING_COUPON,
    FOUNDING_PERCENT: process.env.FOUNDING_PERCENT,
    FOUNDING_FAMILIES_LIMIT: process.env.FOUNDING_FAMILIES_LIMIT,
    FOUNDING_ENDS_AT: process.env.FOUNDING_ENDS_AT,
    STRIPE_GIFT_SALE_COUPON: process.env.STRIPE_GIFT_SALE_COUPON,
    GIFT_SALE_PERCENT: process.env.GIFT_SALE_PERCENT,
    GIFT_SALE_FROM: process.env.GIFT_SALE_FROM,
    GIFT_SALE_TO: process.env.GIFT_SALE_TO,
    STRIPE_SEASON_COUPON: process.env.STRIPE_SEASON_COUPON,
    SEASON_DEAL_PERCENT: process.env.SEASON_DEAL_PERCENT,
    SEASON_DEAL_ON: process.env.SEASON_DEAL_ON,
  }
}

/**
 * Every deal as it stands, with the database's numbers: the Founding places
 * left and the newest Season. A deal whose number cannot be had (the
 * database did not answer) is off, never guessed.
 */
export async function currentDeals(rpc, settings = dealSettings(), now = Date.now()) {
  let founding = foundingDeal(settings, { now })
  if (founding) {
    try {
      const left = await rpc('founding_places_left', { p_limit: settingCount(settings.FOUNDING_FAMILIES_LIMIT, FOUNDING_DEFAULT_LIMIT) })
      founding = foundingDeal(settings, { left: Number(left), now })
    } catch {
      founding = null
    }
  }
  const gift = giftSale(settings, { now })
  let season = null
  if (String(settings.STRIPE_SEASON_COUPON || '').trim()) {
    try {
      const s = await rpc('current_season', {})
      season = seasonDeal(settings, s ? { number: s.number, name: s.name, startsOn: s.starts_on } : null, { now })
    } catch {
      season = null
    }
  }
  return { founding, gift, season }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Use GET.' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  res.setHeader('Cache-Control', 'public, max-age=60')
  if (!url || !key) return res.status(200).json({ ok: true, ...publicDeals({}) })
  try {
    const deals = await currentDeals(makeServiceRpc(url, key))
    return res.status(200).json({ ok: true, ...publicDeals(deals) })
  } catch (err) {
    await reportError('deals', err)
    return res.status(200).json({ ok: true, ...publicDeals({}) })
  }
}
