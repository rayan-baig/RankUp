/**
 * Every email RankUp's own code sends, rendered and read the way a mail
 * program would show it.
 *
 * Three kinds are written here (api/_shared/email.js): the free trial's
 * reminders, a school's month, and the error report. Supabase's and Stripe's
 * emails are written in their dashboards (docs/EMAILS.md), not by this code.
 * Each kind is rendered in every variant it has, and each one must have:
 *
 *   - a plain-text part, as well as the HTML one;
 *   - no blank left unfilled: no undefined, null, NaN, {{ }}, [YOUR ...] or
 *     <your domain>;
 *   - the "RankUp is a product of MTRX Horizyn." footer exactly once in each
 *     part;
 *   - nothing wider than 600px, the width every mail program shows whole;
 *   - the same words, in the same order, and the same links, in both parts:
 *     a reader whose mail program shows the plain text is told nothing less.
 *
 * Reads code only; needs nothing running.
 */
import { readFileSync } from 'node:fs'
import { trialEmail, schoolMonthEmail, errorReportEmail } from '../api/_shared/email.js'
import { TIERS } from '../src/state/initialState.js'
import { PRODUCT_OF } from '../src/data/legalText.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); fails += 1 }
}

const SITE = 'https://rankup.example.test'
const HELP = 'help@example.test'

// ---------- every variant of every kind ----------
const emails = []
const add = (name, email) => emails.push({ name, ...email })

for (const site of [SITE, '']) {
  for (const replyTo of [HELP, '']) {
    const where = `${site ? 'with' : 'without'} a site, ${replyTo ? 'with' : 'without'} a support address`
    for (const paidTier of Object.keys(TIERS)) {
      for (const trialTier of Object.keys(TIERS).filter((t) => t !== paidTier)) {
        for (const daysLeft of [3, 2, 1]) {
          add(`trial, ${daysLeft} days left, ${trialTier} over ${paidTier}, ${where}`,
            trialEmail({ kind: 'three_days', trialTier, paidTier, endsLocal: 'Friday 14 November', daysLeft, site, replyTo }))
        }
        // The end date as the database writes it, and with none at all.
        add(`trial, 3 days left, no end date given, ${trialTier} over ${paidTier}, ${where}`,
          trialEmail({ kind: 'three_days', trialTier, paidTier, daysLeft: 3, site, replyTo }))
        for (const daysLeft of [0, 1]) {
          add(`trial, last day (${daysLeft ? 'the evening before' : 'on the day'}), ${trialTier} over ${paidTier}, ${where}`,
            trialEmail({ kind: 'last_day', trialTier, paidTier, endsLocal: 'Friday 14 November', daysLeft, site, replyTo }))
        }
      }
    }

    const base = {
      name: 'Hill <School> & Co', district: 'North Valley', month_key: '2026-09', score: 14.24, students: 41, ranked: true,
      verified: true, min_students: 5, rank: 1, ranked_schools: 4, champion: false, free_month_given: false,
      rivalries: [], paid: [{ currency: 'USD', minor: 4900 }], status: 'active', renews_at: '2026-11-14T10:00:00Z',
    }
    const schools = {
      placed: { ...base, rank: 2 },
      'the only ranked school': { ...base, ranked_schools: 1 },
      champion: { ...base, champion: true, free_month_given: true, rivalries: [{ rival: 'Lake', result: 'won' }, { rival: 'Pond', result: 'draw' }, { rival: 'Sea', result: 'lost' }] },
      'champion, month to come': { ...base, champion: true },
      'not yet checked': { ...base, ranked: false, verified: false, rank: null, students: 3, paid: [], status: 'trial', renews_at: null, trial_ends_at: '2026-10-20T00:00:00Z' },
      'too few students': { ...base, ranked: false, rank: null, students: 1 },
      'paid twice': { ...base, paid: [{ currency: 'USD', minor: 4900 }, { currency: 'EUR', minor: 1200 }] },
      cancelling: { ...base, renews_at: null, ends_at: '2026-11-20T00:00:00Z' },
      lapsed: { ...base, status: 'lapsed', renews_at: null, paid: [] },
    }
    for (const [k, m] of Object.entries(schools)) add(`school month, ${k}, ${where}`, schoolMonthEmail(m, { site, replyTo }))
  }

  const errorKinds = [
    { source: 'app', where: '/parent/settings', message: 'TypeError: rewards.map is not a function', count: 3, new: true },
    { source: 'server', where: 'create-checkout', message: 'create_checkout failed: 500', count: 1, new: false },
    { source: 'server', where: 'send-trial-emails', message: '2 email(s) not sent', count: 2, new: false },
  ]
  add(`error report, one error, ${site ? 'with' : 'without'} a site`, errorReportEmail({ kinds: errorKinds.slice(0, 1), more: 0 }, { site }))
  add(`error report, three and more to come, ${site ? 'with' : 'without'} a site`, errorReportEmail({ kinds: errorKinds, more: 4 }, { site }))
}

// ---------- every kind the code can send is here ----------
console.log('\n=== Every email RankUp sends itself is rendered here ===')
const source = readFileSync(new URL('../api/_shared/email.js', import.meta.url), 'utf8')
const builders = [...source.matchAll(/^export function (\w+Email)\(/gm)].map((m) => m[1])
const rendered = ['trialEmail', 'schoolMonthEmail', 'errorReportEmail']
ok(`the builders in api/_shared/email.js are the three rendered here (${builders.join(', ')})`,
  builders.length === rendered.length && builders.every((b) => rendered.includes(b)),
  `a new one needs its variants added to tests/emails.mjs: ${builders.filter((b) => !rendered.includes(b)).join(', ')}`)
ok(`${emails.length} emails rendered`, emails.length > 100)

// ---------- reading an HTML part as a mail program shows it ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
const decode = (t) => t.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
const visible = (html) => decode(html
  .replace(/<!doctype[^>]*>/i, '')
  .replace(/<(style|head)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:)]/g
const linksIn = (text) => [...text.matchAll(URL_RE)].map((m) => m[0])
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => decode(m[1]))
// Words, in order, without links (an HTML part puts a link in href, the text
// part beside its label) and without the text part's "--" footer rule.
const words = (text) => text.replace(URL_RE, ' ').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’&@.+-]*/gu)
  ?.map((w) => w.replace(/[.'’-]+$/, '')).filter(Boolean) || []
const count = (text, needle) => text.split(needle).length - 1

const BLANKS = /undefined|\bnull\b|NaN|\{\{|\}\}|\[YOUR|<your domain>|&lt;your domain&gt;|\$\{/i

for (const [title, check] of [
  ['Each has a plain-text part as well as the HTML one', (e) => [
    // A school's name as typed may hold a "<"; markup may not.
    typeof e.text === 'string' && e.text.trim().length > 80 && !/<\/?(p|a|br|div|hr|html|body|span)\b[^>]*>/i.test(e.text)
      && /^<!doctype html>/i.test(e.html || '') && Boolean(e.subject),
    `${(e.text || '').length} characters of text`]],
  ['No blank left unfilled', (e) => {
    const hit = [e.subject, e.text, visible(e.html)].join('\n').match(BLANKS)
    return [!hit, hit ? `"${hit[0]}" in it` : '']
  }],
  ['The footer is there once, in each part', (e) => [
    count(e.text, PRODUCT_OF) === 1 && count(visible(e.html), PRODUCT_OF) === 1,
    `text ${count(e.text, PRODUCT_OF)}, HTML ${count(visible(e.html), PRODUCT_OF)}`]],
  ['Nothing is wider than 600px', (e) => {
    const widths = [...e.html.matchAll(/(?:^|[\s;"'])(?:min-|max-)?width\s*[:=]\s*["']?(\d+)(px)?/gi)].map((m) => Number(m[1]))
    const tooWide = widths.filter((w) => w > 600)
    return [tooWide.length === 0 && !/width\s*:\s*\d+(vw|em|rem)/i.test(e.html), `widths ${widths.join(', ')}`]
  }],
  ['The same words, in the same order, in both parts', (e) => {
    const a = words(e.text)
    const b = words(visible(e.html))
    const at = a.findIndex((w, i) => w !== b[i])
    return [a.length === b.length && at === -1,
      at === -1 ? `text has ${a.length} words, HTML ${b.length}` : `from word ${at}: text "${a.slice(at, at + 6).join(' ')}", HTML "${b.slice(at, at + 6).join(' ')}"`]
  }],
  ['And the same links', (e) => {
    const inText = [...new Set(linksIn(e.text))].sort()
    const inHtml = [...new Set([...hrefs(e.html), ...linksIn(visible(e.html))])].sort()
    return [JSON.stringify(inText) === JSON.stringify(inHtml), `text ${inText.join(' ')} | HTML ${inHtml.join(' ')}`]
  }],
]) {
  console.log(`\n=== ${title} ===`)
  const bad = emails.map((e) => [e, ...check(e)]).filter(([, good]) => !good)
  ok(`all ${emails.length}`, bad.length === 0, bad.slice(0, 3).map(([e, , why]) => `${e.name}: ${why}`).join('; '))
}

console.log('\n=== The error report names no family ===')
{
  const leaky = errorReportEmail({
    kinds: [{ source: 'app', where: '/parent/kid/42', count: 1, new: true,
      message: 'TypeError at 4f1c9a00-0000-4000-8000-00000000000f for someone@example.com, token eyJabc.def.ghi, "Quoted value"' }],
  }, { site: SITE })
  const both = `${leaky.text}\n${leaky.html}`
  ok('even a message the database somehow left an email, id, token or quoted value in comes out scrubbed',
    !/@example\.com|4f1c9a00|eyJabc|Quoted value/.test(both), leaky.text)
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
