/**
 * Does the photo check accuse honest children?
 *
 * This is the feature families pay for, and it is the one that can lose them
 * outright. A child who did the work, photographed it, and got told the app
 * thinks they faked it does not try again — and the parent who watched that
 * happen cancels. Every other bug in this app costs a moment of confusion;
 * this one costs the household.
 *
 * The risk is specific and structural, not hypothetical. The flag is raised
 * on "large flat colour areas and very few distinct colours", and the chores
 * this app ships in its own quest packs are *made your bed*, *tidy your desk*,
 * *clean the bathroom*, *vacuum the living room*. A finished chore is, almost
 * by definition, a photograph of a plain surface with nothing on it. The
 * better the child did, the flatter the picture.
 *
 * So this generates both classes and counts. Real photographs are not flat in
 * the way a screenshot is, even of a bare wall: a sensor adds noise to every
 * pixel, lenses vignette, light falls across a surface unevenly, and JPEG
 * leaves its own texture. A screen grab has none of that — long runs of
 * byte-identical pixels and a handful of distinct colours in the whole frame.
 * That difference is what the check is really detecting, and this measures
 * whether it is detecting it well enough to be trusted with somebody's
 * Saturday morning.
 *
 * The images are synthetic and this file says so plainly. Synthetic is not
 * the same as a camera roll, and the numbers below are a floor rather than a
 * guarantee — what they can prove is that an ordinary tidy-desk photo is not
 * flagged by construction, which is the failure that would ship otherwise.
 */
import { launch, reporter, finish, BASE } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

/*
 * Both classes are drawn in the page, because analyseLocally decodes through
 * a real canvas and there is no honest way to feed it bytes from node.
 */
const results = await page.evaluate(async () => {
  const mod = await import('/src/lib/aiVerify.js')

  const W = 640
  const H = 480

  const make = (paint) => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    paint(c.getContext('2d'), c)
    // JPEG, like a phone camera, and at a quality a phone would use. PNG
    // would hand the check a cleanliness no photograph ever has.
    return c.toDataURL('image/jpeg', 0.82)
  }

  /** Sensor noise, vignetting and an uneven fall of light — what makes a photo a photo. */
  const photographise = (ctx, { grain = 9, vignette = 0.3 } = {}) => {
    const img = ctx.getImageData(0, 0, W, H)
    const d = img.data
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4
        // Light falling across the surface from one side.
        const fall = 1 - 0.18 * (x / W) - 0.1 * (y / H)
        // Darkening toward the corners, as every lens does.
        const dx = (x - W / 2) / (W / 2)
        const dy = (y - H / 2) / (H / 2)
        const vig = 1 - vignette * Math.min(1, dx * dx + dy * dy) * 0.6
        for (let k = 0; k < 3; k += 1) {
          const noise = (Math.random() - 0.5) * grain * 2
          d[i + k] = Math.max(0, Math.min(255, d[i + k] * fall * vig + noise))
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  }

  // ---- honest photographs of finished chores -------------------------------
  // Every one of these is deliberately PLAIN. That is the point: a well-done
  // chore is a picture of a surface with nothing on it.
  const HONEST = {
    'a made bed, plain duvet': make((ctx) => {
      ctx.fillStyle = '#cfd6e2'
      ctx.fillRect(0, 0, W, H)
      // The duvet's own folds — very low contrast, which is the hard case.
      for (let i = 0; i < 7; i += 1) {
        ctx.strokeStyle = `rgba(150,160,180,${0.18 + i * 0.01})`
        ctx.lineWidth = 9 + i
        ctx.beginPath()
        ctx.moveTo(-20, 90 + i * 52)
        ctx.bezierCurveTo(W * 0.3, 70 + i * 52, W * 0.7, 110 + i * 52, W + 20, 85 + i * 52)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(245,247,250,0.85)'
      ctx.fillRect(60, 40, 220, 90) // a pillow
      photographise(ctx, { grain: 8 })
    }),

    'a cleared desk': make((ctx) => {
      ctx.fillStyle = '#a9794f'
      ctx.fillRect(0, 0, W, H)
      // Wood grain: faint, irregular, nothing like a UI line.
      for (let i = 0; i < 90; i += 1) {
        ctx.strokeStyle = `rgba(120,80,45,${0.05 + Math.random() * 0.08})`
        ctx.lineWidth = 1 + Math.random() * 2
        const y = Math.random() * H
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(W / 3, y + (Math.random() - 0.5) * 10, (2 * W) / 3, y + (Math.random() - 0.5) * 10, W, y)
        ctx.stroke()
      }
      photographise(ctx, { grain: 10 })
    }),

    'a vacuumed carpet': make((ctx) => {
      ctx.fillStyle = '#6f7466'
      ctx.fillRect(0, 0, W, H)
      // Vacuum stripes. Soft-edged, unlike anything on a screen.
      for (let i = 0; i < 9; i += 1) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)'
        ctx.fillRect(i * (W / 9), 0, W / 9, H)
      }
      photographise(ctx, { grain: 13 })
    }),

    'a wiped bathroom sink': make((ctx) => {
      ctx.fillStyle = '#e8eaec'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#d2d6da'
      ctx.beginPath()
      ctx.ellipse(W / 2, H / 2, 190, 130, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.ellipse(W / 2 - 50, H / 2 - 40, 70, 40, -0.4, 0, Math.PI * 2)
      ctx.fill()
      photographise(ctx, { grain: 7 })
    }),

    'a tidy floor, almost featureless': make((ctx) => {
      // The hardest honest case there is: one colour, barely any detail.
      ctx.fillStyle = '#b6ada0'
      ctx.fillRect(0, 0, W, H)
      photographise(ctx, { grain: 11, vignette: 0.45 })
    }),

    'clothes folded in a drawer': make((ctx) => {
      ctx.fillStyle = '#8d7f6d'
      ctx.fillRect(0, 0, W, H)
      const cols = ['#5b6f8a', '#8a5b5b', '#6f8a5b', '#4a4a55']
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = cols[i]
        ctx.fillRect(30, 40 + i * 105, W - 60, 86)
      }
      photographise(ctx, { grain: 9 })
    }),
  }

  // ---- what the check is actually for --------------------------------------
  const FAKE = {
    'a solid colour': make((ctx) => {
      ctx.fillStyle = '#1aa34a'
      ctx.fillRect(0, 0, W, H)
    }),
    'a screenshot of an app': make((ctx) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#f2f2f4'
      ctx.fillRect(0, 0, W, 64)
      ctx.fillStyle = '#2b6fe8'
      ctx.fillRect(24, 110, 300, 44)
      ctx.fillStyle = '#e6e6ea'
      for (let i = 0; i < 6; i += 1) ctx.fillRect(24, 190 + i * 46, W - 48, 30)
    }),
    'a flat two-tone graphic': make((ctx) => {
      ctx.fillStyle = '#101823'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#3fe0ff'
      ctx.fillRect(W / 4, H / 4, W / 2, H / 2)
    }),
  }

  const run = async (set) => {
    const out = {}
    for (const [name, url] of Object.entries(set)) {
      // captureSource matters: anything not from the live camera is flagged
      // on its own, which would mask what is being measured here.
      const r = await mod.analyseLocally(url, { captureSource: 'live-camera' })
      out[name] = {
        score: r.score,
        verdict: r.verdict,
        flags: r.flags.map((f) => f.id),
        metrics: r.metrics,
      }
    }
    return out
  }

  return { honest: await run(HONEST), fake: await run(FAKE) }
})

console.log('\n=== Honest photographs of finished chores ===')
let accused = 0
for (const [name, r] of Object.entries(results.honest)) {
  const flagged = r.flags.includes('flat-image') || r.flags.includes('ui-edges')
  if (flagged) accused += 1
  const detail = `score ${r.score}, flat ${r.metrics.flatness}, same-px ${r.metrics.identicalNeighbours}`
  flagged
    ? fail(`${name} is not accused`, `${detail}, flags: ${r.flags.join(', ')}`)
    : pass(`${name} — ${detail}`)
}

console.log('\n=== And the fakes it exists to catch ===')
let caught = 0
for (const [name, r] of Object.entries(results.fake)) {
  const flagged = r.flags.includes('flat-image') || r.flags.includes('ui-edges')
  if (flagged) caught += 1
  flagged
    ? pass(`${name} is caught (score ${r.score}, flat ${r.metrics.flatness}, same-px ${r.metrics.identicalNeighbours})`)
    : fail(`${name} is caught`, `score ${r.score}, flags: ${r.flags.join(', ') || 'none'}`)
}

console.log(`\n  wrongly accused: ${accused} of ${Object.keys(results.honest).length}`)
console.log(`  fakes caught:    ${caught} of ${Object.keys(results.fake).length}`)

/*
 * A flag is not the only way to insult somebody. A low score on an honest
 * photo colours the whole review screen and is read as suspicion even with
 * no flag attached, so the scores are checked too.
 */
console.log('\n=== And the scores are not quietly damning either ===')
for (const [name, r] of Object.entries(results.honest)) {
  r.score >= 70
    ? pass(`${name} scores ${r.score}`)
    : fail(`${name} scores well`, `${r.score} — a parent reads that as doubt`)
}

finish(errors, fails, browser)
