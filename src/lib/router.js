import { useCallback, useEffect, useState } from 'react'

/**
 * A tiny hash router (#/parent/approvals).
 *
 * Hash routing is used on purpose: it needs no server configuration, so the app
 * works the same on Vercel, Netlify, a static host, or opened straight from the
 * dist folder. The browser back button also works, which matters a lot on a phone.
 */

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '')
  return hash || '/'
}

export function useRoute() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to, { replace = false } = {}) => {
    const target = `#${to}`
    if (replace) window.location.replace(target)
    else window.location.hash = to
    window.scrollTo(0, 0)
  }, [])

  return { path, navigate, segments: path.split('/').filter(Boolean) }
}

export function navigate(to) {
  window.location.hash = to
  window.scrollTo(0, 0)
}
