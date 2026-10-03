import Logo, { SLOGAN } from '../components/Logo.jsx'
import LoopPreview from '../components/LoopPreview.jsx'
import { Words } from '../components/Motion.jsx'

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
 */
export default function Welcome({ onLookAround, onParent, onKid }) {
  return (
    <div className="shell px-5 py-7 min-h-screen flex flex-col">
      <div className="text-center mb-5 anim-slide-up">
        <div className="flex justify-center mb-3">
          <Logo size={68} glow />
        </div>
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight">
          Rank<span style={{ color: '#FFC93D' }}>Up</span>
        </h1>
        {/* Three words arriving one after another. It is the first motion
            anybody sees and it says the app is alive before a button is
            tapped. */}
        <Words as="p" className="font-display font-bold mt-1.5 text-[var(--accent)]">
          {SLOGAN}
        </Words>
      </div>

      <LoopPreview />

      <div className="mt-7">
        {/*
          * The one that should be taken, and it says exactly what it costs,
          * because "try it free" has been used by enough people asking for a
          * card that it no longer means anything.
          */}
        <button
          type="button"
          onClick={onLookAround}
          className="btn btn-primary anim-shine w-full font-display font-extrabold"
          style={{ fontSize: 16, paddingTop: 14, paddingBottom: 14 }}
        >
          Have a look around →
        </button>
        <p className="text-xs text-muted text-center mt-2 mb-5">
          A real family, already set up. No account, no email, nothing to cancel.
        </p>

        <p className="section-title text-center">Or set yours up</p>

        <button
          type="button"
          onClick={onParent}
          className="card w-full text-left p-3.5 mb-2.5 flex items-center gap-3.5 transition-transform active:scale-[0.98]"
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
          className="card w-full text-left p-3.5 flex items-center gap-3.5 transition-transform active:scale-[0.98]"
        >
          <span className="text-2xl" aria-hidden="true">🎮</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold text-sm">I'm a kid</span>
            <span className="block text-xs text-muted">
              Get a code to connect to your grown-up's account.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
      </div>

      <p className="text-xs text-muted text-center mt-6">
        A kid's phone never creates its own account — it joins a parent's.
      </p>
    </div>
  )
}
