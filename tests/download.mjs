/**
 * "Download my data" gives two files: everything, as JSON, and a summary a
 * person can read, made from that same JSON. Only this family's.
 *
 * Two families are set up in two browsers against the real database. The
 * first finishes a chore and has it accepted; the second is a stranger whose
 * child's name must not appear anywhere in the first family's download.
 *
 * Needs the dev server and the stand-in API (supabase/test/up.sh).
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { launch, reporter, setUpFamily, asParent, asKid, sendToParent, finish, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

// The stranger first, in a browser of its own, with a child called Zebedee.
const other = await browser.newContext({ viewport: { width: 390, height: 844 } })
const otherPage = await other.newPage()
await setUpFamily(otherPage)
{
  // Renamed in the database, which is what an export reads. Its family is
  // the newest one until the next is set up below.
  const db = new pg.Client({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'rankup_test',
  })
  await db.connect()
  await db.query(`update kids set name = 'Zebedee'
                   where family_id = (select id from families order by created_at desc limit 1)`)
  await db.query(`insert into redemptions (family_id, kid_id, name, cost)
                  select family_id, id, 'Zebedee''s secret treat', 10 from kids where name = 'Zebedee'`)
  await db.end()
}

await setUpFamily(page)

console.log('\n=== A chore done and accepted, so there is history ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
await sendToParent(page)
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Accept' }).first().click()
await page.waitForTimeout(2500)

{
  // A reward set and one spent, so both are in the export.
  const db = new pg.Client({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'rankup_test',
  })
  await db.connect()
  const fam = (await db.query('select id from families order by created_at desc limit 1')).rows[0].id
  await db.query(`insert into rewards (family_id, name, cost) values ($1, 'Film night & popcorn', 60)`, [fam])
  await db.query(`insert into redemptions (family_id, kid_id, name, cost, status)
                  select family_id, id, 'Film night & popcorn', 60, 'given' from kids where family_id = $1`, [fam])
  await db.end()
}

console.log('\n=== Download my data ===')
await page.evaluate(() => { window.location.hash = '/parent/settings' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Your data/ }).click()
await page.waitForTimeout(300)
const downloads = []
page.on('download', (d) => downloads.push(d))
await page.getByRole('button', { name: /Download my data/ }).click()
for (let i = 0; i < 30 && downloads.length < 2; i += 1) await page.waitForTimeout(200)
downloads.length === 2
  ? pass('one tap gives two files')
  : fail('two files downloaded', `${downloads.length} downloaded`)
const named = (ext) => downloads.find((d) => d.suggestedFilename().endsWith(ext))
const jsonFile = named('.json')
const htmlFile = named('.html')
jsonFile && /^rankup-data-\d{4}-\d\d-\d\d\.json$/.test(jsonFile.suggestedFilename())
  ? pass(`the full data as JSON (${jsonFile.suggestedFilename()})`)
  : fail('JSON file', downloads.map((d) => d.suggestedFilename()).join(', '))
htmlFile && /^rankup-summary-\d{4}-\d\d-\d\d\.html$/.test(htmlFile.suggestedFilename())
  ? pass(`and a readable summary (${htmlFile.suggestedFilename()})`)
  : fail('HTML file', downloads.map((d) => d.suggestedFilename()).join(', '))

const json = jsonFile ? JSON.parse(readFileSync(await jsonFile.path(), 'utf8')) : {}
const html = htmlFile ? readFileSync(await htmlFile.path(), 'utf8') : ''
const firstChore = json.quests?.find((q) => json.submissions?.some((s) => s.quest_id === q.id && s.status === 'approved'))

console.log('\n=== The summary says what the JSON holds, in words ===')
json.children?.length === 1 && json.children[0].name === 'Ava'
  ? pass('the JSON is the server\'s export of this family')
  : fail('JSON is this family', JSON.stringify(json.children?.map((k) => k.name)))
html.startsWith('<!doctype html>') && /<title>[^<]*RankUp data<\/title>/.test(html)
  ? pass('the summary is a web page that opens on any phone or computer')
  : fail('summary is HTML', html.slice(0, 120))
;/<h2>Ava<\/h2>/.test(html)
  ? pass('it has a section for the child')
  : fail('child section', 'no Ava heading')
firstChore && html.includes(firstChore.title.replace(/&/g, '&amp;').replace(/'/g, '&#39;'))
  ? pass(`it lists the chores, "${firstChore?.title}" among them`)
  : fail('chores listed', firstChore?.title || 'no approved chore in the JSON')
;/<td>Accepted<\/td>/.test(html)
  ? pass('and the history: the chore that was accepted')
  : fail('history listed', 'no Accepted row')
;/Rewards you set/.test(html) && json.rewards?.every((r) => html.includes(r.name.replace(/&/g, '&amp;').replace(/'/g, '&#39;')))
  && json.rewards?.length > 0
  ? pass(`and the rewards (${json.rewards?.length})`)
  : fail('rewards listed', 'a reward is missing')
json.redemptions?.length === 1 && html.includes('Rewards spent (1)') && html.includes('Film night &amp; popcorn')
  ? pass('and what the child spent, with its name escaped')
  : fail('spent listed', JSON.stringify(json.redemptions))
html.includes('MTRX Horizyn') && /no photos/i.test(html)
  ? pass('it says who runs RankUp, and that it keeps no photos')
  : fail('footer', 'missing')

console.log('\n=== Only this family ===')
!JSON.stringify(json).includes('Zebedee') && !html.includes('Zebedee')
  ? pass('another family\'s child is in neither file')
  : fail('other family excluded', 'Zebedee appears in the download')
!/<script/i.test(html)
  ? pass('the summary runs no code')
  : fail('no script in summary', 'a script tag is in it')

await page.locator('[data-testid="download-files"] a').first().waitFor({ timeout: 5000 }).catch(() => {})
const links = await page.locator('[data-testid="download-files"] a').count()
links === 2
  ? pass('both files can be saved again from the screen, if a phone held one back')
  : fail('links to both files', `${links} links`)
await page.screenshot({ path: `${SHOT_DIR}/download-data.png` })

await other.close()
await finish(errors, fails, browser)
