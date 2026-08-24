import { DIFFICULTY } from '../lib/xp.js'
import { CATEGORY_MAP } from '../data/questTemplates.js'
import { formatDuration } from '../lib/dates.js'

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
        <span className="text-xl leading-none mt-0.5" aria-hidden="true">{cat?.icon || '✅'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-bold text-[15px] leading-snug">{quest.title}</h3>
            <span className="shrink-0 text-right">
              <span className="block font-display font-extrabold text-sm" style={{ color: diff.color }}>
                +{quest.xp ?? diff.xp} XP
              </span>
              {currency && (
                <span className="block text-[11px] text-muted">
                  {currency.icon} ~{Math.max(1, Math.round((quest.xp ?? diff.xp) / 5))}
                </span>
              )}
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
