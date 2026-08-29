import { Component } from 'react'

/**
 * What a person sees when the app crashes.
 *
 * Without this, a React error unmounts everything and leaves a white screen —
 * on a phone, indistinguishable from the app being broken for ever. A parent
 * mid-approval needs to know their data is safe and what to do next.
 *
 * It deliberately offers "try again" before "reload", and never offers to clear
 * data: a crash is not a reason to delete a family's history.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[RankUp] Crash:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const details = [
      this.state.error?.message,
      this.state.info?.componentStack?.split('\n').slice(0, 4).join('\n'),
    ]
      .filter(Boolean)
      .join('\n')

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg, #0b1020)',
          color: 'var(--ink, #e8f0ff)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }} aria-hidden="true">🛠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Something broke</h1>
          <p style={{ opacity: 0.75, fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
            Sorry — that is our fault, not yours. <strong>Nothing has been lost.</strong> Your
            family's quests, photos and XP are all still saved.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => this.setState({ error: null, info: null })}
              style={btn('transparent', 'var(--ink, #e8f0ff)')}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => { window.location.hash = '/'; window.location.reload() }}
              style={btn('var(--accent, #3fe0ff)', 'var(--bg, #0b1020)')}
            >
              Reload the app
            </button>
          </div>

          <details style={{ textAlign: 'left', fontSize: 12, opacity: 0.6 }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 }}>
              {details}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}

const btn = (background, color) => ({
  flex: 1,
  padding: '14px 16px',
  borderRadius: 14,
  border: '1px solid var(--line, #2b3f7d)',
  background,
  color,
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
})
