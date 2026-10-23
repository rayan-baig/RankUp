import { useEffect, useRef, useState } from 'react'

/**
 * A whole self-contained game, embedded and wired into the arcade.
 *
 * Two of the games arrived as standalone HTML files rather than as React —
 * a match-three and a WebGL runner, each with its own stylesheet, its own
 * globals and its own idea of what `body` looks like. Dropping that markup
 * straight into the app would let its CSS loose on every other screen and
 * let the app's CSS loose on it, and the first symptom would be something
 * unrelated breaking three screens away.
 *
 * So each one runs in an iframe written from a string, which gives it its
 * own document and keeps both sides out of each other's way. The frame is
 * sandboxed to scripts only: the game can run, but it cannot reach the
 * child's saved state, their login, or anything else this origin holds.
 * That matters because these files are generated code the app did not
 * write — containing them costs nothing and assumes nothing.
 *
 * The one thing that has to cross the boundary is the score. A small bridge
 * is appended to the game's own HTML, wraps whatever function that game
 * calls when a round ends, and posts the number out. Nothing else is
 * allowed through, and a message is only believed if it came from this
 * frame's own window — not merely from something claiming the right origin,
 * which a sandboxed frame does not have anyway.
 */
export default function ExternalGame({ html, bridge, title, onDone }) {
  const frame = useRef(null)
  const done = useRef(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const onMessage = (event) => {
      // The only sender we trust is the window we created.
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const data = event.data
      if (!data || data.kind !== 'rankup:score') return
      if (done.current) return
      done.current = true
      const score = Number(data.score)
      onDone(Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score : 0))))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onDone])

  // If the frame has not reported in, say so rather than leaving a child
  // staring at a blank rectangle wondering whether they broke it.
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000)
    const onReady = (event) => {
      if (frame.current && event.source === frame.current.contentWindow
        && event.data && event.data.kind === 'rankup:ready') {
        clearTimeout(t)
        setSlow(false)
      }
    }
    window.addEventListener('message', onReady)
    return () => { clearTimeout(t); window.removeEventListener('message', onReady) }
  }, [])

  // Built by concatenation rather than written as a literal: a closing
  // script tag inside a JS string ends the app's own script when this file
  // is inlined anywhere, and that failure is silent.
  const open = '<' + 'script>'
  const close = '<' + '/' + 'script>'
  const doc = `${html}\n${open}${bridge}${close}`

  return (
    <div>
      <iframe
        ref={frame}
        title={title}
        srcDoc={doc}
        sandbox="allow-scripts"
        style={{
          width: '100%',
          height: 'min(74vh, 620px)',
          border: '2px solid var(--line)',
          borderRadius: 14,
          background: '#0b1020',
          display: 'block',
        }}
      />
      {slow && (
        <p className="text-xs text-muted mt-2 text-center">
          Still loading. If nothing appears, this game needs 3D graphics your
          device may have turned off — give up and try another one, and you
          keep your token.
        </p>
      )}
    </div>
  )
}

/**
 * Shared half of every bridge: post a score out, once, and never twice.
 * Each game adds the few lines that say when a round is actually over.
 */
export const BRIDGE_BASE = `
  var sent = false;
  function rankupSend(score) {
    if (sent) return;
    sent = true;
    parent.postMessage({ kind: 'rankup:score', score: score }, '*');
  }
  parent.postMessage({ kind: 'rankup:ready' }, '*');
`
