/**
 * The leaderboards in the app: Adventure, the parent's Arena switch, the
 * boards, and the nickname builder.
 *
 *   - a child starts in Adventure: their badge says so and no worldwide or
 *     country board is offered;
 *   - a parent reads what Arena shows, switches it on, picks the country from
 *     the list; the child sees "Enter the Arena" once;
 *   - the worldwide board has a podium, the child's own row highlighted and
 *     their place; the country board shows the flag; the highest-level board
 *     shows levels; no real name is anywhere on a public board;
 *   - the nickname is built from pieces (no text box), once a week;
 *   - back to Adventure from the child's own phone takes them off at once.
 *
 * Other families' children are put straight into the database (and taken
 * out again at the end); the job is run as the scheduler would.
 *
 * Needs the local backend running; see supabase/test/README.md.
 */
import pg from 'pg'
import { launch, reporter, setUpFamily, asParent, asKid, finish, SHOT_DIR } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const check = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))
const { browser, page, errors } = await launch()
const db = new pg.Client({
  host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()
const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/leaderboards-${name}.png` }).catch(() => {})
const go = async (hash) => { await page.evaluate((h) => { window.location.hash = h }, hash); await page.waitForTimeout(900) }

/** Some other families' children, in Arena, with chores done. Returns a clean-up. */
let quietNickname = null
async function seedRivals(client, tag = 'LB') {
  const countries = ['GB', 'GB', 'US', 'CA', 'GB', 'AU', 'IE', 'GB']
  const fams = []
  for (let i = 0; i < countries.length; i += 1) {
    const { rows: [u] } = await client.query(`insert into auth.users (email) values ($1) returning id`, [`${tag.toLowerCase()}-${Date.now()}-${i}@example.com`])
    const { rows: [f] } = await client.query(`insert into families (name, tier) values ($1, 'standard') returning id`, [`${tag} rival ${i}`])
    await client.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Rival parent')`, [u.id, f.id])
    await client.query('select seed_consent($1, $2)', [f.id, u.id])
    await client.query(`insert into leaderboard_families (family_id, country) values ($1, $2)`, [f.id, countries[i]])
    const { rows: [k] } = await client.query(`insert into kids (family_id, name) values ($1, $2) returning id`, [f.id, `${tag} Rivalkid ${i}`])
    const { rows: [q] } = await client.query(`insert into quests (family_id, kid_id, title, xp) values ($1, $2, 'Rival chore', 30) returning id`, [f.id, k.id])
    const n = 3 + ((i * 5) % 9)
    await client.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at, awarded_xp, base_xp)
                        select $1, $2, $3, 'approved', now() - make_interval(hours => g * 20), 30 + g * 5, 30 + g * 5 from generate_series(1, $4) g`,
    [f.id, q.id, k.id, n])
    await client.query(`insert into leaderboard_profiles (kid_id, family_id, mode, nickname, arena_since)
                        values ($1, $2, 'arena', leaderboard_random_nickname(), now())`, [k.id, f.id])
    await client.query(`update kids set streak_count = $2, streak_last_day = current_date, best_scores = $3 where id = $1`,
      [k.id, 2 + i, JSON.stringify({ stack: 40 + i * 7 })])
    fams.push(f.id)
  }
  // And one child who did the most of all, left in Adventure.
  {
    const { rows: [u] } = await client.query(`insert into auth.users (email) values ($1) returning id`, [`${tag.toLowerCase()}-${Date.now()}-quiet@example.com`])
    const { rows: [f] } = await client.query(`insert into families (name, tier) values ($1, 'standard') returning id`, [`${tag} quiet family`])
    await client.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Quiet parent')`, [u.id, f.id])
    await client.query('select seed_consent($1, $2)', [f.id, u.id])
    await client.query(`insert into leaderboard_families (family_id, country) values ($1, 'GB')`, [f.id])
    const { rows: [k] } = await client.query(`insert into kids (family_id, name) values ($1, $2) returning id`, [f.id, `${tag} Quietkid`])
    const { rows: [q] } = await client.query(`insert into quests (family_id, kid_id, title, xp) values ($1, $2, 'Quiet chore', 30) returning id`, [f.id, k.id])
    await client.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at, awarded_xp, base_xp)
                        select $1, $2, $3, 'approved', now() - make_interval(hours => g * 3), 100, 100 from generate_series(1, 60) g`, [f.id, q.id, k.id])
    const { rows: [p] } = await client.query(`insert into leaderboard_profiles (kid_id, family_id, nickname)
                        values ($1, $2, leaderboard_random_nickname()) returning nickname`, [k.id, f.id])
    quietNickname = p.nickname
    fams.push(f.id)
  }
  return async () => {
    await client.query('delete from families where id = any($1::uuid[])', [fams])
    await client.query(`delete from auth.users where email like $1`, [`${tag.toLowerCase()}-%@example.com`])
  }
}

console.log('\n=== A new child is in Adventure ===')
await setUpFamily(page)
const { rows: [ava] } = await db.query(`select k.id, k.family_id from kids k where k.name = 'Ava' order by k.created_at desc limit 1`)
await asKid(page)
await go('/kid')
await page.waitForTimeout(800)
check('Home shows the Adventure badge', (await page.locator('[data-testid="mode-badge"][data-mode="adventure"]').count()) > 0)
await go('/kid/leaderboards')
await page.waitForTimeout(800)
check('the Leaderboards screen opens', (await page.getByTestId('boards-title').count()) === 1)
const adventureScopes = await page.locator('[aria-label="Where"] button').allInnerTexts()
check('an Adventure child is offered no worldwide or country board',
  !adventureScopes.some((t) => /Worldwide|My country/.test(t)) && adventureScopes.some((t) => /My family/.test(t)), adventureScopes.join(', '))
check('and is told why, and that a grown-up can switch on Arena', (await page.getByTestId('adventure-note').count()) === 1)
const boardCount = await page.locator('[data-testid="board-picker"] button').count()
check(`there are many boards to pick (${boardCount})`, boardCount >= 9)

console.log('\n=== The parent switches on Arena ===')
await asParent(page)
await go('/parent/settings')
await page.getByRole('button', { name: /Family sync/ }).click()
await page.waitForTimeout(300)
await page.getByTestId('open-parent-leaderboards').click()
await page.waitForTimeout(1200)
const explainer = await page.getByTestId('arena-explainer').innerText()
check('the parent is told exactly what Arena shows', /nickname/.test(explainer) && /flag/.test(explainer) && /Never their name/.test(explainer), explainer)
check('Ava is in Adventure', (await page.locator('[data-testid="arena-kid-Ava"] [data-mode="adventure"]').count()) === 1)
await page.getByTestId('country-picker').selectOption('GB')
await page.waitForTimeout(1000)
await page.getByTestId('switch-arena').click()
await page.waitForTimeout(300)
await shot('parent-confirm')
await page.getByTestId('confirm-arena').click()
await page.waitForTimeout(1200)
check('Ava is now in Arena', (await page.locator('[data-testid="arena-kid-Ava"] [data-mode="arena"]').count()) === 1)
await page.evaluate(() => window.scrollTo(0, 0))
await shot('parent-arena')
const { rows: [lf] } = await db.query('select country from leaderboard_families where family_id = $1', [ava.family_id])
check('the country is the one picked from the list', lf?.country === 'GB', JSON.stringify(lf))

console.log('\n=== Other families, chores, and the job ===')
const cleanUp = await seedRivals(db)
const { rows: [q] } = await db.query(`select id from quests where kid_id = $1 limit 1`, [ava.id])
await db.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at, awarded_xp, base_xp)
                select $1, $2, $3, 'approved', now() - make_interval(mins => g), 30, 30 from generate_series(1, 6) g`, [ava.family_id, q.id, ava.id])
await db.query('select refresh_leaderboards()')

console.log('\n=== The child enters the Arena ===')
await asKid(page)
await go('/kid')
await page.waitForTimeout(1500)
check('"Enter the Arena" greets them once', (await page.getByTestId('arena-moment').count()) === 1)
await shot('arena-moment')
await page.getByTestId('arena-go').click()
await page.waitForTimeout(1500)
check('and takes them to the boards, on the worldwide race', (await page.getByRole('button', { name: /Worldwide/, pressed: true }).count()) === 1)
check('the podium is there', (await page.getByTestId('podium').count()) === 1)
check('their own row is highlighted, with their place', (await page.getByTestId('your-place').count()) === 1
  && /#\d+/.test(await page.getByTestId('your-place').innerText()))
const worldText = await page.locator('body').innerText()
check('no real name on a public board', !worldText.includes('Ava') && !worldText.includes('Rivalkid'), worldText.slice(0, 300))
check('a child left in Adventure is not on it, though they did the most',
  Boolean(quietNickname) && !worldText.includes(quietNickname) && !worldText.includes('Quietkid'))
check('the week says when it resets', /Resets Monday/.test(await page.getByTestId('board-when').innerText()))
await shot('world-week')
await page.getByRole('button', { name: /My country/ }).click()
await page.waitForTimeout(1200)
check('the country board shows the flag', (await page.getByTestId('board-when').innerText()).includes('🇬🇧'))
await shot('country')
await page.locator('[data-testid="board-picker"] button', { hasText: 'Highest level' }).click()
await page.getByRole('button', { name: /Worldwide/ }).click()
await page.waitForTimeout(1200)
check('the highest-level board shows levels', /Lv \d+/.test(await page.locator('body').innerText()))
await shot('level')
await page.goto(`${page.url().split('#')[0]}#/kid`)
await page.waitForTimeout(1200)
check('"Enter the Arena" is not shown a second time', (await page.getByTestId('arena-moment').count()) === 0)
check('Home shows the Arena badge', (await page.locator('[data-testid="mode-badge"][data-mode="arena"]').count()) > 0)
await shot('home-arena')

console.log('\n=== The nickname builder ===')
await go('/kid/profile')
await page.waitForTimeout(1200)
check('Profile has the leaderboard card', (await page.getByTestId('leaderboard-card').count()) === 1)
const before = await page.getByTestId('my-nickname').innerText()
await page.getByTestId('open-nickname').click()
await page.waitForTimeout(300)
check('the builder has no text box', (await page.locator('[role="dialog"] input, [role="dialog"] textarea').count()) === 0)
await page.getByRole('button', { name: /Second word/ }).click()
await page.locator('[data-testid="nickname-second"] button', { hasText: /^Narwhal$/ }).click()
await page.getByRole('button', { name: /First word/ }).click()
await page.locator('[data-testid="nickname-first"] button', { hasText: /^Cosmic$/ }).click()
await page.getByRole('button', { name: /^Number/ }).click()
await page.locator('[data-testid="nickname-number"] button', { hasText: /^07$/ }).click()
check('the preview is the pieces put together', (await page.getByTestId('nickname-preview').innerText()) === 'CosmicNarwhal07')
await shot('nickname')
await page.getByTestId('nickname-save').click()
await page.waitForTimeout(1200)
const after = await page.getByTestId('my-nickname').innerText()
check('the new nickname is saved', after === 'CosmicNarwhal07', `${before} -> ${after}`)
const { rows: [prof] } = await db.query('select nickname from leaderboard_profiles where kid_id = $1', [ava.id])
check('on the server too', prof?.nickname === 'CosmicNarwhal07')
await page.getByTestId('open-nickname').click()
await page.waitForTimeout(300)
await page.getByTestId('nickname-shuffle').click()
check('and not again this week', await page.getByTestId('nickname-save').isDisabled())
await page.keyboard.press('Escape')

console.log('\n=== Back to Adventure, from the child\'s own phone ===')
await page.getByTestId('to-adventure').click()
await page.waitForTimeout(1200)
const { rows: [gone] } = await db.query('select count(*)::int n from leaderboard_ranks where kid_id = $1', [ava.id])
check('off every public board at once', gone.n === 0, `${gone.n} rows`)
check('and the badge says Adventure', (await page.locator('[data-testid="leaderboard-card"] [data-mode="adventure"]').count()) === 1)

await cleanUp()
await db.query('delete from leaderboard_ranks')
await db.end()
await finish(errors, fails, browser)
