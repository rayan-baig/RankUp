import { picture } from '../data/art.js'
import { avatarTier, tiersFor } from '../lib/avatarTiers.js'
import { useMedia } from '../lib/useMedia.js'

/**
 * The child's world beside their frame, on a wide screen (0.29.0).
 *
 * A child's screens are a column in a frame on a computer, which left two
 * empty bands of background either side. On a screen 1280px and wider the
 * left band shows the child's own character at their form, large and soft,
 * with their world's name under it, and the right band a soft light in the
 * world's colours. It is decoration only (aria-hidden), never a button, and
 * on a phone or a narrower window nothing is drawn or fetched.
 */
export default function KidWorldArt({ theme, level = 1 }) {
  const wide = useMedia('(min-width: 1280px)')
  if (!wide || !theme) return null
  const tier = avatarTier(level, theme)
  const url = picture(`avatar-${theme.id}-${tiersFor(theme)[tier - 1]}`, `avatar-${theme.id}`)?.url || null
  return (
    <div className="world-art" aria-hidden="true" data-testid="world-art">
      <div className="world-art-left">
        {url && <img src={url} alt="" decoding="async" className="world-art-hero" />}
        <p className="world-art-name">{theme.name}</p>
      </div>
      <div className="world-art-right" />
    </div>
  )
}
