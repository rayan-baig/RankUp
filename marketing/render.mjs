/**
 * Cuts the raw recordings from reels.mjs into finished 1080x1920 clips.
 *
 * Reads marketing/clips/raw/{marks,sources}.json — the scene timestamps and
 * which recording belongs to which device — so you can re-cut the captions or
 * the framing without re-running the browser.
 *
 *   node marketing/render.mjs
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const OUT = process.env.REEL_DIR || 'marketing/clips'
const RAW = path.join(OUT, 'raw')
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
const marks = JSON.parse(await readFile(path.join(RAW, 'marks.json'), 'utf8'))
const paths = new Map(Object.entries(JSON.parse(await readFile(path.join(RAW, 'sources.json'), 'utf8'))))

/* ------------------------------------------------------------------ *
 * ffmpeg: phone screen -> 1080x1920 with a burnt-in caption
 * ------------------------------------------------------------------ */
const PHONE_W = 720
const PHONE_H = Math.round((PHONE_W * 844) / 390)
const PHONE_Y = 300
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019")

const CLIPS = [
  { file: '01-proof', tag: 'kid', from: 'proof.in', to: 'proof.out',
    lines: ['NO MORE "I DID IT"', 'the app checks the photo'] },
  { file: '02-approve', tag: 'parent', from: 'review.in', to: 'review.out',
    lines: ['you see the proof', 'one tap and they get paid'] },
  { file: '03-payout', tag: 'kid', from: 'payout.in', to: 'payout.out',
    lines: ['chores = XP', 'XP = skins they actually want'] },
  { file: '04-arcade', tag: 'kid', from: 'arcade.in', to: 'arcade.out',
    lines: ['finish a chore', 'unlock the arcade'] },
  { file: '05-assign', tag: 'parent', from: 'assign.in', to: 'assign.out',
    lines: ['a whole week of chores', 'assigned in one tap'] },
]

const at = (tag, name) => marks.find((m) => m.tag === tag && m.name === name)?.at
const made = []
for (const c of CLIPS) {
  const from = at(c.tag, c.from); const to = at(c.tag, c.to)
  if (from == null || to == null) { console.log(`  skip ${c.file} (no marks)`); continue }
  const dur = +(to - from).toFixed(2)
  const dest = path.join(OUT, `${c.file}.mp4`)
  const text = c.lines.map((line, i) =>
    `drawtext=fontfile=${FONT}:text='${esc(line.toUpperCase())}':fontcolor=${i ? '0xC9C4FF' : 'white'}` +
    `:fontsize=${i ? 46 : 62}:x=(w-text_w)/2:y=${i ? 172 : 92}`).join(',')
  const filter =
    `[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS,scale=${PHONE_W}:${PHONE_H},setsar=1[ph];` +
    `gradients=s=1080x1920:c0=0x241653:c1=0x08070F:x0=540:y0=0:x1=540:y1=1920:d=${Math.ceil(dur) + 1}:speed=0.00001[bg];` +
    `[bg]trim=duration=${dur},setpts=PTS-STARTPTS,` +
    `drawbox=x=${(1080 - PHONE_W) / 2 - 5}:y=${PHONE_Y - 5}:w=${PHONE_W + 10}:h=${PHONE_H + 10}:color=0x7C5CFF@0.9:t=5[frame];` +
    `[frame][ph]overlay=(W-w)/2:${PHONE_Y}[withphone];[withphone]${text},fps=30,format=yuv420p[v]`
  await run('ffmpeg', ['-y', '-i', paths.get(c.tag), '-filter_complex', filter, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', dest])
  made.push({ dest, dur })
  console.log(`  ${c.file}.mp4  ${dur}s`)
}

if (made.length) {
  const list = path.join(RAW, 'concat.txt')
  await writeFile(list, made.map((m) => `file '${path.resolve(m.dest)}'`).join('\n'))
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy',
    '-movflags', '+faststart', path.join(OUT, '00-full.mp4')])
  const total = made.reduce((s, m) => s + m.dur, 0)
  console.log(`  00-full.mp4  ${total.toFixed(1)}s`)
}
console.log('\nfiles in', OUT + ':')
console.log((await readdir(OUT)).filter((f) => f.endsWith('.mp4')).sort().map((f) => '  ' + f).join('\n'))
