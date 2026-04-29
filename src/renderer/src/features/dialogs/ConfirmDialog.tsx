import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ConfirmOptions } from '@/store/dialogs'

interface ConfirmDialogProps extends ConfirmOptions {
  onResolve: (ok: boolean) => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onResolve,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onResolve(false)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message && <DialogDescription>{message}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onResolve(false)}>
            {cancelLabel}
          </Button>
          <Button
            autoFocus
            variant={danger ? 'destructive' : 'accent'}
            size="lg"
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
