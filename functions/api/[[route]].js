/**
 * Cloudflare Pages adapter.
 *
 * The five functions in /api are written against Node's request/response pair,
 * which is what Vercel hands them. Cloudflare hands a Fetch `Request` and wants
 * a `Response` back. Rather than fork every handler — five copies of the Stripe
 * webhook is five places for a payment bug to hide — this file translates
 * between the two shapes, so both platforms run the exact same code.
 *
 * Deploying to Cloudflare Pages therefore changes nothing about the handlers,
 * and Vercel keeps working untouched as a fallback.
 */
/*
 * Imported lazily, and that is not a style choice.
 *
 * Several handlers read their secrets into module-level constants — the normal
 * shape for a Node serverless function, where the process already has its
 * environment. A Worker evaluates modules when it starts, before any request
 * and therefore before any binding is in reach, so a static import here would
 * freeze every secret as an empty string and the handler would answer
 * "not_configured" forever. Importing after the bindings are bridged means the
 * constants are read once, correctly, on the first request.
 */
const ROUTES = {
  'billing-portal': () => import('../../api/billing-portal.js'),
  'create-checkout': () => import('../../api/create-checkout.js'),
  'send-push': () => import('../../api/send-push.js'),
  'stripe-webhook': () => import('../../api/stripe-webhook.js'),
  'verify-photo': () => import('../../api/verify-photo.js'),
}

/**
 * The handlers read secrets from process.env. On Workers those arrive as
 * bindings on context.env instead, so process is populated before the handler
 * runs. Assigning rather than replacing keeps anything nodejs_compat already
 * put there.
 */
function bridgeEnv(env) {
  globalThis.process = globalThis.process || {}
  globalThis.process.env = { ...(globalThis.process.env || {}), ...env }
}

/** Enough of Node's ServerResponse for these handlers, collecting into a Response. */
function makeRes() {
  const state = { status: 200, headers: {}, body: '', done: null }
  const finished = new Promise((resolve) => { state.done = resolve })
  const res = {
    status(code) { state.status = code; return res },
    setHeader(k, v) { state.headers[k] = String(v); return res },
    json(payload) {
      state.headers['Content-Type'] = 'application/json'
      state.body = JSON.stringify(payload)
      state.done()
      return res
    },
    send(text) { state.body = text == null ? '' : String(text); state.done(); return res },
    end(text) { if (text != null) state.body = String(text); state.done(); return res },
  }
  return { res, state, finished }
}

export async function onRequest(context) {
  const { request, env, params } = context
  const name = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')
  const load = ROUTES[name]
  if (!load) return new Response('Not found', { status: 404 })

  bridgeEnv(env)
  const handler = (await load()).default

  // The Stripe webhook verifies a signature over the exact bytes it was sent,
  // so the body is read once as text and never re-serialised.
  const raw = request.method === 'GET' || request.method === 'HEAD'
    ? ''
    : await request.text()

  const headers = {}
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })

  let parsed = raw
  if ((headers['content-type'] || '').includes('application/json')) {
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
  }

  const url = new URL(request.url)
  const req = {
    method: request.method,
    headers,
    url: url.pathname + url.search,
    query: Object.fromEntries(url.searchParams),
    body: parsed,
    // stripe-webhook streams the request to get untouched bytes; hand it the
    // text we already read so the signature still matches.
    rawBodyText: raw,
    async *[Symbol.asyncIterator]() { yield new TextEncoder().encode(raw) },
    on() { /* the async iterator above is what the handler actually uses */ },
  }

  const { res, state, finished } = makeRes()
  try {
    await Promise.race([Promise.resolve(handler(req, res)).then(() => finished), finished])
  } catch (err) {
    console.error('[pages-adapter]', name, err?.message)
    if (!state.body) { state.status = 500; state.body = JSON.stringify({ error: 'server_error' }) }
  }
  return new Response(state.body, { status: state.status, headers: state.headers })
}
