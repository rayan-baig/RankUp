import { art } from '../data/art.js'

/**
 * The banner across the top of a tab, with the screen's name on it.
 *
 * When the artwork for this slot exists it is the background, dimmed just
 * enough that white text stays readable over whatever the picture turns
 * out to be — the art is made separately and nobody wants a title that
 * disappears because one banner came back pale.
 *
 * When it does not exist, the same band is drawn from the theme's own
 * colours. That is the normal state while art is still being made, so it
 * has to look deliberate rather than like a gap: a lit gradient with the
 * screen's emblem sitting in it, in whatever colour the child's theme is.
 */
export default function HeroArt({ slot, title, sub, emblem, right }) {
  const picture = art(slot)

  return (
    <div
      className="relative overflow-hidden mb-3"
      style={{
        borderRadius: 18,
        border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--line))',
        boxShadow: '0 0 26px -14px color-mix(in srgb, var(--accent) 85%, transparent)',
        minHeight: 104,
        background: picture
          ? undefined
          : `radial-gradient(130% 120% at 82% 14%,
              color-mix(in srgb, var(--accent) 42%, transparent),
              transparent 62%),
             linear-gradient(118deg,
              color-mix(in srgb, var(--surface) 92%, var(--accent) 8%),
              var(--surface-2))`,
      }}
    >
      {picture && (
        <img
          src={picture}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
      )}
      {picture && (
        <div
          className="absolute inset-0"
          aria-hidden="true"
          // Dark on the left where the words are, clear on the right where
          // the picture usually has its subject.
          style={{
            background:
              'linear-gradient(95deg, rgb(0 0 0 / 0.78) 6%, rgb(0 0 0 / 0.5) 46%, rgb(0 0 0 / 0.08) 86%)',
          }}
        />
      )}

      {!picture && emblem && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 54,
            opacity: 0.3,
            filter: 'drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 80%, transparent))',
          }}
        >
          {emblem}
        </span>
      )}

      <div className="relative px-4 py-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="font-display text-2xl font-extrabold leading-tight"
            style={{
              color: picture ? '#fff' : 'var(--ink)',
              textShadow: picture
                ? '0 2px 14px rgb(0 0 0 / 0.75)'
                : '0 0 22px color-mix(in srgb, var(--accent) 45%, transparent)',
            }}
          >
            {title}
          </h1>
          {sub && (
            <p
              className="text-sm mt-0.5"
              style={{
                color: picture ? 'rgb(255 255 255 / 0.86)' : 'var(--ink-muted)',
                textShadow: picture ? '0 1px 10px rgb(0 0 0 / 0.8)' : undefined,
              }}
            >
              {sub}
            </p>
          )}
        </div>
        {right}
      </div>
    </div>
  )
}
