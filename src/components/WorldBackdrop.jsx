import { artAny } from '../data/art.js'

/**
 * The world behind a kid screen.
 *
 * The design is not dark cards on a dark page — it is a window onto a
 * place, with the interface floating on it as lit glass. Each tab has its
 * own place: floating islands on Home, a neon city in the Arcade.
 *
 * It is mounted once from the router rather than from the banner
 * component, because Home has no banner and so had no world — the tab
 * that matters most was the one screen still looking like a form.
 *
 * Falls back through the tab's banner art to nothing at all, in which
 * case the theme's own animated scene shows through the glass instead.
 * Both are fine; what is not fine is an empty box or a broken image.
 */

/** Which world belongs to which part of the app. */
function slotFor(path) {
  if (path.startsWith('/kid/quest')) return 'quests'
  if (path.startsWith('/kid/arcade')) return 'arcade'
  if (path.startsWith('/kid/shop') || path.startsWith('/kid/market')) return 'rewards'
  if (path.startsWith('/kid/profile')) return 'you'
  if (path.startsWith('/kid')) return 'home'
  return null
}

export default function WorldBackdrop({ path, theme }) {
  const tab = slotFor(path || '')
  if (!tab) return null

  const world = artAny(`world-${tab}`, `hero-${tab}`)
  if (!world) return null

  /*
   * Some themes are light — Block Craft turns cream at level 101, and a
   * few of the parent themes are light throughout. The worlds are all
   * dark night scenes, and under a light theme that put dark artwork
   * behind dark-on-light text: the wordmark and its strapline were
   * unreadable. So a light theme gets a much heavier wash of its own
   * background colour and a fainter picture. The world is still there,
   * as a tint rather than a scene, and the words come back.
   */
  const light = theme?.mode === 'light'

  return (
    <>
      <div
        aria-hidden="true"
        /*
         * -z-10, the same layer the theme's own scene uses. At z-index 0 a
         * fixed element paints above ordinary unpositioned content, which
         * is how the first version of this washed out every heading on the
         * page: the picture was in front of the words, not behind them.
         */
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage: `url(${world})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          opacity: light ? 0.3 : 1,
        }}
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          // Enough of the page's own colour over the picture that white
          // text on glass still reads wherever the artwork is bright,
          // and heavier towards the bottom where the lists are longest.
          background: light
            ? `linear-gradient(180deg,
                color-mix(in srgb, var(--bg) 76%, transparent) 0%,
                color-mix(in srgb, var(--bg) 84%, transparent) 50%,
                color-mix(in srgb, var(--bg) 92%, transparent) 100%)`
            : `linear-gradient(180deg,
                color-mix(in srgb, var(--bg) 30%, transparent) 0%,
                color-mix(in srgb, var(--bg) 46%, transparent) 50%,
                color-mix(in srgb, var(--bg) 68%, transparent) 100%)`,
        }}
      />
    </>
  )
}
