/**
 * School districts' side of billing: one plan, yearly, by invoice.
 *
 * Pure functions only, so the decisions that cost or save a district money
 * can be tested without Stripe or a database: which Stripe price each line of
 * the plan is charged at, and what a subscription's prices pay for.
 *
 * Each line of a district's plan is one school size at one discount
 * (district_price_quote, supabase/schools.sql), and each has its own yearly
 * Stripe price, with the line's number of schools as its quantity. The code
 * names prices from settings and never an amount: what a price costs is set
 * in Stripe, at the amounts in docs/PAYMENTS.md, "School districts".
 */

/** One yearly Stripe price per school size and discount. Named in env, never here. */
export const DISTRICT_PRICE_ENV = {
  small: { 10: 'STRIPE_PRICE_DISTRICT_SMALL_10', 20: 'STRIPE_PRICE_DISTRICT_SMALL_20', 30: 'STRIPE_PRICE_DISTRICT_SMALL_30' },
  medium: { 10: 'STRIPE_PRICE_DISTRICT_MEDIUM_10', 20: 'STRIPE_PRICE_DISTRICT_MEDIUM_20', 30: 'STRIPE_PRICE_DISTRICT_MEDIUM_30' },
  large: { 10: 'STRIPE_PRICE_DISTRICT_LARGE_10', 20: 'STRIPE_PRICE_DISTRICT_LARGE_20', 30: 'STRIPE_PRICE_DISTRICT_LARGE_30' },
  xl: { 10: 'STRIPE_PRICE_DISTRICT_XL_10', 20: 'STRIPE_PRICE_DISTRICT_XL_20', 30: 'STRIPE_PRICE_DISTRICT_XL_30' },
}

/** Read by name, spelled out, so tests/config.mjs can see each one is used. */
const fromProcess = () => ({
  STRIPE_PRICE_DISTRICT_SMALL_10: process.env.STRIPE_PRICE_DISTRICT_SMALL_10,
  STRIPE_PRICE_DISTRICT_SMALL_20: process.env.STRIPE_PRICE_DISTRICT_SMALL_20,
  STRIPE_PRICE_DISTRICT_SMALL_30: process.env.STRIPE_PRICE_DISTRICT_SMALL_30,
  STRIPE_PRICE_DISTRICT_MEDIUM_10: process.env.STRIPE_PRICE_DISTRICT_MEDIUM_10,
  STRIPE_PRICE_DISTRICT_MEDIUM_20: process.env.STRIPE_PRICE_DISTRICT_MEDIUM_20,
  STRIPE_PRICE_DISTRICT_MEDIUM_30: process.env.STRIPE_PRICE_DISTRICT_MEDIUM_30,
  STRIPE_PRICE_DISTRICT_LARGE_10: process.env.STRIPE_PRICE_DISTRICT_LARGE_10,
  STRIPE_PRICE_DISTRICT_LARGE_20: process.env.STRIPE_PRICE_DISTRICT_LARGE_20,
  STRIPE_PRICE_DISTRICT_LARGE_30: process.env.STRIPE_PRICE_DISTRICT_LARGE_30,
  STRIPE_PRICE_DISTRICT_XL_10: process.env.STRIPE_PRICE_DISTRICT_XL_10,
  STRIPE_PRICE_DISTRICT_XL_20: process.env.STRIPE_PRICE_DISTRICT_XL_20,
  STRIPE_PRICE_DISTRICT_XL_30: process.env.STRIPE_PRICE_DISTRICT_XL_30,
})

/** The price id for one size at one discount. Empty when not configured. */
export function districtPriceId(band, pct, env = fromProcess()) {
  const name = DISTRICT_PRICE_ENV[band]?.[pct]
  return (name && env[name]) || ''
}

/**
 * The subscription's items for a plan's lines (district_price_quote's
 * `lines`): one price per line, the line's schools as its quantity. Null if
 * any line has no price set, so a district is never invoiced for part of its
 * plan, nor at another line's price.
 */
export function districtItems(lines, env = fromProcess()) {
  if (!Array.isArray(lines) || lines.length === 0) return null
  const items = []
  for (const line of lines) {
    const price = districtPriceId(line?.band, Number(line?.pct), env)
    const quantity = Number(line?.quantity)
    if (!price || !Number.isInteger(quantity) || quantity < 1) return null
    const same = items.find((i) => i.price === price)
    if (same) same.quantity += quantity
    else items.push({ price, quantity })
  }
  return items
}

/**
 * What a district subscription's prices pay for: how many schools of each
 * size. A price that is not one of the twelve (a plan the operator set up by
 * hand in Stripe, for a quoted deal) pays for every school in the district.
 */
export function paidBands(subscription, env = fromProcess()) {
  const byPrice = new Map()
  for (const [band, prices] of Object.entries(DISTRICT_PRICE_ENV)) {
    for (const pct of Object.keys(prices)) {
      const id = districtPriceId(band, Number(pct), env)
      if (id) byPrice.set(id, band)
    }
  }
  const bands = {}
  let all = false
  for (const item of subscription?.items?.data || []) {
    const id = item?.price?.id || item?.plan?.id
    const band = byPrice.get(id)
    if (!band) { all = true; continue }
    bands[band] = (bands[band] || 0) + (Number(item?.quantity) || 0)
  }
  return { bands, all }
}

/**
 * The update that brings a live subscription to a plan's items: quantities
 * changed in place, prices no longer needed taken off, new ones added. Null
 * when the subscription carries a price that is not one of ours (a deal set
 * up by hand), which is the operator's to change, not a button's.
 */
export function districtUpdate(subscription, items, env = fromProcess()) {
  const ours = new Set(Object.values(DISTRICT_PRICE_ENV).flatMap((p) => Object.keys(p).map((pct) => p[pct]))
    .map((name) => env[name]).filter(Boolean))
  const current = subscription?.items?.data || []
  if (current.some((item) => !ours.has(item?.price?.id))) return null
  const wanted = new Map(items.map((i) => [i.price, i.quantity]))
  const out = []
  for (const item of current) {
    if (wanted.has(item.price.id)) {
      out.push({ id: item.id, quantity: wanted.get(item.price.id) })
      wanted.delete(item.price.id)
    } else {
      out.push({ id: item.id, deleted: true })
    }
  }
  for (const [price, quantity] of wanted) out.push({ price, quantity })
  return out
}

/** A short fingerprint of a plan's items, for Stripe's idempotency keys. */
export const itemsKey = (items) => (items || []).map((i) => `${i.price}x${i.quantity}`).sort().join(',')

/** Days the district has to pay each invoice. 30 unless DISTRICT_INVOICE_DAYS says otherwise (1 to 90). */
export function invoiceDays(value = process.env.DISTRICT_INVOICE_DAYS) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 30
}

/** Whether a Stripe object belongs to a district's plan. */
export function districtIdOf(object) {
  return object?.metadata?.district_id
    || object?.parent?.subscription_details?.metadata?.district_id
    || object?.subscription_details?.metadata?.district_id
    || null
}
