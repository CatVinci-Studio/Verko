import { useState } from 'react'
import { Check, Cloud, Download, FolderOpen, FolderPlus, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/store/library'
import { api } from '@/lib/ipc'
import { confirmDialog, promptDialog } from '@/store/dialogs'
import { Button } from '@/components/ui/button'
import { SettingSection } from '@/components/ui/setting-section'
import { S3ConnectForm } from '@/features/onboarding/S3ConnectForm'
import { cn } from '@/lib/utils'
import type { LibraryInfo } from '@shared/types'

type Mode = 'list' | 's3'

export function LibraryTab() {
  const { t } = useTranslation()
  const { libraries, refreshLibraries, switchLibrary } = useLibraryStore()
  const [mode, setMode] = useState<Mode>('list')
  const [busy, setBusy] = useState(false)

  const promptForName = async (path: string): Promise<string | null> => {
    const result = await promptDialog({
      title: t('welcome.namePrompt.title'),
      description: t('welcome.namePrompt.description'),
      fields: [
        {
          name: 'name',
          label: t('welcome.namePrompt.label'),
          placeholder: defaultName(path),
          initialValue: defaultName(path),
          required: true,
        },
      ],
      confirmLabel: t('common.ok'),
    })
    return result?.name ?? null
  }

  const handleOpenExisting = async () => {
    if (busy) return
    const path = await api.libraries.pickFolder()
    if (!path) return
    setBusy(true)
    try {
      const probe = await api.libraries.probeLocal(path)
      if (probe.status === 'error') {
        await confirmDialog({
          title: t('welcome.errors.openTitle'),
          message: probe.message ?? t('welcome.errors.unknown'),
          confirmLabel: t('common.ok'),
        })
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
        kind: 'local',
        name,
        path,
        initialize: probe.status === 'uninitialized',
      })
      await refreshLibraries()
    } catch (e) {
      await confirmDialog({
        title: t('welcome.errors.openTitle'),
        message: e instanceof Error ? e.message : String(e),
        confirmLabel: t('common.ok'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (lib: LibraryInfo) => {
    if (busy) return
    setBusy(true)
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
      await confirmDialog({
        title: t('settings.libraries.exportError'),
        message: e instanceof Error ? e.message : String(e),
        confirmLabel: t('common.ok'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    if (busy) return
    setBusy(true)
    try {
      const info = await api.libraries.importZip()
      if (info) await refreshLibraries()
    } catch (e) {
      await confirmDialog({
        title: t('settings.libraries.importError'),
        message: e instanceof Error ? e.message : String(e),
        confirmLabel: t('common.ok'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleCreateNew = async () => {
    if (busy) return
    const path = await api.libraries.pickFolder()
    if (!path) return
    setBusy(true)
    try {
      const name = await promptForName(path)
      if (!name) return
      await api.libraries.add({ kind: 'local', name, path, initialize: true })
      await refreshLibraries()
    } finally {
      setBusy(false)
    }
  }

  const summarize = (lib: LibraryInfo): string =>
    lib.kind === 'local' ? lib.path : `${lib.bucket}${lib.prefix ? '/' + lib.prefix : ''} (${lib.region})`

  if (mode === 's3') {
    return (
      <S3ConnectForm
        onCancel={() => setMode('list')}
        onConnected={async () => {
          setMode('list')
          await refreshLibraries()
        }}
      />
    )
  }

  return (
    <SettingSection
      title={t('settings.libraries.title')}
      description={t('settings.libraries.description')}
    >
      <div className="space-y-2 pt-2">
        {libraries.map((lib: LibraryInfo) => (
          <div
            key={lib.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors',
              lib.active
                ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent-color)]/25'
                : 'bg-[var(--bg-elevated)] border-[var(--border-color)]'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-[var(--text-primary)]">{lib.name}</div>
              <div className="text-[12.5px] text-[var(--text-muted)] truncate mt-0.5">{summarize(lib)}</div>
              <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {t('settings.libraries.papers', { count: lib.paperCount })}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={() => handleExport(lib)}
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                title={t('settings.libraries.export')}
                className="h-7 w-7 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <Download size={12} />
              </Button>
              {lib.active ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/25">
                  <Check size={10} className="text-[var(--accent-color)]" />
                  <span className="text-[12px] text-[var(--accent-color)] font-medium">
                    {t('settings.libraries.active')}
                  </span>
                </div>
              ) : (
                <Button
                  onClick={() => switchLibrary(lib.id)}
                  variant="outline"
                  size="sm"
                  className="rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)]"
                >
                  {t('settings.libraries.switch')}
                </Button>
              )}
            </div>
          </div>
        ))}

        <div className="grid gap-2 pt-1">
          <AddChoice
            icon={<FolderOpen size={14} />}
            label={t('welcome.actions.openExisting.title')}
            onClick={handleOpenExisting}
            disabled={busy}
          />
          <AddChoice
            icon={<FolderPlus size={14} />}
            label={t('welcome.actions.createLocal.title')}
            onClick={handleCreateNew}
            disabled={busy}
          />
          <AddChoice
            icon={<Cloud size={14} />}
            label={t('welcome.actions.connectS3.title')}
            onClick={() => setMode('s3')}
            disabled={busy}
          />
          <AddChoice
            icon={<Upload size={14} />}
            label={t('settings.libraries.import')}
            onClick={handleImport}
            disabled={busy}
          />
        </div>
      </div>
    </SettingSection>
  )
}

function AddChoice(props: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex items-center gap-2 w-full px-4 py-2.5 rounded-full border border-dashed border-[var(--border-color)] text-[13.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-focus)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-[var(--accent-color)]">{props.icon}</span>
      {props.label}
    </button>
  )
}

function defaultName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || 'Library'
}
