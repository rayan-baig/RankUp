import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { navigate } from '../../lib/router.js'
import { schools, DEMO_LEAGUE } from '../../lib/schools.js'
import { Screen, Card } from '../../components/ui.jsx'
import { SchoolHeadline, LeagueTable, RivalryList, StarList } from '../../components/SchoolParts.jsx'
import { useKidSchool } from './useKidSchool.js'

/*
 * A child's own school page. They see their school's place in the district,
 * its rivals, and whether they are a School Star. They cannot join or leave:
 * that is a parent's decision, made on the parent's side.
 */

export default function KidSchool() {
  const { state } = useApp()
  const kid = state.kids.find((k) => k.id === state.session.kidId) || state.kids[0]
  const school = useKidSchool(kid)
  const [league, setLeague] = useState(null)
  const demo = Boolean(state.demo)

  useEffect(() => {
    if (!school) return
    if (demo) setLeague(DEMO_LEAGUE)
    else schools.league(school.school_id).then((res) => res.ok && setLeague(res))
  }, [school, demo])

  if (school === undefined) {
    return <Screen><Card><p className="text-sm text-muted">Loading your school…</p></Card></Screen>
  }
  if (!school) {
    return (
      <Screen>
        <Card className="text-center">
          <div className="text-4xl mb-2" aria-hidden="true">🏫</div>
          <h1 className="font-display font-bold text-lg mb-1">No school league yet</h1>
          <p className="text-sm text-muted">
            If your school plays, ask a grown-up to add you. Your chores will count for your school.
          </p>
        </Card>
        <button type="button" className="w-full text-xs underline text-muted mt-4" onClick={() => navigate('/kid')}>Back</button>
      </Screen>
    )
  }

  const me = (school.stars || []).find((s) => s.you)
  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">My school</p>
        <h1 className="font-display text-2xl font-extrabold">School League</h1>
      </header>

      {me && (
        <Card className="mb-3 text-center" style={{ borderColor: 'var(--accent)' }}>
          <div className="text-4xl mb-1" aria-hidden="true">🌟</div>
          <p className="font-display font-extrabold text-lg">You are a School Star!</p>
          <p className="text-sm text-muted">Number {me.rank} in your whole school last month, with {me.score} points.</p>
        </Card>
      )}

      <SchoolHeadline school={school} demo={demo} />
      <Card flat className="mb-3">
        <p className="text-sm">
          Every chore a grown-up approves is a point for your school, up to eight a day. Help
          your school beat its rivals and become District Champion!
        </p>
      </Card>
      <RivalryList rivalries={school.rivalries} />
      <StarList stars={school.stars} monthKey={school.stars_month} />
      {league && <LeagueTable league={league} demo={demo} />}
    </Screen>
  )
}
