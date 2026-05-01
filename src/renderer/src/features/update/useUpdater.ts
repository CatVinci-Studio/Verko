// Thin React wrapper around `@tauri-apps/plugin-updater`. The plugin's
// JS API doesn't expose runtime endpoint overrides — endpoints are
// configured statically in tauri.conf.json — so this hook always hits
// the stable channel for now. A future dev-channel switch needs a
// small Rust-side custom command that builds an updater with a
// different endpoint per call; left as follow-up.
//
// On the web build everything is no-op: the dialog never opens, the
// "check now" button reports "up to date".

import { useCallback, useEffect, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'available'; update: Update }
  | { status: 'downloading'; progress: number; update: Update }
  | { status: 'ready'; update: Update }
  | { status: 'error'; error: string }

const SESSION_DISMISSED = 'verko:update-dismissed-this-session'

function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined'
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

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
    setState((prev) => {
      if (prev.status !== 'available') return prev
      const update = prev.update
      void (async () => {
        try {
          let downloaded = 0
          let total = 0
          await update.downloadAndInstall((event) => {
            if (event.event === 'Started') {
              total = event.data.contentLength ?? 0
              setState({ status: 'downloading', progress: 0, update })
            } else if (event.event === 'Progress') {
              downloaded += event.data.chunkLength
              const progress = total > 0 ? downloaded / total : 0
              setState({ status: 'downloading', progress, update })
            } else if (event.event === 'Finished') {
              setState({ status: 'ready', update })
            }
          })
          const { relaunch } = await import('@tauri-apps/plugin-process')
          await relaunch()
        } catch (e) {
          setState({ status: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      })()
      return { status: 'downloading', progress: 0, update }
    })
  }, [])

  const dismiss = useCallback(() => {
    sessionStorage.setItem(SESSION_DISMISSED, '1')
    setState({ status: 'idle' })
  }, [])

  return { state, check, installAndRestart, dismiss }
}

/**
 * Single startup check. Skipped if the user has already dismissed an
 * update prompt this session — clicking "Later" must not re-prompt
 * mid-session.
 */
export function useStartupUpdateCheck(check: () => Promise<UpdateState>): void {
  useEffect(() => {
    if (!isTauri()) return
    if (sessionStorage.getItem(SESSION_DISMISSED) === '1') return
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
