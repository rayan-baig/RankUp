/**
 * Renders every raster asset from the SVGs in public/.
 *
 *   node icons.mjs
 *
 * Chromium does the drawing, because it is the thing that will draw the SVGs
 * on the real site — so what you see here is what a browser will show, rather
 * than what a second, differently-opinionated renderer thinks the file means.
 * There is no ImageMagick or rsvg in this project on purpose: one renderer,
 * one answer.
 *
 * Everything written here is generated. Edit the SVG, re-run this, commit both.
 */
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PUB = 'public'
const read = (f) => readFile(path.join(PUB, f), 'utf8')

/** src, out, size — square app icons and favicons. */
const ICONS = [
  ['icon.svg', 'favicon-16.png', 16],
  ['icon.svg', 'favicon-32.png', 32],
  ['icon.svg', 'favicon-48.png', 48],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'icon-1024.png', 1024],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
]

/** src, out, width, height, background — wide lockups and social cards. */
const WIDE = [
  ['logo-wordmark.svg', 'logo-wordmark.png', 1640, 400, 'transparent'],
  ['logo-wordmark-dark.svg', 'logo-wordmark-dark.png', 1640, 400, 'transparent'],
  ['logo-stacked.svg', 'logo-stacked.png', 960, 760, 'transparent'],
]

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await b.newPage({ deviceScaleFactor: 1 })

async function shoot(svg, out, w, h, bg) {
  await page.setViewportSize({ width: w, height: h })
  // Scoped to the top-level element on purpose: an unscoped `svg` rule also
  // resizes an SVG nested inside a composed card, which silently crops it.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:${bg}}` +
    `body>svg{display:block;width:${w}px;height:${h}px}</style>${svg}`,
    { waitUntil: 'load' },
  )
  await page.screenshot({ path: path.join(PUB, out), omitBackground: bg === 'transparent' })
  console.log(`  ${out}  ${w}x${h}`)
}

for (const [src, out, size] of ICONS) await shoot(await read(src), out, size, size, 'transparent')
for (const [src, out, w, h, bg] of WIDE) await shoot(await read(src), out, w, h, bg)

/**
 * The social card. Every link the app is ever pasted into — a text message, a
 * TikTok bio, a Facebook post — renders this, so it is the first thing most
 * people will ever see of RankUp. 1200x630 is what all of them crop to.
 */
const stacked = await read('logo-stacked.svg')
await shoot(
  `<div style="width:1200px;height:630px;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(120% 100% at 30% 0%, #3B1E8F 0%, #150A38 55%, #08061A 100%)">
     <div style="width:660px">${stacked.replace('<svg', '<svg style="width:100%;height:auto"')}</div>
   </div>`,
  'og-image.png', 1200, 630, '#08061A',
)

/**
 * A favicon.ico so browsers, bookmark bars and Windows shortcuts that still ask
 * for one get a real answer instead of a 404. Hand-built: an ICO is a small
 * header plus, in this case, one embedded PNG per size.
 */
const sizes = [16, 32, 48]
const pngs = await Promise.all(sizes.map((s) => readFile(path.join(PUB, `favicon-${s}.png`))))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((s, i) => {
  const e = 6 + 16 * i
  header.writeUInt8(s === 256 ? 0 : s, e)      // width
  header.writeUInt8(s === 256 ? 0 : s, e + 1)  // height
  header.writeUInt8(0, e + 2)                  // palette size: none, it is a PNG
  header.writeUInt8(0, e + 3)                  // reserved
  header.writeUInt16LE(1, e + 4)               // colour planes
  header.writeUInt16LE(32, e + 6)              // bits per pixel
  header.writeUInt32LE(pngs[i].length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += pngs[i].length
})
await writeFile(path.join(PUB, 'favicon.ico'), Buffer.concat([header, ...pngs]))
console.log(`  favicon.ico  ${sizes.join('/')}`)

await b.close()
