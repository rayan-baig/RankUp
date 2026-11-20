import { PRIVACY_POLICY, TERMS } from '../data/legalText.js'
import { useApp } from '../state/AppContext.jsx'
import { Screen, Card, Button, SectionTitle } from '../components/ui.jsx'
import { navigate } from '../lib/router.js'
import { legalBack } from '../lib/support.js'

/**
 * The privacy policy and terms, readable on a phone.
 *
 * No "not finished" banner here: these pages are public. The reminder to fill
 * in the company's postal address is the owner's (docs/LAUNCH.md section 5,
 * and the operator page), and until it is filled in the pages give the email
 * address in its place.
 */
export default function LegalDoc({ which }) {
  const { state } = useApp()
  const doc = which === 'terms' ? TERMS : PRIVACY_POLICY
  const back = legalBack(state)

  return (
    <Screen>
      <button type="button" onClick={() => navigate(back.to)} className="tap-link text-sm text-muted mb-1 -ml-1" data-testid="legal-back">
        {back.label}
      </button>
      <h1 className="font-display text-2xl font-extrabold mb-1">{doc.title}</h1>
      <p className="text-sm text-muted mb-4">{doc.intro}</p>

      <div className="mt-3">
        {doc.sections.map((section) => (
          <Card key={section.heading} flat className="mb-2.5">
            <SectionTitle>{section.heading}</SectionTitle>
            <div className="space-y-2">
              {section.body.map((line, i) => (
                <p key={i} className="text-sm text-muted">{line}</p>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="soft" className="flex-1" onClick={() => navigate('/legal/privacy')}>Privacy</Button>
        <Button variant="soft" className="flex-1" onClick={() => navigate('/legal/terms')}>Terms</Button>
      </div>
    </Screen>
  )
}
