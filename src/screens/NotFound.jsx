import { useRoute, navigate, homeFor } from '../lib/router.js'
import { Button, Card } from '../components/ui.jsx'

/**
 * A link to a screen that does not exist: an old bookmark, a typo, a screen
 * that has since moved. It used to show the profile switcher instead, which
 * looked like being thrown out. This says what happened and offers the way
 * home for whichever side of the app the link pointed into.
 */
export default function NotFound() {
  const { path } = useRoute()
  const home = homeFor(path)
  return (
    <div className="shell px-4 py-10" data-testid="not-found">
      <Card className="text-center p-5">
        <div className="text-4xl mb-2" aria-hidden="true">🧭</div>
        <h1 className="font-display text-xl font-extrabold mb-1">We can&apos;t find that page</h1>
        <p className="text-sm text-muted mb-4">
          The link may be old, or have a typo in it. Nothing has been lost.
        </p>
        <Button className="w-full" onClick={() => navigate(home)}>Go home</Button>
      </Card>
    </div>
  )
}
