import { navigate } from '../lib/router.js'

/**
 * The bar across the top of every kid screen.
 *
 * In the design this is identical on all five tabs — the crowned wordmark
 * with its line underneath, the theme the child is playing, and the way
 * into settings — and that sameness is the point. It is the one fixed
 * thing on the screen, so a child always knows which app they are in and
 * where the settings live, whichever tab they wandered into.
 *
 * It was being rebuilt slightly differently on each screen, which is how
 * five tabs end up looking like five apps.
 */
export default function AppHeader({ theme, right }) {
  return (
    <header className="flex items-start justify-between gap-2 mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1" style={{ lineHeight: 1 }}>
            {/* The crown sits on the wordmark in the design, not beside it. */}
            <span aria-hidden="true" style={{ fontSize: 11, marginBottom: 12 }}>👑</span>
            <span
              className="font-display font-extrabold tracking-tight"
              style={{
                fontSize: 21,
                color: 'var(--accent)',
                textShadow: '0 0 20px color-mix(in srgb, var(--accent) 65%, transparent)',
              }}
            >
              RANKUP
            </span>
          </div>
          {/* Sized to fit whole at 390px. It was truncating to "UNLOCK
              WOR…", and a strapline that stops mid-word is worse than no
              strapline. */}
          <div
            className="uppercase whitespace-nowrap"
            style={{
              fontSize: 7,
              letterSpacing: '0.1em',
              color: 'var(--ink-muted)',
              marginTop: 2,
            }}
          >
            Do chores. Earn XP. Unlock worlds.
          </div>
        </div>

        {theme && (
          <span className="chip shrink-0" style={{ fontSize: 11 }}>
            {theme.currency.icon} {theme.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {right}
        <button
          type="button"
          onClick={() => navigate('/kid/profile')}
          aria-label="Settings"
          className="grid place-items-center"
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            fontSize: 15,
            background: 'color-mix(in srgb, var(--surface-2) 88%, var(--accent) 12%)',
            border: '1px solid color-mix(in srgb, var(--accent) 28%, var(--line))',
          }}
        >
          <span aria-hidden="true">⚙️</span>
        </button>
      </div>
    </header>
  )
}
