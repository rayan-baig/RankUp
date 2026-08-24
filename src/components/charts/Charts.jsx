import { useState } from 'react'
import { chartTokens } from './palette.js'

/* Hand-rolled SVG charts. No chart library — three chart shapes is not worth a
 * dependency, and this keeps the app small enough to load fast on a phone. */

function EmptyPlot({ mode, message }) {
  const t = chartTokens(mode)
  return (
    <div className="h-24 flex items-center justify-center text-center px-4">
      <p className="text-xs" style={{ color: t.textSecondary }}>{message}</p>
    </div>
  )
}

function Frame({ title, subtitle, mode, legend, table, children }) {
  const t = chartTokens(mode)
  const [showTable, setShowTable] = useState(false)
  return (
    <figure
      className="m-0 p-3 rounded-[var(--radius)]"
      style={{ background: t.surface, border: `1px solid ${t.grid}` }}
    >
      <figcaption className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: t.textPrimary }}>{title}</div>
          {subtitle && <div className="text-xs" style={{ color: t.textSecondary }}>{subtitle}</div>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-[11px] font-semibold underline shrink-0"
            style={{ color: t.textSecondary }}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </figcaption>

      {legend && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 mb-2 list-none p-0 m-0">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: t.textSecondary }}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      )}

      {showTable && table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ color: t.textPrimary }}>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="text-left font-semibold py-1 pr-3 whitespace-nowrap" style={{ borderBottom: `1px solid ${t.grid}`, color: t.textSecondary }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="py-1 pr-3 whitespace-nowrap" style={{ borderBottom: `1px solid ${t.grid}` }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  )
}

/** Vertical bars, one series. Values are labelled directly so no legend is needed. */
export function DailyBars({ title, subtitle, mode, data, unit = '' }) {
  const t = chartTokens(mode)
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const empty = data.every((d) => !d.value)
  const W = 320
  const H = 150
  const padB = 22
  const padT = 18
  const slot = W / data.length
  const barW = Math.min(28, slot - 8)

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      mode={mode}
      table={{ columns: ['Day', title], rows: data.map((d) => [d.label, `${d.value}${unit}`]) }}
    >
      {empty ? (
        <EmptyPlot mode={mode} message="Nothing recorded in the last 7 days." />
      ) : (
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
          <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke={t.grid} strokeWidth="1" />
          {data.map((d, i) => {
            const h = ((H - padB - padT) * d.value) / max
            const x = i * slot + (slot - barW) / 2
            const y = H - padB - h
            return (
              <g
                key={d.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                style={{ cursor: 'default' }}
              >
                {/* Generous invisible hit area — bars are thin on a phone. */}
                <rect x={i * slot} y={padT} width={slot} height={H - padB - padT} fill="transparent" />
                {d.value > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx="4"
                    fill={t.series[0]}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {d.value > 0 && (
                  <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill={t.textPrimary}>
                    {d.value}
                  </text>
                )}
                <text x={i * slot + slot / 2} y={H - 7} textAnchor="middle" fontSize="10" fill={t.textSecondary}>
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div
            className="absolute -top-1 left-0 right-0 text-center text-[11px] font-semibold pointer-events-none"
            style={{ color: t.textPrimary }}
          >
            {data[hover].label}: {data[hover].value}{unit}
          </div>
        )}
      </div>
      )}
    </Frame>
  )
}

/** Stacked bars, up to three series, with a 2px gap between segments. */
export function StackedBars({ title, subtitle, mode, data, series }) {
  const t = chartTokens(mode)
  const [hover, setHover] = useState(null)
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d[s.key] || 0), 0))
  const max = Math.max(1, ...totals)
  const empty = totals.every((v) => !v)
  const W = 320
  const H = 150
  const padB = 22
  const padT = 14
  const slot = W / data.length
  const barW = Math.min(28, slot - 8)
  const legend = series.map((s, i) => ({ label: s.label, color: t.series[i] }))

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      mode={mode}
      legend={legend}
      table={{
        columns: ['Day', ...series.map((s) => s.label)],
        rows: data.map((d) => [d.label, ...series.map((s) => d[s.key] || 0)]),
      }}
    >
      {empty ? (
        <EmptyPlot mode={mode} message="No submissions in the last 7 days." />
      ) : (
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
          <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke={t.grid} strokeWidth="1" />
          {data.map((d, i) => {
            const x = i * slot + (slot - barW) / 2
            let cursor = H - padB
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <rect x={i * slot} y={padT} width={slot} height={H - padB - padT} fill="transparent" />
                {series.map((s, si) => {
                  const v = d[s.key] || 0
                  if (!v) return null
                  const h = ((H - padB - padT) * v) / max
                  cursor -= h
                  const y = cursor
                  cursor -= 2 // the 2px surface gap between segments
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(2, h)}
                      rx={si === 0 ? 4 : 2}
                      fill={t.series[si]}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )
                })}
                {totals[i] > 0 && (
                  <text x={x + barW / 2} y={cursor - 3} textAnchor="middle" fontSize="10" fontWeight="600" fill={t.textPrimary}>
                    {totals[i]}
                  </text>
                )}
                <text x={i * slot + slot / 2} y={H - 7} textAnchor="middle" fontSize="10" fill={t.textSecondary}>
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div className="absolute -top-1 left-0 right-0 text-center text-[11px] pointer-events-none" style={{ color: t.textPrimary }}>
            {data[hover].label}: {series.map((s) => `${s.label} ${data[hover][s.key] || 0}`).join(' · ')}
          </div>
        )}
      </div>
      )}
    </Frame>
  )
}

/** Horizontal bars with the value labelled at the end of each bar. */
export function HorizontalBars({ title, subtitle, mode, data, unit = '', seriesIndex = 0 }) {
  const t = chartTokens(mode)
  const max = Math.max(1, ...data.map((d) => d.value))
  const empty = data.every((d) => !d.value)
  const rowH = 26
  const H = Math.max(rowH, data.length * rowH)
  const W = 320
  const labelW = 96

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      mode={mode}
      table={{ columns: ['Item', title], rows: data.map((d) => [d.label, `${d.value}${unit}`]) }}
    >
      {empty ? <EmptyPlot mode={mode} message="Nothing to show yet." /> : (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} style={{ maxHeight: H * 1.4 }}>
        {data.map((d, i) => {
          const w = ((W - labelW - 34) * d.value) / max
          const y = i * rowH + 4
          return (
            <g key={d.label}>
              <text x="0" y={y + 12} fontSize="11" fill={t.textSecondary}>
                {d.label.length > 15 ? `${d.label.slice(0, 14)}…` : d.label}
              </text>
              {d.value > 0 && <rect x={labelW} y={y + 2} width={w} height="13" rx="4" fill={t.series[seriesIndex]} />}
              <text x={labelW + (d.value > 0 ? w : 0) + 6} y={y + 13} fontSize="10" fontWeight="600" fill={d.value > 0 ? t.textPrimary : t.textSecondary}>
                {d.value}{unit}
              </text>
            </g>
          )
        })}
      </svg>
      )}
    </Frame>
  )
}

/** A single headline number — not every fact deserves a chart. */
export function StatTile({ label, value, note, mode, tone }) {
  const t = chartTokens(mode)
  return (
    <div className="p-3 rounded-[var(--radius)] flex-1 min-w-0" style={{ background: t.surface, border: `1px solid ${t.grid}` }}>
      <div className="text-2xl font-extrabold leading-none" style={{ color: tone || t.textPrimary }}>{value}</div>
      <div className="text-[11px] mt-1.5 font-semibold uppercase tracking-wide truncate" style={{ color: t.textSecondary }}>{label}</div>
      {note && <div className="text-[11px] mt-0.5" style={{ color: t.textSecondary }}>{note}</div>}
    </div>
  )
}
