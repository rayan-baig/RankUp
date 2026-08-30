import { useEffect, useRef, useState } from 'react'

/* Small, boring building blocks. Every screen uses these so the app stays
 * visually consistent no matter which of the 25 themes is active. */

export function Screen({ children, className = '' }) {
  return <div className={`shell px-4 pb-28 pt-3 ${className}`}>{children}</div>
}

export function Card({ children, className = '', flat = false, ...rest }) {
  return (
    <div className={`${flat ? 'card-flat' : 'card'} p-4 ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  const map = { primary: 'btn-primary', ghost: 'btn-ghost', soft: 'btn-soft', danger: 'btn-danger' }
  return (
    <button type="button" className={`btn ${map[variant] || map.primary} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Chip({ children, tone, className = '', ...rest }) {
  const style = tone ? { borderColor: tone, color: tone } : undefined
  return (
    <span className={`chip ${className}`} style={style} {...rest}>
      {children}
    </span>
  )
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="section-title mb-0">{children}</h2>
      {action}
    </div>
  )
}

/**
 * A settings section that opens only when someone wants it.
 *
 * Settings had grown to nearly five phone-screens of scrolling, which on a
 * phone means the last section may as well not exist. Collapsed, the whole page
 * is an index you can see at once; open one and it is the only thing in the way.
 *
 * `summary` is the one-line answer to "what is in here", so the index still
 * tells you the current state without opening anything.
 */
export function Section({ title, summary, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card-flat mb-2.5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {icon && <span className="text-lg leading-none" aria-hidden="true">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-sm leading-tight">{title}</span>
          {summary && <span className="block text-xs text-muted leading-tight mt-0.5">{summary}</span>}
        </span>
        <span
          className="text-muted text-xs shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          aria-hidden="true"
        >
          ▶
        </span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block mb-3">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function TextInput(props) {
  return <input className="field" {...props} />
}

export function TextArea(props) {
  return <textarea className="field" rows={3} {...props} />
}

export function Select({ children, ...props }) {
  return (
    <select className="field appearance-none" {...props}>
      {children}
    </select>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold truncate">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span
        className="shrink-0 w-12 h-7 rounded-full p-1 transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--line)' }}
      >
        <span
          className="block w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  )
}

export function ProgressBar({ value, max = 1, height = 10, tone, label }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  return (
    <div>
      <div
        className="w-full overflow-hidden"
        style={{ height, background: 'var(--surface-2)', borderRadius: height, border: '1px solid var(--line)' }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: tone || 'linear-gradient(90deg, var(--accent), var(--accent-2))', borderRadius: height }}
        />
      </div>
    </div>
  )
}

export function Stat({ icon, value, label, tone }) {
  return (
    <div className="card-flat px-3 py-2.5 flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        {icon && <span aria-hidden="true">{icon}</span>}
        <span className="font-display font-extrabold text-lg leading-none truncate" style={tone ? { color: tone } : undefined}>
          {value}
        </span>
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted mt-1 truncate">{label}</div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} className="relative w-full max-w-phone card p-4 m-0 sm:m-4 anim-slide-up max-h-[88vh] overflow-y-auto">
        {title && (
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-display font-extrabold text-lg leading-tight">{title}</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted text-xl leading-none px-2 -mr-2">
              ×
            </button>
          </div>
        )}
        {children}
        {footer && <div className="mt-4 flex gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon = '✨', title, body, action }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="text-4xl mb-2" aria-hidden="true">{icon}</div>
      <h3 className="font-display font-bold text-base mb-1">{title}</h3>
      {body && <p className="text-sm text-muted mb-4">{body}</p>}
      {action}
    </div>
  )
}

export function Banner({ tone = 'info', icon, title, children, action }) {
  const colors = {
    info: 'var(--accent)',
    good: 'var(--good)',
    warn: 'var(--warn)',
    bad: 'var(--bad)',
  }
  const color = colors[tone] || colors.info
  return (
    <div className="card-flat p-3 flex gap-3 items-start" style={{ borderColor: color }}>
      {icon && <span className="text-lg leading-none mt-0.5" aria-hidden="true">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-sm" style={{ color }}>{title}</div>}
        <div className="text-sm text-muted">{children}</div>
      </div>
      {action}
    </div>
  )
}

/**
 * Marks anything that is sample data rather than a real, working feature.
 * Used deliberately and often — a mockup that looks finished is worse than one
 * that says what it is.
 */
export function DemoTag({ children = 'Sample data', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${className}`}
      style={{ background: 'var(--surface-2)', color: 'var(--warn)', border: '1px dashed var(--warn)' }}
      title="Not real data — this needs a shared server to work for real. See docs/BACKEND.md"
    >
      {children}
    </span>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 card-flat mb-3 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className="flex-1 whitespace-nowrap px-3 py-2 text-sm font-semibold rounded-[calc(var(--radius)-4px)] transition-colors"
          style={
            value === t.id
              ? { background: 'var(--accent)', color: 'var(--bg)' }
              : { color: 'var(--ink-muted)' }
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** A burst of sparkles used on level-ups and avatar taps. */
export function SparkleBurst({ trigger, count = 12, colors = ['#fff'] }) {
  const [key, setKey] = useState(0)
  useEffect(() => {
    if (trigger) setKey((k) => k + 1)
  }, [trigger])
  if (!trigger) return null
  return (
    <div key={key} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const dist = 40 + (i % 4) * 14
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
            style={{
              background: colors[i % colors.length],
              '--dx': `${Math.cos(angle) * dist}px`,
              '--dy': `${Math.sin(angle) * dist}px`,
              animation: 'rankup-sparkle 700ms ease-out forwards',
            }}
          />
        )
      })}
    </div>
  )
}
