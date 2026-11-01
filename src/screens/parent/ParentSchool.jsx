import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { navigate } from '../../lib/router.js'
import { schools, schoolError, demoMySchools, demoSchoolCard, DEMO_LEAGUE } from '../../lib/schools.js'
import { Screen, Card, Button, SectionTitle, Banner, TextInput, Modal, Toggle, DemoTag } from '../../components/ui.jsx'
import { SchoolHeadline, LeagueTable, RivalryList, StarList } from '../../components/SchoolParts.jsx'

/**
 * The School League, for a parent.
 *
 * Only a parent can put a child in a school; a school can never add anyone.
 * Joining asks one more question, and its answer is off unless the parent
 * turns it on: may the school show this child's first name if they make the
 * top ten? Without a yes they are "A student" on every list, and the child
 * still sees that the place is theirs.
 */
export default function ParentSchool() {
  const { state } = useApp()
  const demo = Boolean(state.demo)
  const [data, setData] = useState(null)
  const [league, setLeague] = useState({})
  const [open, setOpen] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [joinFor, setJoinFor] = useState(null)
  const [code, setCode] = useState('')
  const [share, setShare] = useState(false)

  const refresh = useCallback(async () => {
    if (demo) { setData((d) => d || demoMySchools(state.kids)); return }
    const res = await schools.mine()
    if (!res.ok) setError(schoolError(res.reason))
    else { setError(''); setData(res) }
  }, [demo, state.kids])

  useEffect(() => { refresh() }, [refresh])

  const showLeague = async (kidId, schoolId) => {
    if (open === kidId) { setOpen(null); return }
    setOpen(kidId)
    if (league[kidId]) return
    // The league call takes the child's school; the database checks it is a
    // school this family has a child in.
    const res = demo ? DEMO_LEAGUE : await schools.league(schoolId)
    if (res.ok) setLeague((l) => ({ ...l, [kidId]: res }))
    else setError(schoolError(res.reason))
  }

  const act = async (fn) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(schoolError(res.reason)); return false }
    setError('')
    await refresh()
    return true
  }

  const join = async () => {
    if (demo) {
      // The look-around has no real school to join; this shows what happens.
      setData((d) => ({
        ...d,
        children: d.children.map((c) => (c.kid_id === joinFor
          ? { ...c, show_name: share, school: demoSchoolCard() }
          : c)),
      }))
      setJoinFor(null)
      return
    }
    if (await act(() => schools.join(joinFor, code, share))) setJoinFor(null)
  }

  const setSharing = (kidId, show) => {
    if (demo) {
      setData((d) => ({ ...d, children: d.children.map((c) => (c.kid_id === kidId ? { ...c, show_name: show } : c)) }))
      return
    }
    act(() => schools.setNameSharing(kidId, show))
  }

  const leave = (kidId) => {
    if (demo) {
      setData((d) => ({ ...d, children: d.children.map((c) => (c.kid_id === kidId ? { ...c, school: null } : c)) }))
      return
    }
    act(() => schools.leave(kidId))
  }

  const children = data?.children || []

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">School League</p>
        <h1 className="font-display text-2xl font-extrabold">Your children’s schools</h1>
        <p className="text-sm text-muted">
          Chores done at home count for their school. The best school in the district is
          crowned each month, rival schools go head to head, and the top ten students are
          the school’s Stars.
        </p>
      </header>

      {demo && (
        <Banner tone="info" icon="👀" title="A sample school" className="mb-3">
          In the look-around, Ava is in a made-up school so you can see how it works.
        </Banner>
      )}
      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}
      {!data && !error && <Card className="mb-3"><p className="text-sm text-muted">Loading…</p></Card>}

      {children.map((c) => (
        <section key={c.kid_id} className="mb-5">
          <SectionTitle>{c.kid_name}</SectionTitle>
          {!c.school ? (
            <Card className="mb-3">
              <p className="text-sm mb-3">
                {c.kid_name} is not in a school league. If their school takes part, it will
                have given you a six-letter code.
              </p>
              <Button className="w-full" onClick={() => { setJoinFor(c.kid_id); setCode(''); setShare(false) }}>
                Join {c.kid_name}’s school
              </Button>
            </Card>
          ) : (
            <>
              <SchoolHeadline school={c.school} demo={demo} />
              <Card flat className="mb-3">
                <Toggle
                  checked={c.show_name}
                  onChange={(v) => setSharing(c.kid_id, v)}
                  label={`Show ${c.kid_name}’s first name if they are a Star`}
                  hint="Only the first name, only inside this school. Off: they show as “A student”."
                />
              </Card>
              <RivalryList rivalries={c.school.rivalries} />
              <StarList stars={c.school.stars} monthKey={c.school.stars_month} />
              <Button variant="soft" className="w-full mb-2" onClick={() => showLeague(c.kid_id, c.school.school_id)}>
                {open === c.kid_id ? 'Hide the district league' : 'See the district league'}
              </Button>
              {open === c.kid_id && league[c.kid_id] && <LeagueTable league={league[c.kid_id]} demo={demo} />}
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => leave(c.kid_id)}>
                Take {c.kid_name} out of the school league
              </Button>
            </>
          )}
        </section>
      ))}

      <Card flat className="mb-3">
        <p className="text-sm font-semibold mb-1">What the school can see</p>
        <p className="text-xs text-muted">
          How many students have joined, and its top ten each month: a first name only where a
          parent said yes. Never a list of your children, never their chores, photos or anything
          else. Other schools see the school’s name and score, and nothing about any child.
        </p>
      </Card>

      <button type="button" className="w-full text-xs underline text-muted py-2" onClick={() => navigate('/school')}>
        Are you a teacher or principal? Sign your school up →
      </button>

      <Modal
        open={Boolean(joinFor)}
        onClose={() => setJoinFor(null)}
        title="Join a school"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setJoinFor(null)}>Cancel</Button>
            <Button className="flex-1" disabled={(!demo && code.trim().length !== 6) || busy} onClick={join}>
              Join
            </Button>
          </>
        }
      >
        <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                   placeholder="ABC234" maxLength={6} autoFocus aria-label="School code"
                   style={{ letterSpacing: '0.3em', textAlign: 'center', textTransform: 'uppercase' }} />
        <div className="mt-3">
          <Toggle checked={share} onChange={setShare}
                  label="Show their first name if they are a Star"
                  hint="You can change this any time." />
        </div>
        {demo && <p className="text-xs text-muted mt-2"><DemoTag /> Any code works in the look-around.</p>}
      </Modal>
    </Screen>
  )
}
