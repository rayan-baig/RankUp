import Logo, { SLOGAN } from '../components/Logo.jsx'
import LoopPreview from '../components/LoopPreview.jsx'
import { Words } from '../components/Motion.jsx'
import { TIERS, TRIAL_DAYS } from '../state/initialState.js'

/* "$9.99", never "$9.990" or "$10". */
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
 * The three doors are deliberately not equal. Looking around is the one most
 * people should take and it is styled like it; the other two are for people
 * who already know what they are doing.
 *
 * It answers, on one phone screen with no scrolling, the three things a
 * parent asks before anything else: what is it, what does it cost, and is
 * there a catch to trying it. The prices and the trial come from TIERS and
 * TRIAL_DAYS, the same numbers the plan screen and the server use, so the
 * door cannot quote a price the app does not charge (tests/lookaround.mjs).
 */
export default function Welcome({ onLookAround, onParent, onKid, wiped = null }) {
  return (
    <div className="shell px-5 py-5 min-h-screen flex flex-col">
      {wiped && (
        <p role="status" data-testid="device-wiped" className="text-sm text-center mb-4 rounded-xl px-3 py-2"
          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          {wiped === 'removed'
            ? 'This account is no longer part of a family on RankUp, so everything RankUp kept on this phone has been erased.'
            : 'This phone was unlinked from its family, so everything RankUp kept on it has been erased.'}
        </p>
      )}
      <div className="text-center mb-3 anim-slide-up">
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
        <p className="text-sm text-muted mt-1 mx-auto" style={{ maxWidth: 330 }} data-testid="what-it-is">
          Your kids&rsquo; chores become quests. They tap &ldquo;I did it!&rdquo;, you accept,
          and they earn XP and level up in a world they pick.
        </p>
      </div>

      <LoopPreview compact />

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
          className="btn btn-primary anim-shine w-full font-display font-extrabold"
          style={{ fontSize: 16, paddingTop: 12, paddingBottom: 12 }}
        >
          Have a look around →
        </button>
        <p className="text-xs text-muted text-center mt-1.5 mb-3">
          A real family, already set up. No account, no email, nothing to cancel.
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
              No account: get a code to join your grown-up's.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
      </div>
    </div>
  )
}
