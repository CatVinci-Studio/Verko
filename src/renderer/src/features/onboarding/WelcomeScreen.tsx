import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FolderPlus, Cloud, AlertTriangle } from 'lucide-react'
import logoUrl from '@/assets/logo.jpg'
import { useLibraryStore } from '@/store/library'
import { confirmDialog, promptDialog } from '@/store/dialogs'
import { api } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { S3ConnectForm } from './S3ConnectForm'

declare const __WEB_BUILD__: boolean | undefined
const isWeb = typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__

export function WelcomeScreen() {
  const { t } = useTranslation()
  const { noneReason, refreshAll } = useLibraryStore()
  const [mode, setMode] = useState<'choose' | 's3'>('choose')
  const [busy, setBusy] = useState(false)

  const setReady = async () => {
    useLibraryStore.setState({ status: 'ready', noneReason: undefined })
    await refreshAll()
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
      await api.libraries.add({ kind: 'local', name, path, initialize: probe.status === 'uninitialized' })
      await setReady()
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

  const handleCreateNew = async () => {
    if (busy) return
    const path = await api.libraries.pickFolder()
    if (!path) return
    setBusy(true)
    try {
      const name = await promptForName(path)
      if (!name) return
      await api.libraries.add({ kind: 'local', name, path, initialize: true })
      await setReady()
    } finally {
      setBusy(false)
    }
  }

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

  if (mode === 's3') {
    return (
      <S3ConnectForm
        onCancel={() => setMode('choose')}
        onConnected={async () => { setMode('choose'); await setReady() }}
      />
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[var(--bg-base)] px-6 py-10 overflow-auto">
      <div className="max-w-[560px] w-full space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={logoUrl}
            alt="Verko"
            className="w-16 h-16 rounded-[14px] shadow-sm"
          />
          <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">
            {t('welcome.title')}
          </h1>
          <p className="text-[15.5px] text-[var(--text-muted)] max-w-[440px]">
            {t('welcome.subtitle')}
          </p>
        </div>

        {noneReason?.reason === 'last-failed' && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border-warning,#7a4a1a)] text-[14.5px] text-[var(--text-secondary)]">
            <AlertTriangle size={14} className="mt-0.5 text-[var(--accent-color)]" />
            <div>
              <div className="font-medium text-[var(--text-primary)]">{t('welcome.lastFailed.title')}</div>
              <div className="mt-0.5 text-[var(--text-muted)]">{noneReason.message ?? t('welcome.errors.unknown')}</div>
            </div>
          </div>
        )}

        <div className="grid gap-2.5">
          {!isWeb && (
            <>
              <Choice
                icon={<FolderOpen size={16} />}
                title={t('welcome.actions.openExisting.title')}
                description={t('welcome.actions.openExisting.description')}
                onClick={handleOpenExisting}
                disabled={busy}
              />
              <Choice
                icon={<FolderPlus size={16} />}
                title={t('welcome.actions.createLocal.title')}
                description={t('welcome.actions.createLocal.description')}
                onClick={handleCreateNew}
                disabled={busy}
              />
            </>
          )}
          <Choice
            icon={<Cloud size={16} />}
            title={t('welcome.actions.connectS3.title')}
            description={t('welcome.actions.connectS3.description')}
            onClick={() => setMode('s3')}
            disabled={busy}
          />
        </div>
        {isWeb && (
          <p className="text-[13.5px] text-[var(--text-muted)] text-center mt-2">
            {t('welcome.webNote')}
          </p>
        )}
      </div>
    </div>
  )
}

function Choice(props: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      onClick={props.onClick}
      variant="outline"
      disabled={props.disabled}
      className="h-auto flex items-start gap-3 px-4 py-3.5 text-left rounded-[12px] border-[var(--border-color)] hover:border-[var(--border-focus)] bg-[var(--bg-elevated)]"
    >
      <div className="w-8 h-8 rounded-[8px] bg-[var(--bg-base)] border border-[var(--border-color)] flex items-center justify-center text-[var(--accent-color)] shrink-0">
        {props.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15.5px] font-medium text-[var(--text-primary)]">{props.title}</div>
        <div className="text-[14px] text-[var(--text-muted)] mt-0.5 whitespace-normal">{props.description}</div>
      </div>
    </Button>
  )
}

function defaultName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || 'Library'
}
