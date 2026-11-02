/**
 * A phone that ran an older RankUp, opened in this one.
 *
 * Older versions took proof photos, kept them in their own bucket in the
 * phone's storage, and wrote the photo check's verdict onto each submission.
 * RankUp takes no photos now. Pictures of a child's room must not sit on a
 * phone for ever because nothing reads them any more: the first start of this
 * version deletes the bucket and the photo fields, and keeps everything else.
 */
import { launch, reporter, finish, BASE } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.setItem('rankup.photos.v1', JSON.stringify({ photo_s1: 'data:image/jpeg;base64,AAAA' }))
  localStorage.setItem('rankup.state.v1', JSON.stringify({
    onboarded: false,
    submissions: [{
      id: 's1', questId: 'q1', kidId: 'k1', status: 'pending', note: 'done it',
      photoId: 'photo_s1', photoData: 'data:image/jpeg;base64,AAAA', hasPhoto: true, hash: 'ff00',
      captureSource: 'live-camera', report: { verdict: 'looks_good', score: 90 },
    }],
  }))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const after = await page.evaluate(() => ({
  photos: localStorage.getItem('rankup.photos.v1'),
  state: JSON.parse(localStorage.getItem('rankup.state.v1') || '{}'),
}))
const sub = after.state.submissions?.[0] || {}

after.photos === null
  ? pass('the old photo bucket is deleted from the phone')
  : fail('old photo bucket deleted', after.photos.slice(0, 60))
const left = ['photoId', 'photoData', 'hasPhoto', 'hash', 'captureSource', 'report'].filter((k) => k in sub)
left.length === 0
  ? pass('and the photo and photo-check fields are gone from the saved submission')
  : fail('photo fields gone', left.join(', '))
sub.id === 's1' && sub.note === 'done it' && sub.status === 'pending'
  ? pass('while the submission itself is kept as it was')
  : fail('submission kept', JSON.stringify(sub))

finish(errors, fails, browser)
