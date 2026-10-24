/**
 * The artwork registry.
 *
 * Every picture in the app is looked up by a slot name instead of being
 * imported where it is used. Two reasons, and both are about what happens
 * when the art arrives rather than how it looks today:
 *
 * The art is produced separately from the code, in batches, and will be
 * redone more than once. Dropping a file into src/assets/art/ should be
 * the whole job — no import to add, no component to edit, nothing to
 * rebuild by hand. So this scans that folder at build time and every file
 * it finds becomes a slot named after the file.
 *
 * And the app has to look finished with no art at all. A missing picture
 * returns null, every caller draws its own fallback, and nothing shows a
 * broken image or an empty box. That matters because the art lands piece
 * by piece: the day the arcade tiles arrive, the hero banners may not
 * have, and the app still has to be shippable that morning.
 *
 * ── Naming ──────────────────────────────────────────────────────────────
 * Put files in src/assets/art/ named exactly after the slot, any of
 * .png .jpg .jpeg .webp .avif .svg:
 *
 *   hero-home        the banner across the top of each tab
 *   hero-quests
 *   hero-arcade
 *   hero-rewards
 *   hero-you
 *
 *   game-<id>        an arcade tile; the ids are in src/data/minigames.js
 *                    (game-snake, game-sweets, game-tennis, …)
 *
 *   avatar-<theme>-<level>   a child's avatar at a milestone, e.g.
 *                            avatar-blockcraft-1, avatar-blockcraft-51
 *
 *   icon-<name>      a single interface icon, e.g. icon-xp, icon-crown
 *
 * Case and spaces do not matter; "Hero Home.PNG" finds the same slot.
 */

/*
 * Vite inlines this at build time, so the bundle contains only files that
 * actually exist. `query: '?url'` hands back a URL rather than the file's
 * bytes, which keeps big images out of the JavaScript.
 */
const files = import.meta.glob('../assets/art/*.{png,jpg,jpeg,webp,avif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const slug = (s) => s.toLowerCase().replace(/[\s_]+/g, '-')

const BY_SLOT = {}
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '')
  BY_SLOT[slug(name)] = url
}

/** The picture for a slot, or null when that one has not been drawn yet. */
export function art(slot) {
  return BY_SLOT[slug(String(slot || ''))] || null
}

/** The first slot that exists, so a specific picture can fall back to a general one. */
export function artAny(...slots) {
  for (const s of slots) {
    const found = art(s)
    if (found) return found
  }
  return null
}

/** Every slot currently supplied. Used by the art check in tests. */
export function artSlots() {
  return Object.keys(BY_SLOT).sort()
}
