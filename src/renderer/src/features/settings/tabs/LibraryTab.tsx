import { useState } from 'react'
import { Check, Cloud, Download, FolderOpen, FolderPlus, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibrariesQuery, useInvalidateLibrary } from '@/features/library/queries'
import { Button } from '@/components/ui/button'
import { S3ConnectForm } from '@/features/onboarding/S3ConnectForm'
import { cn } from '@/lib/utils'
import { useLibraryActions } from '../useLibraryActions'
import { api } from '@/lib/ipc'
import type { LibraryInfo } from '@shared/types'

type Mode = 'list' | 's3'

export function LibraryTab() {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibrariesQuery()
  const invalidate = useInvalidateLibrary()
  const [mode, setMode] = useState<Mode>('list')
  const { busy, openExisting, createNew, exportLib, importLib } = useLibraryActions()

  // Switching library: the shell emits `library:switched` which App.tsx
  // catches and uses to invalidate every query. We only need to issue the call.
  const switchLibrary = async (id: string) => {
    await api.libraries.open(id)
  }

  const summarize = (lib: LibraryInfo): string =>
    lib.kind === 'local' ? lib.path : `${lib.bucket}${lib.prefix ? '/' + lib.prefix : ''} (${lib.region})`

  if (mode === 's3') {
    return (
      <S3ConnectForm
        onCancel={() => setMode('list')}
        onConnected={() => {
          setMode('list')
          invalidate.libraries()
        }}
      />
    )
  }

  return (
    <div className="space-y-2">
      {/* Action row above the list */}
      <div className="grid grid-cols-4 gap-2">
        <ActionButton icon={<FolderOpen size={13} />} label={t('settings.libraries.action.open')}   onClick={openExisting} disabled={busy} />
        <ActionButton icon={<FolderPlus size={13} />} label={t('settings.libraries.action.new')}    onClick={createNew}    disabled={busy} />
        <ActionButton icon={<Cloud size={13} />}      label={t('settings.libraries.action.s3')}     onClick={() => setMode('s3')} disabled={busy} />
        <ActionButton icon={<Upload size={13} />}     label={t('settings.libraries.action.import')} onClick={importLib}       disabled={busy} />
      </div>

      {libraries.map((lib: LibraryInfo) => (
        <div
          key={lib.id}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-[10px] border transition-colors',
            lib.active
              ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent-color)]/25'
              : 'bg-[var(--bg-elevated)] border-[var(--border-color)]',
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[14.5px] font-medium text-[var(--text-primary)] truncate">{lib.name}</span>
              <span className="text-[13px] text-[var(--text-muted)]">
                · {t('settings.libraries.papers', { count: lib.paperCount })}
              </span>
            </div>
            <div className="text-[13px] text-[var(--text-dim)] truncate">{summarize(lib)}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              onClick={() => exportLib(lib)}
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              title={t('settings.libraries.export')}
              className="h-7 w-7 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <Download size={12} />
            </Button>
            {lib.active ? (
              <Check size={13} className="text-[var(--accent-color)] mx-1.5" aria-label={t('settings.libraries.active')} />
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
    </div>
  )
}

function ActionButton(props: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="h-9 flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[13.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-[var(--accent-color)]">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  )
}

