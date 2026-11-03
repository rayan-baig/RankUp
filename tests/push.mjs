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
    // One path plays a phone that has been uninstalled, one a push service
    // having a bad moment.
    res.writeHead(req.url.endsWith('/gone') ? 410 : req.url.endsWith('/busy') ? 503 : 201)
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
const BUSY = `http://127.0.0.1:${PORT}/push/busy`
for (const e of [LIVE, GONE, DEAD, BUSY]) await register(e)

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

console.log('\n=== A phone that is offline still gets it later ===')
// A push service holds a message for an offline phone only for as long as the
// TTL header says; with none, or 0, a phone out of signal never sees it.
const ttl = Number(live?.headers?.ttl)
ok('the notice says how long the push service may hold it for an offline phone',
  Number.isFinite(ttl) && ttl >= 24 * 60 * 60, `TTL ${live?.headers?.ttl}`)
ok('and how urgent it is', ['normal', 'high'].includes(live?.headers?.urgency), `Urgency ${live?.headers?.urgency}`)

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
  notice?.title === 'Ava finished a chore' && String(notice?.body).includes('Make the bed'), JSON.stringify(notice))

console.log('\n=== Failures land on the right phone ===')
const rows = (await db.query('select endpoint, failures from push_subscriptions where family_id = $1', [FAMILY])).rows
const byEndpoint = Object.fromEntries(rows.map((r) => [r.endpoint, r.failures]))
ok('a phone the push service says is gone (410) is dropped', !(GONE in byEndpoint), JSON.stringify(byEndpoint))
ok('a send that failed for a reason that is not the phone’s is not counted against it',
  byEndpoint[DEAD] === 0, JSON.stringify(byEndpoint))
ok('and the phone that received it is untouched', byEndpoint[LIVE] === 0)
ok('a push service that is busy (503) is not held against the phone, which would be dropped after five',
  byEndpoint[BUSY] === 0, JSON.stringify(byEndpoint))

console.log('\n=== A reminder is on time or not at all ===')
// Due now, where the family lives.
await db.query('delete from reminder_schedules where family_id = $1', [FAMILY])
await db.query(
  `insert into reminder_schedules (family_id, role, label, at_local, timezone)
   values ($1, 'parent', 'Breakfast check', (now() at time zone 'UTC')::time, 'UTC')`, [FAMILY])
received.length = 0
const remind = await fetch(`${BASE}/api/send-reminders`, {
  method: 'POST', headers: { Authorization: 'Bearer test-cron-secret' },
})
const reminder = received.filter((r) => r.path.endsWith('/live')).at(-1)
ok('the reminder job sends it', remind.status === 200 && Boolean(reminder), `status ${remind.status}, received ${received.length}`)
const reminderTtl = Number(reminder?.headers?.ttl)
ok('held for an offline phone no longer than it would still be on time (the grace window)',
  reminderTtl > 0 && reminderTtl <= 120 * 60, `TTL ${reminder?.headers?.ttl}`)
await db.query('delete from reminder_schedules where family_id = $1', [FAMILY])

console.log('\n=== Many reminders at once, and a run that dies part-way ===')
// 150 families, one phone each, every reminder due now. A run that died is
// played by claiming a batch straight from the database and never finishing
// it: the job must leave that batch alone while its claim holds, send it once
// the claim runs out, and send every reminder exactly once in all.
{
  const N = 150
  const fam = (i) => `a0000000-0000-4000-8000-${String(900000000000 + i)}`
  const user = (i) => `a0000000-0000-4000-8001-${String(900000000000 + i)}`
  const ids = Array.from({ length: N }, (_, i) => i)
  await db.query(`delete from families where name like 'Push batch %'`)
  await db.query(`delete from auth.users where email like 'push-batch-%@example.test'`)
  await db.query(`insert into families (id, name, timezone) select unnest($1::uuid[]), 'Push batch ' || generate_series(1, $2::int), 'UTC'`,
    [ids.map(fam), N])
  await db.query(`insert into auth.users (id, email) select u, 'push-batch-' || n || '@example.test'
                  from unnest($1::uuid[]) with ordinality t(u, n)`, [ids.map(user)])
  await db.query(`insert into parents (user_id, family_id, name) select u, f, 'P' from unnest($1::uuid[], $2::uuid[]) t(u, f)`,
    [ids.map(user), ids.map(fam)])
  await db.query(`insert into push_subscriptions (endpoint, keys, family_id, user_id, role)
                  select 'http://127.0.0.1:${PORT}/push/batch/' || n, $3::jsonb, f, u, 'parent'
                    from unnest($1::uuid[], $2::uuid[]) with ordinality t(f, u, n)`, [ids.map(fam), ids.map(user), JSON.stringify(keys)])
  // Everybody else's reminders are not this test's: switched off while it runs.
  const others = (await db.query(`update reminder_schedules set enabled = false
    where enabled and family_id not in (select id from families where name like 'Push batch %') returning id`)).rows.map((r) => r.id)
  await db.query(`insert into reminder_schedules (family_id, role, label, at_local, timezone)
                  select f, 'parent', 'Morning quests', ((now() - interval '1 minute') at time zone 'UTC')::time, 'UTC'
                    from unnest($1::uuid[]) f`, [ids.map(fam)])
  const dead = await db.query(`select claim_due_reminders(120, 40, 300) as v`)
  const deadIds = (dead.rows[0].v.reminders || []).map((r) => r.family_id)

  const run = async () => {
    const before = received.length
    const res = await fetch(`${BASE}/api/send-reminders`, { method: 'POST', headers: { Authorization: 'Bearer test-cron-secret' } })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body, got: received.slice(before).filter((r) => r.path.includes('/push/batch/')) }
  }
  received.length = 0
  const first = await run()
  ok('the job sends everything due that nobody has claimed', first.status === 200 && first.got.length === N - deadIds.length,
    `${first.status} ${JSON.stringify(first.body)}, ${first.got.length} pushes, ${deadIds.length} claimed by the dead run`)
  ok('in batches, each with its own topic', first.body.batches >= 2 && first.got.every((r) => /^[0-9a-f]{32}$/.test(r.headers.topic || '')),
    `${first.body.batches} batches, topic ${first.got[0]?.headers?.topic}`)
  ok('and leaves the dead run\'s batch alone while its claim holds', deadIds.length === 40 && first.got.length === N - 40)
  await db.query(`update reminder_schedules set claimed_at = claimed_at - interval '6 minutes'
                  where claimed_at is not null and family_id = any($1::uuid[])`, [deadIds])
  const second = await run()
  ok('once that claim runs out, the next run sends that batch', second.status === 200 && second.got.length === 40,
    `${second.got.length} pushes`)
  const third = await run()
  ok('and a third run finds nothing', third.status === 200 && third.got.length === 0 && third.body.due === 0, JSON.stringify(third.body))
  const counts = new Map()
  for (const r of [...first.got, ...second.got]) counts.set(r.path, (counts.get(r.path) || 0) + 1)
  ok('every phone got its reminder exactly once', counts.size === N && [...counts.values()].every((n) => n === 1),
    `${counts.size} phones, ${[...counts.values()].filter((n) => n > 1).length} twice`)
  const unmarked = (await db.query(`select count(*)::int n from reminder_schedules
    where family_id = any($1::uuid[]) and (last_sent_on is null or claimed_at is not null)`, [ids.map(fam)])).rows[0].n
  ok('every one is marked sent, and none is left claimed', unmarked === 0, `${unmarked} not`)
  await db.query(`update reminder_schedules set enabled = true where id = any($1::uuid[])`, [others])
  await db.query(`delete from families where name like 'Push batch %'`)
  await db.query(`delete from auth.users where email like 'push-batch-%@example.test'`)
}

console.log('\n=== A family cannot flood a phone ===')
await db.query(`insert into push_sends (family_id) select $1 from generate_series(1, 60)`, [FAMILY])
const flood = await fetch(`${BASE}/api/send-push`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PARENT}` },
  body: JSON.stringify({ familyId: FAMILY, role: 'parent', kind: 'submission', args: ['Ava', 'Again'] }),
})
ok('the sixty-first notice in an hour is refused', flood.status === 429, `status ${flood.status}`)
await db.query('delete from push_sends where family_id = $1', [FAMILY])

console.log('\n=== ...however many phones it uses ===')
// A second parent, two children's phones and the first parent: four devices,
// sending in turn, as fast as they like. The sixty an hour is the family's.
const COPARENT = 'a0000000-0000-4000-8000-0000000b0002'
const KID_PHONES = ['a0000000-0000-4000-8000-0000000b0003', 'a0000000-0000-4000-8000-0000000b0004']
await db.query(`update families set tier = 'elite' where id = $1`, [FAMILY])
await db.query(`insert into auth.users (id, email) values ($1, 'push-coparent@example.com'), ($2, 'push-kid1@example.com'), ($3, 'push-kid2@example.com')
                on conflict do nothing`, [COPARENT, ...KID_PHONES])
await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Pat') on conflict do nothing`, [COPARENT, FAMILY])
await db.query(`insert into parental_consents (family_id, parent_id, version, method, signed_name)
                select $1, id, '2026-01', 'payment_card', 'Pia' from parents where user_id = $2
                 and not exists (select 1 from parental_consents where family_id = $1)`, [FAMILY, PARENT])
for (const [i, kid] of KID_PHONES.entries()) {
  await db.query(`insert into kids (family_id, user_id, name) values ($1, $2, $3)
                  on conflict (user_id) do nothing`, [FAMILY, kid, `Phone kid ${i}`])
}
const devices = [PARENT, COPARENT, ...KID_PHONES]
const statuses = []
for (let i = 0; i < 64; i += 1) {
  const res = await fetch(`${BASE}/api/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devices[i % devices.length]}` },
    // To the children's side, where no phone is registered: nothing is
    // actually sent, but every request is counted.
    body: JSON.stringify({ familyId: FAMILY, role: 'kid', kind: 'submission', args: ['Ava', `Flood ${i}`] }),
  })
  statuses.push(res.status)
}
ok('four phones in one family get sixty notices an hour between them, not sixty each',
  statuses.slice(0, 60).every((s) => s === 200) && statuses.slice(60).every((s) => s === 429),
  `accepted ${statuses.filter((s) => s === 200).length}, refused ${statuses.filter((s) => s === 429).length}, other ${statuses.filter((s) => s !== 200 && s !== 429).join(',')}`)
const outsider = await fetch(`${BASE}/api/send-push`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KID_PHONES[0]}` },
  body: JSON.stringify({ familyId: 'a0000000-0000-4000-8000-00000000f002', role: 'kid', kind: 'submission', args: ['Ava', 'Elsewhere'] }),
})
ok('and naming another family to count against instead is refused', outsider.status === 403, `status ${outsider.status}`)
await db.query('delete from push_sends where family_id = $1', [FAMILY])
await db.query('delete from kids where family_id = $1 and user_id = any($2)', [FAMILY, KID_PHONES])
await db.query('delete from parents where user_id = $1', [COPARENT])

console.log('\n=== A child asking to join a guild: the parents who must say yes are told ===')
// A guild spans two families: the child's own parent and the parent of the
// family whose guild it is both have to approve. The child's phone is in one
// of them, so it names the guild and the server finds the rest.
const G = {
  ownerFamily: 'a0000000-0000-4000-8000-0000000c0f01',
  askingFamily: 'a0000000-0000-4000-8000-0000000c0f02',
  ownerParent: 'a0000000-0000-4000-8000-0000000c0001',
  ownerSupporter: 'a0000000-0000-4000-8000-0000000c0002',
  ownerKidUser: 'a0000000-0000-4000-8000-0000000c0003',
  askingParent: 'a0000000-0000-4000-8000-0000000c0004',
  askingKidUser: 'a0000000-0000-4000-8000-0000000c0005',
  leader: 'a0000000-0000-4000-8000-0000000c0c01',
  kid: 'a0000000-0000-4000-8000-0000000c0c02',
  guild: 'a0000000-0000-4000-8000-0000000c0e01',
}
await db.query(`insert into auth.users (id, email) values ($1, 'push-g-owner@example.com'), ($2, 'push-g-supporter@example.com'),
                ($3, 'push-g-leader@example.com'), ($4, 'push-g-asker@example.com'), ($5, 'push-g-kid@example.com')
                on conflict do nothing`, [G.ownerParent, G.ownerSupporter, G.ownerKidUser, G.askingParent, G.askingKidUser])
await db.query(`insert into families (id, name, tier) values ($1, 'Guild Owners', 'elite'), ($2, 'Guild Askers', 'elite')
                on conflict do nothing`, [G.ownerFamily, G.askingFamily])
await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'Olu', 'parent'), ($3, $2, 'Gramps', 'supporter'),
                ($4, $5, 'Ade', 'parent') on conflict do nothing`, [G.ownerParent, G.ownerFamily, G.ownerSupporter, G.askingParent, G.askingFamily])
for (const [family, parent] of [[G.ownerFamily, G.ownerParent], [G.askingFamily, G.askingParent]]) {
  await db.query(`insert into parental_consents (family_id, parent_id, version, method, signed_name)
                  select $1, id, '2026-01', 'payment_card', 'Test' from parents where user_id = $2
                   and not exists (select 1 from parental_consents where family_id = $1)`, [family, parent])
}
await db.query(`insert into kids (id, family_id, user_id, name) values ($1, $2, $3, 'Lee'), ($4, $5, $6, 'Juno')
                on conflict do nothing`, [G.leader, G.ownerFamily, G.ownerKidUser, G.kid, G.askingFamily, G.askingKidUser])
await db.query(`insert into guilds (id, name, crest, capacity, leader_kid_id, invite_code, owner_family_id)
                values ($1, 'Sock Hunters', '🛡️', 10, $2, 'PSHG23', $3) on conflict do nothing`, [G.guild, G.leader, G.ownerFamily])
await db.query(`insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent, approved_by_owner)
                values ($1, $2, $3, 'leader', 'active', true, true) on conflict do nothing`, [G.guild, G.leader, G.ownerFamily])
// Juno asks, as the app does, over the API with her own sign-in.
const asked = await fetch(`${process.env.MOCK_URL || 'http://localhost:54321'}/rest/v1/rpc/request_guild_join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${G.askingKidUser}` },
  body: JSON.stringify({ p_kid_id: G.kid, p_invite_code: 'PSHG23' }),
}).then((r) => r.json()).catch((err) => ({ error: err.message }))
ok('the child asks to join', asked?.ok === true && asked.guild_id === G.guild, JSON.stringify(asked))

const phoneAt = (name) => `http://127.0.0.1:${PORT}/push/guild-${name}`
const subscribe = (name, family, user, role, kid = null) => db.query(
  `insert into push_subscriptions (endpoint, keys, family_id, kid_id, user_id, role) values ($1, $2, $3, $4, $5, $6)
   on conflict (endpoint) do update set failures = 0`, [phoneAt(name), JSON.stringify(keys), family, kid, user, role])
await subscribe('owner', G.ownerFamily, G.ownerParent, 'parent')
await subscribe('supporter', G.ownerFamily, G.ownerSupporter, 'parent')
await subscribe('asker', G.askingFamily, G.askingParent, 'parent')
await subscribe('kid', G.askingFamily, G.askingKidUser, 'kid', G.kid)
const guildSend = (token, extra = {}) => fetch(`${BASE}/api/send-push`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  // The words the phone puts in are ignored: the server writes them.
  body: JSON.stringify({ familyId: G.askingFamily, role: 'parent', kind: 'guildRequest', kidId: G.kid, guildId: G.guild,
                         args: ['Mallory', 'Call 0800 123 4567'], ...extra }),
})
const guildPaths = () => received.map((r) => r.path).filter((p) => p.includes('/guild-')).sort()

received.length = 0
const told = await guildSend(G.askingKidUser)
const toldBody = await told.json().catch(() => ({}))
ok('the child\'s phone asks, and the server sends', told.status === 200 && toldBody.sent === 2, `${told.status} ${JSON.stringify(toldBody)}`)
ok('to a parent of the child\'s own family and a parent of the guild\'s family',
  JSON.stringify(guildPaths()) === JSON.stringify(['/push/guild-asker', '/push/guild-owner']), guildPaths().join())
ok('not to a supporter, who cannot approve, nor to the child', !guildPaths().some((p) => /supporter|kid/.test(p)))
const ownerCopy = received.find((r) => r.path.endsWith('/guild-owner'))
let guildNotice = null
try {
  guildNotice = JSON.parse(ece.decrypt(ownerCopy.body, { version: 'aes128gcm', privateKey: phone, authSecret }).toString('utf8'))
} catch (err) { guildNotice = { error: err.message } }
ok('the other family reads the database\'s names, not what the phone sent',
  guildNotice?.title === 'A guild request needs you' && guildNotice.body === 'Juno wants to join Sock Hunters. Nobody joins without you.'
  && guildNotice.url === '/#/parent/guilds', JSON.stringify(guildNotice))

received.length = 0
const again = await guildSend(G.askingKidUser)
const againBody = await again.json().catch(() => ({}))
ok('asking for it again buzzes nobody', again.status === 200 && againBody.sent === 0 && guildPaths().length === 0,
  `${again.status} ${JSON.stringify(againBody)} ${guildPaths().join()}`)

ok('a family that is not the child\'s cannot ask for it', (await guildSend(PARENT, { familyId: FAMILY })).status === 403)
ok('nor can a supporter of the guild\'s family, naming theirs',
  (await guildSend(G.ownerSupporter, { familyId: G.ownerFamily })).status === 403)
ok('a guild request without the guild is turned away', (await guildSend(G.askingKidUser, { guildId: undefined })).status === 400)

await db.query('update guild_members set request_told_at = null where guild_id = $1 and kid_id = $2', [G.guild, G.kid])
await db.query('delete from push_sends where family_id = any($1)', [[G.ownerFamily, G.askingFamily]])
await db.query(`insert into push_sends (family_id) select $1 from generate_series(1, 60)`, [G.askingFamily])
received.length = 0
const capped = await guildSend(G.askingKidUser)
ok('over the asking family\'s hourly ceiling it is refused', capped.status === 429 && guildPaths().length === 0, `status ${capped.status}`)
const stillUntold = (await db.query('select request_told_at from guild_members where guild_id = $1 and kid_id = $2', [G.guild, G.kid])).rows[0]
ok('and the request is not marked as told', stillUntold && stillUntold.request_told_at === null, JSON.stringify(stillUntold))

await db.query('delete from push_sends where family_id = $1', [G.askingFamily])
await db.query(`insert into push_sends (family_id) select $1 from generate_series(1, 60)`, [G.ownerFamily])
received.length = 0
const ownersFull = await guildSend(G.askingKidUser)
ok('with the guild\'s family over its own ceiling, only the child\'s own parents are told',
  ownersFull.status === 200 && JSON.stringify(guildPaths()) === JSON.stringify(['/push/guild-asker']),
  `status ${ownersFull.status} ${guildPaths().join()}`)
const ownerCount = (await db.query('select count(*)::int as n from push_sends where family_id = $1', [G.ownerFamily])).rows[0].n
ok('and the guild\'s family\'s count does not go past its ceiling', ownerCount === 60, `count ${ownerCount}`)

await db.query('delete from push_sends where family_id = any($1)', [[G.ownerFamily, G.askingFamily]])
await db.query('delete from push_subscriptions where family_id = any($1)', [[G.ownerFamily, G.askingFamily]])
await db.query('delete from guilds where id = $1', [G.guild])
await db.query('delete from families where id = any($1)', [[G.ownerFamily, G.askingFamily]])

await db.query('delete from push_subscriptions where family_id = $1', [FAMILY])
server.close()
await db.end()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
