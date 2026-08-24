/**
 * Small image utilities used by the camera and the photo checks.
 * Everything here runs in the browser — no upload required.
 */

/** Draw an image source into an offscreen canvas at a bounded size. */
export function toCanvas(source, maxSide = 720) {
  const w = source.videoWidth || source.naturalWidth || source.width
  const h = source.videoHeight || source.naturalHeight || source.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function canvasToJpeg(canvas, quality = 0.72) {
  return canvas.toDataURL('image/jpeg', quality)
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Greyscale luminance array plus dimensions, used by all the checks below. */
export function greyscale(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const grey = new Float32Array(canvas.width * canvas.height)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  }
  return { grey, width: canvas.width, height: canvas.height, rgba: data }
}

/** Downscale a greyscale buffer with simple box averaging. */
export function resizeGrey({ grey, width, height }, outW, outH) {
  const out = new Float32Array(outW * outH)
  const xRatio = width / outW
  const yRatio = height / outH
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const x0 = Math.floor(x * xRatio)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio))
      const y0 = Math.floor(y * yRatio)
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio))
      let sum = 0
      let count = 0
      for (let yy = y0; yy < y1 && yy < height; yy += 1) {
        for (let xx = x0; xx < x1 && xx < width; xx += 1) {
          sum += grey[yy * width + xx]
          count += 1
        }
      }
      out[y * outW + x] = count ? sum / count : 0
    }
  }
  return out
}

/**
 * 64-bit difference hash. Two photos of the same thing produce hashes a few
 * bits apart; unrelated photos are typically 25+ bits apart.
 */
export function dHash(greyData) {
  const w = 9
  const h = 8
  const small = resizeGrey(greyData, w, h)
  let bits = ''
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      bits += small[y * w + x] < small[y * w + x + 1] ? '1' : '0'
    }
  }
  return bits
}

export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 64
  let d = 0
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1
  return d
}
