/**
 * Every refusal a database function can give is actually given by a test.
 *
 * Most functions here answer `{ ok: false, reason }` rather than raising, and
 * the app turns each reason into a sentence for a parent or a child. A reason
 * no test ever produces is a branch nobody has seen run: it may be
 * unreachable, it may be reached when it should not be, and its sentence on
 * screen has never been checked against it.
 *
 * The list is not kept by hand. It is read from supabase/*.sql: every
 * `jsonb_build_object('ok', false, 'reason', '<reason>'` and the function it
 * sits in. Then the same files are applied to a scratch database with each of
 * those prefixed by a call that only raises a NOTICE naming the function and
 * the reason ('{}'::jsonb || the same object, so every answer is unchanged),
 * the whole SQL suite runs against it, and any pair never raised fails here.
 *
 * Mentioning a reason in a test is not enough: it has to come out of the
 * function while the suite runs.
 *
 *   node supabase/test/refusals.mjs          (needs the Postgres run.sh uses)
 *
 * A reason that cannot be reached from any test on purpose goes in UNREACHED
 * below, with the reason why. Nothing is there today.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = process.env.REFUSALS_DB || 'rankup_refusals'
const env = {
  ...process.env,
  PGHOST: process.env.PGHOST || '/tmp',
  PGPORT: process.env.PGPORT || '55432',
  PGUSER: process.env.PGUSER || 'postgres',
}

/** Allowed to go unexercised, each with why. Keep this empty if you can. */
const UNREACHED = new Map([
  // ['function_name:reason', 'why no test can reach it'],
])

// The order run.sh applies them in, read from run.sh so there is one list.
const runSh = readFileSync(join(HERE, 'run.sh'), 'utf8')
const order = [...runSh.split('\n').find((l) => l.startsWith('for f in') && l.includes('00b-helpers'))
  .matchAll(/\$HERE\/\.\.\/([a-z-]+\.sql)/g)].map((m) => m[1])

const REFUSAL = /jsonb_build_object\(\s*'ok',\s*false\s*,\s*'reason',\s*'([a-z0-9_]+)'/g
const HEADER = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi

/** Every (function, reason) in a file, and the file with each one marked. */
function scan(text) {
  const headers = [...text.matchAll(HEADER)].map((m) => ({ at: m.index, name: m[1].toLowerCase() }))
  const fnAt = (index) => {
    let name = null
    for (const h of headers) { if (h.at < index) name = h.name; else break }
    return name
  }
  const pairs = []
  const marked = text.replace(REFUSAL, (match, reason, offset) => {
    const fn = fnAt(offset) || 'top_level'
    pairs.push(`${fn}:${reason}`)
    return `public.refusal_seen('${fn}', '${reason}') || ${match}`
  })
  return { pairs, marked }
}

const psql = (args, opts = {}) => spawnSync('psql', ['-X', '-q', ...args], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })

const expected = new Set()
const work = mkdtempSync(join(tmpdir(), 'rankup-refusals-'))
try {
  for (const file of order) {
    const { pairs, marked } = scan(readFileSync(join(ROOT, file), 'utf8'))
    pairs.forEach((p) => expected.add(p))
    writeFileSync(join(work, file), marked)
  }

  psql(['-c', `drop database if exists ${DB}`, 'postgres'])
  const made = psql(['-c', `create database ${DB}`, 'postgres'])
  if (made.status !== 0) { console.log(`could not create ${DB}: ${made.stderr}`); process.exit(1) }

  const apply = (path) => {
    const r = psql(['-v', 'ON_ERROR_STOP=1', '-f', path, DB])
    if (r.status !== 0) { console.log(`${basename(path)} FAILED TO APPLY:\n${r.stderr}`); process.exit(1) }
  }
  apply(join(HERE, '00-shim.sql'))
  // Raises a notice and returns an empty object, so `|| jsonb_build_object(...)`
  // answers exactly what it did before. A notice survives a test's rollback,
  // which a row written to a table would not.
  writeFileSync(join(work, '000-seen.sql'), `
    create or replace function public.refusal_seen(p_fn text, p_reason text)
    returns jsonb language plpgsql volatile as $$
    begin
      raise notice 'REFUSED %:%', p_fn, p_reason;
      return '{}'::jsonb;
    end $$;
    grant execute on function public.refusal_seen(text, text) to public;
  `)
  apply(join(work, '000-seen.sql'))
  // Twice, with the schema recorded after each, exactly as run.sh does, so
  // 18-upgrade.sql runs here as it does there.
  const snapshot = (pass) => {
    const r = psql(['-v', 'ON_ERROR_STOP=1', '-v', `pass=${pass}`, '-f', join(HERE, 'upgrade-snapshot.sql'), DB])
    if (r.status !== 0) { console.log(`could not record the schema:\n${r.stderr}`); process.exit(1) }
  }
  for (const file of order) apply(join(work, file))
  apply(join(HERE, '00b-helpers.sql'))
  snapshot('first')
  for (const file of order) apply(join(work, file))
  snapshot('second')

  const seen = new Set()
  let failedFiles = 0
  const tests = readdirSync(HERE).filter((f) => /^\d\d-.*\.sql$/.test(f) && !f.startsWith('00-')).sort()
  for (const t of tests) {
    // A test that applies one of the SQL files again (07-consent.sql does, to
    // prove the upgrade path) gets the marked copy, or the marks would be
    // gone for every test after it.
    const source = readFileSync(join(HERE, t), 'utf8')
      .replace(/^\\ir \.\.\/([a-z-]+\.sql)\s*$/gm, (line, file) => (order.includes(file) ? `\\i ${join(work, file)}` : line))
    const copy = join(work, `test-${t}`)
    writeFileSync(copy, source)
    const r = psql(['-v', 'ON_ERROR_STOP=1', '-f', copy, DB],
      { env: { ...env, PGOPTIONS: '-c client_min_messages=notice' } })
    for (const m of `${r.stdout}\n${r.stderr}`.matchAll(/REFUSED ([a-z0-9_]+:[a-z0-9_]+)/g)) seen.add(m[1])
    // A test file failing here fails in run.sh too, and says why there.
    if (r.status !== 0) {
      failedFiles += 1
      console.log(`  ${t} stopped early: ${(r.stderr.match(/ERROR:.*$/m) || [''])[0]}`)
    }
  }

  const missing = [...expected].filter((p) => !seen.has(p) && !UNREACHED.has(p)).sort()
  const stale = [...UNREACHED.keys()].filter((p) => !expected.has(p) || seen.has(p))
  console.log(`\n=== Every refusal reason in supabase/*.sql is given by a test ===`)
  console.log(`  ${expected.size} refusals found in the SQL, ${[...expected].filter((p) => seen.has(p)).length} given by the suite`)
  if (failedFiles) console.log(`  (${failedFiles} test file(s) stopped early; see run.sh for why)`)
  for (const p of missing) console.log(`  FAIL never given: ${p.replace(':', ' -> ')}`)
  for (const p of stale) console.log(`  FAIL UNREACHED lists ${p}, which is now given or gone: take it out`)
  const ok = missing.length === 0 && stale.length === 0 && failedFiles === 0
  console.log(ok ? '\nALL REFUSALS EXERCISED' : `\nREFUSALS NOT EXERCISED: ${missing.length}`)
  process.exitCode = ok ? 0 : 1
} finally {
  rmSync(work, { recursive: true, force: true })
  psql(['-c', `drop database if exists ${DB}`, 'postgres'])
}
