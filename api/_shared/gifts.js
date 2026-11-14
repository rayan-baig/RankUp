/**
 * Gift subscriptions, the server's half: making a code once Stripe says a
 * gift is paid for, and sending the two emails.
 *
 * THE CODE. Worked out from the Stripe checkout session with a keyed hash
 * (HMAC-SHA256 under GIFT_CODE_SECRET), so:
 *   - it exists only after payment: the webhook makes it, from a session
 *     Stripe has confirmed paid, and nothing else can;
 *   - it is unguessable without the secret, which never leaves the server;
 *   - every delivery of the same event gives the same code, so a retry after
 *     an email failed sends the same code again, and Stripe's two events for
 *     one payment cannot make two codes;
 *   - the database is given only its sha256 (fulfil_gift_order) and never
 *     holds the code itself.
 * Changing GIFT_CODE_SECRET does not break codes already sold (their hashes
 * are stored); it only means an email that failed before the change cannot
 * be re-sent with the same code, which the webhook reports.
 *
 * Runs on Node and on Cloudflare Workers: WebCrypto only.
 */
import { GIFT_CODE_ALPHABET, GIFT_CODE_LENGTH, formatGiftCode, normalizeGiftCode } from '../../src/lib/giftRules.js'
import { emailConfigured, emailSettings, sendEmail, giftReceiptEmail, giftEmail } from './email.js'

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)))
}

/**
 * The code for a paid checkout session: 12 characters from the alphabet,
 * each from a byte of the keyed hash. Bytes at or above 248 (8 x 31) are
 * skipped so every character is equally likely; another round of the hash
 * is taken in the very unlikely case one is not enough.
 */
export async function giftCodeFor(secret, sessionId) {
  if (!secret || !sessionId) throw new Error('gift code needs GIFT_CODE_SECRET and a session')
  const n = GIFT_CODE_ALPHABET.length
  const limit = 256 - (256 % n)
  let out = ''
  for (let round = 0; out.length < GIFT_CODE_LENGTH; round += 1) {
    for (const byte of await hmac(secret, `gift-code:${round}:${sessionId}`)) {
      if (byte < limit) out += GIFT_CODE_ALPHABET[byte % n]
      if (out.length === GIFT_CODE_LENGTH) break
    }
  }
  return formatGiftCode(out)
}

/** What the database keeps: sha256 of the code without dashes, in hex. Same as redeem_gift_code. */
export async function giftCodeHash(code) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(normalizeGiftCode(code))))
}

/**
 * Where a redeem request came from, as a keyed hash, for the per-address
 * limit. The address itself is never stored. Cloudflare's own header first
 * (a caller cannot set it through Cloudflare), then the host's.
 */
export async function ipKey(req, secret) {
  const h = req?.headers || {}
  const ip = String(h['cf-connecting-ip'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim()
  return hex(await hmac(secret || 'rankup-gift-ip', `ip:${ip}`)).slice(0, 32)
}

/**
 * Stripe says a gift's checkout is paid: make the code, then send the
 * receipt (and the gift, if the buyer asked us to email it). Throws when
 * something should be tried again, so the webhook answers 500 and Stripe
 * retries: an email the provider refused, or email not set up at all. Each
 * email carries an idempotency key, and is marked sent, so a retry never
 * sends one twice.
 */
export async function giftPaid({ session, event, serviceRpc, reportError }) {
  if (session.payment_status !== 'paid') {
    // A bank payment that has not cleared: async_payment_succeeded follows.
    return { received: true, gift: 'awaiting_payment' }
  }
  const orderId = session.metadata?.gift_order || session.client_reference_id
  const secret = process.env.GIFT_CODE_SECRET || ''
  if (!secret) throw new Error('GIFT_CODE_SECRET is not set: a paid gift has no code yet')
  const code = await giftCodeFor(secret, session.id)
  const result = await serviceRpc('fulfil_gift_order', {
    p_order_id: orderId,
    p_session_id: session.id,
    p_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    p_code_hash: await giftCodeHash(code),
    p_amount_minor: Number(session.amount_total) || null,
    p_currency: session.currency ? String(session.currency) : null,
  })
  if (!result?.ok) {
    // An order this database never had, or one refunded before the payment
    // arrived: nothing to give. Answered, so Stripe stops sending it, and
    // reported so a person looks.
    await reportError('stripe-webhook:gift', `gift ${event?.type}: ${result?.reason || 'refused'}`)
    return { received: true, gift: result?.reason || 'refused' }
  }
  if (!result.code_matches) {
    await reportError('stripe-webhook:gift', 'a gift was paid again with a different GIFT_CODE_SECRET; its emails cannot be re-sent')
    return { received: true, gift: 'duplicate' }
  }

  const s = emailSettings()
  if ((!result.receipt_sent || (result.delivery === 'email' && !result.gift_sent)) && !emailConfigured(s)) {
    throw new Error('email is not configured: a paid gift\'s code cannot be sent')
  }
  const site = process.env.PUBLIC_SITE_URL || ''
  const order = { ...result, code, site, replyTo: s.replyTo }
  const sent = []
  if (!result.receipt_sent) {
    const email = giftReceiptEmail(order)
    const r = await sendEmail({ to: result.buyer_email, ...email, idempotencyKey: `gift-receipt:${session.id}` }, s)
    if (!r.ok) throw new Error(`gift receipt not sent: ${r.status} ${r.error || ''}`.trim())
    await serviceRpc('mark_gift_sent', { p_order_id: result.order_id, p_which: 'receipt' })
    sent.push('receipt')
  }
  if (result.delivery === 'email' && result.to_email && !result.gift_sent) {
    const email = giftEmail(order)
    const r = await sendEmail({ to: result.to_email, ...email, idempotencyKey: `gift-send:${session.id}` }, s)
    if (!r.ok) throw new Error(`gift email not sent: ${r.status} ${r.error || ''}`.trim())
    await serviceRpc('mark_gift_sent', { p_order_id: result.order_id, p_which: 'gift' })
    sent.push('gift')
  }
  return { received: true, gift: result.duplicate ? 'duplicate' : 'paid', sent }
}
