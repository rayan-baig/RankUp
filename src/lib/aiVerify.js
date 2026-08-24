/**
 * Photo proof checking.
 *
 * IMPORTANT: this is an ADVISORY signal shown to the parent. It never approves
 * or rejects anything on its own — the parent always makes the final call. That
 * is a deliberate product rule, not a limitation: a false accusation from an
 * automated checker is far more damaging in a family app than a missed cheat.
 *
 * There are two layers:
 *
 *   1. On-device checks (always run, no API key, no upload, no cost).
 *      These catch the mechanical cheats: a screenshot, a photo of a screen, a
 *      re-used photo from a previous submission, a photo taken far from when the
 *      quest was opened, a lens covered by a thumb.
 *
 *   2. An optional Claude vision call (only if VITE_AI_VERIFY_URL is set and the
 *      serverless function in api/verify-photo.js is deployed with a key).
 *      This is the layer that answers "does this photo actually show a made bed?"
 */

import { toCanvas, greyscale, resizeGrey, dHash, hammingDistance, loadImage } from './imaging.js'

export const VERDICT = {
  LOOKS_GOOD: 'looks_good',
  NEEDS_REVIEW: 'needs_review',
  SUSPICIOUS: 'suspicious',
}

export const VERDICT_META = {
  [VERDICT.LOOKS_GOOD]: { label: 'Looks genuine', tone: 'good', icon: '✅' },
  [VERDICT.NEEDS_REVIEW]: { label: 'Worth a look', tone: 'warn', icon: '👀' },
  [VERDICT.SUSPICIOUS]: { label: 'Flagged', tone: 'bad', icon: '⚠️' },
}

/* ------------------------------------------------------------------ */
/* Layer 1 — on-device checks                                          */
/* ------------------------------------------------------------------ */

/** Sharpness via the variance of a 3×3 Laplacian. Low = blurry or a flat screen. */
function laplacianVariance(grey, width, height) {
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const v =
        -4 * grey[i] + grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width]
      sum += v
      sumSq += v * v
      n += 1
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** How much of the image is made of large flat colour areas — the screenshot tell. */
function flatnessRatio(grey, width, height) {
  let flat = 0
  let n = 0
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x
      const dx = Math.abs(grey[i] - grey[i + 1])
      const dy = Math.abs(grey[i] - grey[i + width])
      if (dx < 2 && dy < 2) flat += 1
      n += 1
    }
  }
  return n ? flat / n : 0
}

/** Long perfectly straight horizontal/vertical edges — UI chrome, not a bedroom. */
function axisAlignedEdgeScore(grey, width, height) {
  const colScore = new Float32Array(width)
  const rowScore = new Float32Array(height)
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const i = y * width + x
      if (Math.abs(grey[i] - grey[i - 1]) > 28) colScore[x] += 1
      if (Math.abs(grey[i] - grey[i - width]) > 28) rowScore[y] += 1
    }
  }
  let strongCols = 0
  let strongRows = 0
  for (let x = 0; x < width; x += 1) if (colScore[x] > height * 0.72) strongCols += 1
  for (let y = 0; y < height; y += 1) if (rowScore[y] > width * 0.72) strongRows += 1
  return (strongCols + strongRows) / ((width + height) * 0.5)
}

/** Colour spread. Screenshots and solid-colour fakes use very few distinct colours. */
function colourDiversity(rgba) {
  const buckets = new Set()
  for (let i = 0; i < rgba.length; i += 4 * 7) {
    const r = rgba[i] >> 4
    const g = rgba[i + 1] >> 4
    const b = rgba[i + 2] >> 4
    buckets.add((r << 8) | (g << 4) | b)
  }
  return buckets.size / 4096
}

function meanBrightness(grey) {
  let sum = 0
  for (let i = 0; i < grey.length; i += 1) sum += grey[i]
  return sum / grey.length
}

/**
 * Analyse a captured photo. `context` carries what we know about how it was
 * captured, which is often stronger evidence than the pixels themselves.
 */
export async function analyseLocally(dataUrl, context = {}) {
  const img = await loadImage(dataUrl)
  const canvas = toCanvas(img, 480)
  const g = greyscale(canvas)
  const small = { grey: resizeGrey(g, 160, 120), width: 160, height: 120 }

  const sharpness = laplacianVariance(small.grey, small.width, small.height)
  const flatness = flatnessRatio(small.grey, small.width, small.height)
  const straightEdges = axisAlignedEdgeScore(small.grey, small.width, small.height)
  const diversity = colourDiversity(g.rgba)
  const brightness = meanBrightness(small.grey)
  const hash = dHash(g)

  const flags = []
  let score = 100

  if (context.captureSource && context.captureSource !== 'live-camera') {
    flags.push({
      id: 'not-live-camera',
      severity: 'high',
      label: 'Not taken with the in-app camera',
      detail: 'This image came from the photo library rather than a live capture.',
    })
    score -= 45
  }

  if (sharpness < 12) {
    flags.push({
      id: 'very-blurry',
      severity: 'medium',
      label: 'Very blurry or out of focus',
      detail: 'Hard to tell what the photo shows. Could also be a covered lens.',
    })
    score -= 20
  }

  if (brightness < 18) {
    flags.push({
      id: 'too-dark',
      severity: 'medium',
      label: 'Almost entirely dark',
      detail: 'Looks like the camera was covered or pointed at nothing.',
    })
    score -= 25
  } else if (brightness > 244) {
    flags.push({
      id: 'blown-out',
      severity: 'low',
      label: 'Washed out',
      detail: 'The photo is very overexposed.',
    })
    score -= 10
  }

  if (flatness > 0.72 && diversity < 0.05) {
    flags.push({
      id: 'flat-image',
      severity: 'high',
      label: 'Looks like a screenshot or a solid image',
      detail: 'Large flat colour areas and very few distinct colours — typical of a screen grab rather than a room.',
    })
    score -= 35
  }

  if (straightEdges > 0.08 && flatness > 0.5) {
    flags.push({
      id: 'ui-edges',
      severity: 'medium',
      label: 'Screen-like straight edges detected',
      detail: 'Long perfectly straight lines across the whole frame suggest a user interface, not a physical scene.',
    })
    score -= 20
  }

  if (context.previousHashes?.length) {
    let best = 64
    let bestId = null
    let bestKidId = null
    for (const prev of context.previousHashes) {
      const d = hammingDistance(hash, prev.hash)
      if (d < best) {
        best = d
        bestId = prev.submissionId
        bestKidId = prev.kidId ?? null
      }
    }
    if (best <= 6) {
      const sameKid = !context.kidId || bestKidId === context.kidId
      flags.push({
        id: 'duplicate',
        severity: 'high',
        label: sameKid
          ? 'Nearly identical to an earlier submission'
          : "Nearly identical to another child's submission",
        detail: sameKid
          ? 'This looks like the same photo that was sent in before.'
          : 'This looks like a photo that was already submitted from a different kid profile in this family.',
        relatedSubmissionId: bestId,
      })
      score -= 50
    } else if (best <= 12) {
      flags.push({
        id: 'similar',
        severity: 'low',
        label: 'Similar to an earlier submission',
        detail: 'Could be the same spot photographed again — or genuinely the same chore repeated.',
        relatedSubmissionId: bestId,
      })
      score -= 8
    }
  }

  if (context.secondsSinceQuestOpened != null && context.secondsSinceQuestOpened < 4) {
    flags.push({
      id: 'instant',
      severity: 'low',
      label: 'Submitted within seconds of opening the quest',
      detail: 'Not proof of anything on its own, but unusually fast.',
    })
    score -= 6
  }

  return {
    layer: 'on-device',
    score: Math.max(0, Math.min(100, Math.round(score))),
    flags,
    hash,
    metrics: {
      sharpness: Math.round(sharpness),
      flatness: Number(flatness.toFixed(3)),
      straightEdges: Number(straightEdges.toFixed(3)),
      colourDiversity: Number(diversity.toFixed(3)),
      brightness: Math.round(brightness),
      width: img.naturalWidth,
      height: img.naturalHeight,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Layer 2 — optional Claude vision call                               */
/* ------------------------------------------------------------------ */

export const AI_ENDPOINT = import.meta.env?.VITE_AI_VERIFY_URL || ''

export function isCloudCheckConfigured() {
  return Boolean(AI_ENDPOINT)
}

async function askClaude(dataUrl, quest, signal) {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      imageDataUrl: dataUrl,
      questTitle: quest?.title || '',
      questDescription: quest?.description || '',
      doneMeans: quest?.doneMeans || '',
      adaptive: Boolean(quest?.adaptive),
    }),
  })
  if (!res.ok) throw new Error(`Photo check service returned ${res.status}`)
  return res.json()
}

/* ------------------------------------------------------------------ */
/* The combined check the app actually calls                           */
/* ------------------------------------------------------------------ */

/**
 * Run both layers and produce one advisory report for the parent.
 * Never throws: if the network layer fails we still return the on-device result
 * and say plainly that the cloud check did not run.
 */
export async function verifyPhoto(dataUrl, { quest, context = {}, timeoutMs = 20000 } = {}) {
  const local = await analyseLocally(dataUrl, context)

  let cloud = null
  let cloudError = null

  if (isCloudCheckConfigured()) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const raw = await askClaude(dataUrl, quest, controller.signal)
      cloud = normaliseCloudResult(raw)
    } catch (err) {
      cloudError = err.name === 'AbortError' ? 'The photo check timed out.' : err.message
    } finally {
      clearTimeout(timer)
    }
  }

  return buildReport({ local, cloud, cloudError, quest })
}

function normaliseCloudResult(raw) {
  const matches = raw?.matchesTask
  return {
    layer: 'claude-vision',
    matchesTask: matches === true ? 'yes' : matches === false ? 'no' : (raw?.matchesTask ?? 'unclear'),
    authenticity: raw?.authenticity ?? 'unclear',
    confidence: typeof raw?.confidence === 'number' ? Math.max(0, Math.min(100, raw.confidence)) : null,
    summary: raw?.summary || '',
    observations: Array.isArray(raw?.observations) ? raw.observations.slice(0, 6) : [],
    concerns: Array.isArray(raw?.concerns) ? raw.concerns.slice(0, 6) : [],
    model: raw?.model || null,
  }
}

function buildReport({ local, cloud, cloudError, quest }) {
  let score = local.score
  const flags = [...local.flags]

  if (cloud) {
    if (cloud.authenticity === 'likely_fake') {
      flags.push({
        id: 'cloud-authenticity',
        severity: 'high',
        label: 'AI thinks this may not be a real photo of the chore',
        detail: cloud.summary || 'The image looks like stock media, a screenshot, or a picture of a screen.',
      })
      score -= 40
    } else if (cloud.authenticity === 'unclear') {
      score -= 8
    }

    if (cloud.matchesTask === 'no') {
      flags.push({
        id: 'cloud-mismatch',
        severity: 'high',
        label: "Photo doesn't seem to show this task",
        detail: cloud.summary || 'The AI could not find the thing this quest asked for.',
      })
      score -= 30
    } else if (cloud.matchesTask === 'unclear') {
      flags.push({
        id: 'cloud-unclear',
        severity: 'low',
        label: 'AI could not tell if the task is done',
        detail: cloud.summary || 'Not enough of the scene is visible to judge.',
      })
      score -= 10
    }

    for (const concern of cloud.concerns) {
      flags.push({ id: `cloud-concern`, severity: 'low', label: concern, detail: '' })
    }
  }

  // Adaptive quests deliberately have a looser definition of "done", so the AI's
  // opinion on whether the task "matches" carries much less weight.
  if (quest?.adaptive) {
    score = Math.round(Math.min(100, score + 12))
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const hasHigh = flags.some((f) => f.severity === 'high')
  let verdict = VERDICT.LOOKS_GOOD
  if (hasHigh || score < 45) verdict = VERDICT.SUSPICIOUS
  else if (score < 78 || flags.length > 0) verdict = VERDICT.NEEDS_REVIEW

  return {
    score,
    verdict,
    flags,
    hash: local.hash,
    metrics: local.metrics,
    cloud,
    cloudError,
    cloudConfigured: isCloudCheckConfigured(),
    checkedAt: Date.now(),
    /** Always true. The parent decides; this report only informs them. */
    advisoryOnly: true,
  }
}

export function verdictSummary(report) {
  if (!report) return 'Not checked yet'
  const meta = VERDICT_META[report.verdict]
  return `${meta.icon} ${meta.label} · ${report.score}/100`
}
