/**
 * A little sound for a child's good moments (0.29.0): a two-note chime when
 * the daily chore bonus is claimed, a four-note one when the weekly goal is
 * reached, and (0.30.0) five rising notes for a level-up seen on Home.
 *
 * Made on the spot with the browser's own audio, so there is no sound file
 * to download and nothing in the first file. It plays only while Sounds is
 * on (Settings, and the child's You screen; on unless someone turns it off),
 * stays quiet where the browser has no audio or has not been tapped yet,
 * and never throws: a moment with no sound is still the moment.
 */
let ctx = null

/** Sounds are on unless someone switched them off. */
export function soundsOn(state) {
  return state?.settings?.soundOn !== false
}

const NOTES = {
  // Two bright notes, like a coin.
  coin: [987.77, 1318.51],
  // Up an arpeggio: a fanfare, small.
  goal: [523.25, 659.25, 783.99, 1046.5],
  // A level reached, seen on the child's own Home (0.30.0): up and up again.
  level: [659.25, 783.99, 987.77, 1318.51, 1567.98],
}

/** Play one of the chimes, if Sounds is on. True when it played. */
export function chime(state, kind = 'coin') {
  if (!soundsOn(state)) return false
  try {
    const Audio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!Audio) return false
    ctx = ctx || new Audio()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const start = ctx.currentTime + 0.02
    ;(NOTES[kind] || NOTES.coin).forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = start + i * 0.09
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    })
    return true
  } catch {
    return false
  }
}
