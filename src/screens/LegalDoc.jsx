import { PRIVACY_POLICY, TERMS, UNFILLED } from '../data/legalText.js'
import { Screen, Card, Button, SectionTitle, Banner } from '../components/ui.jsx'
import { navigate } from '../lib/router.js'

const FIELD_NAMES = { name: 'name', email: 'contact email', address: 'postal address' }

/** The privacy policy and terms, readable on a phone. */
export default function LegalDoc({ which }) {
  const doc = which === 'terms' ? TERMS : PRIVACY_POLICY
  const unfilled = UNFILLED.length > 0

  return (
    <Screen>
      <button type="button" onClick={() => navigate('/parent/settings')} className="text-sm text-muted mb-2">
        ← Settings
      </button>
      <h1 className="font-display text-2xl font-extrabold mb-1">{doc.title}</h1>
      <p className="text-sm text-muted mb-4">{doc.intro}</p>

      {unfilled && (
        <Banner tone="warn" icon="✏️" title="Not finished">
          Still to fill in: the company&apos;s {UNFILLED.map((k) => FIELD_NAMES[k] || k).join(' and ')} (src/data/legalText.js).
          Have a lawyer read this before you publish it.
        </Banner>
      )}

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
