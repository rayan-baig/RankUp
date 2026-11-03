/**
 * "Download my data", in a form a person can read.
 *
 * The download was one JSON file: complete, and the right thing for a
 * machine, but a parent opening it sees braces and ids. This builds a second
 * file beside it, a plain web page that opens in any browser: the family,
 * each child, their chores, what was done and decided, the rewards and what
 * was spent on them.
 *
 * It is made from exactly the data the JSON holds, on the phone, so it can
 * hold nothing the JSON does not, and the JSON is the family's own export
 * (export_family_data answers only for the family of the parent asking).
 * Every value is escaped: a child's name or a chore title is text a person
 * typed, and must never become part of the page.
 *
 * It reads both shapes the JSON comes in: the server's (snake_case rows) and,
 * with no server, the phone's own state.
 */

import { PRODUCT_OF } from '../data/legalText.js'

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text made safe to put into HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => escapeMap[c])
}

const list = (x) => (Array.isArray(x) ? x : [])
const when = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const d = new Date(typeof value === 'number' ? value : String(value))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * The export, in one shape whatever it came from: the server's rows or the
 * phone's own state.
 */
export function normaliseExport(payload) {
  const p = payload || {}
  const server = Array.isArray(p.children)
  const kids = (server ? list(p.children) : list(p.kids)).map((k) => ({
    id: k.id, name: k.name, xp: k.xp ?? 0, coins: k.coins ?? 0,
    streak: server ? (k.streak_count ?? 0) : (k.streak?.count ?? 0),
  }))
  const quests = list(p.quests).map((q) => ({
    id: q.id, kidId: server ? q.kid_id : q.kidId, title: q.title, xp: q.xp,
    status: q.status, repeats: q.recurrence || 'once',
  }))
  const submissions = list(p.submissions).map((s) => ({
    questId: server ? s.quest_id : s.questId, kidId: server ? s.kid_id : s.kidId, status: s.status,
    sent: server ? s.submitted_at : s.submittedAt, decided: server ? s.decided_at : s.decidedAt,
    xp: server ? s.awarded_xp : (s.awardedXp ?? s.xp),
  }))
  const rewards = list(p.rewards).map((r) => ({ name: r.name, cost: r.cost }))
  const redemptions = list(p.redemptions).map((r) => ({
    kidId: server ? r.kid_id : r.kidId, name: r.name, cost: r.cost, status: r.status,
    asked: server ? r.created_at : r.at, given: server ? r.given_at : r.givenAt,
  }))
  return {
    familyName: p.family?.name || '',
    exportedAt: p.exported_at || new Date().toISOString(),
    deviceOnly: !server,
    parents: list(p.parents).map((x) => ({ name: x.name, role: x.role || 'parent' })),
    kids, quests, submissions, rewards, redemptions,
  }
}

const table = (headings, rows, empty) => (rows.length
  ? `<table><thead><tr>${headings.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  : `<p class="none">${escapeHtml(empty)}</p>`)

const STATUS = {
  pending: 'Waiting for a parent', approved: 'Accepted', rejected: 'Sent back', redo: 'Sent back',
  assigned: 'To do', requested: 'Asked for', given: 'Given',
}
const status = (s) => STATUS[s] || s || ''

/** The readable file: one self-contained HTML page. */
export function familySummaryHtml(payload) {
  const d = normaliseExport(payload)
  const questTitle = (id) => d.quests.find((q) => q.id === id)?.title || 'A chore since deleted'
  const title = `${d.familyName || 'Your family'}: RankUp data`

  const perKid = d.kids.map((k) => {
    const chores = d.quests.filter((q) => q.kidId === k.id)
    const history = d.submissions.filter((s) => s.kidId === k.id)
      .sort((a, b) => String(b.sent || '').localeCompare(String(a.sent || '')))
    const spent = d.redemptions.filter((r) => r.kidId === k.id)
    return `<section class="kid">
<h2>${escapeHtml(k.name)}</h2>
<p>${escapeHtml(`${k.xp} XP · ${k.coins} coins · ${k.streak}-day streak`)}</p>
<h3>Chores (${chores.length})</h3>
${table(['Chore', 'XP', 'Repeats', 'Now'], chores.map((q) => [q.title, q.xp ?? '', q.repeats, status(q.status)]), 'No chores.')}
<h3>History (${history.length})</h3>
${table(['Sent', 'Chore', 'Result', 'Decided', 'XP'], history.map((s) => [when(s.sent), questTitle(s.questId), status(s.status), when(s.decided), s.xp ?? '']), 'Nothing done yet.')}
<h3>Rewards spent (${spent.length})</h3>
${table(['Asked', 'Reward', 'Cost', 'Given'], spent.map((r) => [when(r.asked), r.name, r.cost, r.status === 'given' ? when(r.given) || 'Yes' : 'Not yet']), 'Nothing spent yet.')}
</section>`
  }).join('\n')

  const orphans = d.submissions.filter((s) => !d.kids.some((k) => k.id === s.kidId))

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#111;background:#fff}
h1{font-size:22px}h2{font-size:19px;margin-top:28px;border-top:2px solid #ddd;padding-top:12px}h3{font-size:15px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e5e5e5;vertical-align:top}
.none,.small{color:#666}.small{font-size:13px}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="small">Downloaded ${escapeHtml(when(d.exportedAt))}${d.deviceOnly ? ', from this phone only' : ''}. This page is the easy-to-read summary. The .json file downloaded with it holds everything RankUp keeps about your family, in full.</p>
<h2>Family</h2>
${table(['Adult', 'Can'], d.parents.map((x) => [x.name, x.role === 'supporter' ? 'Look in' : 'Everything']), 'No adults listed.')}
<p>${escapeHtml(`${d.kids.length} ${d.kids.length === 1 ? 'child' : 'children'}, ${d.quests.length} chores, ${d.submissions.length} finished or sent, ${d.rewards.length} rewards.`)}</p>
<h2>Rewards you set</h2>
${table(['Reward', 'Cost'], d.rewards.map((r) => [r.name, r.cost]), 'No rewards set.')}
${perKid || '<p class="none">No children on the account.</p>'}
${orphans.length ? `<h2>Earlier history</h2>${table(['Sent', 'Chore', 'Result'], orphans.map((s) => [when(s.sent), questTitle(s.questId), status(s.status)]), '')}` : ''}
<p class="small">RankUp keeps no photos. ${escapeHtml(PRODUCT_OF)}</p>
</body>
</html>
`
}
