import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Card, Button } from './ui.jsx'
import { fetchDeals } from '../lib/billing.js'
import { dealDate, giftAYearDue } from '../lib/deals.js'
import { navigate } from '../lib/router.js'

/**
 * The deals, for a parent (0.23.0). Every card here is for Parent Mode or
 * the Give page only: none of them is ever drawn on a child's phone, and
 * useDeals never even asks there (fetchDeals refuses on a child's phone and
 * in the demo). The words say what the deal is, and when it really ends,
 * with no countdown and no made-up scarcity: the Founding places left are
 * the database's count, and when it cannot be counted nothing is said.
 */
export function useDeals() {
  const { state } = useApp()
  const [deals, setDeals] = useState(null)
  const childPhone = state.device?.role === 'kid'
  useEffect(() => {
    if (childPhone || state.demo) return undefined
    let stop = false
    fetchDeals(state).then((d) => { if (!stop) setDeals(d) })
    return () => { stop = true }
  }, [childPhone, state.demo])
  return childPhone || state.demo ? null : deals
}

/** "Founding Families: your first year 40% off. 312 of 500 places left. Until 31 January." */
export function FoundingCard({ deal, onChoose = null }) {
  if (!deal) return null
  return (
    <Card flat className="mb-3" data-testid="founding-deal">
      <div className="flex gap-3 items-start">
        <span className="text-2xl" aria-hidden="true">🌱</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Founding Families: your first year {deal.percent}% off</p>
          <p className="text-xs text-muted mt-0.5">
            For the first {deal.limit.toLocaleString('en-US')} families on a yearly plan.
            {typeof deal.left === 'number' && ` ${deal.left.toLocaleString('en-US')} places left.`}
            {deal.ends_at && ` Until ${dealDate(deal.ends_at)}.`}
            {' '}After the first year it renews at the plan&apos;s normal yearly price. One per family.
          </p>
        </div>
      </div>
      {onChoose && (
        <Button variant="soft" className="w-full mt-3 py-2 min-h-0 text-sm" onClick={onChoose} data-testid="founding-choose">
          See the yearly plans
        </Button>
      )}
    </Card>
  )
}

/** The holiday gift sale, for a parent and on the Give page. */
export function GiftSaleBanner({ sale, link = true }) {
  if (!sale) return null
  return (
    <Card flat className="mb-3" data-testid="gift-sale">
      <div className="flex gap-3 items-start">
        <span className="text-2xl" aria-hidden="true">🎁</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Gift a year of RankUp: {sale.percent}% off</p>
          <p className="text-xs text-muted mt-0.5">Until {dealDate(sale.until)}. Taken off at the payment page.</p>
        </div>
      </div>
      {link && (
        <Button variant="soft" className="w-full mt-3 py-2 min-h-0 text-sm" onClick={() => navigate('/gift')}>
          Give a year
        </Button>
      )}
    </Card>
  )
}

/** The Season's deal: the first 14 days of each Season. */
export function SeasonDealBanner({ deal }) {
  if (!deal) return null
  return (
    <Card flat className="mb-3" data-testid="season-deal">
      <div className="flex gap-3 items-start">
        <span className="text-2xl" aria-hidden="true">✨</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">
            {deal.name}: {deal.on === 'gift' ? 'gift codes' : 'the yearly plan'} {deal.percent}% off
          </p>
          <p className="text-xs text-muted mt-0.5">For the Season&apos;s first two weeks, until {dealDate(deal.until)}.</p>
        </div>
      </div>
    </Card>
  )
}

/**
 * "Know a family who would like this?": once a family has used RankUp for a
 * month, a quiet line on the parent's dashboard about giving a year. Hidden
 * for good with "Not now". Parent Mode only.
 */
export function GiftAYearCard() {
  const { state, dispatch } = useApp()
  if (state.device?.role === 'kid' || state.demo || !state.session?.parentUnlocked) return null
  if (!giftAYearDue(state.family) || state.settings?.giftAYearHidden) return null
  return (
    <Card flat className="mb-3" data-testid="gift-a-year">
      <div className="flex gap-3 items-start">
        <span className="text-2xl" aria-hidden="true">💌</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Know a family who would like this?</p>
          <p className="text-xs text-muted mt-0.5">Give a grandparent, a brother or a friend a year of RankUp for their family.</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" onClick={() => navigate('/gift')}>Give a year</Button>
        <Button variant="ghost" className="flex-1 py-2 min-h-0 text-sm"
          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { giftAYearHidden: true } })}>Not now</Button>
      </div>
    </Card>
  )
}
