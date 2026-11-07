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
// Imported statically, unlike the handlers below: it reads its settings when
// it is called, not when it is loaded.
import { reportError } from '../../api/_shared/job.js'

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
  'delete-account': () => import('../../api/delete-account.js'),
  health: () => import('../../api/health.js'),
  'run-retention': () => import('../../api/run-retention.js'),
  'send-push': () => import('../../api/send-push.js'),
  'send-digests': () => import('../../api/send-digests.js'),
  'send-reminders': () => import('../../api/send-reminders.js'),
  'send-trial-emails': () => import('../../api/send-trial-emails.js'),
  'settle-alliances': () => import('../../api/settle-alliances.js'),
  'settle-schools': () => import('../../api/settle-schools.js'),
  stats: () => import('../../api/stats.js'),
  'operator-schools': () => import('../../api/operator-schools.js'),
  'operator-themes': () => import('../../api/operator-themes.js'),
  'school-checkout': () => import('../../api/school-checkout.js'),
  'stripe-webhook': () => import('../../api/stripe-webhook.js'),
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

/**
 * Every error this file answers itself is JSON with a code and nothing else:
 * no message from the runtime, no stack, no file name. The handlers answer
 * the same way (tests/api.mjs checks both); the reason, when there is one,
 * goes to the log with console.error, where only the operator reads it.
 */
function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function onRequest(context) {
  const { request, env, params } = context
  const name = Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')
  const load = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null
  if (!load) return jsonError(404, 'not_found')

  bridgeEnv(env)
  let handler
  try {
    handler = (await load()).default
  } catch (err) {
    console.error('[pages-adapter] could not load', name, err?.message)
    return jsonError(500, 'server_error')
  }

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
  // Node's request always carries Host; api/_shared/site.js compares the
  // Origin header against it, so it is filled in here if the runtime left it out.
  if (!headers.host) headers.host = url.host
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
    // A handler that threw before answering: the reason is logged (and goes
    // in the error report), never sent.
    await reportError(name, err)
    if (!state.body) return jsonError(500, 'server_error')
  }
  return new Response(state.body, { status: state.status, headers: state.headers })
}
