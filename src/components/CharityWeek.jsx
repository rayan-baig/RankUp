import {
  inCharityWeek,
  daysLeftOfCharityWeek,
  daysUntilCharityWeek,
  nextCharityWindow,
  charityDatesLabel,
  CHARITY_COPY,
} from '../lib/charity.js'
import { Banner } from './ui.jsx'

/**
 * Charity Week, on the parent's screen.
 *
 * Shown during the week, and for the fortnight before it as a quiet heads-up.
 * Not shown the rest of the year: a promise about one week in June is noise
 * in October, and a banner nobody can act on is a banner people learn to
 * ignore — including on the week it matters.
 *
 * Deliberately never on a child's screen. "Your chores paid for this" is a
 * lovely sentence and it is not true: the money is the parent's
 * subscription, the child did not choose it, and tying a kid's sense of
 * having done good to their parent's card is not something this app should
 * be doing.
 */
export default function CharityWeek({ at = Date.now() }) {
  const running = inCharityWeek(at)
  const until = daysUntilCharityWeek(at)

  // A fortnight of notice, then the week itself, then silence.
  if (!running && until > 14) return null

  if (running) {
    const left = daysLeftOfCharityWeek(at)
    return (
      <Banner
        tone="good"
        icon="💛"
        title={`${CHARITY_COPY.name} — ${left} ${left === 1 ? 'day' : 'days'} left`}
        className="mb-3"
      >
        {CHARITY_COPY.promise} Not a share of it, not the profit left over
        afterwards — everything RankUp is paid between{' '}
        {charityDatesLabel(new Date(at).getUTCFullYear())}. We publish the
        total when the week ends.
      </Banner>
    )
  }

  const { year } = nextCharityWindow(at)
  return (
    <Banner tone="info" icon="💛" title={`${CHARITY_COPY.name} is coming`} className="mb-3">
      From {charityDatesLabel(year)}, every penny RankUp takes goes to
      charity. Nothing to sign up for and nothing to do — it applies to
      everybody.
    </Banner>
  )
}
