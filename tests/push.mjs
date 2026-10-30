/**
 * Push notifications, end to end, through the runtime that sends them.
 *
 * No real push service is reachable from the sandbox this is developed in, so
 * for a long time push was the one feature that had never delivered anything.
 * Then it turned out it could not have: the sender used Node's https module,
 * which Cloudflare Workers do not have, and every push failed.
 *
 * This stands in for the push service. It listens locally, registers itself as
 * a parent's phone, has the real endpoint (under workerd, production build)
 * send a notice, and then does what a phone and a push service do between
 * them: checks the VAPID signature says who sent it, and decrypts the body
 * with the phone's own keys. If the words come out, push works.
 *
 * Also: a phone the push service says is gone (410) is dropped, and a send
 * that fails for a reason that is not the phone's (nothing listening) is NOT
 * counted against it.
 *
 * Needs the Cloudflare stack up:  supabase/test/up.sh --cf
 */
import http from 'node:http'
import crypto from 'node:crypto'
import pg from 'pg'
import ece from 'http_ece'

const BASE = process.env.API_BASE || 'http://localhost:8788'
const PORT = 8791

const fails = []
const ok = (n, cond, d = '') => {
  if (cond) console.log('  PASS', n)
  else { fails.push(n); console.log('  FAIL', n, '—', d) }
}

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const PARENT = 'a0000000-0000-4000-8000-0000000b0001'
const FAMILY = 'a0000000-0000-4000-8000-0000000bf001'
await db.query(`insert into auth.users (id, email) values ($1, 'push-parent@example.com') on conflict do nothing`, [PARENT])
await db.query(`insert into families (id, name) values ($1, 'Push Family') on conflict do nothing`, [FAMILY])
await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Pia') on conflict do nothing`, [PARENT, FAMILY])

// --- the stand-in push service -------------------------------------------
const received = []
const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) })
    // One path plays a phone that has been uninstalled.
    res.writeHead(req.url.endsWith('/gone') ? 410 : 201)
    res.end()
  })
})
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

// --- the "phone" ---------------------------------------------------------
const phone = crypto.createECDH('prime256v1')
phone.generateKeys()
const authSecret = crypto.randomBytes(16)
const keys = { p256dh: phone.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') }

async function register(endpoint) {
  await db.query(
    `insert into push_subscriptions (endpoint, keys, family_id, user_id, role)
     values ($1, $2, $3, $4, 'parent')
     on conflict (endpoint) do update set failures = 0`,
    [endpoint, JSON.stringify(keys), FAMILY, PARENT])
}
await db.query('delete from push_subscriptions where family_id = $1', [FAMILY])
const LIVE = `http://127.0.0.1:${PORT}/push/live`
const GONE = `http://127.0.0.1:${PORT}/push/gone`
const DEAD = 'http://127.0.0.1:1/push/nothing-listening'
for (const e of [LIVE, GONE, DEAD]) await register(e)

const sendRes = await fetch(`${BASE}/api/send-push`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PARENT}` },
  body: JSON.stringify({ familyId: FAMILY, role: 'parent', kind: 'submission', args: ['Ava', 'Make the bed'] }),
})
const sendBody = await sendRes.json().catch(() => ({}))

console.log('\n=== The notice leaves the server ===')
ok('the endpoint accepts the send', sendRes.status === 200, `status ${sendRes.status} ${JSON.stringify(sendBody)}`)
const live = received.find((r) => r.path.endsWith('/live'))
ok('and the push service receives it', Boolean(live), `received ${received.length}`)

console.log('\n=== The push service can tell who sent it ===')
let claims = null
let verified = false
if (live) {
  const auth = String(live.headers.authorization || '')
  const jwt = /t=([^,\s]+)/.exec(auth)?.[1]
  const k = /k=([^,\s]+)/.exec(auth)?.[1]
  if (jwt && k) {
    const [h, p, sig] = jwt.split('.')
    claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    const raw = Buffer.from(k, 'base64url')
    const key = crypto.createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') },
      format: 'jwk',
    })
    verified = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
  }
}
ok('it carries a VAPID signature that verifies against the server’s public key', verified)
ok('addressed to this push service', claims?.aud === `http://127.0.0.1:${PORT}`, JSON.stringify(claims))
ok('and not already expired', claims && claims.exp * 1000 > Date.now())

console.log('\n=== Only the phone can read it ===')
let notice = null
if (live) {
  try {
    const plain = ece.decrypt(live.body, { version: 'aes128gcm', privateKey: phone, authSecret })
    notice = JSON.parse(plain.toString('utf8'))
  } catch (err) {
    notice = { error: err.message }
  }
}
ok('the body is encrypted (the words are not in it)', live && !live.body.toString('latin1').includes('Make the bed'))
ok('and decrypts, with the phone’s own keys, to the right notice',
  notice?.title === 'Ava finished a quest' && String(notice?.body).includes('Make the bed'), JSON.stringify(notice))

console.log('\n=== Failures land on the right phone ===')
const rows = (await db.query('select endpoint, failures from push_subscriptions where family_id = $1', [FAMILY])).rows
const byEndpoint = Object.fromEntries(rows.map((r) => [r.endpoint, r.failures]))
ok('a phone the push service says is gone (410) is dropped', !(GONE in byEndpoint), JSON.stringify(byEndpoint))
ok('a send that failed for a reason that is not the phone’s is not counted against it',
  byEndpoint[DEAD] === 0, JSON.stringify(byEndpoint))
ok('and the phone that received it is untouched', byEndpoint[LIVE] === 0)

await db.query('delete from push_subscriptions where family_id = $1', [FAMILY])
server.close()
await db.end()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
