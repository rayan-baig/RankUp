/**
 * Sending a scheduled job's pushes in batches the database claims, within
 * what one run of a Cloudflare Function is allowed.
 *
 * A Function run has three budgets: processor time (30 seconds by default on
 * Workers Paid; 10 ms on the free plan, too little for any of this), how many
 * requests it may make to other servers (a push is one, a database call is
 * one; about a thousand on Workers Paid, 50 on free), and the patience of
 * whoever called it. Going past the first stops the run wherever it is; past
 * the second, every further request fails. The reminder and digest jobs used
 * to make three requests per notice and mark each sent only after its push,
 * so 10,000 queued notices ran out of requests a few hundred in, and the
 * ones pushed but not yet marked were pushed again next run.
 *
 * So each round here:
 *   1. claims a batch in one call (the database marks it claimed for five
 *      minutes, and returns each notice with the phones it goes to),
 *   2. sends its pushes, six at a time (Workers keep six connections open at
 *      once; more only queue),
 *   3. records the phones that failed, in one call,
 *   4. finishes the batch, in one call (marked sent; the claim let go).
 * Before each round it checks the run still has the time and requests for a
 * whole batch, and stops if not: whatever is left is still due and unclaimed,
 * and the next run takes it. If the run is stopped part-way anyway (the
 * platform ends it), the batch in hand stays claimed until its claim runs
 * out, and the next run after that sends it again. That is the only way a
 * notice goes twice, and the repeat carries the same Topic, so the push
 * service replaces a copy the phone has not fetched yet, and the same tag, so
 * the phone replaces one it has. Nothing claimed is left unsent.
 *
 * Settings, all optional:
 *   PUSH_BATCH_SIZE        phones per batch (default 100)
 *   PUSH_RUN_SECONDS       start no batch after this many seconds (default 20)
 *   JOB_SUBREQUEST_LIMIT   requests one run may make (default 1000, Workers
 *                          Paid; set it to what the plan allows)
 */
import { sendPush, failureFor } from './push.js'

function whole(value, fallback, min, max) {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

/** Read when asked: on Cloudflare the settings arrive with the first request. */
export function batchLimits() {
  return {
    batch: whole(process.env.PUSH_BATCH_SIZE, 100, 1, 1000),
    seconds: whole(process.env.PUSH_RUN_SECONDS, 20, 1, 900),
    subrequests: whole(process.env.JOB_SUBREQUEST_LIMIT, 1000, 20, 1000000),
    parallel: 6,
  }
}

/*
 * Requests kept back for the run's own bookkeeping (recording that it ran),
 * plus room for one notice going to more phones than the batch: the database
 * always hands over at least one notice, however many phones it has.
 */
const RESERVE = 12

/** Run `fn` over `items`, at most `n` at a time, in order of starting. */
async function eachLimited(items, n, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next
      next += 1
      try { results[i] = { ok: true, value: await fn(items[i], i) } } catch (err) { results[i] = { ok: false, error: err } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return results
}

/**
 * claim(maxPhones, cursor) -> { items: [{ key, targets, payload, ttl?, topic? }], more, cursor }
 *   one database call; items are claimed when it returns
 * finish(items) -> one database call marking them sent
 * serviceRpc    for recording failed phones
 *
 * Returns { batches, notices, sent, failed, stoppedFor } where stoppedFor is
 * null when nothing was left, or 'time' / 'requests' when the run stopped with
 * more still due (the next run takes it).
 */
export async function sendInBatches({ claim, finish, serviceRpc, vapid, limits = batchLimits(), clock = Date.now }) {
  const started = clock()
  let used = 0
  let cursor = null
  const out = { batches: 0, notices: 0, sent: 0, failed: 0, stoppedFor: null }

  for (;;) {
    if (clock() - started > limits.seconds * 1000) { out.stoppedFor = 'time'; break }
    // claim + failures + finish, and at least one push.
    const room = limits.subrequests - used - RESERVE - 3
    if (room < 1) { out.stoppedFor = 'requests'; break }

    used += 1
    const claimed = await claim(Math.min(limits.batch, room), cursor)
    const items = claimed?.items || []
    cursor = claimed?.cursor ?? cursor
    if (!items.length) break
    out.batches += 1
    out.notices += items.length

    const pushes = items.flatMap((item) => (item.targets || []).map((target) => ({ item, target })))
    used += pushes.length
    const results = await eachLimited(pushes, limits.parallel, ({ item, target }) =>
      sendPush({ endpoint: target.endpoint, keys: target.keys }, item.payload,
        { ttl: item.ttl, topic: item.topic, vapid }))

    const failures = []
    results.forEach((r, i) => {
      if (r.ok) { out.sent += 1; return }
      out.failed += 1
      const failure = failureFor(r.error)
      if (failure) failures.push({ endpoint: pushes[i].target.endpoint, gone: failure.gone })
    })
    if (failures.length) {
      used += 1
      // Best effort: a phone not counted this time is counted next time it fails.
      try { await serviceRpc('record_push_failures', { p_failures: failures }) } catch { /* next time */ }
    }

    // Marked sent even when every push failed: a family whose phones are all
    // gone must not be retried every run. The dead phones were dropped above.
    used += 1
    await finish(items)

    if (!claimed.more) break
  }
  return out
}

/**
 * A topic for the push service: at most 32 characters of A-Z a-z 0-9 - _.
 * A topic only has to tell apart the messages waiting for one phone, so a
 * reminder's id (a uuid without its dashes is 32 characters exactly) or a
 * digest's week is enough.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function topicFor(id) {
  const text = String(id || '')
  return (UUID.test(text) ? text.replace(/-/g, '') : text.replace(/[^A-Za-z0-9_-]/g, '')).slice(0, 32) || undefined
}
