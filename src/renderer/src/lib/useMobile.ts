import { useEffect, useState } from 'react'

/**
 * Single source of truth for "is this a small / touch viewport?".
 * Threshold matches tailwind's `md` breakpoint (768px) so component
 * className utilities and JS-side layout decisions agree.
 *
 * Driven by matchMedia rather than window.innerWidth so we get an
 * event-driven update without a resize listener firing 60×/sec when
 * the user resizes the desktop window during dev.
 */
const QUERY = '(max-width: 767px)'

export function useMobile(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return matches
}
