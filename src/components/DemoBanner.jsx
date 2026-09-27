import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { Button, Modal } from './ui.jsx'
import { navigate } from '../lib/router.js'

/**
 * "This is not your family."
 *
 * It sits on every screen of the look-around, permanently, because the one
 * genuinely bad outcome here is somebody spending twenty minutes setting up
 * chores for their own children inside a demo and losing the lot. Saying so
 * once at the start is not enough; people arrive at a screen from somewhere
 * else and forget.
 *
 * It is also the only thing in the app allowed to nag, and it is allowed
 * because the person reading it has not agreed to anything yet. The moment
 * they have a real family this component never renders again.
 */
export default function DemoBanner() {
  const { state, dispatch } = useApp()
  const [confirming, setConfirming] = useState(false)

  if (!state.demo) return null

  const start = () => {
    dispatch({ type: 'LEAVE_DEMO' })
    navigate('/welcome')
  }

  return (
    <>
      <div
        className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2"
        style={{
          background: 'color-mix(in srgb, var(--accent) 16%, var(--bg))',
          borderBottom: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span aria-hidden="true">👀</span>
        <span className="text-xs min-w-0 flex-1">
          You're looking around the <strong>Rivera family</strong>. Nothing here is saved anywhere.
        </span>
        <Button
          variant="primary"
          className="shrink-0"
          style={{ padding: '6px 10px', fontSize: 12 }}
          onClick={() => setConfirming(true)}
        >
          Start mine
        </Button>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Start your own family">
        <p className="text-sm text-muted mb-4">
          This clears the Rivera family and takes you to setup. Nothing you have
          done in the demo carries over — which is the point, since none of it
          is yours.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>Keep looking</Button>
          <Button className="flex-1" onClick={start}>Start mine</Button>
        </div>
      </Modal>
    </>
  )
}
