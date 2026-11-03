/**
 * The rules for "Add to Home Screen" (src/lib/installPrompt.js), every case,
 * with nothing running. tests/installprompt.mjs plays them in a browser.
 */
import { readFileSync } from 'node:fs'
import { installCard, hasAcceptedChore, isIos } from '../src/lib/installPrompt.js'

const fails = []
const ok = (n, cond, d = '') => {
  if (cond) console.log('  PASS', n)
  else { fails.push(n); console.log('  FAIL', n, '—', d) }
}

const parent = (subs = [{ status: 'approved' }], extra = {}) => ({
  demo: false, device: { role: 'parent' }, session: { role: 'parent' }, submissions: subs, ...extra,
})
const chrome = { prompt() {}, userChoice: Promise.resolve() }
const env = (o = {}) => ({ event: null, standalone: false, ios: false, answered: false, ...o })

console.log('\n=== When ===')
ok('not before any chore is accepted', installCard(parent([]), env({ event: chrome })) === null)
ok('not while the only chore is waiting, or was sent back',
  installCard(parent([{ status: 'pending' }, { status: 'rejected' }]), env({ event: chrome })) === null)
ok('after the first accepted chore, with Chrome\'s offer kept: the button', installCard(parent(), env({ event: chrome })) === 'install')
ok('on an iPhone: the steps', installCard(parent(), env({ ios: true })) === 'ios')
ok('Chrome\'s own offer wins where there is one', installCard(parent(), env({ ios: true, event: chrome })) === 'install')
ok('a browser that cannot install is not asked', installCard(parent(), env()) === null)
ok('hasAcceptedChore reads the synced submissions', hasAcceptedChore(parent()) && !hasAcceptedChore({}) && !hasAcceptedChore(null))

console.log('\n=== Once ===')
ok('not once answered', installCard(parent(), env({ event: chrome, answered: true })) === null)
ok('not when already opened from the home screen', installCard(parent(), env({ ios: true, standalone: true })) === null)

console.log('\n=== Never for a child ===')
ok('never on a child\'s own phone', installCard(parent(undefined, { device: { role: 'kid' } }), env({ event: chrome, ios: true })) === null)
ok('never while a child is playing on a parent\'s phone',
  installCard(parent(undefined, { session: { role: 'kid', kidId: 'k1' } }), env({ event: chrome })) === null)
ok('nor in the look-around family', installCard(parent(undefined, { demo: true }), env({ event: chrome })) === null)
ok('nor with nothing set up', installCard(null, env({ event: chrome })) === null)

console.log('\n=== Which phone ===')
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 Version/15.6 Mobile/15E148 Safari/604.1' }
const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', maxTouchPoints: 5 }
const mac = { userAgent: ipad.userAgent, maxTouchPoints: 0 }
const android = { userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 Chrome/96.0 Mobile Safari/537.36' }
ok('an iPhone is an iPhone', isIos(iphone))
ok('an iPad that says it is a Mac is an iPad', isIos(ipad))
ok('a Mac is not', !isIos(mac))
ok('nor is Android', !isIos(android))

console.log('\n=== Where ===')
const kidHome = readFileSync('src/screens/kid/KidHome.jsx', 'utf8')
const dashboard = readFileSync('src/screens/parent/ParentDashboard.jsx', 'utf8')
const main = readFileSync('src/main.jsx', 'utf8')
ok('no child\'s screen shows it', !/InstallPrompt/.test(kidHome)
  && !readFileSync('src/App.jsx', 'utf8').includes('InstallPrompt'))
ok('the parent\'s dashboard does', /<InstallPrompt \/>/.test(dashboard))
ok('Chrome\'s offer is caught as the app starts, before any screen', /listenForInstall\(\)/.test(main))

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
