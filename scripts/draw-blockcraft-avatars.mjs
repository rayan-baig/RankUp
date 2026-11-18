#!/usr/bin/env node
/**
 * Draws Block Craft's nine avatar forms as SVG, straight into
 * src/assets/art/ (avatar-blockcraft-<level>.svg), where the app picks
 * them up by name.
 *
 * The hero is ours: a cube-headed adventurer in an ivory helmet with a
 * dark visor and two glowing eyes, a little sprout growing out of the top,
 * and an orange scarf. Nothing here is traced or copied from anything.
 * Each form adds to the hero's own gear story, so every one looks cooler
 * than the last:
 *
 *     1   sprout and a short scarf
 *    10   a second leaf, a satchel, the scarf catching the wind
 *    25   copper shoulder guards and a star badge
 *    50   a cape, and the sprout flowers
 *   100   glowing runes on the helmet and chest, the aurora overhead
 *   125   the Ember Gate: a gold-banded helmet, an ember flower, flame cape
 *   175   the Ashlands: a ring of runes behind the head, a glowing core
 *   250   the Far Isle: a crystal circlet, a cape full of stars
 *   399   the dragon: a gold crown and wings of light
 *
 * The picture is a head-and-shoulders portrait on a square, because the
 * app shows it inside a circle as small as 23px across (and 67px on the
 * level-up). The big helmet and its eyes are what has to read at that
 * size, so they get most of the space.
 *
 *     node scripts/draw-blockcraft-avatars.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'art')

/* ------------------------------------------------------------ the forms */
const DUSK = { sky: ['#071226', '#173a66', '#3a6aa0'], glow: '#ff9a6b', hills: ['#0d2442', '#0a1b33'] }
const EMBER = { sky: ['#1b0605', '#5c1a12', '#c2481c'], glow: '#ffb302', hills: ['#2a0a07', '#190504'] }
const ASH = { sky: ['#170305', '#57101c', '#b0243e'], glow: '#ff9f43', hills: ['#2a0610', '#16030a'] }
const ISLE = { sky: ['#0a0713', '#2b1f4d', '#6a4bb0'], glow: '#7ef0ff', hills: ['#1a1233', '#100b22'] }
const CROWN = { sky: ['#0d0418', '#3d1157', '#b03fd0'], glow: '#ffd36b', hills: ['#22093a', '#140426'] }

const FORMS = [
  { level: 1, world: DUSK, eye: '#7dffb0', tunic: ['#7a4cc0', '#4a2a7e'], top: 'sprout1', scarf: 1 },
  { level: 10, world: DUSK, eye: '#7dffb0', tunic: ['#7a4cc0', '#4a2a7e'], top: 'sprout2', scarf: 2, strap: true, stars: 1 },
  { level: 25, world: DUSK, eye: '#8dffbd', tunic: ['#7a4cc0', '#4a2a7e'], top: 'bud', scarf: 2, strap: true, badge: true, pads: 'copper', moon: true, stars: 1 },
  { level: 50, world: DUSK, eye: '#9dffc8', tunic: ['#7a4cc0', '#4a2a7e'], top: 'flower', scarf: 3, strap: true, badge: true, pads: 'copper', cape: ['#ff6a4d', '#b8322a'], belt: '#f2b544', moon: true, comet: true, stars: 2 },
  { level: 100, world: DUSK, eye: '#b4ffd6', tunic: ['#7a4cc0', '#4a2a7e'], top: 'flower', glowTop: true, scarf: 3, strap: true, pads: 'copper', cape: ['#ff6a4d', '#b8322a'], capeTrim: '#ffd36b', belt: '#f2b544', runes: '#7dffb0', aurora: true, motes: '#9dffc8', moon: true, stars: 2 },
  { level: 125, world: EMBER, eye: '#ffc24a', tunic: ['#4a2440', '#26101f'], top: 'ember', band: true, scarf: 3, pads: 'gold', cape: ['#ffb302', '#d2401a'], capeTrim: '#ffe08a', belt: '#ffd36b', runes: '#ffb84d', plate: '#ff8a3d', spires: true, embers: true },
  { level: 175, world: ASH, eye: '#ffd36b', tunic: ['#4a1a2c', '#240a14'], top: 'ember', glowTop: true, band: true, scarf: 3, pads: 'gold', cape: ['#e0283f', '#7a0f22'], capeTrim: '#ffd36b', belt: '#ffd36b', runes: '#ffcf5a', plate: '#ffcf5a', halo: '#ffcf5a', spires: true, embers: true },
  { level: 250, world: ISLE, eye: '#efe0ff', tunic: ['#2c3a8e', '#18205a'], top: 'circlet', band: true, scarf: 3, pads: 'crystal', cape: ['#2a1f66', '#120c33'], capeStars: true, capeTrim: '#d6b4ff', belt: '#d6b4ff', runes: '#d6b4ff', brooch: true, halo: '#d6b4ff', island: true, shards: true, stars: 3 },
  { level: 399, world: CROWN, eye: '#fff3b0', tunic: ['#fff1cf', '#d9b768'], top: 'crown', band: true, scarf: 3, pads: 'gold', cape: ['#2a1f66', '#120c33'], capeStars: true, capeTrim: '#ffd36b', belt: '#ffd36b', runes: '#ffe08a', plate: '#fff3b0', star: true, halo: '#ffe08a', wings: true, radiance: true, sparkles: true, stars: 3 },
]

/* -------------------------------------------------------------- helpers */
// A fixed scatter, so the stars are in the same place every time this runs.
function scatter(seed, n) {
  let s = seed
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  return Array.from({ length: n }, () => [r(), r(), r()])
}
const f = (n) => Number(n.toFixed(1))
const star5 = (cx, cy, R, r) => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? r : R
    pts.push(`${f(cx + Math.cos(a) * rad)} ${f(cy + Math.sin(a) * rad)}`)
  }
  return `M${pts.join(' L')}Z`
}
const sparkle = (cx, cy, s) =>
  `M${f(cx)} ${f(cy - s)} Q${f(cx + s * 0.18)} ${f(cy - s * 0.18)} ${f(cx + s)} ${f(cy)} Q${f(cx + s * 0.18)} ${f(cy + s * 0.18)} ${f(cx)} ${f(cy + s)} Q${f(cx - s * 0.18)} ${f(cy + s * 0.18)} ${f(cx - s)} ${f(cy)} Q${f(cx - s * 0.18)} ${f(cy - s * 0.18)} ${f(cx)} ${f(cy - s)}Z`
// Keep the hero's middle clear of background clutter.
const clear = (x, y) => Math.abs(x - 100) < 58 && y > 22

/* ----------------------------------------------------------- the layers */
function defs(F) {
  const [s0, s1, s2] = F.world.sky
  const pad = { copper: ['#e39a5a', '#9a5226'], gold: ['#ffe08a', '#c98a1e'], crystal: ['#f3e8ff', '#a98be8'] }[F.pads] || ['#000', '#000']
  return `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s0}"/><stop offset=".6" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient>
<linearGradient id="helm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#efe3cc"/><stop offset="1" stop-color="#cdb994"/></linearGradient>
<linearGradient id="tunic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${F.tunic[0]}"/><stop offset="1" stop-color="${F.tunic[1]}"/></linearGradient>
<linearGradient id="scarf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb05a"/><stop offset="1" stop-color="#e5541e"/></linearGradient>
<linearGradient id="pad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pad[0]}"/><stop offset="1" stop-color="${pad[1]}"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffcf4a"/><stop offset="1" stop-color="#c9861a"/></linearGradient>
${F.cape ? `<linearGradient id="cape" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${F.cape[0]}"/><stop offset="1" stop-color="${F.cape[1]}"/></linearGradient>` : ''}
${F.wings ? '<linearGradient id="wing" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffd36b" stop-opacity=".25"/></linearGradient>' : ''}
<radialGradient id="glow"><stop offset="0" stop-color="${F.world.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${F.world.glow}" stop-opacity="0"/></radialGradient>
<filter id="g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`
}

function background(F) {
  const out = ['<rect width="200" height="200" fill="url(#sky)"/>']
  const nStars = F.stars === 3 ? 34 : F.stars === 2 ? 22 : F.stars === 1 ? 16 : 11
  for (const [x, y, z] of scatter(F.level * 7 + 3, nStars)) {
    const px = x * 200
    const py = y * 120
    if (clear(px, py)) continue
    out.push(`<circle cx="${f(px)}" cy="${f(py)}" r="${f(0.6 + z * 1.1)}" fill="#fff" opacity="${f(0.35 + z * 0.55)}"/>`)
  }
  if (F.moon) out.push('<circle cx="34" cy="38" r="13" fill="#fff4d8"/><circle cx="40" cy="33" r="11" fill="' + F.world.sky[0] + '"/>')
  if (F.comet) out.push('<path d="M150 26 L186 12" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/><circle cx="150" cy="26" r="2.4" fill="#fff"/>')
  if (F.aurora) {
    out.push('<path d="M-5 58 C30 30 60 70 100 44 S170 30 205 50" stroke="#7dffb0" stroke-width="10" fill="none" opacity=".22" filter="url(#g)"/>')
    out.push('<path d="M-5 72 C40 50 70 84 110 60 S175 50 205 66" stroke="#58c7ff" stroke-width="6" fill="none" opacity=".2"/>')
  }
  if (F.radiance) {
    out.push('<circle cx="100" cy="96" r="96" fill="url(#glow)"/>')
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      out.push(`<path d="M100 96 L${f(100 + Math.cos(a - 0.08) * 140)} ${f(96 + Math.sin(a - 0.08) * 140)} L${f(100 + Math.cos(a + 0.08) * 140)} ${f(96 + Math.sin(a + 0.08) * 140)}Z" fill="#ffe9a8" opacity=".08"/>`)
    }
  } else {
    out.push('<ellipse cx="100" cy="196" rx="130" ry="60" fill="url(#glow)"/>')
  }
  const [h0, h1] = F.world.hills
  if (F.spires) {
    // Their land: rock towers with light coming through the cracks.
    out.push(`<path d="M0 200 V128 h14 v-22 a6 6 0 0 1 12 0 v34 h16 v-12 h12 V200Z M146 200 V136 h12 v-30 a7 7 0 0 1 14 0 v16 h14 v-8 h14 V200Z" fill="${h0}"/>`)
    out.push(`<path d="M18 150 l4 10 l-3 8 M164 128 l-4 12 l5 9" stroke="${F.world.glow}" stroke-width="2" fill="none" opacity=".8" filter="url(#g)"/>`)
  } else if (F.island) {
    // A floating island off to the side, crystals growing on it.
    out.push(`<path d="M8 150 h52 l-8 12 l-10 4 l-6 10 l-8 -8 l-12 -4z" fill="${h0}"/>`)
    out.push('<path d="M20 150 l5 -16 l5 16z M34 150 l4 -11 l4 11z" fill="#d6b4ff" opacity=".9" filter="url(#g)"/>')
    out.push(`<path d="M150 170 h44 l-6 10 l-12 6 l-10 -6z" fill="${h0}"/>`)
  } else if (!F.radiance) {
    // Rolling block hills, rounded off: dusk over the village.
    out.push(`<path d="M0 200 V150 q0 -6 6 -6 h22 q6 0 6 6 v-8 q0 -6 6 -6 h14 q6 0 6 6 V200Z M140 200 V146 q0 -6 6 -6 h16 q6 0 6 6 v6 q0 -6 6 -6 h20 q6 0 6 6 V200Z" fill="${h0}"/>`)
    out.push(`<path d="M0 200 V170 h40 v8 h20 V200Z M150 200 V176 h22 v-6 h28 V200Z" fill="${h1}"/>`)
    out.push('<rect x="14" y="156" width="5" height="5" rx="1" fill="#ffd27a" opacity=".85"/><rect x="176" y="160" width="5" height="5" rx="1" fill="#ffd27a" opacity=".85"/>')
  }
  if (F.embers) {
    for (const [x, y, z] of scatter(F.level + 11, 18)) {
      const px = x * 200
      const py = 20 + y * 170
      if (clear(px, py) && py < 170) continue
      out.push(`<rect x="${f(px)}" y="${f(py)}" width="${f(1.6 + z * 2)}" height="${f(1.6 + z * 2)}" rx=".6" fill="${z > 0.5 ? '#ffd36b' : '#ff7a2d'}" opacity="${f(0.5 + z * 0.5)}" transform="rotate(45 ${f(px)} ${f(py)})"/>`)
    }
  }
  return out.join('')
}

function behind(F) {
  const out = []
  if (F.halo) {
    out.push(`<circle cx="100" cy="80" r="62" fill="none" stroke="${F.halo}" stroke-width="2" opacity=".55"/>`)
    out.push(`<circle cx="100" cy="80" r="56" fill="none" stroke="${F.halo}" stroke-width="4" stroke-dasharray="3 9" opacity=".8" filter="url(#g)"/>`)
  }
  if (F.wings) {
    // Wings of light: long rounded blades fanning out from the shoulders.
    const blades = [[8, 66], [26, 80], [44, 86], [62, 80], [80, 64]]
    const side = blades.map(([a, len]) =>
      `<rect x="${f(-len)}" y="-7" width="${len}" height="14" rx="7" fill="url(#wing)" transform="rotate(${a})"/>`).join('')
    out.push(`<g filter="url(#g)" opacity=".95"><g transform="translate(68 128)">${side}</g><g transform="translate(132 128) scale(-1 1)">${side}</g></g>`)
  }
  if (F.cape) {
    out.push('<path d="M58 124 C22 136 4 172 -4 204 H204 C196 172 178 136 142 124Z" fill="url(#cape)"/>')
    if (F.capeStars) {
      for (const [x, y, z] of scatter(F.level + 5, 16)) {
        const px = x * 200
        const py = 150 + y * 50
        if (px > 52 && px < 148) continue
        out.push(`<circle cx="${f(px)}" cy="${f(py)}" r="${f(0.7 + z)}" fill="#fff" opacity=".85"/>`)
      }
    }
    if (F.capeTrim) out.push(`<path d="M58 124 C22 136 4 172 -4 204 M142 124 C178 136 196 172 204 204" stroke="${F.capeTrim}" stroke-width="3" fill="none"/>`)
  }
  return out.join('')
}

function body(F) {
  const out = []
  // Arms, then the tunic over them.
  out.push(`<rect x="32" y="138" width="32" height="80" rx="15" fill="${F.tunic[1]}"/><rect x="136" y="138" width="32" height="80" rx="15" fill="${F.tunic[1]}"/>`)
  out.push('<path d="M54 134 q0 -10 12 -12 h68 q12 2 12 12 V210 H54Z" fill="url(#tunic)"/>')
  out.push('<path d="M100 130 V210" stroke="#000" stroke-opacity=".18" stroke-width="2"/>')
  if (F.plate) {
    out.push(`<path d="M70 138 h60 v26 q0 22 -30 34 q-30 -12 -30 -34z" fill="#000" opacity=".28"/><path d="M70 138 h60 v26 q0 22 -30 34 q-30 -12 -30 -34z" fill="none" stroke="${F.belt}" stroke-width="2.5"/>`)
    if (F.star) out.push(`<path d="${star5(100, 164, 15, 6.5)}" fill="${F.plate}" filter="url(#g)"/>`)
    else out.push(`<circle cx="100" cy="162" r="9" fill="${F.plate}" filter="url(#g)"/><circle cx="100" cy="162" r="4" fill="#fff8e0"/>`)
  }
  if (F.strap) out.push('<path d="M64 128 L136 200" stroke="#6b4426" stroke-width="9"/><path d="M64 128 L136 200" stroke="#8f5e36" stroke-width="5"/>')
  if (F.badge) out.push(`<path d="${star5(96, 160, 9, 4)}" fill="url(#gold)" stroke="#7a4a10" stroke-width="1"/>`)
  if (F.belt) out.push(`<rect x="54" y="188" width="92" height="8" fill="${F.belt}"/><rect x="94" y="186" width="12" height="12" rx="2" fill="${F.belt}" stroke="#000" stroke-opacity=".25"/>`)
  if (F.runes && !F.plate) out.push(`<path d="M100 146 l9 11 l-9 11 l-9 -11z M86 172 h28" stroke="${F.runes}" stroke-width="2.5" fill="none" stroke-linecap="round" filter="url(#g)"/>`)
  if (F.brooch) out.push('<path d="M100 148 l9 14 l-9 14 l-9 -14z" fill="#e9d7ff" stroke="#fff" stroke-width="1.5" filter="url(#g)"/>')
  if (F.capeStars && !F.plate) {
    for (const [x, y] of scatter(F.level + 9, 10)) out.push(`<circle cx="${f(60 + x * 80)}" cy="${f(140 + y * 46)}" r=".9" fill="#fff" opacity=".7"/>`)
  }
  if (F.pads) out.push('<ellipse cx="52" cy="140" rx="21" ry="14" fill="url(#pad)"/><ellipse cx="148" cy="140" rx="21" ry="14" fill="url(#pad)"/><path d="M38 136 q14 -8 28 0 M134 136 q14 -8 28 0" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none"/>')
  return out.join('')
}

function scarf(F) {
  // The tail streams further out as the hero gets stronger.
  const tail = [
    'M128 124 q16 4 22 18 l-10 4 q-4 -10 -14 -14z',
    'M126 122 q26 0 40 20 l-10 7 q-10 -14 -28 -16z',
    'M126 121 q34 -6 56 14 q4 4 2 8 q-20 -12 -54 -8z M150 128 q16 2 26 14 l-8 4 q-8 -10 -18 -12z',
  ][F.scarf - 1]
  return `<path d="${tail}" fill="url(#scarf)"/><rect x="60" y="113" width="80" height="19" rx="9.5" fill="url(#scarf)"/><path d="M68 118 h50" stroke="#fff" stroke-opacity=".35" stroke-width="2.5" stroke-linecap="round"/>`
}

function top(F) {
  const glow = F.glowTop ? ' filter="url(#g)"' : ''
  const leaf = (flip) => `<path d="M101 26 q14 -12 25 -2 q-12 11 -25 2z" fill="#6be37a" stroke="#2f8a45" stroke-width="1.5"${flip ? ' transform="translate(202 0) scale(-1 1)"' : ''}/>`
  const stem = '<path d="M100 40 q-2 -9 1 -16" stroke="#2f8a45" stroke-width="4" fill="none" stroke-linecap="round"/>'
  switch (F.top) {
    case 'sprout1': return stem + leaf(false)
    case 'sprout2': return stem + leaf(false) + leaf(true)
    case 'bud': return stem + leaf(false) + leaf(true) + '<circle cx="101" cy="20" r="5" fill="#ff8fb1" stroke="#c2456e" stroke-width="1.5"/>'
    case 'flower': {
      const petals = [0, 1, 2, 3, 4].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
        return `<circle cx="${f(101 + Math.cos(a) * 7)}" cy="${f(17 + Math.sin(a) * 7)}" r="5.5" fill="#ff8fb1"/>`
      }).join('')
      return stem + leaf(false) + leaf(true) + `<g${glow}>${petals}<circle cx="101" cy="17" r="4" fill="#ffd36b"/></g>`
    }
    case 'ember': {
      const petals = [-50, -25, 0, 25, 50].map((a) =>
        `<path d="M101 26 q-6 -10 0 -20 q6 10 0 20z" fill="${Math.abs(a) > 30 ? '#ff7a2d' : '#ffc24a'}" transform="rotate(${a} 101 26)"/>`).join('')
      return '<path d="M100 40 q-2 -8 1 -14" stroke="#7a2a12" stroke-width="4" fill="none" stroke-linecap="round"/>' + `<g${glow}>${petals}<circle cx="101" cy="24" r="3.5" fill="#fff3c0"/></g>`
    }
    case 'circlet':
      return '<g filter="url(#g)"><path d="M70 44 l7 -18 l7 16 l9 -24 l7 22 l7 -22 l9 24 l7 -16 l7 18z" fill="#e9d7ff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></g><circle cx="100" cy="36" r="3.5" fill="#7ef0ff"/>'
    case 'crown':
      return '<path d="M64 46 L68 14 L84 32 L100 6 L116 32 L132 14 L136 46Z" fill="url(#gold)" stroke="#8a5a10" stroke-width="2" stroke-linejoin="round"/>'
        + '<rect x="64" y="40" width="72" height="9" rx="3" fill="url(#gold)" stroke="#8a5a10" stroke-width="1.5"/>'
        + '<circle cx="100" cy="24" r="5" fill="#ff5ca8" filter="url(#g)"/><circle cx="76" cy="33" r="3" fill="#7ef0ff"/><circle cx="124" cy="33" r="3" fill="#7ef0ff"/>'
    default: return ''
  }
}

function head(F) {
  const out = []
  out.push('<g transform="rotate(-4 100 82)">')
  out.push('<rect x="56" y="38" width="88" height="82" rx="18" fill="url(#helm)" stroke="#3a2a1a" stroke-opacity=".35" stroke-width="3"/>')
  out.push('<path d="M128 40 h-2 v78 h2 a16 16 0 0 0 16 -16 v-46 a16 16 0 0 0 -16 -16z" fill="#7a5a30" opacity=".18"/>')
  out.push('<rect x="66" y="45" width="50" height="7" rx="3.5" fill="#fff" opacity=".7"/>')
  if (F.band) out.push(`<path d="M57 58 h86" stroke="${F.level === 250 ? '#d6b4ff' : '#ffcf4a'}" stroke-width="5"/>`)
  out.push('<rect x="64" y="64" width="72" height="33" rx="15" fill="#0e1430"/>')
  out.push('<path d="M72 70 h26" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round"/>')
  out.push(`<g filter="url(#g)"><rect x="80" y="71" width="11" height="19" rx="5.5" fill="${F.eye}"/><rect x="109" y="71" width="11" height="19" rx="5.5" fill="${F.eye}"/></g>`)
  out.push('<rect x="83" y="74" width="4" height="6" rx="2" fill="#fff" opacity=".85"/><rect x="112" y="74" width="4" height="6" rx="2" fill="#fff" opacity=".85"/>')
  if (F.runes) out.push(`<path d="M62 104 l5 -6 l5 6 M128 104 l5 -6 l5 6 M70 110 h10 M120 110 h10" stroke="${F.runes}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#g)"/>`)
  out.push(top(F))
  out.push('</g>')
  return out.join('')
}

function front(F) {
  const out = []
  if (F.motes) {
    for (const [x, y, z] of scatter(F.level + 21, 9)) {
      const px = x * 200
      const py = 30 + y * 150
      if (clear(px, py)) continue
      out.push(`<circle cx="${f(px)}" cy="${f(py)}" r="${f(1.2 + z * 1.6)}" fill="${F.motes}" opacity=".85" filter="url(#g)"/>`)
    }
  }
  if (F.shards) {
    for (const [x, y, z] of scatter(F.level + 31, 10)) {
      const px = x * 200
      const py = 20 + y * 150
      if (clear(px, py)) continue
      const s = 3 + z * 4
      out.push(`<path d="M${f(px)} ${f(py - s * 1.6)} l${f(s)} ${f(s * 1.6)} l${f(-s)} ${f(s * 1.6)} l${f(-s)} ${f(-s * 1.6)}z" fill="#e9d7ff" opacity=".85" filter="url(#g)"/>`)
    }
  }
  if (F.sparkles) {
    for (const [x, y, z] of scatter(F.level + 41, 12)) {
      const px = x * 200
      const py = 14 + y * 170
      if (clear(px, py) && py < 180) continue
      out.push(`<path d="${sparkle(px, py, 3 + z * 5)}" fill="#fff3b0" filter="url(#g)"/>`)
    }
  }
  return out.join('')
}

for (const F of FORMS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">${defs(F)}${background(F)}${behind(F)}${body(F)}${scarf(F)}${head(F)}${front(F)}</svg>\n`
  writeFileSync(join(OUT, `avatar-blockcraft-${F.level}.svg`), svg)
  console.log(`avatar-blockcraft-${F.level}.svg  ${(svg.length / 1024).toFixed(1)} KB`)
}
