import { TIER_LADDER, PLAN_COMPARISON } from '../state/initialState.js'
import { KID_THEMES } from '../data/kidThemes.js'
import { guildsEnabled } from '../lib/guilds.js'

/*
 * What you get on each plan, on one screen, inside the trial banner
 * (0.29.0). Words only: what differs between the plans, from the same table
 * the plan screen uses (PLAN_COMPARISON), so it can't say anything the app
 * doesn't do. The prices are one tap away on "See plans". Parent Mode only:
 * the banner never shows on a child's screen. And one plain line about
 * Pilot, which is no plan's extra: it is optional, and runs on the parent's
 * own AI key.
 *
 * 0.30.0: it spans the banner's whole width under its header (it used to be
 * squeezed into the column beside the icon on a phone), says "Any number"
 * rather than "Unlimited" for children, has a Close button of its own, and
 * its words are 13–14px on a computer (index.css, .plan-compare).
 */
const MARK = (v) => (v === true ? '✓' : v === 'Unlimited' ? 'Any number' : v ? v : '—')

export default function PlanCompare({ trialTier, onClose }) {
  const rows = PLAN_COMPARISON
    .filter((row) => !row.needs || (row.needs === 'guilds' && guildsEnabled()))
    .filter((row) => new Set(TIER_LADDER.map((t) => String(row.value(t) || false))).size > 1)
  return (
    <div className="plan-compare mt-2.5" data-testid="plan-compare">
      <div className="flex items-center gap-2 mb-1">
        <p className="plan-compare-title flex-1 min-w-0 font-semibold">What you get on each plan</p>
        {onClose && (
          <button type="button" className="plan-compare-close" aria-label="Close the comparison" data-testid="plan-compare-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <table className="w-full leading-tight">
        <thead>
          <tr>
            <td />
            {TIER_LADDER.map((t) => (
              <th key={t.id} scope="col" className={`pb-1 font-semibold${t.id === trialTier ? ' plan-compare-on' : ''}`}>{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="text-left font-normal py-1 pr-1">{row.label}</th>
              {TIER_LADDER.map((t) => (
                <td key={t.id} className={`text-center py-1 px-0.5${t.id === trialTier ? ' plan-compare-on' : ''}`}>{MARK(row.value(t))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="plan-compare-note text-muted mt-1.5">
        On every plan: unlimited quests and rewards, all {KID_THEMES.length} worlds, the arcade and the Sunday Market.
      </p>
      <p className="plan-compare-note text-muted mt-1" data-testid="pilot-optional">
        🤖 Pilot, the AI helper for grown-ups, is optional on every plan. It uses your own AI key, so RankUp never charges for it.
      </p>
    </div>
  )
}
