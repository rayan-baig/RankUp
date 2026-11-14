/**
 * Theme Genesis in the app: a child makes, edits, wears and deletes a theme
 * of their own, and a parent renames and removes one from Settings.
 *
 * In the look-around family (a browser, no server; tests/genesissync.mjs
 * does the same across two phones and a real database):
 *
 *   - from the You tab's "Make your own theme" through Spark, Design, Build
 *     and Launch, the checklist and progress bar filling in as it goes;
 *   - "What's it inspired by?": "gta" fills in City Nights and "f1" Racing
 *     (a name, colours, pattern, mascot, worlds and coins, all changeable
 *     after), a rude idea is refused, and nothing typed there is kept;
 *   - a finished theme named after a game stays the family's own, but cannot
 *     be sent in for a Season, and says why;
 *   - a rude name is refused, in a child's words, and nothing is saved;
 *   - a draft is saved, found again, changed and finished;
 *   - "Use this theme" asks for the PIN, as any theme change does, and then
 *     the whole app is in the new theme with every level, coin and streak
 *     exactly as it was;
 *   - five themes a child, and the sixth is not offered;
 *   - deleting the theme a child wears puts them on the one it was made from;
 *   - a parent sees every theme in Settings, renames one (a rude name is
 *     refused there too) and removes one.
 *
 * Needs the dev server.   node tests/genesis.mjs
 */
import { launch, BASE, SHOT_DIR, reporter, finish, readState } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const ok = (n, cond, d = '') => (cond ? pass(n) : fail(n, d))
const { browser, page, errors } = await launch()
const go = async (hash, wait = 700) => { await page.evaluate((h) => { window.location.hash = h }, hash); await page.waitForTimeout(wait) }
const ava = async () => (await readState(page)).kids.find((k) => k.name === 'Ava')
const progressOf = (k) => JSON.stringify([k.xp, k.coins, k.streak, k.playTokens, k.skins, k.bestScores])
const bgVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Have a look around/ }).click()
await page.waitForTimeout(1500)
await page.getByTestId('demo-tour').getByRole('button', { name: /See Ava's world/ }).click()
await page.waitForTimeout(800)
const start = await ava()

console.log('\n=== From the theme picker to Spark ===')
await go('/kid/profile')
ok('the You tab offers "Make your own theme", without the theme lock', await page.getByTestId('open-genesis').isVisible())
await page.getByTestId('open-genesis').click()
await page.waitForTimeout(600)
ok('it opens Theme Genesis, with none made yet (0 of 5)', (await page.getByTestId('genesis-list').textContent()).includes('0 of 5'))
await page.getByRole('button', { name: /Start a new theme/ }).click()
await page.waitForTimeout(400)
ok('four steps on the track: Spark, Design, Build, Launch',
  (await page.getByTestId('genesis-track').textContent()).replace(/\s+/g, ' ').match(/Spark.*Design.*Build.*Launch/) !== null)

console.log('\n=== "What\'s it inspired by?" ===')
ok('Spark has the box, with its placeholder', await page.getByTestId('genesis-idea').isVisible()
  && (await page.getByTestId('genesis-idea').getAttribute('placeholder')) === 'e.g. racing, space, dinosaurs, a game you love'
  && await page.getByText("What's it inspired by?").isVisible())
await page.getByTestId('genesis-idea').fill('gta')
await page.getByTestId('genesis-make').click()
await page.waitForTimeout(300)
ok('"gta" fills in City Nights, and says what it picked',
  (await page.getByTestId('genesis-idea-line').textContent()).replace(/\u00a0/g, ' ').includes('City Nights vibes: a neon city, cars and skyscrapers, 🌃')
    && (await page.getByTestId('genesis-name').inputValue()) === 'City Nights')
ok('and the name ideas are City Nights ones', await page.getByRole('button', { name: 'Neon Skyline' }).isVisible())
await page.screenshot({ path: `${SHOT_DIR}/genesis-0-inspired-gta.png` })
await page.getByTestId('genesis-idea').fill('f1')
await page.getByTestId('genesis-idea').press('Enter')
await page.waitForTimeout(300)
ok('"f1" (Enter works too) fills in Racing, and the suggested name follows',
  (await page.getByTestId('genesis-idea-line').textContent()).replace(/\u00a0/g, ' ').includes('Racing vibes: checkered flags, red and black, 🏎️')
    && (await page.getByTestId('genesis-name').inputValue()) === 'Speed Circuit')
await page.screenshot({ path: `${SHOT_DIR}/genesis-0-inspired-f1.png` })
await page.getByTestId('genesis-idea').fill('big ass cars')
await page.getByTestId('genesis-make').click()
await page.waitForTimeout(300)
ok('a rude idea gets the gentle no, and changes nothing',
  (await page.getByTestId('genesis-idea-problem').textContent()).includes('does not allow')
    && (await page.getByTestId('genesis-name').inputValue()) === 'Speed Circuit')
await page.getByTestId('genesis-idea').fill('f1')
await page.getByTestId('genesis-make').click()
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(400)
ok('Design is filled in from it: its own colours first and picked, the checkers, the 🏎️',
  (await page.getByTestId('palette-idea').getAttribute('aria-pressed')) === 'true'
    && (await page.getByTestId('palette-idea').textContent()).includes('Racing')
    && (await page.getByRole('button', { name: 'Mascot 🏎️' }).getAttribute('aria-pressed')) === 'true'
    && (await page.getByTestId('genesis-design').locator('button[aria-pressed=true]', { hasText: 'Checkers' }).count()) === 1)
await page.screenshot({ path: `${SHOT_DIR}/genesis-0-inspired-design.png` })
await page.getByTestId('palette-lagoon').click()
await page.getByRole('button', { name: 'Mascot 🐬' }).click()
ok('and every bit of it can be changed', (await page.getByTestId('palette-lagoon').getAttribute('aria-pressed')) === 'true'
  && (await page.getByRole('button', { name: 'Mascot 🐬' }).getAttribute('aria-pressed')) === 'true')
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(300)
ok('Build has the racing worlds and coins, ready to rename', (await page.getByTestId('genesis-world-0').inputValue()) === 'Pit Lane'
  && (await page.getByTestId('genesis-currency').inputValue()) === 'Turbo Coins')
await page.getByRole('button', { name: '← Design' }).click()
await page.getByRole('button', { name: '← Spark' }).click()
await page.waitForTimeout(300)
ok('nothing typed in the box is kept anywhere', !JSON.stringify(await readState(page)).includes('big ass')
  && !(await page.evaluate(() => Object.values(localStorage).some((v) => v.includes('big ass')))))

await page.getByTestId('genesis-name').fill('')
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(300)
ok('without a name it does not go on, and says so', await page.getByText('Give your theme a name.').isVisible())
await page.getByTestId('genesis-name').fill('Sh1t Planet')
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(300)
ok('a rude name is refused, in a child\'s words', await page.getByText(/word RankUp does not allow/).isVisible())
await page.getByTestId('genesis-name').fill('Reef Racers')
await page.getByTestId('vibe-ocean').click()
ok('picking a vibe ticks the Spark checklist', (await page.getByTestId('genesis-checklist').textContent()).match(/✓ A name.*✓ A vibe/) !== null)
await page.screenshot({ path: `${SHOT_DIR}/genesis-1-spark.png` })
await page.getByRole('button', { name: 'Save draft' }).click()
await page.waitForTimeout(400)
let s = await readState(page)
ok('a draft is saved at Spark', s.kidThemes.length === 1 && s.kidThemes[0].status === 'draft' && s.kidThemes[0].name === 'Reef Racers'
  && s.kidThemes[0].design.vibe === 'ocean')
ok('and nothing is sent anywhere: the look-around has no outbox traffic',
  !(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('rankup.sync.outbox') && localStorage.getItem(k) !== '[]'))))

console.log('\n=== Design, Build, Launch ===')
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(400)
await page.getByTestId('palette-grape').click()
await page.getByRole('button', { name: 'Mascot 🦈' }).click()
await page.getByRole('button', { name: /Bubbles/ }).click()
await page.screenshot({ path: `${SHOT_DIR}/genesis-2-design.png` })
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(400)
ok('Build is filled in already: four worlds and the coins', (await page.getByTestId('genesis-world-0').inputValue()) === 'Coral Reef'
  && (await page.getByTestId('genesis-currency').inputValue()) === 'Pearls')
ok('and says the levels and rewards are the same as every theme', await page.getByText(/never the rules or the rewards/).isVisible())
await page.getByTestId('genesis-world-3').fill('Shark Town')
await page.screenshot({ path: `${SHOT_DIR}/genesis-3-build.png` })
await page.getByTestId('genesis-next').click()
await page.waitForTimeout(900)
ok('Launch shows the home screen in the new theme', await page.getByTestId('theme-preview').isVisible()
  && (await page.getByTestId('theme-preview').textContent()).includes('Reef Racers'))
await page.screenshot({ path: `${SHOT_DIR}/genesis-4-launch.png` })

const bgBefore = await bgVar()
await page.getByTestId('genesis-use').click()
await page.waitForTimeout(300)
ok('"Use this theme" asks for the PIN, as any theme change does', await page.getByText('Parent PIN required').isVisible())
await page.locator('input[type=password]').fill('1234')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForTimeout(800)
s = await readState(page)
const made = s.kidThemes[0]
const now = await ava()
ok('and then they are playing it', now.themeId === `custom-${made.id}` && made.status === 'ready', now.themeId)
ok('with the grape background on screen', (await bgVar()) !== bgBefore)
ok('the design they chose was kept', made.design.mascot === '🦈' && made.design.pat === 'bubbles' && made.design.worlds[3] === 'Shark Town')
ok('every level, coin and streak exactly as it was', progressOf(now) === progressOf(start))
await go('/kid', 1200)
ok('the home screen is in it: their coins have the new name', (await page.locator('body').textContent()).includes('Pearls'))
await page.evaluate(() => window.scrollTo(0, 0))
await page.screenshot({ path: `${SHOT_DIR}/genesis-5-home.png` })

console.log('\n=== Edit later ===')
await go(`/kid/genesis?edit=${made.id}`)
await page.getByTestId('genesis-name').fill('Reef Racers II')
await page.getByRole('button', { name: 'Save draft' }).click()
await page.waitForTimeout(400)
s = await readState(page)
ok('a finished theme is edited and stays finished', s.kidThemes[0].name === 'Reef Racers II' && s.kidThemes[0].status === 'ready')

console.log('\n=== Another company\'s name: theirs to keep, not a Season\'s ===')
await page.getByTestId('genesis-name').fill('Minecraft Reef')
await page.getByRole('button', { name: 'Save draft' }).click()
await page.waitForTimeout(400)
ok('a theme named after a game is saved as their own', (await readState(page)).kidThemes[0].name === 'Minecraft Reef')
await page.getByTestId('genesis-track').getByRole('button', { name: /Launch/ }).click()
await page.waitForTimeout(700)
ok('but it is not offered for a Season, and says why in a child\'s words',
  (await page.getByTestId('genesis-send-blocked').textContent()) === "Season themes can't use other companies' names. Give it your own name to send it in."
    && (await page.getByTestId('genesis-ask-send').count()) === 0)
await page.getByTestId('genesis-send-blocked').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${SHOT_DIR}/genesis-season-brand.png` })
await page.getByRole('button', { name: 'Rename it' }).click()
await page.waitForTimeout(300)
await page.getByTestId('genesis-name').fill('Reef Racers II')
await page.getByRole('button', { name: 'Save draft' }).click()
await page.waitForTimeout(300)
await page.getByTestId('genesis-track').getByRole('button', { name: /Launch/ }).click()
await page.waitForTimeout(700)
ok('with its own name again, it can be sent', (await page.getByTestId('genesis-ask-send').count()) === 1
  && (await page.getByTestId('genesis-send-blocked').count()) === 0)

console.log('\n=== Five a child ===')
await go('/kid/genesis')
for (let i = 0; i < 4; i += 1) {
  if (i > 0) { await page.getByRole('button', { name: '← Your themes' }).click(); await page.waitForTimeout(300) }
  await page.getByRole('button', { name: /Start a new theme/ }).click()
  await page.waitForTimeout(200)
  await page.getByTestId('genesis-name').fill(`Theme ${i + 2}`)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForTimeout(250)
}
await page.getByRole('button', { name: '← Your themes' }).click()
await page.waitForTimeout(300)
ok('five made', (await readState(page)).kidThemes.length === 5)
ok('and the sixth is not offered', await page.getByText('5 themes is the most').isVisible()
  && (await page.getByRole('button', { name: /Start a new theme/ }).count()) === 0)
await page.screenshot({ path: `${SHOT_DIR}/genesis-6-list.png` })

console.log('\n=== The theme picker ===')
await go('/kid/profile')
await page.getByRole('button', { name: /Ask a parent to change the theme/ }).click()
await page.locator('input[type=password]').fill('1234')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForTimeout(400)
ok('their finished theme is in the picker, marked as theirs; drafts are not', (await page.getByTestId('own-theme').count()) === 1)
ok('beside "Make your own theme"', await page.getByTestId('make-own-theme').isVisible())
await page.locator('button[aria-pressed]', { hasText: 'Coquette' }).first().click()
await page.getByRole('button', { name: 'Save theme' }).click()
await page.waitForTimeout(500)
ok('switching back to a built-in theme keeps everything', (await ava()).themeId === 'coquette' && progressOf(await ava()) === progressOf(start))
await page.getByRole('button', { name: /Ask a parent to change the theme/ }).click()
await page.locator('input[type=password]').fill('1234')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForTimeout(300)
await page.getByTestId('own-theme').click()
await page.getByRole('button', { name: 'Save theme' }).click()
await page.waitForTimeout(500)
ok('and back to their own', (await ava()).themeId === `custom-${made.id}`)

console.log('\n=== Delete ===')
await go('/kid/genesis', 300)
await go('/kid', 300)
await go('/kid/genesis')
await page.getByTestId('genesis-row').filter({ hasText: 'Reef Racers II' }).getByRole('button', { name: 'Delete' }).click()
await page.getByTestId('genesis-confirm-delete').click()
await page.waitForTimeout(500)
s = await readState(page)
ok('deleting the theme they wear removes it', !s.kidThemes.some((t) => t.id === made.id) && s.kidThemes.length === 4)
ok('and puts them on the theme it was made from (Ocean is made from Aura Lite)', (await ava()).themeId === 'aura', (await ava()).themeId)
ok('with progress exactly as it was', progressOf(await ava()) === progressOf(start))

console.log('\n=== A parent, in Settings ===')
await go('/parent/settings')
if (await page.getByRole('button', { name: 'Open Parent Mode' }).count()) {
  await page.getByRole('button', { name: 'Open Parent Mode' }).click()
  await page.waitForTimeout(300)
}
if (await page.getByLabel('Parent PIN').count()) { await page.getByLabel('Parent PIN').fill('1234'); await page.waitForTimeout(900) }
if (!(await page.evaluate(() => location.hash.startsWith('#/parent/settings')))) await go('/parent/settings')
await page.getByRole('button', { name: /Kids' own themes/ }).click()
await page.waitForTimeout(300)
ok('Settings lists every theme the children made', (await page.getByTestId('kid-theme-row').count()) === 4)
await page.screenshot({ path: `${SHOT_DIR}/genesis-7-settings.png` })
const row = page.getByTestId('kid-theme-row').filter({ hasText: 'Theme 2' })
await row.getByRole('button', { name: 'Rename' }).click()
await page.getByTestId('kid-theme-rename').fill('Big Ass Land')
await page.getByTestId('kid-theme-rename-save').click()
await page.waitForTimeout(300)
ok('a parent\'s rename is held to the same words', await page.getByText(/word RankUp does not allow/).isVisible()
  && (await readState(page)).kidThemes.some((t) => t.name === 'Theme 2'))
await page.getByTestId('kid-theme-rename').fill('Ocean Party')
await page.getByTestId('kid-theme-rename-save').click()
await page.waitForTimeout(400)
ok('a parent renames a child\'s theme', (await readState(page)).kidThemes.some((t) => t.name === 'Ocean Party'))
await page.getByTestId('kid-theme-row').filter({ hasText: 'Ocean Party' }).getByRole('button', { name: 'Remove' }).click()
await page.getByTestId('kid-theme-remove-confirm').click()
await page.waitForTimeout(400)
ok('and removes one', !(await readState(page)).kidThemes.some((t) => t.name === 'Ocean Party') && (await page.getByTestId('kid-theme-row').count()) === 3)
ok('"+ Make one" opens Theme Genesis for that child, on the parent side',
  await (async () => { await page.getByRole('button', { name: '+ Make one' }).first().click(); await page.waitForTimeout(600)
    return page.evaluate(() => window.location.hash.startsWith('#/parent/genesis?kid=')) })())

ok('no errors on the page', errors.length === 0, errors.join('; '))
await finish(errors, fails, browser)
