/**
 * One Stripe client that works on both runtimes.
 *
 * On a Node host the SDK's default HTTP client is fine. On Cloudflare Workers
 * there is no Node http module, so the SDK has to be told to use fetch, and
 * signature verification has to use the async form because WebCrypto's digest
 * is async and the synchronous constructEvent cannot await it.
 *
 * constructEventAsync works on Node too, so the webhook uses it unconditionally
 * rather than branching — one path, exercised everywhere.
 */
import Stripe from 'stripe'

/** True on Cloudflare Workers and other non-Node fetch runtimes. */
export function isEdgeRuntime() {
  return typeof globalThis.process?.versions?.node !== 'string'
}

/**
 * Where Stripe's API is. Unset means Stripe itself, which is the only right
 * answer in production. tests/api.mjs sets it to a stand-in it runs, so the
 * checkout, portal and webhook paths can be driven — including Stripe being
 * down — without a real account.
 */
function apiHost() {
  const base = process.env.STRIPE_API_BASE || ''
  if (!base) return {}
  try {
    const url = new URL(base)
    return { host: url.hostname, port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80), protocol: url.protocol.replace(':', '') }
  } catch {
    return {}
  }
}

export function makeStripe(secret) {
  return new Stripe(secret, {
    // The SDK waits eighty seconds by default. A parent tapping "Manage
    // billing" while Stripe is struggling was left looking at a spinner for
    // well over a minute, and a Worker can be cut off before then, which
    // answers with nothing the app can explain. Ten seconds, one retry, then
    // a plain "Stripe is not answering" (see stripeUnavailable).
    timeout: 10000,
    maxNetworkRetries: 1,
    ...apiHost(),
    ...(isEdgeRuntime() ? { httpClient: Stripe.createFetchHttpClient() } : {}),
  })
}

/**
 * True when the failure is Stripe being unreachable or broken, rather than
 * Stripe refusing what was asked. The first is worth telling a parent to try
 * again in a few minutes; the second is a fault here, and is logged.
 */
export function stripeUnavailable(err) {
  const type = err?.type || err?.rawType || ''
  return type === 'StripeConnectionError' || type === 'StripeAPIError'
    || Number(err?.statusCode) >= 500
}

/** Verify a webhook signature on either runtime. */
export function verifyWebhook(stripe, body, signature, secret) {
  const provider = isEdgeRuntime() ? Stripe.createSubtleCryptoProvider() : undefined
  return stripe.webhooks.constructEventAsync(body, signature, secret, undefined, provider)
}
