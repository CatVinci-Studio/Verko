import { useState } from 'react'

/**
 * Click-to-edit / blur-or-Enter-saves / Escape-cancels state machine.
 * Display markup stays bespoke per call site (h2 / span / sized input);
 * only the wiring is shared.
 *
 * `onCommit` receives the raw draft string — callers do their own
 * trimming / parsing before mutating the model.
 */
export function useInlineEdit(onCommit: (draft: string) => void) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const start = (initial: string) => {
    setDraft(initial)
    setEditing(true)
  }
  const cancel = () => setEditing(false)
  const commit = () => {
    onCommit(draft)
    setEditing(false)
  }

  return {
    editing,
    start,
    cancel,
    /** Spread onto the `<input>` — handles value/change/blur/Enter/Escape. */
    inputProps: {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') cancel()
      },
      style: { userSelect: 'text' as const },
    },
  }
}
