// React wrapper around `@tauri-apps/plugin-updater`. The plugin's JS
// API doesn't expose runtime endpoint overrides, so this hook always
// hits the stable endpoint configured in tauri.conf.json. On the web
// build everything is no-op.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'
import { isTauri } from '@/lib/ipc'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'available'; update: Update }
  | { status: 'downloading'; progress: number; update: Update }
  | { status: 'ready'; update: Update }
  | { status: 'error'; error: string }

const SESSION_DISMISSED = 'verko:update-dismissed-this-session'

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const stateRef = useRef(state)
  stateRef.current = state

  const check = useCallback(async (): Promise<UpdateState> => {
    if (!isTauri()) {
      const next: UpdateState = { status: 'none' }
      setState(next)
      return next
    }
    setState({ status: 'checking' })
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      const next: UpdateState = update ? { status: 'available', update } : { status: 'none' }
      setState(next)
      return next
    } catch (e) {
      const next: UpdateState = { status: 'error', error: e instanceof Error ? e.message : String(e) }
      setState(next)
      return next
    }
  }, [])

  const installAndRestart = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== 'available') return
    const update = current.update
    setState({ status: 'downloading', progress: 0, update })

    try {
      let downloaded = 0
      let total = 0
      let lastPercent = -1
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          const progress = total > 0 ? downloaded / total : 0
          // Only re-render when the displayed integer percent changes.
          const percent = Math.round(progress * 100)
          if (percent !== lastPercent) {
            lastPercent = percent
            setState({ status: 'downloading', progress, update })
          }
        } else if (event.event === 'Finished') {
          setState({ status: 'ready', update })
        }
      })
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      setState({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const dismiss = useCallback(() => {
    sessionStorage.setItem(SESSION_DISMISSED, '1')
    setState({ status: 'idle' })
  }, [])

  return { state, check, installAndRestart, dismiss }
}

/**
 * Run a single check on mount. Skipped if the user has already
 * dismissed an update prompt this session.
 */
export function useStartupUpdateCheck(check: () => Promise<UpdateState>): void {
  useEffect(() => {
    if (!isTauri()) return
    if (sessionStorage.getItem(SESSION_DISMISSED) === '1') return
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
