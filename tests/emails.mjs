/**
 * Every email RankUp's own code sends, rendered and read the way a mail
 * program would show it.
 *
 * Seven kinds are written here (api/_shared/email.js): the free trial's
 * reminders, the reminder that a paused plan starts again, a school's month, the error report, and a gift's two emails
 * (the buyer's receipt with the code, and the gift to the person it is for). Supabase's and Stripe's
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
import {
  trialEmail, pauseReminderEmail, schoolMonthEmail, errorReportEmail, giftReceiptEmail, giftEmail, districtQuoteEmail,
  pilotReminderEmail, pilotRequestEmail, districtTakeoverEmail,
} from '../api/_shared/email.js'
import { TIERS } from '../src/state/initialState.js'
import { PRODUCT_OF } from '../src/data/legalText.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); fails += 1 }
}

const SITE = 'https://rankup.example.test'
const HELP = 'help@example.test'
const GIFT_BUYER = 'gift-buyer@example.com'

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

    // A paused plan starting again in three days: each paid plan, monthly
    // and yearly, with the day as the database writes it, and with none.
    for (const paidTier of ['standard', 'elite']) {
      for (const cycle of ['month', 'year']) {
        for (const resumesLocal of ['Friday 12 December', null]) {
          add(`pause reminder, ${paidTier}, ${cycle}ly, ${resumesLocal ? 'with' : 'without'} the day, ${where}`,
            pauseReminderEmail({ paidTier, cycle, resumesLocal, site, replyTo }))
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
      // Its district pays: its own plan has ended, and that is not the news.
      'paid for by its district': { ...base, status: 'lapsed', renews_at: null, paid: [], district_plan: 'North Valley Unified' },
      'champion, paid for by its district': { ...base, champion: true, status: 'trial', renews_at: null, paid: [], district_plan: 'North Valley Unified' },
    }
    for (const [k, m] of Object.entries(schools)) add(`school month, ${k}, ${where}`, schoolMonthEmail(m, { site, replyTo }))

    // A gift, as fulfil_gift_order hands it to the webhook, every way it can
    // be filled in: each plan, emailed or given by hand, with and without
    // names and a message (which may hold quotes, ampersands and angle
    // brackets as typed), with and without the amount and the date.
    for (const plan of ['standard', 'elite']) {
      for (const delivery of ['email', 'self']) {
        for (const full of [true, false]) {
          const order = {
            order_id: 'ord', plan, delivery, code: 'ABCD-EFGH-JKMN', site, replyTo,
            buyer_email: GIFT_BUYER,
            expires_at: full ? '2028-11-14T10:00:00Z' : null,
            amount_minor: full ? Math.round(TIERS[plan].yearPrice * 100) : null,
            currency: full ? 'USD' : null,
            from_name: full ? 'Grandma "Jo" & Pops' : null,
            to_name: full ? 'The <Rivera> family' : null,
            to_email: delivery === 'email' ? 'riveras@example.com' : null,
            message: full ? 'Happy holidays! Love you all & see you soon <3' : null,
          }
          const name = `${plan}, ${delivery === 'email' ? 'emailed' : 'given by hand'}, ${full ? 'everything filled in' : 'nothing optional'}, ${where}`
          add(`gift receipt, ${name}`, giftReceiptEmail(order))
          if (delivery === 'email') add(`gift to the recipient, ${name}`, giftEmail(order))
        }
      }
    }
  }

  // A district's quote request, every way it can be filled in. What was typed
  // may hold quotes, ampersands and angle brackets.
  for (const full of [true, false]) {
    for (const schools of [1, 140]) {
      add(`district quote, ${schools} school(s), ${full ? 'everything filled in' : 'nothing optional'}, ${site ? 'with' : 'without'} a site`,
        districtQuoteEmail({
          district: 'Big "Plains" & <Co> Unified', name: 'Dr Ames', email: 'ames@district.example',
          schools, role: full ? 'Head of Technology' : '', students: full ? 52000 : null,
          message: full ? 'We need a PO & a W-9 <please>.\nThanks!' : '',
        }, { site }))
    }
  }

  // A school's pilot ending, with and without the price and the day, and the
  // help address.
  for (const days of [1, 14]) {
    for (const full of [true, false]) {
      for (const replyTo of [HELP, '']) {
        add(`pilot reminder, ${days} day(s) left, ${full ? 'everything known' : 'nothing optional'}, ${replyTo ? 'with' : 'without'} help, ${site ? 'with' : 'without'} a site`,
          pilotReminderEmail({
            name: 'Example "Oak" & <Elm> Academy', days_left: days,
            ends_local: full ? 'Monday 30 November 2026' : '',
            price: full ? { ok: true, label: 'Medium school', monthly_cents: 5900, yearly_cents: 59000 } : null,
          }, { site, replyTo }))
      }
    }
  }

  // A school whose district now pays: its own plan set to stop, with and
  // without the day and the help address.
  for (const full of [true, false]) {
    for (const replyTo of [HELP, '']) {
      add(`district takeover, ${full ? 'everything known' : 'nothing optional'}, ${replyTo ? 'with' : 'without'} help, ${site ? 'with' : 'without'} a site`,
        districtTakeoverEmail({
          name: 'Example "Oak" & <Elm> Academy', district: full ? 'North <Valley> Unified' : '',
          period_end: full ? '2026-12-30T00:00:00Z' : null,
        }, { site, replyTo }))
    }
  }

  // "Request a pilot", every way it can be filled in.
  for (const full of [true, false]) {
    add(`pilot request, ${full ? 'everything filled in' : 'nothing optional'}, ${site ? 'with' : 'without'} a site`,
      pilotRequestEmail({
        school: 'Example "Oak" & <Elm> Academy', name: 'Ms Example', email: 'head@example-academy.example',
        role: full ? 'Head of school' : '', town: full ? 'Exampleton' : '', students: full ? 640 : null,
        message: full ? 'We use houses & would love one <soon>.\nThanks!' : '',
      }, { site }))
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
const rendered = ['trialEmail', 'pauseReminderEmail', 'schoolMonthEmail', 'errorReportEmail', 'giftReceiptEmail', 'giftEmail', 'districtQuoteEmail',
  'pilotReminderEmail', 'pilotRequestEmail', 'districtTakeoverEmail']
ok(`the builders in api/_shared/email.js are the ten rendered here (${builders.join(', ')})`,
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

console.log('\n=== A district\'s quote request ===')
{
  const quotes = emails.filter((e) => e.name.startsWith('district quote'))
  ok(`${quotes.length} quote requests rendered`, quotes.length >= 8)
  ok('each says it is the only copy, and how to reply', quotes.every((e) => /the only copy/.test(e.text) && /Replying to this email goes to them/.test(e.text)))
  ok('what was typed is escaped in the HTML part', quotes.every((e) => !/<Co>|<please>/.test(e.html)))
}
{
  const district = emails.filter((e) => e.name.includes('paid for by its district'))
  ok('a school its district pays for is told so, not that its plan ended',
    district.length > 0 && district.every((e) => /North Valley Unified pays for/.test(e.text) && !/Your plan has ended/.test(e.text)))
}

console.log('\n=== A school\'s pilot ending, and a request for one ===')
{
  const reminders = emails.filter((e) => e.name.startsWith('pilot reminder'))
  ok(`${reminders.length} pilot reminders rendered`, reminders.length >= 16)
  const one = pilotReminderEmail({ name: 'Example Academy', days_left: 14, ends_local: 'Monday 30 November 2026',
    price: { ok: true, label: 'Medium school', monthly_cents: 5900, yearly_cents: 59000 } }, { site: SITE, replyTo: HELP })
  ok('the subject says how many days are left', one.subject === 'Your RankUp pilot ends in 14 days', one.subject)
  ok('it says the day, what the school would pay and both ways to buy',
    one.text.includes('ends on Monday 30 November 2026') && one.text.includes('$59.00 a month, or $590.00 a year')
    && /pay by card, or ask for a yearly invoice/.test(one.text))
  ok('that nothing is deleted, and links the report', /Nothing is deleted/.test(one.text) && one.text.includes(`${SITE}/#/school/report`))
  ok('one day left is "1 day"', pilotReminderEmail({ name: 'X', days_left: 1 }, {}).subject === 'Your RankUp pilot ends in 1 day')
  ok('no child is named in it', !/Ava|kid name/.test(one.text))
  const requests = emails.filter((e) => e.name.startsWith('pilot request'))
  ok(`${requests.length} pilot requests rendered`, requests.length >= 4)
  ok('each says it is the only copy, and how to reply', requests.every((e) => /the only copy/.test(e.text) && /Replying to this email goes to them/.test(e.text)))
  ok('what was typed is escaped in the HTML part', requests.every((e) => !/<Elm>|<soon>/.test(e.html)))
}

console.log('\n=== A paused plan starting again ===')
{
  const pauses = emails.filter((e) => e.name.startsWith('pause reminder'))
  ok(`${pauses.length} pause reminders rendered`, pauses.length >= 16)
  const one = pauseReminderEmail({ paidTier: 'standard', cycle: 'month', resumesLocal: 'Friday 12 December', site: SITE, replyTo: HELP })
  ok('the subject says the day it starts again', one.subject === 'Your RankUp plan starts again on Friday 12 December', one.subject)
  ok('it says what is charged then, at the plan list\'s own price',
    one.text.includes(`$${TIERS.standard.price.toFixed(2)} a month`)
    && pauseReminderEmail({ paidTier: 'elite', cycle: 'year', site: SITE }).text.includes(`$${TIERS.elite.yearPrice.toFixed(2)} a year`))
  ok('that nothing was lost while it was paused', /every child, their XP, coins and items are all still there/.test(one.text))
  ok('and that cancelling instead is one tap, with a link to the plan', /Cancelling is one tap/.test(one.text) && one.text.includes(`${SITE}/#/parent/plan`))
  ok('no child is named in it', !/Ava|kid name/.test(one.text))
}

console.log('\n=== A gift ===')
{
  const gifts = emails.filter((e) => e.name.startsWith('gift'))
  const toThem = gifts.filter((e) => e.name.startsWith('gift to the recipient'))
  const receipts = gifts.filter((e) => e.name.startsWith('gift receipt'))
  ok(`${gifts.length} gift emails rendered, both kinds`, toThem.length >= 8 && receipts.length >= 16)
  ok('the email to the recipient never contains the buyer\'s email address, in either part or the subject',
    toThem.every((e) => ![e.subject, e.text, e.html].join('\n').includes(GIFT_BUYER)
      && !/gift-buyer|%40example|buyer@/i.test([e.subject, e.text, e.html].join('\n'))),
    toThem.find((e) => [e.subject, e.text, e.html].join('\n').includes(GIFT_BUYER))?.name || '')
  ok('its subject says who it is from: "<name> gave your family a year of RankUp"',
    toThem.every((e) => /^(Grandma "Jo" & Pops|Someone) gave your family a year of RankUp$/.test(e.subject)),
    toThem.map((e) => e.subject).join(' | '))
  ok('it carries the code, the message when there is one, and how to redeem it',
    toThem.every((e) => e.text.includes('ABCD-EFGH-JKMN') && /Redeem a gift/.test(e.text)
      && (!e.name.includes('everything filled in') || e.text.includes('Happy holidays! Love you all & see you soon <3'))))
  ok('in the HTML part, what the buyer typed is escaped, never markup',
    toThem.every((e) => !e.html.includes('<Rivera>') && !e.html.includes('<3') && (!e.name.includes('everything') || e.html.includes('&lt;3'))))
  ok('the receipt carries the code, the plan, how to redeem it and, with a site, the printable card',
    receipts.every((e) => e.text.includes('ABCD-EFGH-JKMN') && /Redeem a gift/.test(e.text)
      && (e.name.includes(', without a site') || /#\/gift\/card\?code=ABCD-EFGH-JKMN/.test(e.text))))
  ok('and says nothing renews', receipts.every((e) => /Nothing renews and nothing more is charged/.test(e.text)))
  ok('the plan named is the plan bought',
    gifts.every((e) => e.subject.includes('RankUp') && e.text.includes(e.name.includes('standard') ? TIERS.standard.name : TIERS.elite.name)))
}

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
