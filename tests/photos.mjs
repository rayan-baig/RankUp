/**
 * The photo must survive the gap between arriving and being claimed.
 *
 * A picture taken on the child's phone travels inside the submission row. The
 * provider writes it into this device's photo store and THEN dispatches an
 * action to point the submission at it — two steps, with a debounced save
 * running on a timer in between. The sweep that deletes photos nothing points
 * at would see the new one, decide it was rubbish, and delete it. The parent
 * opens the review screen to approve their child's chore and the picture is
 * gone.
 *
 * The other half of this test matters just as much and pulls the other way:
 * approving a chore is what DELETES the photo, and that must keep working. A
 * picture of the inside of a child's home is not something to keep because a
 * fix for one bug was written too broadly.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { putPhoto, getPhoto, purgeOrphanPhotos } = await import('../src/lib/storage.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== A photo that has arrived but not been claimed is kept ===')
// Exactly the state the pull leaves behind: the row carries the image, and
// nothing points at the stored copy yet.
putPhoto('photo_sub1', 'data:image/jpeg;base64,AAAA')
purgeOrphanPhotos({ submissions: [{ id: 'sub1', photoData: 'data:image/jpeg;base64,AAAA', photoId: null }] })
ok('the picture is still there for the parent to review', getPhoto('photo_sub1') !== null)

console.log('\n=== Once claimed, it is kept for the ordinary reason ===')
purgeOrphanPhotos({ submissions: [{ id: 'sub1', photoData: null, photoId: 'photo_sub1' }] })
ok('a photo the submission points at is kept', getPhoto('photo_sub1') !== null)

console.log('\n=== Approving the chore still destroys it ===')
// Approval clears photoData and photoId together; the sweep is what actually
// removes the image from the device.
purgeOrphanPhotos({ submissions: [{ id: 'sub1', status: 'approved', photoData: null, photoId: null }] })
ok('the photo is deleted when the parent is done with it', getPhoto('photo_sub1') === null)

console.log('\n=== And a photo whose submission is gone entirely goes too ===')
putPhoto('photo_sub2', 'data:image/jpeg;base64,BBBB')
const removed = purgeOrphanPhotos({ submissions: [] })
ok('deleting a kid or a quest takes their pictures with it', getPhoto('photo_sub2') === null)
ok('and it says how many it removed', removed === 1, `removed ${removed}`)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
