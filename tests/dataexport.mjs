/**
 * The readable copy of "Download my data" (src/lib/dataExport.js).
 *
 * It is a web page built from text people typed: a child's name, a chore, a
 * reward. None of it may become part of the page's code. It must read both
 * shapes the export comes in (the server's rows, and a phone with no server),
 * and say only what that export holds.
 *
 * tests/download.mjs downloads both files from the real app.
 *
 * Needs nothing running.   node tests/dataexport.mjs
 */
import { familySummaryHtml, normaliseExport, escapeHtml } from '../src/lib/dataExport.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const server = {
  exported_at: '2026-11-03T10:00:00Z',
  family: { name: 'The <b>Bold</b> Family' },
  parents: [{ name: 'Sam', role: 'parent' }, { name: 'Gran', role: 'supporter' }],
  children: [
    { id: 'k1', name: '<script>alert(1)</script>', xp: 120, coins: 24, streak_count: 3 },
    { id: 'k2', name: 'Noah', xp: 0, coins: 0, streak_count: 0 },
  ],
  quests: [
    { id: 'q1', kid_id: 'k1', title: 'Feed the "cat" & dog', xp: 30, status: 'approved', recurrence: 'daily' },
    { id: 'q2', kid_id: 'k2', title: 'Tidy up', xp: 20, status: 'assigned', recurrence: 'once' },
  ],
  submissions: [
    { quest_id: 'q1', kid_id: 'k1', status: 'approved', submitted_at: '2026-11-02T08:00:00Z', decided_at: '2026-11-02T09:00:00Z', awarded_xp: 30 },
    { quest_id: 'q1', kid_id: 'k1', status: 'rejected', submitted_at: '2026-11-01T08:00:00Z', decided_at: '2026-11-01T09:00:00Z' },
  ],
  rewards: [{ name: "Pick Friday's film", cost: 50 }],
  redemptions: [{ kid_id: 'k1', name: "Pick Friday's film", cost: 50, status: 'given', created_at: '2026-11-02T10:00:00Z', given_at: '2026-11-02T18:00:00Z' }],
}
const html = familySummaryHtml(server)

console.log('\n=== Typed text never becomes code ===')
ok('escapeHtml escapes the five characters', escapeHtml(`<a href="x" title='y'>&</a>`) === '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
ok('a child called <script> is shown, not run', !html.includes('<script>') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
ok('a family name with tags is text', html.includes('The &lt;b&gt;Bold&lt;/b&gt; Family') && !html.includes('<b>Bold</b>'))
ok('quotes and ampersands in a chore are escaped', html.includes('Feed the &quot;cat&quot; &amp; dog'))
ok('the page has no script at all', !/<script/i.test(html))

console.log('\n=== It says what the export holds ===')
ok('a heading per child', (html.match(/<section class="kid">/g) || []).length === 2)
ok('each child\'s XP, coins and streak', html.includes('120 XP · 24 coins · 3-day streak'))
ok('their chores, with how often', html.includes('<td>daily</td>') && html.includes('Tidy up'))
ok('the history, accepted and sent back, with dates', html.includes('<td>Accepted</td>') && html.includes('<td>Sent back</td>') && html.includes('2026-11-02'))
ok('the rewards set, and what was spent and given', html.includes('Rewards you set') && html.includes('Rewards spent (1)') && html.includes('Pick Friday&#39;s film'))
ok('the adults, and what a supporter can do', html.includes('Gran') && html.includes('Look in'))
ok('a child with nothing yet says so', html.includes('Nothing done yet.'))
ok('it points to the JSON for the full record', html.includes('.json file'))
ok('and says who runs RankUp', html.includes('MTRX Horizyn'))

console.log('\n=== Invites: counts, never who ===')
{
  const withRefs = familySummaryHtml({ ...server, referrals: {
    joined_with_a_code: null, your_code: 'HJ4K2P', families_joined_with_your_code: 2,
    free_months: [{ decided_at: '2026-11-04T10:00:00Z', state: 'applied', amount: 1599, currency: 'USD', plan: 'elite' },
      { decided_at: '2026-11-05T10:00:00Z', state: 'banked' }],
  } })
  ok('the download says how many families joined with the code', withRefs.includes('<h2>Invites</h2>') && withRefs.includes('2 families joined with your code'))
  ok('and each free month, what it was worth and where it is', withRefs.includes('On your account') && withRefs.includes('15.99 USD')
    && withRefs.includes('Banked until you choose a plan'))
  ok('a download with no referrals has no invites section', !html.includes('<h2>Invites</h2>'))
}

console.log('\n=== A phone with no server ===')
const local = {
  exported_at: '2026-11-03T10:00:00Z', source: 'this device only',
  family: { name: 'Local Family' },
  kids: [{ id: 'a', name: 'Ava', xp: 45, coins: 9, streak: { count: 2 } }],
  quests: [{ id: 'qa', kidId: 'a', title: 'Make your bed', xp: 15, status: 'approved', recurrence: 'daily' }],
  submissions: [{ questId: 'qa', kidId: 'a', status: 'approved', submittedAt: Date.parse('2026-11-01T08:00:00Z'), decidedAt: Date.parse('2026-11-01T09:00:00Z') }],
  rewards: [{ name: 'Ice cream', cost: 40 }],
  redemptions: [{ kidId: 'a', name: 'Ice cream', cost: 40, status: 'requested', at: Date.parse('2026-11-02T08:00:00Z') }],
}
const n = normaliseExport(local)
ok('the phone\'s own state reads the same way', n.kids[0].name === 'Ava' && n.kids[0].streak === 2 && n.quests[0].kidId === 'a'
  && n.submissions[0].questId === 'qa' && n.redemptions[0].kidId === 'a' && n.deviceOnly === true)
const localHtml = familySummaryHtml(local)
ok('and its summary says it came from this phone only', localHtml.includes('from this phone only') && localHtml.includes('Make your bed') && localHtml.includes('Not yet'))

console.log('\n=== Only what it was given ===')
ok('nothing in the page that is not in the export', !html.includes('Ava') && !localHtml.includes('Noah'))
ok('an empty export is still a page that says there is nothing', familySummaryHtml({}).includes('No children on the account.'))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
