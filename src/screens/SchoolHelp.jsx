import { useEffect, useMemo } from 'react'
import { schoolHelp } from '../data/schoolHelp.js'
import { PRODUCT_OF } from '../data/legalText.js'
import { SUPPORT_EMAIL } from '../lib/support.js'
import { countHelpView } from '../lib/usage.js'
import { Screen, Section, Card } from '../components/ui.jsx'
import { navigate } from '../lib/router.js'

/**
 * Help for schools: what principals and teachers ask, answered from what the
 * School League really does. The words and numbers live in data/schoolHelp.js.
 * Reachable without an account, from the School League's front page and from
 * a school's own page.
 */
export default function SchoolHelp() {
  const questions = useMemo(() => schoolHelp(), [])
  const email = SUPPORT_EMAIL || null
  // One to today's count of help page views: a number, nothing about who.
  useEffect(() => { countHelpView() }, [])
  return (
    <Screen>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">RankUp for schools</p>
          <h1 className="font-display text-2xl font-extrabold">Questions from schools</h1>
        </div>
        <button type="button" className="text-xs underline text-muted mt-1 shrink-0" onClick={() => navigate('/school')}>
          ← The School League
        </button>
      </header>
      <p className="text-sm text-muted mb-3">Tap a question to see the answer.</p>
      {questions.map((item) => (
        <Section key={item.id} title={item.q}>
          <div data-testid={`school-help-${item.id}`}>
            {item.a.map((line, i) => <p key={i} className="text-sm mb-2 last:mb-0">{line}</p>)}
          </div>
        </Section>
      ))}
      <Card flat className="text-center mt-2">
        <p className="text-sm font-semibold mb-1">{email ? 'Still stuck?' : 'About RankUp'}</p>
        <p className="text-xs text-muted">{email ? <>Write to {email}. </> : null}{PRODUCT_OF}</p>
      </Card>
    </Screen>
  )
}
