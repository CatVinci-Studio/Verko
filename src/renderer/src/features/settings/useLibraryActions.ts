import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInvalidateLibrary } from '@/features/library/queries'
import { api } from '@/lib/ipc'
import { confirmDialog, promptDialog } from '@/store/dialogs'
import type { LibraryInfo } from '@shared/types'

/**
 * Library tab handlers — open existing folder, create new, connect S3,
 * import/export zip. Owns the shared `busy` flag so multiple buttons can
 * disable each other during a long-running action.
 */
export function useLibraryActions() {
  const { t } = useTranslation()
  const invalidate = useInvalidateLibrary()
  const [busy, setBusy] = useState(false)

  const promptForName = async (path: string): Promise<string | null> => {
    const result = await promptDialog({
      title: t('welcome.namePrompt.title'),
      description: t('welcome.namePrompt.description'),
      fields: [{
        name: 'name',
        label: t('welcome.namePrompt.label'),
        placeholder: defaultName(path),
        initialValue: defaultName(path),
        required: true,
      }],
      confirmLabel: t('common.ok'),
    })
    return result?.name ?? null
  }

  const showError = (key: string, e: unknown) =>
    confirmDialog({
      title: t(key),
      message: e instanceof Error ? e.message : String(e),
      confirmLabel: t('common.ok'),
    })

  // Wrap a handler to manage busy state. No-op while already busy.
  const guarded = <Args extends unknown[]>(
    fn: (...args: Args) => Promise<void>,
  ) => async (...args: Args) => {
    if (busy) return
    setBusy(true)
    try { await fn(...args) }
    finally { setBusy(false) }
  }

  const openExisting = guarded(async () => {
    const path = await api.libraries.pickFolder()
    if (!path) return
    try {
      const probe = await api.libraries.probeLocal(path)
      if (probe.status === 'error') {
        await showError('welcome.errors.openTitle', probe.message ?? t('welcome.errors.unknown'))
        return
      }
      if (probe.status === 'uninitialized') {
        const ok = await confirmDialog({
          title: t('welcome.initPrompt.title'),
          message: t('welcome.initPrompt.message'),
          confirmLabel: t('welcome.initPrompt.confirm'),
        })
        if (!ok) return
      }
      const name = await promptForName(path)
      if (!name) return
      await api.libraries.add({
        kind: 'local', name, path,
        initialize: probe.status === 'uninitialized',
      })
      invalidate.libraries()
    } catch (e) {
      await showError('welcome.errors.openTitle', e)
    }
  })

  const createNew = guarded(async () => {
    const path = await api.libraries.pickFolder()
    if (!path) return
    const name = await promptForName(path)
    if (!name) return
    await api.libraries.add({ kind: 'local', name, path, initialize: true })
    invalidate.libraries()
  })

  const exportLib = guarded(async (lib: LibraryInfo) => {
    try {
      const saved = await api.libraries.exportZip(lib.id)
      if (saved) {
        await confirmDialog({
          title: t('settings.libraries.exportDone.title'),
          message: t('settings.libraries.exportDone.message', { path: saved }),
          confirmLabel: t('common.ok'),
        })
      }
    } catch (e) {
      await showError('settings.libraries.exportError', e)
    }
  })

  const importLib = guarded(async () => {
    try {
      const info = await api.libraries.importZip()
      if (info) invalidate.libraries()
    } catch (e) {
      await showError('settings.libraries.importError', e)
    }
  })

  return { busy, openExisting, createNew, exportLib, importLib }
}

function defaultName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || 'Library'
}
