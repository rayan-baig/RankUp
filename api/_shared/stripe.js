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

export function makeStripe(secret) {
  if (!isEdgeRuntime()) return new Stripe(secret)
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

/** Verify a webhook signature on either runtime. */
export function verifyWebhook(stripe, body, signature, secret) {
  const provider = isEdgeRuntime() ? Stripe.createSubtleCryptoProvider() : undefined
  return stripe.webhooks.constructEventAsync(body, signature, secret, undefined, provider)
}
