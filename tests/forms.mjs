/**
 * Avatar forms, and the one theme that has its own ladder.
 *
 * Block Craft runs to nine forms because its later levels are a story —
 * the portal, the Nether, the End, the dragon — while every other theme
 * stops at five. That is easy to break by accident in either direction:
 * give everything nine and the other fourteen themes promise forms that
 * do not exist; give everything five and Block Craft's story stops
 * halfway, which is the thing a child was working towards.
 *
 * So this checks both halves, and checks the numbers on screen come from
 * the theme rather than from a five somebody typed in.
 */
import { avatarTier, nextTierLevel, tiersFor, DEFAULT_TIERS } from '../src/lib/avatarTiers.js'
import { KID_THEMES, KID_THEME_MAP } from '../src/data/kidThemes.js'
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const block = KID_THEME_MAP.blockcraft
const plain = KID_THEME_MAP.matrixblocks

console.log('\n=== Block Craft goes all the way to the dragon ===')
ok('it has nine forms, not five',
  tiersFor(block).length === 9, String(tiersFor(block).length))
ok('and they are the levels on the art sheet',
  tiersFor(block).join(',') === '1,10,25,50,100,125,175,250,399',
  tiersFor(block).join(','))
ok('a child at level 399 is on the last form',
  avatarTier(399, block) === 9, String(avatarTier(399, block)))
ok('and at 250 they are on the eighth, not finished',
  avatarTier(250, block) === 8, String(avatarTier(250, block)))
ok('the glitch levels really are separate rungs',
  [125, 175, 250, 399].every((l, i) => avatarTier(l, block) === 6 + i))
ok('there is a colour for every rung',
  block.avatar.hues.length === tiersFor(block).length,
  `${block.avatar.hues.length} hues for ${tiersFor(block).length} forms`)

console.log('\n=== Every other theme still stops at five ===')
{
  const wrong = KID_THEMES
    .filter((t) => t.id !== 'blockcraft')
    .filter((t) => tiersFor(t).length !== 5)
    .map((t) => t.id)
  ok(`all ${KID_THEMES.length - 1} of them have five forms`, wrong.length === 0, wrong.join(', '))
  ok('and they use the shared ladder', tiersFor(plain) === DEFAULT_TIERS)
  ok('level 100 is their last form', avatarTier(100, plain) === 5, String(avatarTier(100, plain)))
  // The bug that would hurt most: a child on a five-form theme reaching
  // 399 must not be told they are on form nine of five.
  ok('and going past it does not invent a sixth',
    avatarTier(399, plain) === 5, String(avatarTier(399, plain)))
}

console.log('\n=== What comes next is read off the right ladder ===')
ok('Block Craft at 100 is heading for 125',
  nextTierLevel(100, block) === 125, String(nextTierLevel(100, block)))
ok('another theme at 100 has nothing left to reach',
  nextTierLevel(100, plain) === null, String(nextTierLevel(100, plain)))
ok('and at level 1 everyone is heading for 10',
  nextTierLevel(1, block) === 10 && nextTierLevel(1, plain) === 10)

console.log('\n=== Nothing on screen still says "of 5" ===')
{
  /*
   * The whole change is pointless if a screen prints a hardcoded five
   * next to a form number. Checked by reading the files, because this is
   * exactly the sort of thing that gets reintroduced by a copy-paste.
   */
  const screens = [
    'src/screens/kid/KidHome.jsx',
    'src/screens/kid/KidProfile.jsx',
    'src/components/LevelUpOverlay.jsx',
  ]
  const guilty = screens.filter((f) => {
    const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    return /Form \{tier\} (of|\/) 5|form \{tierAfter\} of 5/.test(text)
  })
  ok('no screen hardcodes the number of forms', guilty.length === 0, guilty.join(', '))
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
