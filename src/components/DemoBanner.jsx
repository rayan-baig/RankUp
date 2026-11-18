import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Button, Modal } from './ui.jsx'
import { navigate, navigateThen, useRoute } from '../lib/router.js'
import { TRIAL_DAYS } from '../state/initialState.js'

/**
 * "This is a demo."
 *
 * It sits on every screen of the look-around, permanently, because the one
 * genuinely bad outcome here is somebody spending twenty minutes setting up
 * chores for their own children inside a demo and losing the lot. Saying so
 * once at the start is not enough; people arrive at a screen from somewhere
 * else and forget.
 *
 * It also holds the two things a visitor wants at any moment: to see the
 * same family from the other side (the parent's phone, or a child's), and
 * to start their own for free. "Start for free" goes straight to making an
 * account, not back to the front door they already read.
 *
 * It is the only thing in the app allowed to nag, and it is allowed because
 * the person reading it has not agreed to anything yet. The moment they have
 * a real family this component never renders again.
 */
export default function DemoBanner() {
  const { state, dispatch } = useApp()
  const { path } = useRoute()
  const [confirming, setConfirming] = useState(false)

  if (!state.demo) return null

  const route = path.split('?')[0]
  const inKidSide = route.startsWith('/kid')
  const viewing = route.startsWith('/parent') ? 'parent' : inKidSide ? state.session.kidId : null

  const start = () => {
    dispatch({ type: 'LEAVE_DEMO' })
    // Onboarding reads this and opens on the parent's sign-up.
    navigate('/welcome?start=parent')
  }

  const asParent = () => {
    dispatch({ type: 'UNLOCK_PARENT' })
    navigate('/parent')
  }
  const asKid = (kid) => {
    const go = () => dispatch({ type: 'SET_ROLE', role: 'kid', kidId: kid.id })
    if (inKidSide) { go(); return }
    navigateThen('/kid', go)
  }

  return (
    <>
      <div className="demo-bar sticky top-0 z-30 px-3 py-2" data-testid="demo-banner">
        <div className="flex items-center gap-2">
          <span className="demo-pill shrink-0">DEMO</span>
          <span className="text-xs min-w-0 flex-1">
            The <strong>Rivera family</strong> is pretend. Nothing here is saved.
          </span>
          <Button variant="primary" className="demo-start shrink-0" onClick={() => setConfirming(true)}>
            Start for free
          </Button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" role="group" aria-label="See the demo as">
          <span className="text-[11px] text-muted mr-0.5">See it as:</span>
          <button type="button" className="demo-view" aria-pressed={viewing === 'parent'} onClick={asParent}>
            👀 Parent
          </button>
          {state.kids.map((kid) => (
            <button key={kid.id} type="button" className="demo-view" aria-pressed={viewing === kid.id} onClick={() => asKid(kid)}>
              🎮 {kid.name}
            </button>
          ))}
        </div>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Start your own family">
        <p className="text-sm text-muted mb-4">
          Free for {TRIAL_DAYS} days, no card. The Rivera family is cleared and
          you make your account. Nothing from the demo comes with you.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>Keep looking</Button>
          <Button className="flex-1" onClick={start}>Start for free</Button>
        </div>
      </Modal>
    </>
  )
}
