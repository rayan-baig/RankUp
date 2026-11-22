import { Suspense, useEffect, useState } from 'react'
import Logo, { SLOGAN } from '../components/Logo.jsx'
import LoopPreview, { BEATS } from '../components/LoopPreview.jsx'
import { Words } from '../components/Motion.jsx'
import { TIERS, TRIAL_DAYS } from '../state/initialState.js'
import { OPERATOR } from '../data/legalText.js'
import { lazyLoad } from '../lib/lazy.js'
// On a computer the door is two columns, the demo beside the ways in.
import '../styles/desk.css'

/* The four beats of the demo, said once more beside it on a computer. */
const BEAT_LINES = [
  'A chore from a ready-made pack, or your own.',
  'They tap “I did it!” on their phone or on yours.',
  'A photo from their own camera app, if you ask. RankUp keeps none.',
  'XP and coins land only when you accept.',
]

/* The strip of RankUp's screens under the door, on a computer window (0.32.0):
   fetched after the page has loaded, never on a phone. On a short window it
   sits just under the fold, and the page scrolls to it. */
const DoorStrip = lazyLoad(() => import('../components/DoorStrip.jsx'))
const STRIP_QUERY = '(min-width: 960px) and (min-height: 700px)'
function useStrip() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.(STRIP_QUERY)
    if (!mq) return undefined
    const check = () => setOn(mq.matches)
    const t = setTimeout(check, 0)
    mq.addEventListener?.('change', check)
    return () => { clearTimeout(t); mq.removeEventListener?.('change', check) }
  }, [])
  return on
}

/* "$5.99", never "$5.990" or "$6". */
const dollars = (n) => `$${n.toFixed(2)}`

/**
 * The front door.
 *
 * The old one asked whose phone this was and then, for a parent, asked for an
 * email address before showing a single thing. Everybody who bounced there was
 * free to acquire and gone for nothing, and they left without ever seeing the
 * product — which is the only argument it has.
 *
 * So the order is inverted. The loop plays by itself at the top, and the first
 * thing offered is a way in that costs nothing: a real family, already set up,
 * that they can prod at for as long as they like. The account is asked for at
 * the point where it starts being worth something — when they want the app to
 * hold their own children rather than somebody else's.
 *
 * The three doors are deliberately not equal. "See it live" is the one most
 * people should take and it is styled like it; the other two are for people
 * who already know what they are doing.
 *
 * It answers, on one phone screen with no scrolling, the three things a
 * parent asks before anything else: what is it, what does it cost, and is
 * there a catch to trying it. The prices and the trial come from TIERS and
 * TRIAL_DAYS, the same numbers the plan screen and the server use, so the
 * door cannot quote a price the app does not charge (tests/lookaround.mjs).
 *
 * On a computer (960px and up, styles/desk.css) it is two columns: the words
 * and the ways in on the left, and on the right the demo, with its four steps
 * written out beside it, and (0.32.0) a bigger title, and under both, on a
 * window tall enough, a strip of four of the app's real screens
 * (components/DoorStrip.jsx). On a phone the order and the look are unchanged.
 */
export default function Welcome({ onLookAround, onParent, onKid, wiped = null, childPhone = false }) {
  const strip = useStrip()
  return (
    <div className="shell door px-5 py-5 min-h-screen flex flex-col">
      {wiped && (
        <p role="status" data-testid="device-wiped" className="text-sm text-center mb-4 rounded-xl px-3 py-2"
          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          {wiped === 'removed'
            ? 'This account is no longer part of a family on RankUp, so everything RankUp kept on this phone has been erased.'
            : 'This phone was unlinked from its family, so everything RankUp kept on it has been erased.'}
        </p>
      )}
      <div className="door-grid">
      <div className="door-head text-center mb-3 anim-slide-up">
        <div className="flex items-center justify-center gap-2.5">
          <Logo size={44} glow />
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight">
            Rank<span style={{ color: '#FFC93D' }}>Up</span>
          </h1>
        </div>
        {/* Three words arriving one after another. It is the first motion
            anybody sees and it says the app is alive before a button is
            tapped. */}
        <Words as="p" className="font-display font-bold mt-1.5 text-[var(--accent)]">
          {SLOGAN}
        </Words>
        <p className="text-sm text-muted mt-1 mx-auto max-w-[330px]" data-testid="what-it-is">
          Your kids&rsquo; chores become quests. They tap &ldquo;I did it!&rdquo;, you accept,
          and they earn XP and level up in a world they pick.
        </p>
      </div>

      <div className="door-demo">
        <LoopPreview compact />
        <ol className="door-steps" aria-label="How it works">
          {BEATS.map((b, i) => (
            <li key={b.label}>
              <span className="door-step-n" aria-hidden="true">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-display font-bold text-sm">{b.label}</span>
                <span className="block text-xs text-muted mt-0.5">{BEAT_LINES[i]}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="door-ways">

      {/*
        * The price, before anyone is asked for anything. A parent who has to
        * sign up to find out what it costs assumes the worst.
        */}
      <div className="card-flat mt-4 px-3 py-2.5" data-testid="price">
        <p className="text-xs text-center font-semibold mb-2">
          Free for {TRIAL_DAYS} days with everything in {TIERS.elite.name}. No card.
        </p>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[TIERS.starter, TIERS.standard, TIERS.elite].map((t) => (
            <div key={t.id} className="min-w-0">
              <div className="font-display font-extrabold text-sm leading-tight">
                {t.price ? dollars(t.price) : 'Free'}
                {t.price ? <span className="text-[10px] font-semibold text-muted">/mo</span> : null}
              </div>
              <div className="text-[11px] text-muted leading-tight">
                {t.name}{t.limits.maxKids !== Infinity ? ` · ${t.limits.maxKids} ${t.limits.maxKids === 1 ? 'child' : 'children'}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {/*
          * The one that should be taken, and it says exactly what it costs,
          * because "try it free" has been used by enough people asking for a
          * card that it no longer means anything.
          */}
        <button
          type="button"
          onClick={onLookAround}
          className="btn btn-primary anim-shine w-full font-display font-extrabold text-base py-3"
          data-testid="see-it-live"
        >
          See it live: try a demo family →
        </button>
        <p className="text-xs text-muted text-center mt-1.5 mb-3">
          A pretend family, already set up. Be the parent or the kid. No account, no email, nothing to cancel.
        </p>

        <p className="section-title text-center">Or set yours up</p>

        <button
          type="button"
          onClick={onParent}
          className="card w-full text-left px-3.5 py-2.5 mb-2 flex items-center gap-3.5 transition-transform active:scale-[0.98]"
        >
          <span className="text-2xl" aria-hidden="true">🧑‍🍳</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold text-sm">I'm a parent</span>
            <span className="block text-xs text-muted">
              Add your kids and assign their first quests.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>

        <button
          type="button"
          onClick={onKid}
          className="card w-full text-left px-3.5 py-2.5 flex items-center gap-3.5 transition-transform active:scale-[0.98]"
        >
          <span className="text-2xl" aria-hidden="true">🎮</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold text-sm">I'm a kid</span>
            <span className="block text-xs text-muted">
              No account: type the code from your grown-up's phone.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>

        {/* One line, so the front door still fits one phone screen (no
            emoji: their width differs from one phone's fonts to another's,
            and a second line pushed the door past one screen). For
            grandparents, aunts and uncles a year of RankUp as a gift (#/gift,
            no account), for schools the School League's front page, and the
            small print a parent deciding looks for (Privacy, Terms, Contact),
            readable with no account. The gift and schools links are never on
            a phone that is a child's: both are one tap from prices. */}
        <nav className="flex justify-center flex-wrap gap-x-1 mt-1 text-xs whitespace-nowrap" aria-label="More" data-testid="front-footer">
          {!childPhone && (
            <>
              <a href="#/gift" className="tap-link underline text-muted" data-testid="give-link">Give a year</a>
              <a href="#/school" className="tap-link underline text-muted" data-testid="schools-link">Schools</a>
            </>
          )}
          <a href="#/legal/privacy" className="tap-link underline text-muted">Privacy</a>
          <a href="#/legal/terms" className="tap-link underline text-muted">Terms</a>
          <a href={`mailto:${OPERATOR.email}`} className="tap-link underline text-muted">Contact</a>
        </nav>
      </div>
      </div>
      </div>
      {strip && <Suspense fallback={null}><DoorStrip /></Suspense>}
    </div>
  )
}
