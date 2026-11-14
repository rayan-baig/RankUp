import { Component } from 'react'
import { navigate, homeFor } from '../lib/router.js'
import { reportCrash } from '../lib/crashReport.js'
import { retryFailedLoads } from '../lib/lazy.js'

/**
 * A screen whose code could not be downloaded, rather than one that broke.
 *
 * Each screen arrives the first time it is opened (lib/lazy.js), and the
 * service worker keeps it after that. A phone with no signal opening one it
 * has never fetched gets this error, and "this screen broke, our fault" was
 * the wrong thing to tell it: nothing broke, the phone needs the internet
 * once. Browsers word it differently, so this matches all three, and a phone
 * that says it is offline counts too.
 */
export function isOfflineLoadError(error, online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  const text = String(error?.message || error || '')
  const loadFailed = /dynamically imported module|importing a module script failed|failed to fetch|load failed|networkerror/i.test(text)
  return loadFailed || (online === false && /fetch|import|module|network|load/i.test(text))
}

/**
 * A crash barrier around ONE screen.
 *
 * The boundary in main.jsx catches everything, which means a bug on any single
 * screen takes down the entire app: the navigation goes, the theme goes, and a
 * kid halfway through a quest gets a full-screen apology. Nearly every crash is
 * one screen's fault, and the rest of the app is still perfectly usable.
 *
 * So this sits inside the chrome. The tab bar survives, and — because it is
 * keyed on the route in App.jsx — walking away from the broken screen and
 * coming back gives it a clean mount. Most of the time that is genuinely the
 * fix: the crash was a bad bit of state for one render, not a dead app.
 *
 * It also reports, once per mount. Nobody files a bug report about a children's
 * chore app; they uninstall it. See lib/crashReport.js.
 */
export default class ScreenBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Not a bug, and nothing to report: the phone had no internet.
    if (isOfflineLoadError(error)) return
    console.error('[RankUp] Screen crashed:', this.props.route, error, info?.componentStack)
    reportCrash({ where: this.props.route, error, componentStack: info?.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children

    if (isOfflineLoadError(this.state.error)) {
      return (
        <div className="shell px-4 py-10" data-testid="offline-screen">
          <div className="card p-5 text-center">
            <div className="text-4xl mb-2" aria-hidden="true">📡</div>
            <h1 className="font-display text-xl font-extrabold mb-1">No internet right now</h1>
            <p className="text-sm text-muted mb-4">
              This part of RankUp needs the internet the first time it opens. Everything you have
              done is saved on this phone. Connect, then tap Try again.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-soft flex-1"
                onClick={() => { retryFailedLoads(); this.setState({ error: null }); navigate(homeFor(this.props.route)) }}
              >
                Go home
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => { retryFailedLoads(); this.setState({ error: null }) }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="shell px-4 py-10">
        <div className="card p-5 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">🛠️</div>
          <h1 className="font-display text-xl font-extrabold mb-1">This screen broke</h1>
          <p className="text-sm text-muted mb-4">
            Sorry — our fault, not yours. <strong>Nothing has been lost.</strong> The rest of the
            app still works, so you can carry on somewhere else.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-soft flex-1"
              onClick={() => { retryFailedLoads(); this.setState({ error: null }) }}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => { retryFailedLoads(); this.setState({ error: null }); navigate(homeFor(this.props.route)) }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    )
  }
}
