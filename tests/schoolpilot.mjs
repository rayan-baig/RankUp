/**
 * A school pilot, in a real browser: the "For schools" front page, "Request
 * a pilot", signing up with a pilot code, the house board and the pilot
 * report.
 *
 *   - the front page says in plain words what RankUp does, what a school
 *     sees, what children never do, the prices and how a pilot works;
 *   - "Request a pilot" checks what it needs, sends only that, and says when
 *     it has been asked too often;
 *   - a pilot code typed at sign-up turns the trial into the pilot; one used
 *     already, or past its date, is refused in words and the school is still
 *     signed up; a school that pays is told a pilot adds nothing;
 *   - the admin names houses; a parent chooses one for each child; the board
 *     shows each house's totals, and none for a house with fewer than 5;
 *   - the report shows the totals, the under-5 rule, the price and how to
 *     buy, and never a child's name or anything typed;
 *   - the report's kinds of chore are the app's own categories.
 *
 * Against the mock API and a real Postgres (supabase/test/up.sh).
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import pg from 'pg'
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { SCHOOL_PRICES, SCHOOL_TRIAL_DAYS, PILOT_DEFAULT_DAYS, dollars, schoolPrice } from '../src/lib/schools.js'
import { CATEGORIES } from '../src/data/questTemplates.js'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const ok = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))
const field = (p, label) => p.locator('label', { hasText: label }).locator('input, textarea, select').first()
const body = (p) => p.locator('body').innerText()
const shot = (p, name) => p.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true })

const stamp = Date.now()
const db = new pg.Client({
  host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

/** A pilot code made the way the operator's page makes one: only its hash stored. */
const makeCode = async (label, days, until = "now() + interval '30 days'") => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (const b of createHash('sha256').update(`${label}${stamp}${Math.random()}`).digest()) {
    if (code.length < 10) code += letters[b % letters.length]
  }
  await db.query(`insert into school_pilots (code_hash, label, days, code_expires_at) values ($1, $2, $3, ${until})`,
    [createHash('sha256').update(code).digest('hex'), label, days])
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

console.log('\n=== The rule the report counts by: the app\'s own kinds of chore ===')
{
  const sql = readFileSync('supabase/schools.sql', 'utf8')
  const listed = sql.match(/function school_report_categories\(\)[\s\S]*?array\[([^\]]*)\]/)?.[1]
    .match(/'([a-z]+)'/g).map((w) => w.slice(1, -1))
  ok('school_report_categories() is CATEGORIES in src/data/questTemplates.js, in order',
    JSON.stringify(listed) === JSON.stringify(CATEGORIES.map((c) => c.id)), JSON.stringify(listed))
}

console.log('\n=== The front page, for schools ===')
await page.goto(`${BASE}/#/welcome`, { waitUntil: 'networkidle' }).catch(() => {})
await page.goto(`${BASE}/#/school`, { waitUntil: 'networkidle' })
await page.getByTestId('for-schools').waitFor({ timeout: 15000 })
const front = await body(page)
ok('it says what RankUp does: chores at home as a game, a league between classes or houses',
  /Chores at home, turned into a game/.test(front) && /class or house/.test(front))
ok('what the school sees: totals only, nothing for fewer than 5', /Totals only/.test(front) && /fewer than 5 students/.test(front))
ok('what children never do: no typing to strangers, no photos, nothing without a parent',
  /No typing to strangers/.test(front) && /No photos/.test(front) && /Nothing without a parent/.test(front))
ok('the price list', SCHOOL_PRICES.every((p) => front.includes(dollars(p.monthlyCents))))
ok('and how a pilot works', /How a pilot works/i.test(front) && front.includes(`${PILOT_DEFAULT_DAYS} days`)
  && front.includes(`${SCHOOL_TRIAL_DAYS}-day trial`) && /by card or invoice/.test(front))
ok('nothing on it is styled inline', await page.locator('[data-testid="for-schools"] [style]').count() === 0)
await page.screenshot({ path: `${SHOT_DIR}/rankup-school-for-schools.png` })
await shot(page, 'rankup-school-for-schools-full')

console.log('\n=== Request a pilot ===')
let sentBody = null
let answer = { status: 200, body: '{"ok":true}' }
await page.route('**/api/pilot-request', async (route) => {
  sentBody = JSON.parse(route.request().postData() || '{}')
  await route.fulfill({ status: answer.status, contentType: 'application/json', body: answer.body })
})
await page.getByRole('button', { name: 'Request a free pilot' }).click()
await page.getByTestId('pilot-form').waitFor()
await page.getByRole('button', { name: 'Send the request' }).click()
await page.waitForTimeout(300)
const asked = await page.getByTestId('pilot-form').innerText()
ok('sent empty, it says what is missing, and sends nothing',
  /Which school is it/.test(asked) && /An email address/.test(asked) && sentBody === null, asked.slice(0, 200))
await field(page, 'School').fill(`Example Academy ${stamp}`)
await field(page, 'Your name').fill('Ms Example')
await field(page, 'Your role').fill('Head of school')
await field(page, 'Work email').fill(`Head${stamp}@Example-Academy.example`)
await field(page, 'Students, about').fill('640')
answer = { status: 429, body: '{"error":"too_many_requests"}' }
await page.getByRole('button', { name: 'Send the request' }).click()
await page.waitForTimeout(500)
ok('asked too often, it says to wait, in words', /a few requests from here this hour/.test(await page.getByTestId('pilot-form').innerText()))
// The browser logs the 429 it was made to get; that is this test's doing, not the app's.
for (let i = errors.length - 1; i >= 0; i -= 1) if (/status of 429/.test(errors[i])) errors.splice(i, 1)
answer = { status: 200, body: '{"ok":true}' }
await page.getByRole('button', { name: 'Send the request' }).click()
await page.getByTestId('pilot-sent').waitFor({ timeout: 10000 })
ok('then it is sent, tidied: the email in lower case, the number a number',
  sentBody?.email === `head${stamp}@example-academy.example` && sentBody?.students === 640 && sentBody?.school === `Example Academy ${stamp}`,
  JSON.stringify(sentBody))
ok('and the page says nothing typed is kept', /Nothing you typed is kept on this site/.test(await body(page)))
await page.unroute('**/api/pilot-request')

console.log('\n=== Signing up with a pilot code ===')
const code = await makeCode(`Example Academy ${stamp}`, PILOT_DEFAULT_DAYS)
const oldCode = await makeCode('Too late', 90, "now() + interval '1 hour'")
await db.query(`update school_pilots set code_expires_at = now() - interval '1 minute' where label = 'Too late' and code_hash = $1`,
  [createHash('sha256').update(oldCode.replace('-', '')).digest('hex')])

const signUp = async (p, who, school, pilot) => {
  await p.goto(`${BASE}/#/school`, { waitUntil: 'networkidle' })
  await p.reload({ waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Sign your school up' }).click()
  await p.getByTestId('school-account').waitFor()
  await p.locator('input[type=email]').fill(`${who}${stamp}@example.com`)
  await p.locator('input[type=password]').fill('correct-horse-battery')
  await field(p, 'Your name').fill('Ms Example')
  await field(p, 'School name').fill(school)
  await field(p, 'School district').fill('Exampleshire')
  await field(p, 'Number of students').fill('420')
  if (pilot) await field(p, 'Pilot code').fill(pilot)
}
await signUp(page, 'head', 'Example Academy', code.toLowerCase())
ok('typed in lower case, the code is shown as the operator gave it', (await field(page, 'Pilot code').inputValue()) === code)
ok('and the price line says it comes after the pilot', /after your free pilot/.test(await body(page)))
await page.screenshot({ path: `${SHOT_DIR}/rankup-school-pilot-code.png` })
await page.getByRole('button', { name: 'Sign the school up' }).click()
await page.getByTestId('league-table').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(500)
const dash = await body(page)
ok(`the school's page opens with "Your pilot has started": ${PILOT_DEFAULT_DAYS} days`, /Your pilot has started/.test(dash) && dash.includes(`${PILOT_DEFAULT_DAYS} days free`))
ok('and the plan says so, not the trial', /\d+ days of your pilot left/.test(await page.getByTestId('trial-left').innerText())
  && /A 90-day pilot/.test(await page.getByTestId('pilot-status').innerText()))
ok('with nowhere to type another code', await page.getByTestId('pilot-code').count() === 0)
// The newest school of that name: this run's. Removed again at the end.
const newest = async (name) => (await db.query('select id from schools where name = $1 order by created_at desc limit 1', [name])).rows[0].id
const schoolId = await newest('Example Academy')
ok('the database agrees: a 90-day pilot, from today',
  (await db.query(`select abs(extract(epoch from trial_ends_at - (now() + interval '90 days'))) < 600 as near from schools where id = $1`, [schoolId])).rows[0].near)

// A second school: a code used already, then one past its date, then the right one.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const second = await ctx2.newPage()
second.on('pageerror', (e) => errors.push(`second pageerror: ${e.message}`))
await signUp(second, 'second', 'Second Example School', code)
await second.getByRole('button', { name: 'Sign the school up' }).click()
await second.getByTestId('league-table').waitFor({ state: 'visible', timeout: 15000 })
await second.waitForTimeout(500)
const secondText = await body(second)
ok('a code already used is refused in words, and the school is signed up on its trial anyway',
  /The pilot code did not work/.test(secondText) && /already been used/.test(secondText) && /30-day trial/.test(secondText), secondText.slice(0, 400))
await second.getByLabel('Pilot code').fill(oldCode)
await second.getByRole('button', { name: 'Start the pilot' }).click()
await second.waitForTimeout(800)
ok('a code past its date is refused on the school\'s page, in words', /has run out/.test(await body(second)))
const secondId = await newest('Second Example School')
await db.query(`update schools set status = 'active', stripe_subscription_id = 'sub_pilot_test' where id = $1`, [secondId])
const spare = await makeCode('Spare', 60)
await second.reload({ waitUntil: 'networkidle' })
await second.waitForTimeout(800)
ok('a school that pays has nowhere to type a pilot code', await second.getByTestId('pilot-code').count() === 0)
await db.query(`update schools set status = 'trial', stripe_subscription_id = null where id = $1`, [secondId])
await second.reload({ waitUntil: 'networkidle' })
await second.getByTestId('pilot-code').waitFor({ timeout: 10000 })
await db.query(`update schools set status = 'active', stripe_subscription_id = 'sub_pilot_test' where id = $1`, [secondId])
await second.getByLabel('Pilot code').fill(spare)
await second.getByRole('button', { name: 'Start the pilot' }).click()
await second.waitForTimeout(800)
ok('and one that started paying meanwhile is told a pilot adds nothing, and the code is left unused',
  /already has a plan, so a pilot would add nothing/.test(await body(second))
  && (await db.query(`select redeemed_at from school_pilots where label = 'Spare' and code_hash = $1`,
    [createHash('sha256').update(spare.replace('-', '')).digest('hex')])).rows[0].redeemed_at === null)
await ctx2.close()

console.log('\n=== Houses: named by the admin ===')
const settings = page.getByTestId('house-settings')
await settings.scrollIntoViewIfNeeded()
for (const name of ['Kestrel', 'Otter', 'Heron']) {
  await settings.getByLabel('New house').fill(name)
  await settings.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(700)
}
await settings.getByLabel('New house').fill('Shit house')
ok('a rude name cannot be added', await settings.getByRole('button', { name: 'Add' }).isDisabled()
  && /Children read these names/.test(await settings.innerText()))
await settings.getByLabel('New house').fill('')
ok('three houses, on the school\'s board', (await page.getByTestId('house-board').innerText()).includes('Kestrel')
  && (await settings.innerText()).includes('Heron'))

console.log('\n=== A parent puts each child in a house; the board shows totals only ===')
const groups = Object.fromEntries((await db.query('select name, id from school_groups where school_id = $1', [schoolId])).rows.map((r) => [r.name, r.id]))
const fam = (await db.query(`insert into families (name, tier) values ('The Wobblethorpes', 'standard') returning id`)).rows[0].id
const parentUser = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`pilot-parent${stamp}@example.com`])).rows[0].id
await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Wilma')`, [parentUser, fam])
await db.query('select seed_consent($1, $2)', [fam, parentUser])
// Five children of one family are that family's numbers (school_group_shown:
// 5 students from 3 families), so at school the twelve count as three
// households, round in turn; the last one is this parent's.
const households = [fam]
for (const name of ['The Wobblethorpes Two', 'The Wobblethorpes Three']) {
  households.push((await db.query(`insert into families (name, tier) values ($1, 'standard') returning id`, [name])).rows[0].id)
}
// Twelve children: six in Kestrel, five in Otter, one in no house yet. Kestrel's did
// two chores each, three of Otter's one each, and the one in no house one.
const plan = [...Array(6).fill('Kestrel'), ...Array(5).fill('Otter'), 'Heron']
for (const [i, house] of plan.entries()) {
  const kid = (await db.query(`insert into kids (family_id, name) values ($1, $2) returning id`, [fam, `Wobblethorpe Kid${i + 1}`])).rows[0].id
  const quest = (await db.query(`insert into quests (family_id, kid_id, title, category) values ($1, $2, 'Feed the axolotl', $3) returning id`,
    [fam, kid, house === 'Kestrel' ? 'kitchen' : 'pets'])).rows[0].id
  await db.query(`insert into school_members (kid_id, school_id, family_id, joined_at, group_id) values ($1, $2, $3, now() - interval '1 hour', $4)`,
    [kid, schoolId, i === plan.length - 1 ? fam : households[i % 3], house === 'Heron' ? null : groups[house]])
  const chores = house === 'Kestrel' ? 2 : house === 'Otter' && i < 9 ? 1 : house === 'Heron' ? 1 : 0
  for (let n = 0; n < chores; n += 1) {
    await db.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at, note) values ($1, $2, $3, 'approved', now(), 'my secret note')`,
      [fam, quest, kid])
  }
}
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('house-board').waitFor({ timeout: 10000 })
await page.waitForTimeout(600)
const boardText = await page.getByTestId('house-board').innerText()
ok('with one child in no house, Otter (5) is hidden too, or the school less the houses would be that child',
  /Kestrel[\s\S]*6 students · 100% did a chore · 12 chores/.test(boardText) && /Otter\s*\n?\s*Too few/.test(boardText), boardText)
// The parent puts the last child in Otter, with their own sign-in.
const lastKid = (await db.query(`select id from kids where family_id = $1 and name = 'Wobblethorpe Kid12'`, [fam])).rows[0].id
const asParent = (fn, args) => fetch(`${process.env.MOCK_URL || 'http://localhost:54321'}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${parentUser}` },
  body: JSON.stringify(args),
}).then((r) => r.json())
const set = await asParent('set_kid_school_group', { p_kid_id: lastKid, p_group_id: groups.Otter })
ok('the parent chooses the child\'s house', set.ok === true, JSON.stringify(set))
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('house-board').waitFor({ timeout: 10000 })
await page.waitForTimeout(600)
const board2 = await page.getByTestId('house-board').innerText()
ok('now nobody is left over: Kestrel 2.0, Otter 0.7 (6 students, 67%), Heron (none) shows nothing',
  /Kestrel[\s\S]*2\.0/.test(board2) && /Otter[\s\S]*6 students · 67% did a chore · 4 chores[\s\S]*0\.7/.test(board2)
  && /Heron\s*\n?\s*Too few/.test(board2), board2)
ok('the best average first', board2.indexOf('Kestrel') < board2.indexOf('Otter') && board2.indexOf('Otter') < board2.indexOf('Heron'))
ok('and never a child on the school\'s page', !/Wobblethorpe|Kid1|secret note|axolotl|Wilma/.test(await body(page)))
await page.getByTestId('house-board').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${SHOT_DIR}/rankup-school-house-board.png` })

console.log('\n=== The pilot report ===')
await page.getByRole('button', { name: /The pilot report, for the school office/ }).click()
await page.getByTestId('report-school').waitFor({ timeout: 10000 })
await page.waitForTimeout(400)
const report = await body(page)
ok('12 students taking part, 83% did at least one chore, 16 chores, 1.3 each',
  (await page.getByTestId('report-students').innerText()).startsWith('12')
  && (await page.getByTestId('report-share').innerText()).startsWith('83%')
  && (await page.getByTestId('report-chores').innerText()).startsWith('16')
  && (await page.getByTestId('report-average').innerText()).startsWith('1.3'), report.slice(0, 500))
ok('the busiest week, and the most popular kinds of chore by name', /Busiest week: the week of/.test(report)
  && /Kitchen \(75%\), Pets \(25%\)/.test(await page.getByTestId('report-kinds').innerText()))
const byHouse = await page.getByTestId('report-groups').innerText()
ok('by house: Kestrel and Otter with their numbers, Heron too few to show',
  /Kestrel\s+6\s+100%\s+12\s+2\.0/.test(byHouse) && /Otter\s+6\s+67%\s+4\s+0\.7/.test(byHouse) && /Heron\s+Too few to show/.test(byHouse), byHouse)
const price = schoolPrice(420)
ok(`it ends with the price for the school's size, ${dollars(price.monthlyCents)} a month or ${dollars(price.yearlyCents)} a year, and how to buy`,
  (await page.getByTestId('report-price').innerText()).includes(`${dollars(price.monthlyCents)} a month`)
  && /By card/.test(report) && /By invoice/.test(report))
ok('no "what families said": RankUp asks families for no rating', !/families said/i.test(report))
ok('never a child: no name, no note, no chore\'s words', !/Wobblethorpe|Kid\d|secret note|axolotl|Wilma/.test(report))
ok('nothing on it is styled inline', await page.locator('.print-page [style]').count() === 0)
await page.screenshot({ path: `${SHOT_DIR}/rankup-school-pilot-report.png` })
await shot(page, 'rankup-school-pilot-report-full')
await page.emulateMedia({ media: 'print' })
ok('on paper, the buttons are left off', !(await page.getByRole('button', { name: 'Print this page' }).isVisible()))
await page.emulateMedia({ media: 'screen' })

console.log('\n=== Under five: no numbers at all ===')
await db.query('update school_members set school_id = $2 where school_id = $1 and kid_id in (select id from kids where family_id = $3 and name not in ($4, $5, $6))',
  [schoolId, secondId, fam, 'Wobblethorpe Kid1', 'Wobblethorpe Kid2', 'Wobblethorpe Kid3'])
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('report-school').waitFor({ timeout: 10000 })
await page.waitForTimeout(400)
const small = await page.getByTestId('report-school').innerText()
ok('with 3 students left, the report shows how many joined and nothing else', /3 students have joined so far/.test(small)
  && await page.getByTestId('report-chores').count() === 0 && !/Busiest week/.test(small), small)
ok('and every house says too few', !/\d+%/.test(await page.getByTestId('report-groups').innerText()))

await db.query('delete from schools where id in ($1, $2)', [schoolId, secondId])
await db.query('delete from families where id = any($1)', [households])
await db.query(`delete from school_pilots where label in ($1, 'Too late', 'Spare')`, [`Example Academy ${stamp}`])
await db.query('delete from auth.users where id = $1', [parentUser])
await db.end()
await finish(errors, fails, browser)
