import { useEffect, useMemo } from 'react'
import { parentHelp } from '../../data/parentHelp.js'
import { PRODUCT_OF } from '../../data/legalText.js'
import { SUPPORT_EMAIL } from '../../lib/support.js'
import { countHelpView } from '../../lib/usage.js'
import { APP_VERSION } from '../../lib/version.js'
import { Screen, Section, SectionTitle, Button, Card } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

/**
 * Help: the questions parents ask, answered from what the app really does.
 *
 * The words live in data/parentHelp.js, where every number is read from the
 * code that decides it. Linked from Settings → Help & about.
 */
export default function ParentHelp() {
  const sections = useMemo(() => parentHelp(), [])
  const email = SUPPORT_EMAIL || null
  // One to today's count of help page views: a number, nothing about who.
  useEffect(() => { countHelpView() }, [])

  return (
    <Screen>
      <button type="button" onClick={() => navigate('/parent/settings')} className="text-sm text-muted mb-2">
        ← Settings
      </button>
      <h1 className="font-display text-2xl font-extrabold mb-1">Help</h1>
      <p className="text-sm text-muted mb-4">Tap a question to see the answer.</p>

      {sections.map((section) => (
        <div key={section.id} className="mb-4" data-testid={`help-${section.id}`}>
          <SectionTitle>
            <span aria-hidden="true">{section.icon}</span> {section.title}
          </SectionTitle>
          {section.questions.map((item) => (
            <Section key={item.id} title={item.q}>
              <div data-testid={`help-answer-${item.id}`}>
                {item.a.map((line, i) => (
                  <p key={i} className="text-sm mb-2 last:mb-0">{line}</p>
                ))}
              </div>
              {item.to && (
                <Button variant="soft" className="w-full mt-3 text-sm" onClick={() => navigate(item.to.path)}>
                  {item.to.label}
                </Button>
              )}
            </Section>
          ))}
        </div>
      ))}

      <Card flat className="text-center">
        <p className="text-sm font-semibold mb-1">{email ? 'Still stuck?' : 'About RankUp'}</p>
        <p className="text-xs text-muted">
          {email ? <>Write to {email}. </> : null}
          {PRODUCT_OF} Version {APP_VERSION}.
        </p>
      </Card>
    </Screen>
  )
}
