/**
 * No price and no trial length is typed into the app by hand.
 *
 * The parent dashboard said "Elite Pass — $15.99/mo" in its own words, the
 * kids screen said "Standard ($9.99 a month)", and the terms said a failed
 * payment moved a family to "Standard features". Each was true once and none
 * of them would have changed with the plan list. Every price and every trial
 * length a parent reads has to come from the code that charges it:
 *
 *   TIERS and TRIAL_DAYS          src/state/initialState.js
 *   FLASH_TICKET_PACKS            src/lib/billing.js
 *   SCHOOL_PRICES and its days    src/lib/schools.js
 *
 * This reads every file in src/ with comments taken out, and fails on a
 * dollar amount, a "N a month"/"N a year"/"N/mo" price, or a "N days free" /
 * "N-day trial" written as a literal anywhere other than those lists. A
 * value worked out in a template (`${...}`) is fine: that is the point.
 *
 * Needs nothing running.   node tests/prices.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** Where prices are allowed to be written: the lists themselves. */
const PRICE_LISTS = new Set([
  'src/state/initialState.js',
  'src/lib/billing.js',
  'src/lib/schools.js',
])

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(jsx?|mjs)$/.test(name) ? [path] : []
  })
}

/**
 * The code with comments removed, line by line so the line numbers still
 * point at the right place. Strings are kept: a `//` inside a quoted URL is
 * not a comment.
 */
export function withoutComments(source) {
  let out = ''
  let i = 0
  let quote = null
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += next || ''; i += 2; continue }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
      continue
    }
    if (c === '/' && next === '/' && !/[:\w]$/.test(out.slice(-1))) {
      while (i < source.length && source[i] !== '\n') { out += ' '; i += 1 }
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c
    i += 1
  }
  return out
}

/** What a reader sees: template expressions are worked out, so they are not typed. */
const typed = (line) => line.replace(/\$\{[^}]*\}/g, '«value»').replace(/\{[^{}'"`]*\}/g, '«value»')

const RULES = [
  { name: 'a dollar amount', pattern: /\$\s?\d/ },
  { name: 'a price per month or year', pattern: /\b\d+(?:\.\d+)?\s?(?:\/\s?(?:mo|month|yr|year)\b|a month\b|a year\b|per month\b|per year\b)/i },
  { name: 'a free trial length', pattern: /\b\d+[- ]days?\b[^.]{0,24}\b(?:free|trial)\b|\b(?:free|trial)\b[^.]{0,24}\b\d+[- ]?days?\b/i },
]

/** Words that may legitimately carry a number before "a month" and are not money. */
const NOT_MONEY = [
  /\b\d+ (?:times|chores?|quests?) a (?:month|year)\b/i,
]

console.log('\n=== Nothing in src/ types a price or a trial length by hand ===')
const files = walk('src')
const found = []
for (const file of files) {
  const rel = file.replace(/\\/g, '/')
  if (PRICE_LISTS.has(rel)) continue
  const lines = withoutComments(readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, n) => {
    const seen = typed(line)
    for (const rule of RULES) {
      // "$1" in a .replace() is a regular expression's group, not money.
      if (rule === RULES[0] && /\.replace\(/.test(seen) && !/\$\d+\.\d/.test(seen)) continue
      if (rule.pattern.test(seen) && !NOT_MONEY.some((p) => p.test(seen))) {
        found.push(`${rel}:${n + 1} (${rule.name}): ${line.trim().slice(0, 110)}`)
      }
    }
  })
}
ok(`${files.length} files read`, files.length > 50)
ok('no hand-typed price or trial length', found.length === 0, `\n    ${found.join('\n    ')}`)

console.log('\n=== The test itself catches what it is meant to ===')
// A rule that never fires passes for ever. Each of these must be caught.
const caught = (source) => withoutComments(source).split('\n')
  .some((line) => RULES.some((r) => r.pattern.test(typed(line))))
ok('"Elite Pass — $15.99/mo" is caught', caught('<Banner title="Elite Pass — $15.99/mo" />'))
ok('"Standard (9.99 a month)" is caught', caught("const s = 'Standard (9.99 a month)'"))
ok('"14 days free" is caught', caught("const s = 'Try it 14 days free'"))
ok('"a 14-day trial" is caught', caught("const s = 'Start a 14-day trial'"))
ok('"free for 14 days" is caught', caught('<p>Free for 14 days</p>'))
ok('a price worked out from the list is not', !caught('<p>Elite Pass — ${priceTag(TIERS.elite)}</p>'))
ok('nor a trial length read from TRIAL_DAYS', !caught('<p>Free for {TRIAL_DAYS} days</p>'))
ok('nor a price in a comment', !caught('// It was $4.99 a month\nconst x = 1'))
ok('nor one in a block comment', !caught('/* $9.99, never "$9.990" */\nconst y = 2'))
ok('a URL in a string is not mistaken for a comment', caught("const u = 'https://x.test' + ' $5'"))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
