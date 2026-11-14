import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { schools, demoMySchools } from '../../lib/schools.js'

/*
 * Kept apart from KidSchool.jsx because the home screen asks it too. Imported
 * from there, the home screen pulled the whole school page and its league
 * tables into the first download just to read one card.
 */

// One answer per child per visit to the app, rather than a request every time
// the home screen draws.
const cache = new Map()

/** This child's school card, or null if they are not in one. */
export function useKidSchool(kid) {
  const { state } = useApp()
  const demo = Boolean(state.demo)
  const key = kid ? `${demo ? 'demo' : 'live'}:${kid.id}` : null
  const [school, setSchool] = useState(() => (key ? cache.get(key) : undefined))

  useEffect(() => {
    if (!kid || cache.has(key)) { setSchool(cache.get(key)); return undefined }
    let live = true
    const get = demo
      ? Promise.resolve(demoMySchools(state.kids, kid.id))
      : schools.mine()
    get.then((res) => {
      const mine = res.ok ? (res.children || []).find((c) => c.kid_id === kid.id) : null
      const value = mine?.school || null
      // A failed request is not remembered, so the next visit tries again.
      if (res.ok) cache.set(key, value)
      if (live) setSchool(value)
    })
    return () => { live = false }
  }, [key])

  return school
}
