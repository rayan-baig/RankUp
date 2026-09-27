/**
 * Money, in minor units, everywhere.
 *
 * Every amount in RankUp is an integer number of pence or cents. Nothing here
 * ever holds a decimal: a float will eventually pay a child £2.9999999999, and
 * no arithmetic in this app is worth having that argument with a nine-year-old.
 * Decimals exist for exactly two moments — reading what a parent typed, and
 * printing it back — and both of them live in this file.
 */

// Currencies whose minor unit is not a hundredth. Yen has no subdivision at
// all, so "£1.50" has no equivalent and the input must not offer one.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX'])

export const CURRENCIES = [
  { code: 'GBP', label: 'British pound', symbol: '£' },
  { code: 'USD', label: 'US dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'CAD', label: 'Canadian dollar', symbol: '$' },
  { code: 'AUD', label: 'Australian dollar', symbol: '$' },
  { code: 'NZD', label: 'New Zealand dollar', symbol: '$' },
  { code: 'JPY', label: 'Japanese yen', symbol: '¥' },
]

export const minorDigits = (currency) => (ZERO_DECIMAL.has(currency) ? 0 : 2)

/**
 * Print an amount.
 *
 * Intl does the work, because getting "£1.50", "1,50 €" and "¥150" right by
 * hand is a decade of edge cases. It is asked for the browser's own locale so
 * a family in Ireland sees euros written the way Ireland writes them, and
 * falls back to something readable if the currency code is one it has never
 * heard of.
 */
export function formatMoney(pence, currency = 'GBP') {
  const digits = minorDigits(currency)
  const amount = pence / 10 ** digits
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    return `${amount.toFixed(digits)} ${currency}`
  }
}

/**
 * Read what a parent typed.
 *
 * Returns whole minor units, or null for anything that is not an amount.
 * Deliberately forgiving about what is around the number — people type "£2",
 * "2.50", " 2 " — and deliberately unforgiving about the number itself: two
 * decimal points, or more digits than the currency has, is a typo and saying
 * so beats guessing which one was meant.
 */
export function parseMoney(input, currency = 'GBP') {
  const text = String(input ?? '').trim().replace(/[^\d.,-]/g, '')
  if (!text) return null
  // One separator, whichever it is. "1.234,56" and "1,234.56" both mean the
  // same thing to a person and neither is worth supporting here — the fields
  // this reads are pocket money, not invoices.
  const normalised = text.replace(',', '.')
  if (!/^\d*\.?\d*$/.test(normalised) || normalised === '.') return null

  const digits = minorDigits(currency)
  const value = Number(normalised)
  if (!Number.isFinite(value) || value < 0) return null

  const [, fraction = ''] = normalised.split('.')
  if (fraction.length > digits) return null

  return Math.round(value * 10 ** digits)
}

/** The symbol on its own, for a field's prefix. */
export function symbolFor(currency = 'GBP') {
  const known = CURRENCIES.find((c) => c.code === currency)
  if (known) return known.symbol
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value || currency
  } catch {
    return currency
  }
}
