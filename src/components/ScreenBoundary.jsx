import { Component } from 'react'
import { navigate } from '../lib/router.js'
import { reportCrash } from '../lib/crashReport.js'

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
    console.error('[RankUp] Screen crashed:', this.props.route, error, info?.componentStack)
    reportCrash({ where: this.props.route, error, componentStack: info?.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children

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
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => { this.setState({ error: null }); navigate('/') }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    )
  }
}
