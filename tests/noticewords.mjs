/**
 * The words on the lock screen, and where a tap on them goes.
 *
 * Every notice RankUp sends, to a parent or a child, by push or on the phone
 * where it happened, is written in src/data/noticeWords.js. This holds those
 * words to their rules, with the longest name and chore title a notice can
 * carry: short enough for a lock screen, never shaming, true to what
 * happened. And every link a notice or the weekly digest carries has to be a
 * screen the app really has (a route in renderRoute in src/App.jsx), and has
 * to survive the Parent Mode PIN: a link into the parent side used to open
 * the dashboard once the PIN was typed, wherever it was going.
 *
 * Reads files and runs pure functions: needs nothing running.
 */
import { readFileSync } from 'node:fs'

globalThis.window = { location: { hash: '' } }

const words = await import('../src/data/noticeWords.js')
const { NOTICES, PUSH_KINDS, TITLE_MAX, BODY_MAX, DIGEST_BODY_MAX, VALUE_MAX, digestNotice, reminderPush, clip } = words
const { lockedLink, afterUnlock } = await import('../src/lib/router.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); fails += 1 }
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/* ------------------------------------------------------------------ */
console.log('\n=== Every notice fits a lock screen, with the longest values it can carry ===')

const LONG_NAME = 'Maximiliana-Josephine Featherstonehaugh'.padEnd(VALUE_MAX, 'x').slice(0, VALUE_MAX)
const LONG_CHORE = 'Sort the recycling and take the bins out'.padEnd(VALUE_MAX, 'x').slice(0, VALUE_MAX)
const WORST = {
  submission: [LONG_NAME, LONG_CHORE],
  approved: [LONG_CHORE, 99999],
  rejected: [LONG_CHORE],
  guildRequest: [LONG_NAME, LONG_CHORE],
  reminder: [LONG_CHORE, 'parent'],
  test: [],
}
const all = []
for (const [kind, make] of Object.entries(NOTICES)) {
  const n = make(...(WORST[kind] || []))
  all.push({ kind, n })
  ok(`${kind}: title "${n.title}" is at most ${TITLE_MAX} characters, uncut`,
    n.title.length <= TITLE_MAX && !n.title.endsWith('…'), `${n.title.length}`)
  ok(`${kind}: body is at most ${BODY_MAX} characters, uncut`, n.body.length <= BODY_MAX && !n.body.endsWith('…'),
    `${n.body.length}: ${n.body}`)
  ok(`${kind}: has a tag, so a newer one replaces it rather than stacking`, Boolean(n.tag))
}
for (const role of ['parent', 'kid']) {
  const n = reminderPush('A reminder named with far, far too many words to ever fit', role)
  all.push({ kind: `reminder (server, ${role})`, n })
  ok(`the server's reminder for a ${role} fits, however long the name it was given`,
    n.title.length <= TITLE_MAX && n.body.length <= BODY_MAX, `${n.title} / ${n.body}`)
}

const busiest = digestNotice({
  approved: 9999, approved_last_week: 8888, quietest_day: 'Wednesday', waiting_for_you: 999,
  kids: [{ name: LONG_NAME, done: 9999 }, { name: 'Ava', done: 1 }],
})
all.push({ kind: 'digest', n: busiest })
ok(`the busiest digest fits in ${DIGEST_BODY_MAX} characters`, busiest.body.length <= DIGEST_BODY_MAX && busiest.title.length <= TITLE_MAX,
  `${busiest.body.length}: ${busiest.body}`)
ok('anything longer is cut at a word, with an ellipsis, not mid-word',
  clip('one two three four five six', 15) === 'one two three…' && clip('short', 15) === 'short')

/* ------------------------------------------------------------------ */
console.log('\n=== Friendly, never shaming, plain ===')

const SHAMING = /\b(fail(ed|ure)?|lazy|bad|wrong|disappoint\w*|reject(ed)?|should have|didn[’']t|forgot|not good enough|again\?)\b/i
for (const { kind, n } of all) {
  const text = `${n.title} ${n.body}`
  ok(`${kind}: no word that blames ("${text.match(SHAMING)?.[0] || ''}")`, !SHAMING.test(text))
  ok(`${kind}: no shouting: no "!!", no word in capitals`, !/!!|\b[A-Z]{4,}\b/.test(text.replace(/XP|RankUp/g, '')), text)
  const emoji = text.match(/\p{Extended_Pictographic}/gu) || []
  ok(`${kind}: at most one emoji`, emoji.length <= 1, emoji.join(''))
  ok(`${kind}: no link or phone number in the words`, !/https?:|www\.|\d{6,}/.test(text.replace(/99999|9999|8888/g, '')), text)
}

/* ------------------------------------------------------------------ */
console.log('\n=== True to what happened ===')

ok('a parent taps Accept, so the child is told it was accepted', NOTICES.approved('Make your bed', 45).title.startsWith('Accepted'))
ok('with the XP it really earned', NOTICES.approved('Make your bed', 45).body === '“Make your bed” earned you 45 XP.')
ok('and no "earned you 0 XP" when it paid none', NOTICES.approved('Make your bed', 0).body === '“Make your bed” was accepted.')
ok('a chore sent back promises no reason, since the note is optional',
  !/why|reason|note/i.test(NOTICES.rejected('Make your bed').body))
ok('a parent is told a chore is ready to check, in the app\'s own word (chore, not quest)',
  NOTICES.submission('Ava', 'Make your bed').title === 'Ava finished a chore'
  && NOTICES.submission('Ava', 'Make your bed').body === '“Make your bed” is ready for you to check.')
ok('the test notification says it is a test, not that somebody finished something',
  NOTICES.test().title === 'Notifications are on' && !/finished/.test(NOTICES.test().body))
ok('a reminder on a parent\'s phone opens the chores to check; on a child\'s, their quests',
  NOTICES.reminder('Morning', 'parent').url === '/#/parent/approvals' && NOTICES.reminder('Morning', 'kid').url === '/#/kid/quests')

const digest = (d) => digestNotice({ kids: [], ...d }).body
ok('a digest: up', digest({ approved: 9, approved_last_week: 5 }) === '9 chores done, up from 5 last week.', digest({ approved: 9, approved_last_week: 5 }))
ok('a digest: down', digest({ approved: 2, approved_last_week: 5 }) === '2 chores done, down from 5 last week.')
ok('a digest: the same', digest({ approved: 5, approved_last_week: 5 }) === '5 chores done, the same as last week.')
ok('a digest: one chore is "1 chore"', digest({ approved: 1, approved_last_week: 0 }) === '1 chore done this week.')
ok('a quiet week is said kindly, in a sentence that reads',
  digest({ approved: 0, approved_last_week: 3 }) === 'A quiet week, with no chores finished. 3 were done the week before.'
  && digest({ approved: 0, approved_last_week: 1 }) === 'A quiet week, with no chores finished. 1 was done the week before.',
  digest({ approved: 0, approved_last_week: 1 }))
ok('the child who did most is named only when there is more than one child',
  /Ava led with 6\./.test(digest({ approved: 8, approved_last_week: 5, kids: [{ name: 'Ava', done: 6 }, { name: 'Ben', done: 2 }] }))
  && !/led/.test(digest({ approved: 8, approved_last_week: 5, kids: [{ name: 'Ava', done: 8 }] })))
ok('nobody is named for doing least', !/Ben/.test(digest({ approved: 8, approved_last_week: 5, kids: [{ name: 'Ava', done: 8 }, { name: 'Ben', done: 0 }] })))
ok('chores waiting are counted, and singular when there is one',
  / 1 chore is waiting for you to check\.$/.test(digest({ approved: 3, approved_last_week: 1, waiting_for_you: 1 }))
  && / 2 chores are waiting for you to check\.$/.test(digest({ approved: 3, approved_last_week: 1, waiting_for_you: 2 })))

/* ------------------------------------------------------------------ */
console.log('\n=== Every link goes to a screen the app has ===')

// The routes renderRoute in src/App.jsx actually draws, read from it.
const app = read('src/App.jsx')
const render = app.slice(app.indexOf('function renderRoute'))
const exact = new Set([...render.matchAll(/route === '([^']+)'/g)].map((m) => m[1]))
const prefixes = [...render.matchAll(/route\.startsWith\('([^']+)'\)/g)].map((m) => m[1])
const isRoute = (url) => {
  const path = String(url).replace(/^\/?#/, '').split('?')[0]
  return exact.has(path) || prefixes.some((p) => path.startsWith(p) && path.length > p.length)
}
ok('the route list was read (it has the parent and kid homes)', exact.has('/parent') && exact.has('/kid') && exact.size > 15, [...exact].join(' '))

const links = [
  ...all.map(({ kind, n }) => ({ kind, url: n.url })),
  { kind: 'digest, nothing waiting', url: digestNotice({ approved: 3, approved_last_week: 1, kids: [] }).url },
  { kind: 'digest, chores waiting', url: digestNotice({ approved: 3, approved_last_week: 1, waiting_for_you: 2, kids: [] }).url },
]
for (const { kind, url } of links) {
  ok(`${kind}: ${url} is a real screen`, /^\/#\//.test(url) && isRoute(url), url)
}
ok('the digest with chores waiting goes straight to them', digestNotice({ approved: 1, waiting_for_you: 1, kids: [] }).url === '/#/parent/approvals')
ok('otherwise to the week\'s charts', digestNotice({ approved: 1, kids: [] }).url === '/#/parent/blueprint')

// The trial email's link, and Stripe's ways back, are links into the app too.
const email = read('api/_shared/email.js')
for (const path of [...email.matchAll(/#(\/[a-z/]+)/g)].map((m) => m[1])) {
  ok(`an email's link (#${path}) is a real screen`, isRoute(path), path)
}
for (const path of [...read('api/create-checkout.js').matchAll(/\/#(\/[a-z/]+)\?/g)].map((m) => m[1])) {
  ok(`Stripe's way back (#${path}) is a real screen`, isRoute(path), path)
}

console.log('\n=== And survives the Parent Mode PIN ===')
for (const { kind, url } of links.filter((l) => l.url.startsWith('/#/parent/'))) {
  const path = url.replace(/^\/#/, '')
  ok(`${kind}: after the PIN, ${path} opens, not the dashboard`, afterUnlock(`#${lockedLink(path)}`) === path, lockedLink(path))
}
ok('the way back from Stripe keeps what it says', afterUnlock(`#${lockedLink('/parent/plan?checkout=success')}`) === '/parent/plan?checkout=success')
ok('a "next" that is not a parent screen opens the dashboard',
  afterUnlock('#/switch?next=https%3A%2F%2Fexample.com') === '/parent' && afterUnlock('#/switch?next=%2Fkid') === '/parent'
  && afterUnlock('#/switch?next=%2Fparent%2F..%2F..%2Fx') === '/parent' && afterUnlock('#/switch') === '/parent')
ok('the route guard and the PIN screen both use it',
  /navigate\(lockedLink\(path\)\)/.test(app) && /navigate\(afterUnlock\(\)\)/.test(read('src/screens/RoleSwitch.jsx')))

/* ------------------------------------------------------------------ */
console.log('\n=== One copy of the words ===')

for (const file of ['api/send-push.js', 'api/send-reminders.js', 'api/send-digests.js', 'src/lib/notifications.js']) {
  const text = read(file)
  ok(`${file} takes its words from src/data/noticeWords.js`, /from '\.\.\/(src\/)?data\/noticeWords\.js'/.test(text))
  ok(`${file} writes no notice of its own`, !/title:\s*[`'"]/.test(text), (text.match(/title:\s*[`'"][^\n]*/) || [''])[0])
}
ok('a phone can ask the server for every kind but the local test', PUSH_KINDS.every((k) => NOTICES[k]) && !PUSH_KINDS.includes('test'))
ok('the server clips a value to the length these words were measured with', /\.slice\(0, VALUE_MAX\)/.test(read('api/send-push.js')))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
