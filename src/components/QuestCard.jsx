import { DIFFICULTY } from '../lib/xp.js'
import { CATEGORY_MAP } from '../data/questTemplates.js'
import { formatDuration } from '../lib/dates.js'
import { REPEATS } from '../lib/recurrence.js'

/** Short enough to sit beside the others without pushing them onto a third row. */
const REPEAT_CHIP = {
  daily: '🔁 Daily',
  weekdays: '🔁 School days',
  weekly: '🔁 Weekly',
}

const STATUS_LABEL = {
  assigned: null,
  redo: { text: 'Send back — redo this', tone: 'var(--warn)' },
  submitted: { text: 'Waiting for approval', tone: 'var(--accent)' },
  approved: { text: 'Approved', tone: 'var(--good)' },
}

export default function QuestCard({ quest, onClick, currency, showStatus = true }) {
  const diff = DIFFICULTY[quest.difficulty] || DIFFICULTY.medium
  const cat = CATEGORY_MAP[quest.category]
  const status = showStatus ? STATUS_LABEL[quest.status] : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full text-left p-3.5 mb-2.5 transition-transform active:scale-[0.985]"
      style={quest.status === 'redo' ? { borderColor: 'var(--warn)' } : undefined}
    >
      <div className="flex items-start gap-3">
        {/* The design gives the icon its own lit tile rather than letting it
            float next to the words, which is what makes the rows scan as a
            list instead of a wall of text. */}
        <span
          className="shrink-0 grid place-items-center"
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            fontSize: 20,
            background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 34%, var(--line))',
            boxShadow: 'inset 0 0 20px -12px var(--accent)',
          }}
        >
          {cat?.icon || '✅'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-bold text-[15px] leading-snug">{quest.title}</h3>
            {/*
              The design puts the two rewards in their own small boxes
              rather than as loose text — the currency on top, the XP
              under it — so what a quest is worth reads at a glance down
              a list instead of having to be picked out of a line.
            */}
            <span className="shrink-0 flex items-center gap-1.5">
              <span className="flex flex-col gap-1 items-end">
                {currency && (
                  <span
                    className="font-display font-extrabold whitespace-nowrap"
                    style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 7,
                      background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 36%, transparent)',
                    }}
                  >
                    {currency.icon} +{Math.max(1, Math.round((quest.xp ?? diff.xp) / 5))}
                  </span>
                )}
                <span
                  className="font-display font-extrabold whitespace-nowrap"
                  style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 7,
                    color: diff.color,
                    background: `color-mix(in srgb, ${diff.color} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${diff.color} 38%, transparent)`,
                  }}
                >
                  +{quest.xp ?? diff.xp} XP
                </span>
              </span>
              {/* The design ends every row with one, so a row reads as
                  something you open rather than something you have read. */}
              <span className="text-muted" style={{ fontSize: 18, lineHeight: 1 }}>›</span>
            </span>
          </div>

          {quest.description && <p className="text-xs text-muted mt-1 line-clamp-2">{quest.description}</p>}

          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="chip" style={{ color: diff.color, borderColor: diff.color }}>{diff.label}</span>
            {quest.adaptive && <span className="chip" style={{ color: 'var(--accent-2)', borderColor: 'var(--accent-2)' }}>♿ Adaptive</span>}
            {quest.doubleXp && <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>⚡ 2× XP</span>}
            {quest.requiresPhoto && <span className="chip">📷 Photo</span>}
            {quest.timerSeconds > 0 && <span className="chip">⏱ {formatDuration(quest.timerSeconds * 1000)}</span>}
            {quest.testScore && <span className="chip">📊 Score</span>}
            {REPEATS.has(quest.recurrence) && <span className="chip">{REPEAT_CHIP[quest.recurrence]}</span>}
          </div>

          {status && (
            <div className="mt-2 text-xs font-semibold" style={{ color: status.tone }}>
              {status.text}
            </div>
          )}
          {quest.status === 'redo' && quest.redoNote && (
            <p className="text-xs text-muted mt-1 italic">“{quest.redoNote}”</p>
          )}
        </div>
      </div>
    </button>
  )
}
