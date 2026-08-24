import { navigate } from '../lib/router.js'

/** The bottom tab bar. Big targets — this is used by children on a phone. */
export default function NavBar({ items, path, badges = {} }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--line)',
        paddingBottom: 'var(--safe-bottom)',
      }}
      aria-label="Main"
    >
      <div className="mx-auto max-w-phone flex">
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
              className="flex-1 py-2.5 flex flex-col items-center gap-0.5 relative"
              style={{ color: active ? 'var(--accent)' : 'var(--ink-muted)' }}
            >
              <span className="text-xl leading-none" aria-hidden="true">{item.icon}</span>
              <span className="text-[10px] font-semibold">{item.label}</span>
              {badge > 0 && (
                <span
                  className="absolute top-1.5 right-[22%] min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--bad)', color: '#fff' }}
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
