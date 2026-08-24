/** A quiet patterned backdrop for the parent dashboard themes. Purely cosmetic. */
export default function ParentBackground({ theme }) {
  if (!theme) return null
  const c = theme.colors
  const p = theme.pattern

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true" style={{ background: c.bg }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        {p === 'grid' && (
          <g stroke={c.accent} strokeWidth="0.14" opacity="0.28">
            {Array.from({ length: 21 }, (_, i) => <line key={`v${i}`} x1={i * 5} y1="0" x2={i * 5} y2="100" />)}
            {Array.from({ length: 21 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 5} x2="100" y2={i * 5} />)}
          </g>
        )}
        {p === 'wood' && (
          <g opacity="0.35">
            {Array.from({ length: 9 }, (_, i) => (
              <g key={i}>
                <rect x="0" y={i * 11.5} width="100" height="11" fill={c.surface2} opacity={i % 2 ? 0.6 : 0.35} />
                <path d={`M0 ${i * 11.5 + 5} Q25 ${i * 11.5 + 2} 50 ${i * 11.5 + 6} T100 ${i * 11.5 + 4}`} stroke={c.line} strokeWidth="0.2" fill="none" />
              </g>
            ))}
          </g>
        )}
        {p === 'nodes' && (
          <g>
            {Array.from({ length: 22 }, (_, i) => {
              const x = (i * 37) % 100
              const y = (i * 53) % 100
              return (
                <circle key={i} cx={x} cy={y} r="0.9" fill={c.accent} opacity="0.5">
                  <animate attributeName="opacity" values="0.12;0.7;0.12" dur={`${3 + (i % 5)}s`} repeatCount="indefinite" />
                </circle>
              )
            })}
          </g>
        )}
        {p === 'fronds' && (
          <g opacity="0.16">
            {Array.from({ length: 7 }, (_, i) => (
              <path key={i} d={`M${i * 16} 100 C${i * 16 + 8} 70 ${i * 16 - 6} 46 ${i * 16 + 4} 20`} stroke={c.accent} strokeWidth="1.4" fill="none" />
            ))}
          </g>
        )}
        {p === 'carbon' && (
          <g opacity="0.3">
            {Array.from({ length: 26 }, (_, r) =>
              Array.from({ length: 26 }, (_, col) => (
                <rect key={`${r}-${col}`} x={col * 4 + (r % 2 ? 2 : 0)} y={r * 4} width="1.8" height="1.8" rx="0.4" fill={c.surface2} />
              )),
            )}
            <line x1="0" y1="30" x2="100" y2="26" stroke={c.accent} strokeWidth="0.35" opacity="0.7" />
            <line x1="0" y1="74" x2="100" y2="70" stroke={c.accent} strokeWidth="0.35" opacity="0.5" />
          </g>
        )}
        {p === 'sunrise' && (
          <g>
            <defs>
              <radialGradient id="sol" cx="0.5" cy="1">
                <stop offset="0" stopColor={c.accent} stopOpacity="0.5" />
                <stop offset="1" stopColor={c.accent} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill="url(#sol)" />
          </g>
        )}
        {p === 'waves' && (
          <g opacity="0.3">
            {Array.from({ length: 8 }, (_, i) => (
              <path key={i} d={`M0 ${14 + i * 11} Q25 ${8 + i * 11} 50 ${14 + i * 11} T100 ${14 + i * 11}`} stroke={c.accent} strokeWidth="0.4" fill="none" />
            ))}
          </g>
        )}
        {p === 'blueprint' && (
          <g stroke={c.accent} opacity="0.22">
            {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" strokeWidth="0.3" />)}
            {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} strokeWidth="0.3" />)}
            <rect x="20" y="24" width="34" height="26" fill="none" strokeWidth="0.6" />
            <rect x="58" y="52" width="26" height="22" fill="none" strokeWidth="0.6" />
            <line x1="20" y1="20" x2="54" y2="20" strokeWidth="0.4" />
          </g>
        )}
        {p === 'estate' && (
          <g>
            <rect width="100" height="100" fill={c.bg} />
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={2 + i * 3} y={2 + i * 3} width={96 - i * 6} height={96 - i * 6} fill="none" stroke={c.accent} strokeWidth="0.12" opacity="0.4">
                <animate attributeName="opacity" values="0.12;0.5;0.12" dur={`${5 + i}s`} repeatCount="indefinite" />
              </rect>
            ))}
          </g>
        )}
      </svg>
      <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${c.bg}cc, ${c.bg}88 40%, ${c.bg}ee)` }} />
    </div>
  )
}
