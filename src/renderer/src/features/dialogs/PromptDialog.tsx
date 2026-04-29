import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PromptOptions } from '@/store/dialogs'

interface PromptDialogProps extends PromptOptions {
  onResolve: (values: Record<string, string> | null) => void
}

export function PromptDialog({
  title,
  description,
  fields,
  confirmLabel = 'OK',
  onResolve,
}: PromptDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.initialValue ?? '']))
  )
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstInputRef.current?.focus()
    firstInputRef.current?.select()
  }, [])

  const canSubmit = fields.every(
    (f) => !f.required || (values[f.name] ?? '').trim().length > 0
  )

  const submit = () => {
    if (!canSubmit) return
    onResolve(values)
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onResolve(null)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={f.name} className="space-y-1.5">
              <label className="block text-[11.5px] font-medium text-[var(--text-secondary)]">
                {f.label}
                {f.required && <span className="text-[var(--danger)] ml-0.5">*</span>}
              </label>
              <Input
                ref={i === 0 ? firstInputRef : undefined}
                type={f.type ?? 'text'}
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
                className="h-9 text-[13px]"
                style={{ userSelect: 'text' }}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onResolve(null)}>
            Cancel
          </Button>
          <Button variant="accent" size="lg" disabled={!canSubmit} onClick={submit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
