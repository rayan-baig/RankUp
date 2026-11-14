/**
 * Block Craft's worlds stay secret until the child reaches them.
 *
 * Knowing something is coming is the hook; finding out what it is belongs to
 * the moment the child gets there. So no screen a child or a parent can open
 * may name a world, or tell its story, before that world is open: not in the
 * words on screen, and not in a label, a title or a picture's description
 * that the words leave out. The last world opens only when the dragon falls,
 * so a child at the dragon must not see it either.
 *
 * Walks a real child through each threshold, just short of it and just past it.
 */
import { launch, reporter, setUpFamily, setKidInDatabase, asKid, asParent, readState, finish } from './helpers.mjs'
import { KID_THEME_MAP } from '../src/data/kidThemes.js'
import { totalXpForLevel } from '../src/lib/xp.js'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const WORLDS = KID_THEME_MAP.blockcraft.evolutions

const KID_ROUTES = ['/kid', '/kid/quests', '/kid/profile', '/kid/arcade', '/kid/shop', '/kid/dragon', '/kid/story/raid']
const PARENT_ROUTES = ['/parent', '/parent/kids', '/parent/approvals', '/parent/blueprint']

/** Everything a screen says, the hidden labels included. */
const everything = () => page.evaluate(() => [
  document.body.innerText,
  ...[...document.querySelectorAll('[aria-label],[title],[alt]')]
    .map((el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt')].join(' ')),
  document.title,
].join('\n'))

async function atLevel(level) {
  await setKidInDatabase('Ava', { theme_id: 'blockcraft', xp: totalXpForLevel(level) })
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const kid = (await readState(page)).kids?.[0]
    if (kid?.themeId === 'blockcraft' && kid?.xp === totalXpForLevel(level)) return true
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500)
  }
  return false
}

async function check(level) {
  const reached = await atLevel(level)
  if (!reached) { fail(`level ${level}`, 'the child never reached it on this phone'); return }
  // The dragon is not beaten in any of these: no chores have been approved.
  const secret = WORLDS.filter((w) => level < w.level || w.requires)
  const open = WORLDS.filter((w) => level >= w.level && !w.requires)
  const leaks = []
  await asKid(page)
  for (const route of KID_ROUTES) {
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((r) => { window.location.hash = r }, route)
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(700)
    // eslint-disable-next-line no-await-in-loop
    const text = await everything()
    for (const w of secret) {
      if (text.includes(w.label)) leaks.push(`${route} names "${w.label}"`)
      if (w.story && text.includes(w.story.slice(0, 40))) leaks.push(`${route} tells the story of "${w.label}"`)
    }
  }
  await asParent(page)
  for (const route of PARENT_ROUTES) {
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((r) => { window.location.hash = r }, route)
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(600)
    // eslint-disable-next-line no-await-in-loop
    const text = await everything()
    for (const w of secret) if (text.includes(w.label)) leaks.push(`${route} names "${w.label}"`)
  }
  leaks.length === 0
    ? pass(`at level ${level}, no screen names a world not yet reached (${secret.map((w) => w.label).join(', ')})`)
    : fail(`secret worlds at level ${level}`, leaks.slice(0, 4).join('; '))

  if (open.length) {
    await asKid(page)
    await page.evaluate(() => { window.location.hash = '/kid/profile' })
    await page.waitForTimeout(700)
    const text = await everything()
    const newest = open[open.length - 1]
    text.includes(newest.label)
      ? pass(`and the world reached, ${newest.label}, is named`)
      : fail(`reached world named at level ${level}`, newest.label)
  }
}

await setUpFamily(page)
for (const level of [124, 125, 174, 249, 398, 399, 420]) await check(level) // eslint-disable-line no-await-in-loop

finish(errors, fails, browser)
