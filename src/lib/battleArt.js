/**
 * How the Block Craft battles look: a smooth, lit, cartoon style rather
 * than pixels.
 *
 * Everything here draws in the battle's own 256 × 144 units, and the engine
 * scales those to the real size of the screen (times the phone's pixel
 * density), so edges stay sharp on any display. Nothing in this file moves
 * anything — where everyone is comes from lib/battleEngine.js; this only
 * paints them.
 *
 * The look, in a sentence: chunky block-world characters with rounded
 * corners, soft shading from the top left, glowing magic and fire, a world
 * in layers that fade into haze, and a vignette to frame it.
 */

export const W = 256
export const H = 144
export const GROUND = 118

const TAU = Math.PI * 2

/* ---------------------------------------------------------- colour helpers */
const rgbCache = new Map()
function rgb(hex) {
  let v = rgbCache.get(hex)
  if (!v) {
    const n = parseInt(hex.slice(1), 16)
    v = hex.length === 4
      ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
      : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    rgbCache.set(hex, v)
  }
  return v
}
/** `a` moved `f` of the way towards `b`. */
export function mix(a, b, f) {
  const x = rgb(a)
  const y = rgb(b)
  return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * f)).join(',')})`
}
const alpha = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`
const bright = (hex) => { const [r, g, b] = rgb(hex); return r * 0.3 + g * 0.59 + b * 0.11 > 110 }

export function makeArt(g) {
  /* ---------------------------------------------------------- shape helpers */
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2))
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
  }
  function box(x, y, w, h, r, fill) { rr(x, y, w, h, r); g.fillStyle = fill; g.fill() }
  function lin(x0, y0, x1, y1, ...stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1)
    stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c))
    return gr
  }
  /** A soft light: added on top, so it brightens whatever is behind it. */
  function glow(x, y, r, col, a = 1) {
    if (r <= 0 || a <= 0) return
    g.save()
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = Math.min(1, a)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, col)
    gr.addColorStop(0.35, alpha(col, 0.45))
    gr.addColorStop(1, alpha(col, 0))
    g.fillStyle = gr
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill()
    g.restore()
  }
  function dot(x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill() }
  function shadow(x, w, a = 0.4) {
    g.save()
    g.translate(x, GROUND + 0.5)
    g.scale(1, 0.22)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w)
    gr.addColorStop(0, `rgba(0,0,0,${a})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.beginPath(); g.arc(0, 0, w, 0, TAU); g.fill()
    g.restore()
  }
  /** A limb hanging from its joint at (x, y), swung by `ang`. */
  function limb(x, y, w, len, ang, light, dark, end) {
    g.save()
    g.translate(x, y)
    g.rotate(ang)
    box(-w / 2, -w / 3, w, len + w / 3, w / 2.4, lin(-w / 2, 0, w / 2, 0, light, dark))
    if (end) box(-w / 2 - 0.3, len - 2.6, w + 0.6, 3.2, 1.3, end)
    g.restore()
  }
  // Deterministic scatter for stars, embers and the like, so they do not jump about.
  const hash = (i, s = 1) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v) }

  /* ================================================================ worlds */
  const SKY = {
    village: ['#081230', '#1a2f63', '#3d5694'],
    nether: ['#160203', '#4f0b07', '#b2340f'],
    end: ['#04020a', '#120a26', '#2b1849'],
    dawn: ['#35307a', '#c8608e', '#ffbe74'],
  }

  function hills(y, amp, freq, phase, fill) {
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x <= W; x += 4) g.lineTo(x, y - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.4)
    g.lineTo(W, H)
    g.closePath()
    g.fillStyle = fill
    g.fill()
  }

  function tree(x, y, s, leaf, dark) {
    box(x - 1.5 * s, y - 10 * s, 3 * s, 10 * s, 1, lin(x - 2, 0, x + 2, 0, '#5b3b22', '#3a2414'))
    for (const [dx, dy, r] of [[0, -16, 7], [-5, -12, 5.5], [5, -12, 5.5], [0, -21, 5]]) {
      dot(x + dx * s, y + dy * s, r * s, lin(x, y - 26 * s, x, y - 6 * s, leaf, dark))
    }
  }

  function house(x, w, h, lit, warm) {
    const top = GROUND - h
    // Walls: planks with a light side and a shadow side.
    box(x, top, w, h, 1.2, lin(x, top, x + w, top, warm ? '#c99257' : '#a87444', warm ? '#8a5a2f' : '#6b4424'))
    g.strokeStyle = 'rgba(40,20,8,.25)'; g.lineWidth = 0.4
    for (let py = top + 4; py < GROUND; py += 4) { g.beginPath(); g.moveTo(x + 0.5, py); g.lineTo(x + w - 0.5, py); g.stroke() }
    // Roof.
    g.beginPath()
    g.moveTo(x - 3, top + 1); g.lineTo(x + w / 2, top - h * 0.55); g.lineTo(x + w + 3, top + 1); g.closePath()
    g.fillStyle = lin(x, top - h * 0.55, x, top, '#8c3b2a', '#4e1c14'); g.fill()
    g.strokeStyle = 'rgba(255,190,150,.25)'; g.lineWidth = 0.6
    g.beginPath(); g.moveTo(x - 3, top + 1); g.lineTo(x + w / 2, top - h * 0.55); g.stroke()
    // Door and a window.
    box(x + w / 2 - 2.5, GROUND - 9, 5, 9, 1.5, lin(0, GROUND - 9, 0, GROUND, '#5a3418', '#2e180a'))
    const wx = x + 3
    const wy = top + 4
    box(wx, wy, 5, 5, 0.8, lit ? lin(wx, wy, wx, wy + 5, '#ffe7a3', '#ffb347') : '#1e2033')
    g.strokeStyle = '#3a2412'; g.lineWidth = 0.6
    g.beginPath(); g.moveTo(wx + 2.5, wy); g.lineTo(wx + 2.5, wy + 5); g.moveTo(wx, wy + 2.5); g.lineTo(wx + 5, wy + 2.5); g.stroke()
  }

  function houseLights(list, t) {
    for (const [x, , h] of list) {
      const flick = 0.85 + Math.sin(t * 7 + x) * 0.08 + Math.sin(t * 13 + x * 2) * 0.05
      glow(x + 5.5, GROUND - h + 6.5, 14, '#ffb347', 0.55 * flick)
    }
  }

  function groundBand(top, dark, lip, seam) {
    // Blocks along the front, with rounded tops and a lit lip, so it still
    // reads as a block world without a single hard pixel.
    box(-2, GROUND, W + 4, H - GROUND + 2, 0, lin(0, GROUND, 0, H, dark[0], dark[1]))
    box(-2, GROUND - 1, W + 4, 6, 2, lin(0, GROUND - 1, 0, GROUND + 5, top[0], top[1]))
    g.fillStyle = lip; g.fillRect(-2, GROUND - 1, W + 4, 0.8)
    g.strokeStyle = seam; g.lineWidth = 0.5
    for (let x = 0; x < W; x += 16) {
      g.beginPath(); g.moveTo(x, GROUND + 5); g.lineTo(x, H); g.stroke()
      g.beginPath(); g.moveTo(x + 8, GROUND + 15); g.lineTo(x + 8, H); g.stroke()
    }
    g.beginPath(); g.moveTo(0, GROUND + 15); g.lineTo(W, GROUND + 15); g.stroke()
  }

  function grassTufts(col) {
    g.fillStyle = col
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 3) * W
      const h = 1.5 + hash(i, 4) * 2
      g.beginPath(); g.moveTo(x - 1, GROUND); g.lineTo(x - 0.2, GROUND - h); g.lineTo(x + 0.6, GROUND); g.fill()
    }
  }

  const VILLAGE_HOUSES = [[14, 30, 24], [52, 24, 19], [210, 34, 28]]

  /** The parts of a world that never move, drawn once per screen size. */
  function staticWorld(world) {
    const s = SKY[world]
    g.fillStyle = lin(0, 0, 0, GROUND, s[0], s[1], s[2])
    g.fillRect(0, 0, W, H)

    if (world === 'village' || world === 'dawn') {
      const day = world === 'dawn'
      if (!day) {
        glow(205, 26, 40, '#9fb6ff', 0.35)
        dot(205, 26, 9, lin(198, 18, 212, 34, '#fffbea', '#e3dab0'))
        dot(202, 23, 1.8, 'rgba(160,150,110,.35)'); dot(208, 29, 1.2, 'rgba(160,150,110,.35)')
      } else {
        glow(42, 52, 70, '#ffd27a', 0.6)
        dot(42, 52, 12, lin(30, 40, 54, 64, '#fff6cf', '#ffc65a'))
      }
      hills(86, 6, 0.025, 1, day ? alpha('#6b5aa8', 0.8) : '#132552')
      hills(98, 5, 0.04, 3, day ? '#5f8f5a' : '#183a3e')
      for (const [x, s2] of [[92, 1], [120, 0.8], [175, 0.9], [244, 0.75]]) {
        tree(x, GROUND, s2, day ? '#6fcf5f' : '#2f7a4a', day ? '#2f7a3a' : '#16402a')
      }
      for (const [x, w, h] of VILLAGE_HOUSES) house(x, w, h, true, day)
      groundBand(day ? ['#8ef07a', '#4fbf4a'] : ['#5fd35a', '#2f9a3a'], ['#7a5233', '#3b2414'],
        day ? '#d6ffc0' : '#b4ffb0', 'rgba(0,0,0,.18)')
      grassTufts(day ? '#4fbf4a' : '#2f9a3a')
    }

    if (world === 'nether') {
      glow(128, GROUND - 4, 150, '#ff6a1f', 0.35)
      // Far cliffs, then near ones, darker as they come forward.
      g.fillStyle = '#5a1209'
      g.beginPath(); g.moveTo(0, GROUND)
      for (let x = 0; x <= W; x += 8) g.lineTo(x, 60 + hash(x, 9) * 22)
      g.lineTo(W, GROUND); g.closePath(); g.fill()
      g.fillStyle = '#300606'
      g.beginPath(); g.moveTo(0, GROUND)
      for (let x = 0; x <= W; x += 10) g.lineTo(x, 84 + hash(x, 11) * 18)
      g.lineTo(W, GROUND); g.closePath(); g.fill()
      // The raiders' fortress.
      box(186, 48, 70, 72, 1, lin(186, 48, 256, 48, '#3b0a10', '#1b0306'))
      for (let i = 0; i < 5; i++) box(186 + i * 14, 42, 8, 8, 0.8, '#2b070b')
      groundBand(['#a43a24', '#6e1d12'], ['#5c1a12', '#2a0806'], '#ff9d73', 'rgba(0,0,0,.28)')
    }

    if (world === 'end') {
      glow(70, 40, 90, '#6b2fbf', 0.35)
      glow(200, 30, 70, '#1f8fa8', 0.2)
      for (let i = 0; i < 90; i++) dot(hash(i, 1) * W, hash(i, 2) * 100, 0.3 + hash(i, 5) * 0.4, 'rgba(230,215,255,.6)')
      for (const [x, h] of END_PILLARS) {
        box(x - 6, GROUND - h, 12, h, 1, lin(x - 6, 0, x + 6, 0, '#2a1d40', '#0b0714'))
        g.strokeStyle = 'rgba(180,140,255,.18)'; g.lineWidth = 0.5
        for (let y = GROUND - h + 6; y < GROUND; y += 6) { g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke() }
      }
      groundBand(['#f4efc2', '#d6cc8f'], ['#c9bf84', '#8c834f'], '#fffbe0', 'rgba(80,70,30,.18)')
      g.fillStyle = 'rgba(120,110,60,.25)'
      for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(hash(i, 7) * W, GROUND + 8 + hash(i, 8) * 18, 2 + hash(i, 6) * 2, 1, 0, 0, TAU); g.fill() }
    }
  }

  const END_PILLARS = [[30, 58], [72, 42], [212, 64]]

  /** The parts of a world that move: stars, embers, crystals, firelight. */
  function liveWorld(world, t, portalAt) {
    if (world === 'village') {
      for (let i = 0; i < 46; i++) {
        const tw = (Math.sin(t * (1.5 + hash(i, 4)) + i) + 1) / 2
        const x = hash(i, 1) * W
        const y = hash(i, 2) * 70
        dot(x, y, 0.35 + hash(i, 3) * 0.35, `rgba(220,232,255,${0.35 + tw * 0.65})`)
        if (hash(i, 6) > 0.85) glow(x, y, 3, '#bcd0ff', tw * 0.6)
      }
      clouds(t, 'rgba(150,170,230,.10)')
      houseLights(VILLAGE_HOUSES, t)
    }
    if (world === 'dawn') {
      clouds(t, 'rgba(255,200,220,.22)')
      g.save(); g.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 10; i++) {
        const a = t * 0.15 + i * TAU / 10
        g.fillStyle = 'rgba(255,220,140,.05)'
        g.beginPath(); g.moveTo(42, 52); g.arc(42, 52, 120, a, a + 0.12); g.closePath(); g.fill()
      }
      g.restore()
    }
    if (world === 'nether') {
      // Lava falls pouring off the cliffs, with streaks running down them.
      for (const x of [16, 116]) {
        const top = 70
        glow(x, (top + GROUND) / 2, 30, '#ff6a1f', 0.35)
        box(x - 5, top, 10, GROUND - top, 3, lin(x - 5, 0, x + 5, 0, '#c2260b', '#ffb02e', '#ffe08a', '#ffb02e', '#c2260b'))
        g.save(); rr(x - 5, top, 10, GROUND - top, 3); g.clip()
        g.fillStyle = 'rgba(255,250,210,.55)'
        for (let i = 0; i < 6; i++) {
          const y = top + ((t * 45 + i * 9) % (GROUND - top + 10)) - 10
          box(x - 4 + (i % 3) * 3, y, 1.4, 8, 0.7, 'rgba(255,250,210,.55)')
        }
        g.restore()
        box(x - 8, top - 2, 16, 4, 2, '#4a0d08')
        glow(x, GROUND - 2, 16, '#ffcf5a', 0.6 + Math.sin(t * 6 + x) * 0.15)
      }
      for (let i = 0; i < 4; i++) glow(193 + i * 14, 62, 6, '#ff9a3d', 0.7 + Math.sin(t * 5 + i) * 0.2)
      for (let i = 0; i < 30; i++) {
        const y = GROUND - ((hash(i, 2) * GROUND + t * (8 + hash(i, 3) * 10)) % GROUND)
        const x = (hash(i, 1) * W + Math.sin(t + i) * 5) % W
        glow(x, y, 1.8, '#ff9a5a', 0.8)
      }
      g.fillStyle = lin(0, GROUND - 6, 0, GROUND, 'rgba(255,110,40,0)', `rgba(255,110,40,${0.25 + Math.sin(t * 3) * 0.08})`)
      g.fillRect(0, GROUND - 6, W, 6)
    }
    if (world === 'end') {
      for (let i = 0; i < 50; i++) {
        const tw = (Math.sin(t * 2 + i) + 1) / 2
        dot(hash(i, 11) * W, hash(i, 12) * 96, 0.4 + hash(i, 13) * 0.4, `rgba(235,220,255,${0.3 + tw * 0.7})`)
      }
      END_PILLARS.forEach(([x, h], i) => {
        const y = GROUND - h - 7 + Math.sin(t * 2 + i) * 1.5
        const p = (Math.sin(t * 3 + i) + 1) / 2
        glow(x, y, 14, '#ff8adf', 0.4 + p * 0.3)
        g.save(); g.translate(x, y); g.rotate(t * 1.5 + i)
        box(-3, -3, 6, 6, 1, lin(-3, -3, 3, 3, '#ffe6fb', '#d36bff'))
        g.restore()
      })
    }
    if (portalAt != null) portal(portalAt, t)
  }

  function clouds(t, fill) {
    g.fillStyle = fill
    for (let i = 0; i < 4; i++) {
      const x = ((hash(i, 21) * W + t * (2 + i)) % (W + 80)) - 40
      const y = 18 + hash(i, 22) * 34
      for (const [dx, dy, rx, ry] of [[0, 0, 16, 4], [8, -3, 10, 4], [-8, -2, 9, 3.5]]) {
        g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, 0, 0, TAU); g.fill()
      }
    }
  }

  function portal(x, t) {
    const top = GROUND - 46
    // Obsidian frame, block by block.
    for (let y = top; y < GROUND; y += 8) {
      box(x, y, 6, 8, 1, lin(x, y, x + 6, y + 8, '#3a2860', '#0f0820'))
      box(x + 26, y, 6, 8, 1, lin(x + 26, y, x + 32, y + 8, '#3a2860', '#0f0820'))
    }
    for (let i = 0; i < 4; i++) box(x + i * 8, top - 6, 8, 6, 1, lin(x, top - 6, x, top, '#3a2860', '#0f0820'))
    // The swirl.
    g.save()
    rr(x + 6, top, 20, GROUND - top, 1); g.clip()
    g.fillStyle = lin(x, top, x, GROUND, '#7a2cd6', '#3b0f85'); g.fillRect(x + 6, top, 20, GROUND - top)
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 7; i++) {
      const a = t * (0.8 + i * 0.15) + i
      g.fillStyle = `rgba(200,120,255,${0.12 + (i % 3) * 0.04})`
      g.beginPath(); g.ellipse(x + 16 + Math.sin(a) * 4, top + 8 + i * 6 + Math.cos(a * 1.3) * 3, 9, 3, a, 0, TAU); g.fill()
    }
    g.restore()
    glow(x + 16, top + 22, 34, '#b26bff', 0.45 + Math.sin(t * 4) * 0.1)
  }

  /* ============================================================ characters */
  const flashOf = (n) => n > 0 && Math.floor(n * 30) % 2 === 0

  function hero(h, t) {
    const hurt = flashOf(h.hurt)
    const C = (c) => (hurt ? mix(c, '#ff4d4d', 0.55) : c)
    shadow(h.x, 11, h.jump < -2 ? 0.2 : 0.4)
    g.save()
    g.translate(h.x, GROUND + h.jump)
    g.scale(h.face, 1)
    const walk = h.moving ? Math.sin(t * 14) : 0
    const bob = h.moving ? Math.abs(Math.cos(t * 14)) * 1 : Math.sin(t * 3) * 0.35
    limb(-2.6, -13, 5, 13, walk * 0.6, C('#3e5fd8'), C('#243c99'), C('#3a2a20'))
    limb(2.6, -13, 5, 13, -walk * 0.6, C('#4a6cf0'), C('#2a46b0'), C('#3a2a20'))
    g.translate(0, -bob)
    limb(-5.5, -25, 4.4, 11, h.raise ? -2.6 : walk * 0.5 + 0.1, C('#e8b48a'), C('#c08560'))
    // Shirt, belt.
    box(-7, -27, 14, 15, 3, lin(-7, -27, 7, -12, C('#3fd0c8'), C('#178c93')))
    box(-7, -15, 14, 2.2, 1, C('#5b3a1e'))
    box(-1.2, -15.2, 2.4, 2.6, 0.6, '#e8c45a')
    // Head.
    box(-7.5, -41.5, 15, 15, 3.6, lin(-7.5, -41, 7.5, -26, C('#f5c8a0'), C('#cf9466')))
    box(-8, -43, 16, 6, 3, lin(0, -43, 0, -37, C('#6b4426'), C('#3f2512')))
    box(-8, -40, 4.5, 8, 2, C('#4a2d16'))
    // A face that means it: eye, brow, mouth.
    box(1.6, -36, 3.6, 3.4, 1, '#ffffff')
    box(3.2, -35.4, 1.9, 2.4, 0.8, '#1d2a6b')
    dot(3.8, -35, 0.45, '#ffffff')
    g.strokeStyle = '#3f2512'; g.lineWidth = 1; g.lineCap = 'round'
    g.beginPath(); g.moveTo(1.2, -37.6); g.lineTo(5.6, -38.4); g.stroke()
    g.lineWidth = 0.7
    g.beginPath(); g.moveTo(2.8, -30); g.lineTo(5.6, -30.4); g.stroke()
    // Sword arm.
    const ang = h.raise ? -Math.PI / 2 - 0.2 : h.swing > 0 ? -2.3 + (1 - h.swing / 0.25) * 3.1 : -0.9
    g.save()
    g.translate(2, -24)
    g.rotate(ang)
    box(-2.2, -2.2, 12, 4.4, 2, lin(0, -2, 0, 2, C('#f5c8a0'), C('#c08560')))
    box(9.5, -3.5, 1.8, 7, 0.8, '#7a5230')
    box(11, -1, 3, 2, 0.6, '#5b3a1e')
    g.beginPath(); g.moveTo(13.5, -1.8); g.lineTo(31, -1); g.lineTo(34, 0); g.lineTo(31, 1); g.lineTo(13.5, 1.8); g.closePath()
    g.fillStyle = lin(13, -2, 13, 2, '#e9ffff', '#5fe4f2', '#1aa7c4'); g.fill()
    if (h.swing > 0 || h.raise) glow(24, 0, 12, '#7ff3ff', h.raise ? 0.5 : 0.8)
    g.restore()
    g.restore()
    if (h.swing > 0.03) {
      const a = h.swing / 0.25
      g.save()
      g.globalCompositeOperation = 'lighter'
      g.translate(h.x + h.face * 2, GROUND + h.jump - 25)
      g.scale(h.face, 1)
      g.lineCap = 'round'
      g.strokeStyle = `rgba(120,240,255,${a * 0.5})`; g.lineWidth = 5
      g.beginPath(); g.arc(0, 0, 30, -1.3, 0.8); g.stroke()
      g.strokeStyle = `rgba(235,255,255,${a})`; g.lineWidth = 1.6
      g.beginPath(); g.arc(0, 0, 30, -1.1, 0.7); g.stroke()
      g.restore()
    }
  }

  function raider(e, t, face, brute) {
    const s = brute ? 1.35 : 1
    const white = e.hit > 0
    const C = (c) => (white ? mix(c, '#ffffff', 0.75) : c)
    shadow(e.x, 10 * s)
    g.save()
    g.translate(e.x, GROUND)
    g.scale(face * s, s)
    const walk = e.moving ? Math.sin(t * 12 + e.x) : 0
    limb(-2.5, -12, 4.6, 12, walk * 0.6, C('#3a3f4a'), C('#22252c'), C('#1a1a1a'))
    limb(2.5, -12, 4.6, 12, -walk * 0.6, C('#454b57'), C('#2a2e36'), C('#1a1a1a'))
    // Robe, with a sash; the brute wears iron.
    box(-7, -27, 14, 17, 3, lin(-7, -27, 7, -10, C(brute ? '#7a2a2a' : '#4e5566'), C(brute ? '#3a0f12' : '#2a2f3a')))
    if (brute) box(-7.5, -27, 15, 6, 2.5, lin(0, -27, 0, -21, C('#c9ced6'), C('#7b828c')))
    else box(-7, -20, 14, 2, 0.8, C('#6b2a2a'))
    // Grey head, long nose, one angry brow.
    box(-6.5, -40, 13, 13.5, 3, lin(-6.5, -40, 6.5, -26, C('#b4bcb6'), C('#7d867f')))
    box(5, -34.5, 4, 5.5, 1.6, C('#8f9891'))
    g.fillStyle = '#1b1b1b'; g.fillRect(-1, -36.5, 7, 1.6)
    box(1.3, -34.8, 2.4, 1.8, 0.6, '#ffffff')
    dot(2.6, -33.9, 0.7, '#14202a')
    // The axe, raised when it swings.
    const lift = e.attack > 0 ? -1.4 : -0.35
    g.save()
    g.translate(4, -22)
    g.rotate(lift)
    box(-0.9, -1, 15, 2, 0.8, lin(0, -1, 0, 1, '#8a5a2f', '#4e3018'))
    g.beginPath(); g.moveTo(12, -1); g.lineTo(16, -6); g.quadraticCurveTo(19, 0, 16, 6); g.lineTo(12, 1); g.closePath()
    g.fillStyle = lin(12, -6, 18, 6, '#eef2f6', '#8c96a3'); g.fill()
    g.restore()
    g.restore()
  }

  function spirit(e, t) {
    const x = e.x
    const y = e.anchor + Math.sin(t * 3 + e.x) * 3
    const white = e.hit > 0
    glow(x, y, 26, '#ff8a1f', 0.55)
    // Rods spin round it; the ones behind are drawn first and darker.
    const rods = [0, 1, 2, 3].map((i) => {
      const a = t * 3 + (i * TAU) / 4
      return { a, z: Math.sin(a) }
    }).sort((p, q) => p.z - q.z)
    const rod = (r) => {
      const rx = x + Math.cos(r.a) * 11
      const ry = y + 6 + r.z * 2.5
      box(rx - 1.6, ry - 5, 3.2, 10, 1.5, lin(rx, ry - 5, rx, ry + 5, r.z > 0 ? '#ffe28a' : '#d98a1f', r.z > 0 ? '#ff9a1f' : '#8a4a0f'))
    }
    rods.filter((r) => r.z <= 0).forEach(rod)
    box(x - 6, y - 6, 12, 12, 3, white ? '#ffffff' : lin(x - 6, y - 6, x + 6, y + 6, '#fff3a0', '#ffb31f', '#e0700f'))
    box(x - 3.5, y - 2, 2.4, 2.6, 0.6, '#3b1a00')
    box(x + 1.1, y - 2, 2.4, 2.6, 0.6, '#3b1a00')
    rods.filter((r) => r.z > 0).forEach(rod)
    for (let i = 0; i < 3; i++) glow(x + Math.sin(t * 5 + i * 2) * 5, y - 8 - ((t * 20 + i * 6) % 14), 3, '#ffcf5a', 0.7)
  }

  function shadowWalker(e, t, face) {
    if (e.blink > 0 && Math.floor(e.blink * 20) % 2) return
    const white = e.hit > 0
    const C = (c) => (white ? mix(c, '#ffffff', 0.8) : c)
    shadow(e.x, 9, 0.5)
    for (let i = 0; i < 5; i++) {
      const a = t * 2 + i * 1.3
      glow(e.x + Math.cos(a) * 9, GROUND - 22 + Math.sin(a * 1.4) * 14, 2.4, '#c25bff', 0.7)
    }
    g.save()
    g.translate(e.x, GROUND)
    g.scale(face, 1)
    const sway = Math.sin(t * 2 + e.x) * 0.08
    limb(-2, -24, 2.6, 24, sway, C('#211832'), C('#0a0712'))
    limb(2, -24, 2.6, 24, -sway, C('#211832'), C('#0a0712'))
    box(-5.5, -38, 11, 15, 2, lin(-5.5, -38, 5.5, -23, C('#261b3a'), C('#0a0712')))
    limb(-6.5, -36, 2.4, 25, 0.12 + sway, C('#1d152b'), C('#08060d'))
    limb(6.5, -36, 2.4, 25, -0.12 - sway, C('#1d152b'), C('#08060d'))
    box(-6, -49, 12, 11, 2.5, lin(-6, -49, 6, -38, C('#2a1f40'), C('#0b0814')))
    g.restore()
    const ex = e.x + face * 1.5
    for (const d of [-2.6, 2.6]) {
      box(ex + d - 1.4, GROUND - 45, 2.8, 1.2, 0.5, '#f2b6ff')
      glow(ex + d, GROUND - 44.4, 5, '#d24bff', 0.9)
    }
  }

  /** Dragon scale: big enough to be the boss of the whole story. */
  const DS = 1.3

  function dragon(e, t) {
    const white = e.hit > 0
    const C = (c) => (white ? mix(c, '#ffffff', 0.8) : c)
    const f = Math.sin(t * 6)
    // Drawn a little below where it hovers, so its wings clear the health bars.
    const cy = e.y + 12
    const toWorld = (lx, ly) => [e.x - lx * DS * e.face, cy + ly * DS]
    // A purple light behind it, so it never sinks into the night sky.
    glow(e.x, cy - 8, 70, '#7b3fd6', 0.4)

    // Drawn facing left (head at -x); flipped when it faces right.
    g.save()
    g.translate(e.x, cy)
    g.scale(-e.face * DS, DS)

    const wing = (far) => {
      const lift = (far ? Math.sin(t * 6 - 0.4) : f) * 10
      const o = far ? [5, -3] : [0, 0]
      g.save()
      g.translate(o[0], o[1])
      const wrist = [20, -30 - lift * 0.8]
      const tips = [[40, -24 - lift * 0.6], [45, -11 - lift * 0.35], [37, 1 - lift * 0.1]]
      g.beginPath()
      g.moveTo(0, -5)
      g.quadraticCurveTo(6, -24 - lift * 0.5, wrist[0], wrist[1])
      g.lineTo(tips[0][0], tips[0][1])
      g.quadraticCurveTo(34, -18 - lift * 0.45, tips[1][0], tips[1][1])
      g.quadraticCurveTo(33, -6 - lift * 0.2, tips[2][0], tips[2][1])
      g.quadraticCurveTo(24, 0, 14, 3)
      g.closePath()
      g.fillStyle = lin(wrist[0], wrist[1], 14, 3,
        C(far ? '#4a2780' : '#9a63e8'), C(far ? '#24103f' : '#5a2a9c'), C(far ? '#140826' : '#2b1050'))
      g.fill()
      g.strokeStyle = C(far ? '#3d2366' : '#d9c2ff'); g.lineWidth = 0.6; g.stroke()
      g.lineCap = 'round'
      g.strokeStyle = C(far ? '#2c1650' : '#e6d6ff'); g.lineWidth = 0.9
      for (const tip of tips) { g.beginPath(); g.moveTo(wrist[0], wrist[1]); g.lineTo(tip[0], tip[1]); g.stroke() }
      g.strokeStyle = C(far ? '#1f0d38' : '#3a1866'); g.lineWidth = 2.4
      g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(6, -24 - lift * 0.5, wrist[0], wrist[1]); g.stroke()
      dot(wrist[0], wrist[1], 1.4, C('#f0e6ff'))
      g.restore()
    }

    wing(true)

    // Tail, swinging, with a spade on the end.
    g.lineCap = 'round'
    let tx = 22
    let ty = 2
    for (let i = 0; i < 9; i++) {
      const nx = 22 + (i + 1) * 4.2
      const ny = 2 + Math.sin(t * 4 + (i + 1) * 0.6) * (i + 1) * 0.45
      g.strokeStyle = C(mix('#4a2580', '#7a4ab8', i / 9)); g.lineWidth = 7 - i * 0.65
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(nx, ny); g.stroke()
      tx = nx; ty = ny
    }
    g.fillStyle = C('#d2b6ff')
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 5, ty - 3); g.lineTo(tx + 3, ty); g.lineTo(tx + 5, ty + 3); g.closePath(); g.fill()

    // Legs, tucked up in flight.
    for (const lx of [0, 10]) {
      g.strokeStyle = C('#3a1a63'); g.lineWidth = 3
      g.beginPath(); g.moveTo(lx, 5); g.quadraticCurveTo(lx - 2, 10, lx - 5, 11); g.stroke()
      g.strokeStyle = C('#e6d6ff'); g.lineWidth = 0.7
      g.beginPath(); g.moveTo(lx - 5, 11); g.lineTo(lx - 7, 12.5); g.stroke()
    }

    // Body: lit along the back, pale scales underneath.
    g.beginPath(); g.ellipse(6, 0, 20, 9, 0, 0, TAU)
    g.fillStyle = lin(0, -9, 0, 9, C('#8a58cc'), C('#4a2580'), C('#22103d')); g.fill()
    g.strokeStyle = C('#e2d0ff'); g.lineWidth = 0.7
    g.beginPath(); g.ellipse(6, 0, 20, 9, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke()
    g.strokeStyle = 'rgba(230,214,255,.35)'; g.lineWidth = 0.6
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-4 + i * 5, 4, 3, 0.2, Math.PI - 0.2); g.stroke() }
    g.fillStyle = C('#efe4ff')
    for (let i = 0; i < 7; i++) {
      const sx = -10 + i * 4.5
      g.beginPath(); g.moveTo(sx, -7.5); g.lineTo(sx + 1.5, -12 + (i % 2)); g.lineTo(sx + 3, -7.5); g.closePath(); g.fill()
    }

    // Neck and head.
    g.strokeStyle = lin(-26, -12, -8, 0, C('#6a3aa8'), C('#4a2580')); g.lineWidth = 8
    g.beginPath(); g.moveTo(-10, -3); g.quadraticCurveTo(-18, -6, -25, -13); g.stroke()
    const jaw = e.breath > 0 ? 4 : 0
    g.beginPath()
    g.moveTo(-22, -20); g.lineTo(-36, -18); g.lineTo(-44, -14); g.lineTo(-43, -11); g.lineTo(-30, -10)
    g.lineTo(-42, -8 + jaw); g.lineTo(-41, -6 + jaw); g.lineTo(-26, -6); g.closePath()
    g.fillStyle = lin(-44, -20, -22, -6, C('#9a68dc'), C('#4a2580'), C('#22103d')); g.fill()
    g.strokeStyle = C('#e2d0ff'); g.lineWidth = 0.6
    g.beginPath(); g.moveTo(-22, -20); g.lineTo(-36, -18); g.lineTo(-44, -14); g.stroke()
    // Horns, sweeping back.
    g.fillStyle = C('#f2eaff')
    g.beginPath(); g.moveTo(-26, -19); g.quadraticCurveTo(-20, -27, -12, -28); g.quadraticCurveTo(-19, -24, -22, -18); g.closePath(); g.fill()
    g.fillStyle = C('#cdb6f5')
    g.beginPath(); g.moveTo(-30, -18.5); g.quadraticCurveTo(-26, -25, -19, -27); g.quadraticCurveTo(-24, -22, -26, -17.5); g.closePath(); g.fill()

    wing(false)
    g.restore()

    const [eyeX, eyeY] = toWorld(-34, -15.5)
    box(eyeX - 2, eyeY - 1, 4, 2, 0.8, '#ffe6ff')
    glow(eyeX, eyeY, 12, '#ff3df2', white ? 0.4 : 1)

    if (e.breath > 0) {
      const [mx, my] = toWorld(-44, -9)
      glow(mx, my, 14, '#ff6bf0', e.breath)
      for (let i = 0; i < 16; i++) {
        const d = i * 4.5 + (1 - e.breath) * 14
        const bx = mx + e.face * d
        const by = my + d * 0.62
        glow(bx, by, 4 + i * 0.55, i % 2 ? '#c64bff' : '#ff6bf0', e.breath)
        dot(bx, by, 1 + i * 0.12, `rgba(255,230,255,${e.breath * 0.8})`)
      }
    }
  }

  function villager(v, t) {
    const y = GROUND - Math.max(0, Math.sin(t * 6 + v.p) * 5)
    shadow(v.x, 9, 0.35)
    g.save()
    g.translate(v.x, y)
    const cheer = Math.sin(t * 6 + v.p) > 0
    limb(-5.5, -22, 3.6, 10, cheer ? -2.7 : 0.3, '#d8a57a', '#b47f56')
    limb(5.5, -22, 3.6, 10, cheer ? 2.7 : -0.3, '#d8a57a', '#b47f56')
    box(-6.5, -24, 13, 24, 3, lin(-6.5, -24, 6.5, 0, mix(v.c, '#ffffff', 0.2), mix(v.c, '#000000', 0.35)))
    box(-6, -37, 12, 13, 3, lin(-6, -37, 6, -24, '#e8b98d', '#b98258'))
    box(-1.6, -32, 3.2, 6, 1.4, '#a8714a')
    g.fillStyle = '#3b2412'; g.fillRect(-4.5, -33.5, 9, 1.2)
    dot(-2.6, -31.6, 0.8, '#2a3a1a'); dot(2.6, -31.6, 0.8, '#2a3a1a')
    g.restore()
  }

  /* =============================================================== effects */
  function particles(parts) {
    for (const p of parts) {
      const f = Math.max(0, p.life / p.max)
      const r = 0.6 + f * 1.4
      if (bright(p.c)) {
        glow(p.x, p.y, r * 3, p.c, f * 0.8)
        dot(p.x, p.y, r * 0.6, `rgba(255,255,255,${f})`)
      } else {
        dot(p.x, p.y, r, alpha(p.c, f))
      }
    }
  }

  function bolt(b) {
    glow(b.x, b.y, 8, '#ff8a1f', 0.9)
    dot(b.x, b.y, 1.6, '#fff4b0')
  }

  function bar(x, y, w, frac, shown, col, label) {
    const h = 5
    box(x - 1, y - 1, w + 2, h + 2, 3.5, 'rgba(10,6,20,.75)')
    box(x, y, w, h, 2.5, 'rgba(255,255,255,.08)')
    if (shown > frac) box(x, y, w * shown, h, 2.5, 'rgba(255,255,255,.85)')
    if (frac > 0) {
      box(x, y, Math.max(h, w * frac), h, 2.5, lin(x, y, x, y + h, mix(col, '#ffffff', 0.35), col, mix(col, '#000000', 0.3)))
      box(x + 1, y + 0.6, Math.max(0, w * frac - 2), 1.3, 0.8, 'rgba(255,255,255,.35)')
    }
    g.font = '800 6.5px system-ui, -apple-system, "Segoe UI", sans-serif'
    g.textAlign = 'left'
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(label, x, y - 2.5)
    g.fillStyle = '#ffffff'; g.fillText(label, x, y - 2.5)
  }

  function pop(p) {
    const y = p.y - (1.2 - p.life) * 16
    g.globalAlpha = Math.min(1, p.life * 2)
    g.font = '900 10px system-ui, -apple-system, "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.lineJoin = 'round'
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(p.text, p.x, y)
    g.fillStyle = p.col; g.fillText(p.text, p.x, y)
    g.globalAlpha = 1
  }

  function banner(text) {
    g.font = '900 13px system-ui, -apple-system, "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.lineJoin = 'round'
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(30,0,40,.9)'; g.strokeText(text, 128, 38)
    g.fillStyle = lin(0, 28, 0, 40, '#fff4c2', '#ffb21f'); g.fillText(text, 128, 38)
  }

  function sign(t) {
    g.strokeStyle = '#6b4426'; g.lineWidth = 1.4
    g.beginPath(); g.moveTo(98, 34); g.lineTo(98, 76); g.moveTo(158, 34); g.lineTo(158, 76); g.stroke()
    const sway = Math.sin(t * 2) * 0.03
    g.save(); g.translate(128, 41); g.rotate(sway)
    box(-31, -8, 62, 16, 3, lin(0, -8, 0, 8, '#ffcf5a', '#e08a1f'))
    g.font = '900 10px system-ui, -apple-system, "Segoe UI", sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = '#5a2a00'; g.fillText('HERO!', 0, 0.5)
    g.textBaseline = 'alphabetic'
    g.restore()
  }

  function vignette() {
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(1, 'rgba(0,0,0,.42)')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
  }

  return { staticWorld, liveWorld, hero, raider, spirit, shadowWalker, dragon, villager, particles, bolt, bar, pop, banner, sign, vignette }
}
