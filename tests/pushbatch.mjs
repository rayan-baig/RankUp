/**
 * The scheduled jobs' push batches (api/_shared/pushBatch.js), in Node, with
 * every request counted.
 *
 * A Cloudflare Function run may make only so many requests (a push is one, a
 * database call is one) and has only so much time. The reminder and digest
 * jobs used to make three requests a notice and mark each sent after its
 * push, so a queue of 10,000 ran out of requests a few hundred in, and the
 * notices pushed but not marked went again the next run. This holds the
 * batching to its promises, with fetch replaced by a counter and the database
 * by a queue in memory that claims the way claim_due_reminders does
 * (supabase/test/46-push-batches.sql checks the real one):
 *
 *   - a run never makes more requests than its limit, and stops with the rest
 *     unclaimed, so the next run sends them;
 *   - nothing is sent twice across runs, and nothing claimed is left unsent;
 *   - a run stops starting batches when its time is up;
 *   - one notice with more phones than a batch still goes, whole;
 *   - failed phones are recorded in one call per batch, and only the push
 *     service's answers about a phone count against it;
 *   - the VAPID signature is reused per push service, and every push names a
 *     Topic, so a repeat replaces rather than adds.
 *
 * tests/push.mjs runs the real job under workerd, including a run that dies
 * part-way; tools/pushload.mjs times 10,000.
 */
import webpush from 'web-push'
import crypto from 'node:crypto'
import { sendInBatches, topicFor, batchLimits } from '../api/_shared/pushBatch.js'

const fails = []
const ok = (n, cond, d = '') => {
  if (cond) console.log('  PASS', n)
  else { fails.push(n); console.log('  FAIL', n, '—', d) }
}

const keys = webpush.generateVAPIDKeys()
const vapid = { subject: 'mailto:test@example.test', publicKey: keys.publicKey, privateKey: keys.privateKey }
const phoneKey = crypto.createECDH('prime256v1')
phoneKey.generateKeys()
const phone = { p256dh: phoneKey.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }

/* Every request the job makes goes through here. */
let requests = []
let open = 0
let mostOpen = 0
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  requests.push({ url: u, headers: init.headers || {} })
  open += 1
  mostOpen = Math.max(mostOpen, open)
  await new Promise((resolve) => setTimeout(resolve, 1))
  open -= 1
  if (u.includes('/dead/')) throw new TypeError('fetch failed')
  const status = u.includes('/gone/') ? 410 : u.includes('/busy/') ? 503 : u.includes('/db/') ? 200 : 201
  return new Response(u.includes('/db/') ? '{}' : '', { status })
}

/** The database, in memory: a queue of notices, claimed and finished as the SQL does. */
function makeQueue(notices) {
  const state = new Map(notices.map((n) => [n.id, 'due']))
  const finished = []
  const db = {
    state,
    finished,
    async claim(maxPhones) {
      await fetch('https://example.test/db/claim')
      const items = []
      let phones = 0
      let more = false
      for (const n of notices) {
        if (state.get(n.id) !== 'due') continue
        if (items.length && phones + n.targets.length > maxPhones) { more = true; break }
        state.set(n.id, 'claimed')
        phones += n.targets.length
        items.push({ ...n, payload: JSON.stringify({ title: 'Morning quests' }), topic: topicFor(n.id), ttl: 7200 })
      }
      return { items, more }
    },
    async finish(items) {
      await fetch('https://example.test/db/finish')
      for (const i of items) { state.set(i.id, 'sent'); finished.push(i.id) }
    },
    serviceRpc: async (fn, args) => {
      await fetch(`https://example.test/db/${fn}`)
      db.lastFailures = args?.p_failures
      db.failureCalls = (db.failureCalls || 0) + 1
    },
  }
  return db
}

const notice = (i, phones = 1, kind = 'live') => ({
  id: crypto.randomUUID(),
  targets: Array.from({ length: phones }, (_, k) => ({ endpoint: `https://push.example.test/${kind}/${i}-${k}`, keys: phone })),
})

console.log('\n=== 2,500 notices, a run may make 1,000 requests ===')
{
  const notices = Array.from({ length: 2500 }, (_, i) => notice(i))
  const db = makeQueue(notices)
  const limits = { batch: 100, seconds: 600, subrequests: 1000, parallel: 6 }
  const runs = []
  for (let run = 0; run < 10; run += 1) {
    requests = []
    const r = await sendInBatches({ claim: db.claim, finish: db.finish, serviceRpc: db.serviceRpc, vapid, limits })
    runs.push({ ...r, requests: requests.length })
    if (!r.notices) break
  }
  ok('no run makes more requests than it may, with room left to record that it ran',
    runs.every((r) => r.requests <= 1000 - 2), runs.map((r) => r.requests).join(', '))
  ok('a run that reaches its limit says so', runs[0].stoppedFor === 'requests', String(runs[0].stoppedFor))
  ok('and the next run carries on where it stopped', runs[1].sent > 0 && runs.length <= 4, `${runs.length} runs`)
  const pushes = new Map()
  // Counted from what was finished; every finished notice's phones were pushed in its run.
  for (const id of db.finished) pushes.set(id, (pushes.get(id) || 0) + 1)
  ok('every notice is sent, once', db.finished.length === 2500 && [...pushes.values()].every((n) => n === 1),
    `${db.finished.length} finished`)
  ok('and none is left claimed', [...db.state.values()].every((s) => s === 'sent'))
  ok('the last run finds nothing and says nothing is left', runs.at(-1).notices === 0 && runs.at(-1).stoppedFor === null)
}

console.log('\n=== Out of time ===')
{
  const db = makeQueue(Array.from({ length: 1000 }, (_, i) => notice(i)))
  let now = 0
  const clock = () => now
  const claim = async (max) => { now += 5000; return db.claim(max) }
  const r = await sendInBatches({ claim, finish: db.finish, serviceRpc: db.serviceRpc, vapid,
    limits: { batch: 50, seconds: 20, subrequests: 100000, parallel: 6 }, clock })
  ok('a run starts no batch once its time is up', r.stoppedFor === 'time' && r.batches === 5, `${r.batches} batches, ${r.stoppedFor}`)
  ok('every batch it started is finished', [...db.state.values()].filter((s) => s === 'claimed').length === 0)
  ok('and the rest is still due, for the next run', [...db.state.values()].filter((s) => s === 'due').length === 750)
}

console.log('\n=== A family with more phones than a batch ===')
{
  const db = makeQueue([notice(0, 30), notice(1, 1)])
  requests = []
  const r = await sendInBatches({ claim: db.claim, finish: db.finish, serviceRpc: db.serviceRpc, vapid,
    limits: { batch: 10, seconds: 600, subrequests: 1000, parallel: 6 } })
  ok('its notice goes to every phone, in a batch of its own', r.batches === 2 && r.sent === 31, JSON.stringify(r))
  ok('six requests open at a time at most, as Workers allow', mostOpen <= 6 && mostOpen > 1, String(mostOpen))
}

console.log('\n=== Phones that fail ===')
{
  const db = makeQueue([notice(0, 1, 'gone'), notice(1, 1, 'busy'), notice(2, 1, 'dead'), notice(3, 1, 'live')])
  db.failureCalls = 0
  const r = await sendInBatches({ claim: db.claim, finish: db.finish, serviceRpc: db.serviceRpc, vapid,
    limits: { batch: 100, seconds: 600, subrequests: 1000, parallel: 6 } })
  ok('sent and failed are counted', r.sent === 1 && r.failed === 3, JSON.stringify(r))
  ok('failures are recorded in one call for the batch', db.failureCalls === 1, String(db.failureCalls))
  ok('a phone the push service says is gone is recorded as gone',
    db.lastFailures?.length === 1 && db.lastFailures[0].gone === true && db.lastFailures[0].endpoint.includes('/gone/'),
    JSON.stringify(db.lastFailures))
  ok('a busy push service and no network are not held against the phone',
    !db.lastFailures.some((f) => /busy|dead/.test(f.endpoint)))
  ok('and the batch is still marked sent, so a family with no working phone is not retried all day',
    [...db.state.values()].every((s) => s === 'sent'))
}

console.log('\n=== A database that fails part-way ===')
{
  const db = makeQueue([notice(0), notice(1)])
  let threw = false
  try {
    await sendInBatches({ claim: db.claim, finish: async () => { throw new Error('finish failed: 502') },
      serviceRpc: db.serviceRpc, vapid, limits: { batch: 100, seconds: 600, subrequests: 1000, parallel: 6 } })
  } catch { threw = true }
  ok('a batch that cannot be marked sent fails the run, so it is reported, and stays claimed until its claim runs out',
    threw && [...db.state.values()].every((s) => s === 'claimed'))
}

console.log('\n=== The signature and the topic ===')
{
  const db = makeQueue([notice(0, 2), { id: crypto.randomUUID(), targets: [{ endpoint: 'https://other-push.example.test/live/x', keys: phone }] }])
  requests = []
  await sendInBatches({ claim: db.claim, finish: db.finish, serviceRpc: db.serviceRpc, vapid,
    limits: { batch: 100, seconds: 600, subrequests: 1000, parallel: 6 } })
  const pushes = requests.filter((r) => !r.url.includes('/db/'))
  const auth = (r) => r.headers.Authorization || r.headers.authorization
  ok('two pushes to one push service share a signature', auth(pushes[0]) && auth(pushes[0]) === auth(pushes[1]))
  ok('another push service gets its own', auth(pushes[2]) && auth(pushes[2]) !== auth(pushes[0]))
  const jwt = /t=([^,\s]+)/.exec(auth(pushes[2]) || '')?.[1] || ''
  const claims = JSON.parse(Buffer.from(jwt.split('.')[1] || 'e30', 'base64url').toString())
  ok('naming that push service', claims.aud === 'https://other-push.example.test', JSON.stringify(claims))
  ok('every push names a topic of at most 32 safe characters',
    pushes.every((r) => /^[A-Za-z0-9_-]{1,32}$/.test(r.headers.Topic || '')), pushes.map((r) => r.headers.Topic).join(' '))
  ok('a uuid becomes one', topicFor('46e00000-0000-4000-8000-00000000000a') === '46e0000000004000800000000000000a')
}

console.log('\n=== The settings ===')
{
  const saved = { ...process.env }
  Object.assign(process.env, { JOB_SUBREQUEST_LIMIT: '5000', PUSH_RUN_SECONDS: '40', PUSH_BATCH_SIZE: '250' })
  const l = batchLimits()
  ok('read from the host', l.subrequests === 5000 && l.seconds === 40 && l.batch === 250, JSON.stringify(l))
  Object.assign(process.env, { JOB_SUBREQUEST_LIMIT: 'lots', PUSH_RUN_SECONDS: '-1', PUSH_BATCH_SIZE: '1.5' })
  const d = batchLimits()
  ok('and a typo is the default, not nothing', d.subrequests === 1000 && d.seconds === 20 && d.batch === 100, JSON.stringify(d))
  process.env = saved
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nALL PUSH BATCH CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
