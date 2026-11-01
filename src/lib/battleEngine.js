/**
 * The Block Craft battle scenes: one short fight per chapter of the story,
 * drawn on a canvas.
 *
 * No React in here on purpose. A scene is a little game loop — sixty frames
 * a second of moving characters — and running that through React state
 * would re-render the whole screen every frame. The component in
 * components/BattleScene.jsx owns the canvas and hands it to this file.
 *
 * This file decides where everyone is and what happens; lib/battleArt.js
 * paints it. The fight runs in its own 256 × 144 units and is drawn at the
 * real size of the screen, so it is sharp on any phone.
 *
 * The dragon chapter is different from the rest: it does not play a made-up
 * fight. It is handed the real fight from lib/dragonFight.js and replays
 * what happened since the child last looked — every approved chore a hit,
 * every chore sent back a blast of fire — and its two health bars end on
 * exactly the numbers that fight worked out.
 */

import { makeArt, W, H, GROUND } from './battleArt.js'

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
/** Drawn at up to this many real pixels across; more costs battery for nothing. */
const MAX_WIDTH = 1600

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
 *   makeBuffer     for tests: how to make the off-screen canvases
 *
 * The canvas's own width and height are the real pixels to draw; set them
 * (and call redraw) when it changes size.
 *
 * Returns { destroy, replay, redraw, step, snapshot }.
 */
export function createBattle(canvas, opts = {}) {
  const scene = SCENES[opts.chapter] || SCENES.raid
  const ctx = canvas.getContext('2d')
  const makeBuffer = opts.makeBuffer || (() => document.createElement('canvas'))
  // Two layers off screen: the still parts of the world, painted once per
  // size, and the frame being built.
  const bg = makeBuffer()
  const buf = makeBuffer()
  const bgc = bg.getContext('2d')
  const g = buf.getContext('2d')
  const art = makeArt(g)
  const bgArt = makeArt(bgc)
  let k = 0

  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

  /** Match the layers to the canvas; repaint the still world if it changed. */
  function fit() {
    const cw = Math.min(MAX_WIDTH, canvas.width || W * 2)
    const scale = cw / W
    if (scale === k) return
    k = scale
    for (const c of [bg, buf]) { c.width = Math.round(W * k); c.height = Math.round(H * k) }
    bgc.setTransform(k, 0, 0, k, 0, 0)
    bgArt.staticWorld(scene.world)
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
  function moveParts(dt) {
    parts = parts.filter((p) => (p.life -= dt) > 0)
    for (const p of parts) { p.vy += 80 * dt; p.x += p.vx * dt; p.y += p.vy * dt }
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

  /* ---------------------------------------------------------- drawing */
  function renderBoss() {
    const b = boss
    if (!b.dead || b.y < H + 30) art.dragon(b, T)
    art.bar(8, 13, 76, b.php / HERO_MAX, b.pshown / HERO_MAX, '#5ad85a', `YOU  ${Math.round(b.pshown)} / ${HERO_MAX}`)
    art.bar(100, 13, 148, b.hp / BOSS_MAX, b.shown / BOSS_MAX, '#c94bff', `THE DRAGON  ${Math.round(b.shown)} / ${BOSS_MAX}`)
    for (const p of pops) art.pop(p)
    if (b.banner) art.banner(b.banner.text)
  }

  /* The arrival glitch: torn rows, split colour, static, then the world. */
  function glitch(t) {
    const strength = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.3
    const bw = buf.width
    for (let i = 0; i < 9; i++) {
      const y = Math.floor(rnd() * H) * k
      const h = (2 + Math.floor(rnd() * 12)) * k
      const off = Math.round((rnd() - 0.5) * 40 * strength * k)
      ctx.drawImage(buf, 0, y, bw, h, off, y, bw, h)
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 * strength; ctx.drawImage(buf, 3 * k, 0); ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 40 * strength; i++) {
      ctx.fillStyle = ['#ff00ff', '#00ffff', '#ffffff', '#000000'][i % 4]
      ctx.fillRect(Math.floor(rnd() * W) * k, Math.floor(rnd() * H) * k, (1 + Math.floor(rnd() * 8)) * k, k)
    }
    if (t < 0.15 || (t > 0.45 && t < 0.52)) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(0, 0, bw, buf.height) }
  }

  function render(dt) {
    fit()
    moveParts(dt)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(bg, 0, 0)
    g.setTransform(k, 0, 0, k, 0, 0)
    art.liveWorld(scene.world, T, scene.portal ? 36 : null)
    if (scene.celebrate) {
      art.sign(T)
      villagers.forEach((v) => art.villager(v, T))
    }
    for (const f of foes) {
      if (f.dead || T < f.delay) continue
      const face = hero.x < f.x ? -1 : 1
      if (f.type === 'raider') art.raider(f, T, face, false)
      if (f.type === 'brute') art.raider(f, T, face, true)
      if (f.type === 'spirit') art.spirit(f, T)
      if (f.type === 'shadow') art.shadowWalker(f, T, face)
    }
    for (const b of bolts) art.bolt(b)
    art.hero(hero, T)
    art.particles(parts)
    if (boss) renderBoss()
    art.vignette()

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const sx = shake > 0 ? (rnd() - 0.5) * 4 * k : 0
    const sy = shake > 0 ? (rnd() - 0.5) * 3 * k : 0
    ctx.drawImage(buf, sx, sy, canvas.width, canvas.height)
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
    for (let i = 0; i < 30 * 40 && !(won && T - wonAt > 0.7); i++) { update(1 / 30); moveParts(1 / 30) }
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
    /** After the canvas changed size: a still frame has to be painted again. */
    redraw() { if (opts.reducedMotion) render(0) },
    destroy: stop,
    /** For tests: what the bars say and whether the fight is over. */
    snapshot: () => ({
      T, won, dragon: boss?.hp ?? null, hero: boss?.php ?? null, heroX: hero.x,
      dragonGone: Boolean(boss?.dead), queued: boss?.queue.length ?? 0,
    }),
  }
}
