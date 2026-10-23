import { navigate } from '../lib/router.js'

/**
 * The bottom tab bar. Big targets — this is used by children on a phone.
 *
 * The active tab sits inside a lit pill rather than just changing colour.
 * On a dark theme a colour change alone is easy to miss at a glance, and
 * the tab bar is the one piece of furniture that has to answer "where am
 * I" without being read. The pill is drawn from the theme's own accent, so
 * it is green under Block Craft and pink under Coquette Circuit without
 * this file knowing anything about either.
 *
 * The bar itself is translucent and blurred, so the screen behind it keeps
 * going instead of stopping at a grey slab.
 */
export default function NavBar({ items, path, badges = {} }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{
        background: 'color-mix(in srgb, var(--surface) 86%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--line))',
        paddingBottom: 'var(--safe-bottom)',
        boxShadow: '0 -8px 30px -18px rgb(0 0 0 / 0.8)',
      }}
      aria-label="Main"
    >
      <div className="mx-auto max-w-phone flex px-1.5 py-1.5 gap-1">
        {items.map((item) => {
          const active =
            path === item.to ||
            (!item.exact && path.startsWith(`${item.to}/`)) ||
            (item.alsoMatches || []).some((prefix) => path.startsWith(prefix))
          const badge = badges[item.to]
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              aria-current={active ? 'page' : undefined}
              className="flex-1 py-2 flex flex-col items-center gap-1 relative rounded-2xl transition-colors"
              style={{
                color: active ? 'var(--accent)' : 'var(--ink-muted)',
                background: active
                  ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                  : 'transparent',
                border: active
                  ? '1px solid color-mix(in srgb, var(--accent) 38%, transparent)'
                  : '1px solid transparent',
                boxShadow: active
                  ? '0 0 18px -8px color-mix(in srgb, var(--accent) 90%, transparent)'
                  : 'none',
              }}
            >
              <span
                className="text-xl leading-none"
                aria-hidden="true"
                style={{
                  // A lit tab's icon gets the same bloom as its pill, which
                  // is what makes the row read at a glance rather than
                  // needing the label underneath.
                  filter: active
                    ? 'drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 80%, transparent))'
                    : 'none',
                }}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
              {badge > 0 && (
                <span
                  className="absolute top-1 right-[18%] min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{
                    background: 'var(--bad)',
                    color: '#fff',
                    boxShadow: '0 0 12px -2px var(--bad)',
                  }}
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
