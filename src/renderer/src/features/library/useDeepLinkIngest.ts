import { useEffect } from 'react'
import { api } from '@/lib/ipc'
import { useInvalidateLibrary } from './queries'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'

/**
 * Subscribe to deep-link `verko://ingest?url=…` events emitted by the
 * Rust shell (mobile) or by the OS share sheet on desktop where the
 * plugin supports it. Each URL is routed through `Library.ingestUrl`
 * and selected in the inbox so the user sees the new row appear.
 *
 * Safe on platforms without deep-link wiring — the underlying listener
 * never fires; this hook becomes a no-op.
 */
export function useDeepLinkIngest(): void {
  const invalidate = useInvalidateLibrary()
  const setSelected = useLibraryStore((s) => s.setSelected)
  const setActiveView = useUIStore((s) => s.setActiveView)

  useEffect(() => {
    return api.deepLink.onIngest(async (url) => {
      try {
        const id = await api.papers.ingestUrl(url)
        invalidate.papers()
        setSelected(id)
        setActiveView('library')
      } catch (e) {
        // Failures here are silent on purpose — the user didn't initiate
        // this from the UI; surfacing a modal would be confusing. The
        // error logs to the dev console.
        console.warn('deep-link ingest failed', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
