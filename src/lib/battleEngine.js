/**
 * The Block Craft battle scenes: one short pixel-art fight per chapter of
 * the story, drawn on a canvas.
 *
 * No React in here on purpose. A scene is a little game loop — sixty frames
 * a second of moving sprites — and running that through React state would
 * re-render the whole screen every frame. The component in
 * components/BattleScene.jsx owns the canvas and hands it to this file.
 *
 * Everything is drawn at 256×144 into a buffer and scaled up with the
 * pixels kept sharp, so it looks like the blocks it is about at any size.
 *
 * The dragon chapter is different from the rest: it does not play a made-up
 * fight. It is handed the real fight from lib/dragonFight.js and replays
 * what happened since the child last looked — every approved chore a hit,
 * every chore sent back a blast of fire — and its two health bars end on
 * exactly the numbers that fight worked out.
 */

const W = 256
const H = 144
const GROUND = 118

/** What each chapter looks like. The words for it live in data/kidThemes.js. */
export const SCENES = {
  raid: { world: 'village', accent: '#5ad85a', enemies: [['raider', 270, 0], ['raider', 300, 1.2], ['raider', 330, 2.4]] },
  portal: { world: 'nether', accent: '#ff6a3d', glitch: true, portal: true, enemies: [['spirit', 210, 0.8], ['spirit', 240, 2.2]] },
  rise: { world: 'nether', accent: '#ff3b5c', enemies: [['raider', 270, 0], ['raider', 295, 0.6], ['brute', 330, 1.6], ['raider', 360, 2.6]] },
  end: { world: 'end', accent: '#d6b4ff', glitch: true, enemies: [['shadow', 190, 0.4], ['shadow', 220, 1.4], ['shadow', 170, 2.4]] },
  dragon: { world: 'end', accent: '#e879f9', boss: true, enemies: [] },
  home: { world: 'dawn', accent: '#ffc94a', celebrate: true, enemies: [] },
}

const BOSS_MAX = 1000
const HERO_MAX = 100
/** How the dragon moves for each kind of attack in the real fight. */
const MOVE = { sentBack: 'breath', idle: 'dive', wings: 'wings', breath: 'breath', quake: 'quake' }

/**
 * Start a scene on `canvas`.
 *
 *   chapter        one of the SCENES keys
 *   fight          dragon chapter only: { from: {dragon, hero}, events, defeated }
 *                  where events are dragonFight() events to replay, oldest first
 *   reducedMotion  draw one still frame of how the scene ends, and stop
 *   onWon          called once when the fight is won (or the replay is over)
 *   onEvent        dragon chapter: called as each replayed event lands
 *   manual         do not start a loop; the caller drives it with step()
 *   makeBuffer     for tests: how to make the off-screen canvas
 *
 * Returns { destroy, replay, step, snapshot }.
 */
export function createBattle(canvas, opts = {}) {
  const scene = SCENES[opts.chapter] || SCENES.raid
  const ctx = canvas.getContext('2d')
  const buf = (opts.makeBuffer || (() => document.createElement('canvas')))()
  buf.width = W
  buf.height = H
  const g = buf.getContext('2d')

  /* ---------------------------------------------------------- drawing helpers */
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h) }
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  /* Characters are drawn at twice size, anchored on their own feet, so the
     fight reads at a glance instead of being a row of ants. */
  function big(x, y, fn, s = 2) { g.save(); g.translate(x, y); g.scale(s, s); g.translate(-x, -y); fn(); g.restore() }

  function sky(world, t) {
    const grads = {
      village: ['#06101f', '#14284a'], nether: ['#2a0505', '#6b1408'],
      end: ['#05020c', '#1c1033'], dawn: ['#2b2a6b', '#ff9a5a'],
    }[world]
    const gr = g.createLinearGradient(0, 0, 0, GROUND)
    gr.addColorStop(0, grads[0]); gr.addColorStop(1, grads[1])
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
    if (world === 'village') {
      R(206, 16, 14, 14, '#f4f1d0'); R(208, 18, 4, 4, '#dcd8b0') // a square moon
      for (let i = 0; i < 26; i++) R((i * 53) % W, (i * 29) % 70, 1, 1, i % 3 ? '#9fb7e0' : '#fff')
    }
    if (world === 'end') {
      for (let i = 0; i < 60; i++) {
        const tw = (Math.sin(t * 2 + i) + 1) / 2
        R((i * 97) % W, (i * 41) % 100, 1, 1, `rgba(220,200,255,${0.3 + tw * 0.7})`)
      }
    }
    if (world === 'nether') {
      for (let i = 0; i < 14; i++) { // drifting ash
        const y = (i * 37 + t * 10) % GROUND
        const x = (i * 71 + Math.sin(t + i) * 6) % W
        R(x, GROUND - y, 1, 1, '#ffb08a')
      }
    }
    if (world === 'dawn') { R(30, 30, 18, 18, '#ffe08a'); R(26, 34, 26, 10, 'rgba(255,224,138,.35)') }
  }

  function groundRow(world) {
    const top = { village: '#5ad85a', nether: '#8f2e1d', end: '#e8e0a8', dawn: '#6fe06f' }[world]
    const dirt = { village: '#7a5232', nether: '#5c1a12', end: '#cfc68c', dawn: '#8a6038' }[world]
    for (let x = 0; x < W; x += 8) {
      R(x, GROUND, 8, 3, top); R(x, GROUND + 3, 8, H - GROUND - 3, dirt)
      R(x, GROUND + 3, 1, H, 'rgba(0,0,0,.18)')
      if ((x / 8) % 3 === 0) R(x + 3, GROUND + 9, 2, 2, 'rgba(0,0,0,.2)')
    }
  }

  function house(x, w, h, wall, roof, lit) {
    R(x, GROUND - h, w, h, wall)
    for (let i = 0; i < 4; i++) R(x - 2 + i * 2, GROUND - h - 2 - i * 2, w + 4 - i * 4, 2, roof)
    R(x + w / 2 - 2, GROUND - 8, 4, 8, '#3b2414')
    R(x + 3, GROUND - h + 4, 4, 4, lit ? '#ffd36b' : '#1a1a2a')
  }

  function portal(x, t) {
    R(x, GROUND - 40, 4, 40, '#1a0f2e'); R(x + 24, GROUND - 40, 4, 40, '#1a0f2e')
    R(x, GROUND - 44, 28, 4, '#1a0f2e')
    for (let y = 0; y < 40; y += 2) {
      for (let i = 0; i < 20; i += 2) {
        const v = Math.sin(t * 6 + y * 0.4 + i * 0.7)
        R(x + 4 + i, GROUND - 40 + y, 2, 2, v > 0.3 ? '#b06bff' : v > -0.4 ? '#7a2cd6' : '#4b1a8f')
      }
    }
  }

  function backdrop(t) {
    sky(scene.world, t)
    if (scene.world === 'village' || scene.world === 'dawn') {
      house(18, 26, 22, '#a8743f', '#6b3f1f', true)
      house(56, 22, 18, '#b88a52', '#5a3418', scene.world === 'dawn')
      house(214, 30, 26, '#a8743f', '#6b3f1f', true)
      R(100, GROUND - 30, 6, 30, '#6b4a2a'); R(92, GROUND - 42, 22, 14, '#2f8f3a') // a tree
    }
    if (scene.world === 'nether') {
      R(0, GROUND - 46, 40, 46, '#3d0a12'); R(6, GROUND - 56, 10, 10, '#3d0a12'); R(26, GROUND - 52, 10, 6, '#3d0a12')
      R(200, GROUND - 60, 56, 60, '#2a0608')
      for (let i = 0; i < 4; i++) R(206 + i * 12, GROUND - 52, 5, 7, '#ff8a3d')
      const glow = 0.5 + Math.sin(t * 3) * 0.2
      g.fillStyle = `rgba(255,120,40,${glow * 0.35})`; g.fillRect(0, GROUND - 6, W, 6)
    }
    if (scene.world === 'end') {
      [[30, 54], [70, 40], [210, 60]].forEach(([x, h], i) => {
        R(x, GROUND - h, 10, h, '#140c24'); R(x + 2, GROUND - h - 4, 6, 4, '#d6b4ff')
        const p = (Math.sin(t * 3 + i) + 1) / 2
        g.fillStyle = `rgba(214,180,255,${0.15 + p * 0.25})`; g.fillRect(x - 3, GROUND - h - 8, 16, 12)
      })
    }
    groundRow(scene.world)
    if (scene.portal) portal(36, t)
  }

  /* ---------------------------------------------------------- characters */
  function drawHero(h, t) {
    const x = h.x
    const y = GROUND + h.jump
    const f = h.face
    const step = h.moving ? Math.sin(t * 14) * 2 : 0
    const flash = h.hurt > 0 && Math.floor(h.hurt * 30) % 2 === 0
    const skin = flash ? '#fff' : '#e0a878'
    R(x - 3, y - 6, 2, 6 + Math.min(0, step), '#3b5bdb'); R(x + 1, y - 6, 2, 6 - Math.max(0, step), '#3b5bdb')
    R(x - 3, y - 13, 6, 7, flash ? '#fff' : '#1fa3a3')
    R(x - 3, y - 19, 6, 6, skin); R(x - 3, y - 20, 6, 2, '#5b3a1e')
    R(x + (f > 0 ? 1 : -2), y - 17, 1, 1, '#1b1b2b')
    // The sword arm.
    g.save(); g.translate(x + f * 2, y - 11)
    const swing = h.swing > 0 ? (1 - h.swing / 0.25) : 0
    const a = f > 0 ? (-1.9 + swing * 2.6) : (Math.PI + 1.9 - swing * 2.6)
    g.rotate(h.raise ? -Math.PI / 2 : a)
    g.fillStyle = '#e0a878'; g.fillRect(0, -1, 3, 2)
    g.fillStyle = '#6b4a2a'; g.fillRect(3, -1, 2, 2)
    g.fillStyle = '#8ff0ff'; g.fillRect(5, -1, 9, 2); g.fillStyle = '#d8fbff'; g.fillRect(5, -1, 9, 1)
    g.restore()
    if (h.swing > 0.05) { // the slash
      g.strokeStyle = `rgba(200,250,255,${h.swing * 3})`; g.lineWidth = 1
      g.beginPath(); g.arc(x + f * 2, y - 11, 14, f > 0 ? -1.2 : Math.PI - 0.6, f > 0 ? 0.6 : Math.PI + 1.2); g.stroke()
    }
  }

  function raider(e, t, brute) {
    const s = brute ? 1.5 : 1
    const x = e.x
    const y = GROUND
    const c = (col) => (e.hit > 0 ? '#fff' : col)
    const step = e.moving ? Math.sin(t * 12 + e.x) * 2 : 0
    R(x - 3 * s, y - 6 * s, 2 * s, 6 * s + step, c('#2b2f36')); R(x + 1 * s, y - 6 * s, 2 * s, 6 * s - step, c('#2b2f36'))
    R(x - 3 * s, y - 14 * s, 6 * s, 8 * s, c('#3a3f47'))
    R(x - 3 * s, y - 20 * s, 6 * s, 6 * s, c('#9aa0a6'))
    R(x - 3 * s, y - 18 * s, 6 * s, 1, c('#2b2f36')) // the frown
    R(x - 2 * s, y - 17 * s, 1, 1, '#000'); R(x - 0.5 * s, y - 15 * s, 2, 2, c('#7d848c'))
    const lift = e.attack > 0 ? -6 : 0
    R(x - 6 * s, y - 15 * s + lift, 2, 9 * s, '#6b4a2a'); R(x - 8 * s, y - 15 * s + lift, 4 * s, 4 * s, '#b9c0c8') // the axe
  }

  function spirit(e, t) {
    const x = e.x
    const y = e.anchor + Math.sin(t * 3 + e.x) * 3
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + i * Math.PI / 2
      R(x + Math.cos(a) * 7 - 1, y + Math.sin(a) * 4 + 4, 2, 4, '#ff9a2a')
    }
    g.fillStyle = 'rgba(255,170,40,.25)'; g.fillRect(x - 7, y - 7, 14, 16)
    R(x - 3, y - 4, 6, 8, e.hit > 0 ? '#fff' : '#ffd23d'); R(x - 2, y - 2, 1, 1, '#3b1a00'); R(x + 1, y - 2, 1, 1, '#3b1a00')
  }

  function shadowWalker(e) {
    if (e.blink > 0 && Math.floor(e.blink * 20) % 2) return
    const x = e.x
    const y = GROUND
    const col = e.hit > 0 ? '#fff' : '#0c0816'
    R(x - 1, y - 14, 1, 14, col); R(x + 1, y - 14, 1, 14, col)
    R(x - 2, y - 26, 5, 12, col); R(x - 3, y - 25, 1, 12, col); R(x + 3, y - 25, 1, 12, col)
    R(x - 2, y - 31, 5, 5, col); R(x - 2, y - 29, 2, 1, '#d06bff'); R(x + 1, y - 29, 2, 1, '#d06bff')
  }

  function drawDragon(e, t) {
    const x = e.x
    const y = e.y
    const flap = Math.sin(t * 6) * 10
    // Lighter than the night behind it, with a rim, or it vanishes into the sky.
    const col = e.hit > 0 ? '#fff' : '#3a1a5c'
    const rim = e.hit > 0 ? '#fff' : '#8a5ad6'
    g.fillStyle = col
    g.strokeStyle = rim; g.lineWidth = 1
    g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x - 30, y - 6 - flap); g.lineTo(x - 18, y + 2); g.fill(); g.stroke()
    g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + 30, y - 6 - flap); g.lineTo(x + 18, y + 2); g.fill(); g.stroke()
    R(x - 16, y - 4, 32, 1, rim)
    R(x - 16 * e.face, y - 3, 32, 7, col)
    R(x + 16 * e.face - (e.face > 0 ? 0 : 8), y - 6, 8, 7, col)
    R(x + 18 * e.face - (e.face > 0 ? -2 : 4), y - 4, 2, 1, '#ff4dff')
    for (let i = 0; i < 4; i++) R(x - 22 * e.face - i * 4 * e.face, y + Math.sin(t * 5 + i) * 2, 4, 3, col)
    if (e.breath > 0) {
      for (let i = 0; i < 12; i++) {
        const d = i * 4 + (1 - e.breath) * 10
        R(x + (22 + d) * e.face, y + d * 0.6 + rnd() * 3, 3, 3, i % 2 ? '#c26bff' : '#ff7bff')
      }
    }
  }

  function villager(v, t) {
    const y = GROUND - Math.max(0, Math.sin(t * 6 + v.p) * 6)
    R(v.x - 3, y - 14, 6, 14, v.c); R(v.x - 3, y - 20, 6, 6, '#c98f5c'); R(v.x - 1, y - 16, 2, 3, '#a86b3c')
    R(v.x - 4, y - 12, 1, 4, '#c98f5c'); R(v.x + 3, y - 12, 1, 4, '#c98f5c')
  }

  /* ---------------------------------------------------------- particles */
  let parts = []
  function burst(x, y, n, cols, speed = 40, life = 0.7) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2
      const s = speed * (0.3 + rnd())
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life, max: life, c: cols[i % cols.length] })
    }
  }
  function drawParts(dt) {
    parts = parts.filter((p) => (p.life -= dt) > 0)
    for (const p of parts) {
      p.vy += 80 * dt; p.x += p.vx * dt; p.y += p.vy * dt
      g.globalAlpha = Math.max(0, p.life / p.max); R(p.x, p.y, 2, 2, p.c); g.globalAlpha = 1
    }
  }

  /* ---------------------------------------------------------- the scene */
  let T, hero, foes, bolts, shake, won, wonAt, boss, pops, villagers, reported

  function hurtHero() { hero.hurt = 0.4; shake = 0.15; burst(hero.x, GROUND - 24, 8, ['#ff5c5c', '#ffd0d0'], 30, 0.4) }
  function pop(text, x, y, col) { pops.push({ text, x, y, col, life: 1.2 }) }

  function reset() {
    T = 0; parts = []; bolts = []; pops = []; shake = 0; won = false; wonAt = 0; reported = false
    seed = 7 + Object.keys(SCENES).indexOf(opts.chapter)
    hero = { x: scene.portal ? 50 : 30, face: 1, swing: 0, cd: 0, hurt: 0, jump: 0, moving: false, raise: false }
    foes = scene.enemies.map(([type, x, delay]) => ({
      type, x: Math.min(x, W + 12), delay, anchor: GROUND - 34, hp: type === 'brute' ? 4 : 2, hit: 0, cd: 1 + delay,
      dead: false, moving: false, attack: 0, blink: 0,
    }))
    boss = null
    if (scene.boss) {
      const fight = opts.fight || {}
      const from = fight.from || { dragon: BOSS_MAX, hero: HERO_MAX }
      hero.x = 56
      boss = {
        hp: from.dragon, shown: from.dragon, php: from.hero, pshown: from.hero,
        x: 168, y: 56, face: -1, hit: 0, breath: 0, phase: 0, act: null, banner: null,
        queue: [...(fight.events || [])], wait: 1.2, dead: false,
      }
      // Already beaten and nothing new to show: the sky is empty and the hero is cheering.
      if (fight.defeated && boss.queue.length === 0) {
        boss.dead = true; boss.y = H + 40; won = true; wonAt = -10
      }
    }
    villagers = scene.celebrate
      ? [44, 78, 160, 186, 112].map((x, k) => ({ x, p: k * 1.3, c: ['#6b4a2a', '#3b6b8f', '#7a3f8f', '#2f7a4a', '#8f3a2f'][k] }))
      : []
    if (scene.celebrate) hero.x = -10
  }

  function nearest() {
    let best = null
    for (const f of foes) if (!f.dead && T > f.delay && (!best || Math.abs(f.x - hero.x) < Math.abs(best.x - hero.x))) best = f
    return best
  }

  /* The dragon's next move comes off the queue of real events. */
  function nextBossAct() {
    const e = boss.queue.shift()
    if (!e) return
    if (e.kind === 'hit') {
      boss.act = { type: 'strike', t: 0, e }
    } else {
      const type = MOVE[e.kind === 'special' ? e.special : e.kind] || 'breath'
      if (e.kind === 'special') boss.banner = { text: `${String(e.name || 'Special').toUpperCase()}!`, life: 1.6 }
      boss.act = { type, t: 0, e }
    }
  }

  function landOnHero(e) {
    hurtHero(); shake = 0.3
    pop(`-${e.dmg}`, hero.x, GROUND - 46, '#ff8a8a')
    boss.php = e.hero
    if (e.knockout) {
      boss.hp = e.dragon
      boss.banner = { text: 'KNOCKED OUT', life: 2 }
    }
    opts.onEvent?.(e)
  }

  function updateBoss(dt) {
    const b = boss
    b.hit = Math.max(0, b.hit - dt); b.breath = Math.max(0, b.breath - dt)
    b.shown += (b.hp - b.shown) * Math.min(1, dt * 6); b.pshown += (b.php - b.pshown) * Math.min(1, dt * 6)
    if (b.banner && (b.banner.life -= dt) <= 0) b.banner = null
    pops = pops.filter((p) => (p.life -= dt) > 0)
    if (b.dead) {
      b.y += 40 * dt; hero.raise = true; hero.jump = -Math.abs(Math.sin((T - wonAt) * 7)) * 5
      return
    }
    b.phase += dt
    const a = b.act
    if (!a) {
      b.x = 168 + Math.sin(b.phase * 0.8) * 20; b.y = 56 + Math.sin(b.phase * 1.7) * 8; b.face = -1
      hero.x += (56 - hero.x) * Math.min(1, dt * 5); hero.face = 1; hero.moving = Math.abs(56 - hero.x) > 1; hero.jump = 0
      if (b.queue.length) {
        if ((b.wait -= dt) <= 0) { b.wait = 0.5; nextBossAct() }
      } else if (!won) {
        won = true; wonAt = T // the replay is over; the fight carries on tomorrow
      }
      return
    }
    a.t += dt
    if (a.type === 'strike') { // run in, leap, hit, come back
      const tx = b.x - 34
      if (a.t < 0.45) {
        hero.moving = true; hero.x += (tx - hero.x) * Math.min(1, dt * 9)
        hero.jump = -Math.sin(a.t / 0.45 * Math.PI) * 26
      } else if (!a.done) {
        a.done = true; hero.swing = 0.25; b.hit = 0.2; shake = 0.25
        b.hp = a.e.dragon
        burst(b.x, b.y, 18, ['#ffffff', '#bff6ff', '#e879f9'], 55, 0.6)
        pop(`-${a.e.dmg}`, b.x, b.y - 22, '#b9f5b9')
        opts.onEvent?.(a.e)
        if (b.hp === 0) {
          b.dead = true; won = true; wonAt = T; shake = 0.5; b.queue = []
          burst(b.x, b.y, 120, ['#1a0b26', '#e879f9', '#fff', '#ffd36b'], 100, 1.8)
        }
      }
      if (a.t > 0.75) b.act = null
    } else if (a.type === 'breath') { // fire from where it hovers
      if (a.t < 0.2) b.breath = 0.7
      if (a.t > 0.5 && !a.done) { a.done = true; landOnHero(a.e) }
      if (a.t > 0.9) b.act = null
    } else if (a.type === 'dive' || a.type === 'wings') {
      const k = a.t < 0.5 ? a.t / 0.5 : 1 - (a.t - 0.5) / 0.5
      b.x += ((hero.x + 40) - b.x) * k * 0.15; b.y = 56 + k * (GROUND - 80)
      if (a.type === 'wings' && a.t > 0.3 && a.t < 0.6) {
        for (let i = 0; i < 2; i++) parts.push({ x: b.x - 20, y: GROUND - 8 - rnd() * 30, vx: -90, vy: 0, life: 0.5, max: 0.5, c: '#c9b8ff' })
      }
      if (a.t > 0.5 && !a.done) { a.done = true; landOnHero(a.e); hero.x -= 10 }
      if (a.t > 1) b.act = null
    } else if (a.type === 'quake') {
      if (a.t > 0.2 && a.t < 0.7) shake = 0.2
      if (a.t > 0.4 && !a.done) { a.done = true; burst(hero.x, GROUND, 20, ['#e8e0a8', '#8a7f4a'], 50, 0.6); landOnHero(a.e) }
      if (a.t > 0.9) b.act = null
    }
  }

  function update(dt) {
    T += dt
    hero.swing = Math.max(0, hero.swing - dt); hero.cd -= dt; hero.hurt = Math.max(0, hero.hurt - dt)
    shake = Math.max(0, shake - dt)
    if (scene.glitch && T < 0.9) return // the glitch plays first
    if (boss) { updateBoss(dt); return }

    if (scene.celebrate) {
      hero.moving = hero.x < 128
      if (hero.moving) hero.x += 46 * dt
      hero.raise = !hero.moving
      if (!hero.moving && Math.floor(T * 1.4) !== Math.floor((T - dt) * 1.4)) {
        burst(30 + rnd() * 200, 20 + rnd() * 30, 28, ['#ffd36b', '#ff7bff', '#7ef0ff', '#5ad85a'], 55, 1.1)
      }
      if (T > 3 && !won) { won = true; wonAt = T }
      return
    }

    const target = nearest()
    if (!target) {
      if (!won && foes.every((f) => f.dead) && T > 1) {
        won = true; wonAt = T
        burst(hero.x, GROUND - 40, 22, ['#5ad85a', '#9bff9b', '#ffd36b'], 50, 1)
      }
      hero.moving = false; hero.raise = won
      hero.jump = won ? -Math.abs(Math.sin((T - wonAt) * 7)) * 5 : 0
    } else {
      const reach = target.type === 'brute' ? 26 : 22
      hero.face = target.x > hero.x ? 1 : -1
      const close = Math.abs(target.x - hero.x) < reach
      hero.moving = !close && Math.abs(target.x - hero.x) > reach - 2
      // Kept on screen: the hero never walks out of their own story.
      if (hero.moving) hero.x = Math.max(10, Math.min(W - 26, hero.x + hero.face * 46 * dt))
      hero.jump = target.type === 'spirit' && close ? -8 : 0
      if (close && hero.cd <= 0) {
        hero.swing = 0.25; hero.cd = 0.42
        target.hp -= 1; target.hit = 0.15; shake = 0.12
        const hy = target.type === 'spirit' ? target.anchor : GROUND - 26
        burst(target.x, hy, 8, ['#ffffff', '#bff6ff', scene.accent], 45, 0.4)
        if (target.type !== 'spirit') target.x += hero.face * 8
        if (target.hp <= 0) {
          target.dead = true; shake = 0.25
          const cols = {
            raider: ['#9aa0a6', '#3a3f47', '#5ad85a'], brute: ['#9aa0a6', '#3a3f47', '#5ad85a'],
            spirit: ['#ffd23d', '#ff9a2a', '#fff'], shadow: ['#0c0816', '#d06bff', '#fff'],
          }[target.type]
          burst(target.x, target.type === 'spirit' ? target.anchor : GROUND - 24, 30, cols, 60, 0.9)
        }
      }
    }

    for (const f of foes) {
      f.hit = Math.max(0, f.hit - dt); f.attack = Math.max(0, f.attack - dt); f.blink = Math.max(0, f.blink - dt)
      if (f.dead || T < f.delay) continue
      f.cd -= dt
      const d = hero.x - f.x
      if (f.type === 'raider' || f.type === 'brute') {
        f.moving = Math.abs(d) > 18
        if (f.moving) f.x += Math.sign(d) * (f.type === 'brute' ? 16 : 24) * dt
        if (!f.moving && f.cd <= 0) { f.attack = 0.25; f.cd = f.type === 'brute' ? 1.5 : 1.2; hurtHero() }
      } else if (f.type === 'spirit') {
        if (Math.abs(d) > 40) f.x += Math.sign(d) * 14 * dt
        if (f.cd <= 0) { f.cd = 1.6; bolts.push({ x: f.x, y: f.anchor, vx: Math.sign(d) * 70, vy: 14 }) }
      } else if (f.type === 'shadow') {
        if (f.cd <= 0) {
          f.cd = 1.4; f.blink = 0.3; burst(f.x, GROUND - 16, 10, ['#d06bff', '#3a1a5a'], 30, 0.5)
          f.x = Math.max(16, Math.min(W - 16, hero.x + (rnd() > 0.5 ? 1 : -1) * (18 + rnd() * 10)))
          burst(f.x, GROUND - 16, 10, ['#d06bff', '#3a1a5a'], 30, 0.5)
        }
        if (Math.abs(d) < 26 && f.cd > 1.0 && f.cd < 1.05) hurtHero()
      }
    }

    bolts = bolts.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt
      if (Math.abs(b.x - hero.x) < 7 && b.y > GROUND - 40) {
        if (hero.swing > 0) burst(b.x, b.y, 6, ['#ff9a2a', '#fff'], 30, 0.3)
        else hurtHero()
        return false
      }
      return b.y < GROUND && b.x > 0 && b.x < W
    })
  }

  function bar(x, y, w, frac, shown, col, label) {
    R(x - 1, y - 1, w + 2, 7, '#000'); R(x, y, w, 5, '#2a2a3a')
    R(x, y, Math.round(w * shown), 5, '#ffffff'); R(x, y, Math.round(w * frac), 5, col)
    R(x, y, Math.round(w * frac), 1, 'rgba(255,255,255,.35)')
    g.font = 'bold 7px monospace'; g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText(label, x, y - 2)
  }

  function renderBoss() {
    const b = boss
    if (!b.dead || b.y < H) big(b.x, b.y, () => drawDragon(b, T), 1.6)
    bar(8, 12, 76, b.php / HERO_MAX, b.pshown / HERO_MAX, '#5ad85a', `YOU  ${Math.round(b.pshown)}/${HERO_MAX}`)
    bar(100, 12, 148, b.hp / BOSS_MAX, b.shown / BOSS_MAX, '#c94bff', `THE DRAGON  ${Math.round(b.shown)}/${BOSS_MAX}`)
    g.textAlign = 'center'
    for (const p of pops) {
      g.globalAlpha = Math.min(1, p.life * 2); g.font = 'bold 10px monospace'
      g.fillStyle = '#000'; g.fillText(p.text, p.x + 1, p.y - (1.2 - p.life) * 16 + 1)
      g.fillStyle = p.col; g.fillText(p.text, p.x, p.y - (1.2 - p.life) * 16); g.globalAlpha = 1
    }
    if (b.banner) {
      g.font = 'bold 12px monospace'; g.fillStyle = '#000'; g.fillText(b.banner.text, 129, 37)
      g.fillStyle = '#ffd36b'; g.fillText(b.banner.text, 128, 36)
    }
  }

  /* The arrival glitch: torn rows, split colour, static, then the world. */
  function glitch(t) {
    const strength = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.3
    for (let i = 0; i < 9; i++) {
      const y = Math.floor(rnd() * H)
      const h = 2 + Math.floor(rnd() * 12)
      const off = Math.round((rnd() - 0.5) * 40 * strength)
      ctx.drawImage(buf, 0, y, W, h, off, y, W, h)
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 * strength; ctx.drawImage(buf, 3, 0); ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 40 * strength; i++) {
      ctx.fillStyle = ['#ff00ff', '#00ffff', '#ffffff', '#000000'][i % 4]
      ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1 + Math.floor(rnd() * 8), 1)
    }
    if (t < 0.15 || (t > 0.45 && t < 0.52)) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(0, 0, W, H) }
  }

  function render(dt) {
    backdrop(T)
    if (scene.celebrate) {
      villagers.forEach((v) => big(v.x, GROUND, () => villager(v, T)))
      R(98, 34, 60, 14, '#2a1a0c'); g.fillStyle = '#ffd36b'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText('HERO!', 128, 44)
      R(97, 34, 1, 40, '#6b4a2a'); R(158, 34, 1, 40, '#6b4a2a')
    }
    for (const f of foes) {
      if (f.dead || T < f.delay) continue
      if (f.type === 'raider') big(f.x, GROUND, () => raider(f, T, false))
      if (f.type === 'brute') big(f.x, GROUND, () => raider(f, T, true))
      if (f.type === 'spirit') big(f.x, f.anchor, () => spirit(f, T))
      if (f.type === 'shadow') big(f.x, GROUND, () => shadowWalker(f))
    }
    for (const b of bolts) { R(b.x - 1, b.y - 1, 3, 3, '#ff9a2a'); R(b.x, b.y, 1, 1, '#fff2a0') }
    big(hero.x, GROUND + hero.jump, () => drawHero(hero, T))
    drawParts(dt)
    if (boss) renderBoss()

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, H)
    const sx = shake > 0 ? Math.round((rnd() - 0.5) * 4) : 0
    const sy = shake > 0 ? Math.round((rnd() - 0.5) * 3) : 0
    ctx.drawImage(buf, sx, sy)
    if (scene.glitch && T < 1.2) glitch(T)
  }

  /** Advance the scene by dt seconds and draw it. */
  function step(dt) {
    update(dt)
    render(dt)
    if (won && !reported && T - wonAt > 0.6) { reported = true; opts.onWon?.() }
  }

  /* ---------------------------------------------------------- running it */
  let raf = 0
  let last = 0
  let stopped = false
  function frame(now) {
    if (stopped) return
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    step(dt)
    raf = requestAnimationFrame(frame)
  }

  /*
   * With reduced motion the whole scene still happens — the bars still end
   * on the real numbers — but out of sight, and only its last frame is
   * drawn. A child who gets motion sick still sees who won.
   */
  function stillFrame() {
    for (let i = 0; i < 30 * 40 && !(won && T - wonAt > 0.7); i++) update(1 / 30)
    parts = []; pops = []; shake = 0; T = Math.max(T, 2)
    if (boss) { boss.shown = boss.hp; boss.pshown = boss.php; boss.banner = null }
    render(0)
    if (!reported) { reported = true; opts.onWon?.() }
  }

  function stop() {
    stopped = true
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    raf = 0
  }

  function start() {
    reset()
    if (opts.manual) return
    if (opts.reducedMotion) stillFrame()
    else { last = 0; raf = requestAnimationFrame(frame) }
  }

  start()

  return {
    step,
    replay() { stop(); stopped = false; start() },
    destroy: stop,
    /** For tests: what the bars say and whether the fight is over. */
    snapshot: () => ({
      T, won, dragon: boss?.hp ?? null, hero: boss?.php ?? null, heroX: hero.x,
      dragonGone: Boolean(boss?.dead), queued: boss?.queue.length ?? 0,
    }),
  }
}
