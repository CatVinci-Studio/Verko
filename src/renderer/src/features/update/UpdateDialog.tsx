import { useTranslation } from 'react-i18next'
import { Loader, RotateCw, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { UpdateState } from './useUpdater'

interface Props {
  state: UpdateState
  onInstall: () => void
  onDismiss: () => void
}

/**
 * Single-purpose dialog rendered when an update is available. Mirrors
 * the lifecycle of `useUpdater().state` — visible while the state is
 * `available`, `downloading`, `ready`, or a post-check `error`.
 */
export function UpdateDialog({ state, onInstall, onDismiss }: Props) {
  const { t } = useTranslation()

  if (
    state.status !== 'available'
    && state.status !== 'downloading'
    && state.status !== 'ready'
  ) return null

  const update = state.update

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDismiss() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('update.available.title')}</DialogTitle>
          <DialogDescription>
            {update.version
              ? t('update.available.version', { version: update.version })
              : ''}
          </DialogDescription>
        </DialogHeader>

        {update.body && (
          <p className="text-[14px] text-[var(--text-muted)] whitespace-pre-wrap max-h-40 overflow-y-auto">
            {update.body}
          </p>
        )}

        {state.status === 'downloading' && (
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent-color)] transition-all"
                style={{ width: `${Math.round(state.progress * 100)}%` }}
              />
            </div>
            <p className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5">
              <Loader size={11} className="animate-spin" />
              {t('update.downloading')}
            </p>
          </div>
        )}

        <DialogFooter className="flex-row justify-end gap-2">
          {state.status === 'available' && (
            <>
              <Button variant="outline" size="lg" onClick={onDismiss} className="rounded-full">
                <X size={11} /> {t('update.later')}
              </Button>
              <Button variant="accent" size="lg" onClick={onInstall} className="rounded-full">
                <RotateCw size={11} /> {t('update.install')}
              </Button>
            </>
          )}
          {state.status === 'ready' && (
            <p className="text-[13px] text-[var(--text-muted)] mr-auto">
              {t('update.restarting')}
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
