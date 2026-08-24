import { useCallback, useEffect, useRef, useState } from 'react'
import { toCanvas, canvasToJpeg } from '../lib/imaging.js'
import { Button, Banner } from './ui.jsx'

/**
 * The in-app camera.
 *
 * Uses the browser's getUserMedia API, which works on modern iOS Safari,
 * Android Chrome and desktop browsers — but ONLY over https (or localhost).
 * On a plain http:// address the browser blocks the camera entirely, which is
 * one practical reason this app has to be deployed on a real host rather than
 * shared as a local file.
 *
 * If the live camera is unavailable we fall back to the phone's own camera app
 * via a file input, and we tag that capture as `upload` so the photo check can
 * tell the parent the photo was not taken inside RankUp.
 */

const CONSTRAINTS = (facing) => ({
  video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } },
  audio: false,
})

export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facing, setFacing] = useState('environment')
  const [status, setStatus] = useState('starting') // starting | live | denied | unsupported | error
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [flash, setFlash] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async (mode) => {
    stop()
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS(mode))
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStatus('live')
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setStatus('denied')
        setError('Camera access was blocked. Allow the camera for this site in your browser settings, then try again.')
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        setStatus('unsupported')
        setError('No camera was found on this device.')
      } else {
        setStatus('error')
        setError(err.message || 'The camera could not be started.')
      }
    }
  }, [stop])

  useEffect(() => {
    start(facing)
    return stop
  }, [facing, start, stop])

  const shoot = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setFlash(true)
    setTimeout(() => setFlash(false), 160)
    const canvas = toCanvas(video, 1080)
    setPreview({ dataUrl: canvasToJpeg(canvas, 0.72), source: 'live-camera', at: Date.now() })
    stop()
  }

  const onFilePick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const img = new Image()
      img.onload = () => {
        const canvas = toCanvas(img, 1080)
        setPreview({ dataUrl: canvasToJpeg(canvas, 0.72), source: 'upload', at: Date.now() })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
          <img src={preview.dataUrl} alt="Your photo proof" className="w-full block" />
        </div>
        {preview.source === 'upload' && (
          <Banner tone="warn" icon="ℹ️" title="Picked from your photos">
            This did not come from the in-app camera, so the check will tell your parent that.
          </Banner>
        )}
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" onClick={() => { setPreview(null); start(facing) }}>
            Retake
          </Button>
          <Button className="flex-1" onClick={() => onCapture(preview)}>
            Use this photo
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden bg-black aspect-[3/4] flex items-center justify-center"
        style={{ borderRadius: 'var(--radius)' }}
      >
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white" />}
        {status === 'starting' && <p className="absolute text-white/80 text-sm">Starting camera…</p>}
        {(status === 'denied' || status === 'unsupported' || status === 'error') && (
          <div className="absolute inset-0 p-5 flex flex-col items-center justify-center text-center gap-3">
            <span className="text-3xl" aria-hidden="true">📷</span>
            <p className="text-white/85 text-sm">{error}</p>
          </div>
        )}
        {status === 'live' && (
          <>
            <div className="absolute inset-4 border-2 border-white/25 rounded-lg pointer-events-none" />
            <button
              type="button"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 text-white text-lg"
              aria-label="Switch camera"
            >
              ⟳
            </button>
          </>
        )}
      </div>

      {status === 'live' ? (
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => { stop(); onCancel?.() }}>Cancel</Button>
          <button
            type="button"
            onClick={shoot}
            aria-label="Take photo"
            className="mx-auto w-[68px] h-[68px] rounded-full border-4 flex items-center justify-center"
            style={{ borderColor: 'var(--accent)', background: 'var(--surface)' }}
          >
            <span className="w-12 h-12 rounded-full block" style={{ background: 'var(--accent)' }} />
          </button>
          <span className="w-[74px]" />
        </div>
      ) : (
        <div className="space-y-2">
          {status !== 'starting' && (
            <>
              <Button className="w-full" onClick={() => start(facing)}>Try the camera again</Button>
              <label className="btn btn-soft w-full cursor-pointer">
                Use my phone's camera app instead
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFilePick} />
              </label>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={() => { stop(); onCancel?.() }}>Cancel</Button>
        </div>
      )}
    </div>
  )
}
