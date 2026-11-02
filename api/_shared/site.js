/**
 * Where Stripe sends a person back to: this site, and only this site.
 *
 * Whatever lands in a checkout's success_url or the billing portal's
 * return_url is where Stripe sends somebody after paying, on a page carrying
 * RankUp's name, so an address taken from the request unchecked would be an
 * open redirect wearing our branding.
 *
 * PUBLIC_SITE_URL is the authority when it is set, and on a live site it is
 * (https://rankup.<your domain>; docs/LAUNCH.md). Without it, the browser's
 * Origin header is accepted only when it names this very host, the one the
 * request was sent to. Any other site is refused, and that includes a sibling
 * on the same parent domain: RankUp lives at rankup.<your domain> beside the
 * company's other sites, and none of them is RankUp. An earlier version took
 * any https Origin when the setting was missing.
 *
 * Refused means '' and the caller answers "not configured", rather than
 * quietly rewriting the address, so a misconfiguration is visible.
 */
export function returnOrigin(req) {
  const site = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  if (site) return site
  const headers = req?.headers || {}
  let url
  try { url = new URL(headers.origin || '') } catch { return '' }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return ''
  // The host the request was sent to. Host, not x-forwarded-host: the host
  // routes on Host, so it has to be this site, while a forwarded header is
  // whatever the caller chose to write.
  const own = String(headers.host || '').trim().toLowerCase()
  if (!own || url.host.toLowerCase() !== own) return ''
  return url.origin
}
