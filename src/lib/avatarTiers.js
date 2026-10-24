/**
 * How many forms an avatar has, and which one a level is on.
 *
 * Plain JavaScript with no React in it, so the rule can be tested directly.
 * The component imports from here rather than owning it.
 *
 * HOW MANY FORMS: five for most themes, but a theme can set its own ladder
 * in src/data/kidThemes.js. Block Craft runs to nine, because its later
 * levels are a story rather than a recolour — the portal, the Nether, the
 * End, the dragon — and stopping that at five would end the story halfway.
 *
 * Everything that shows a form number asks the theme rather than assuming
 * five, so a child on Block Craft is told "form 6 of 9" and a child on
 * Sugar Rush "form 3 of 5", and neither is quietly measured against the
 * other's ladder.
 */

export const DEFAULT_TIERS = [1, 10, 25, 50, 100]

/** The level ladder for a theme, which is the default unless it says otherwise. */
export function tiersFor(theme) {
  const own = theme?.tiers
  return Array.isArray(own) && own.length ? own : DEFAULT_TIERS
}

/** Which form a level is on, counting from one. */
export function avatarTier(level, theme) {
  let tier = 1
  tiersFor(theme).forEach((t, i) => {
    if (level >= t) tier = i + 1
  })
  return tier
}

/** The next level that unlocks a form, or null once they are all unlocked. */
export function nextTierLevel(level, theme) {
  return tiersFor(theme).find((t) => t > level) ?? null
}
