import { useDialogStore } from '@/store/dialogs'
import { ConfirmDialog } from './ConfirmDialog'
import { PromptDialog } from './PromptDialog'

export function DialogHost() {
  const { confirms, prompts, resolveConfirm, resolvePrompt } = useDialogStore()
  return (
    <>
      {confirms.map((c) => (
        <ConfirmDialog
          key={c.id}
          {...c}
          onResolve={(ok) => resolveConfirm(c.id, ok)}
        />
      ))}
      {prompts.map((p) => (
        <PromptDialog
          key={p.id}
          {...p}
          onResolve={(v) => resolvePrompt(p.id, v)}
        />
      ))}
    </>
  )
}
