import { useState, type RefObject } from 'react'
import type { PaperRef } from '@shared/types'

interface MentionState {
  /** Index of the `@` character in the textarea/input value. */
  triggerPos: number
  coords: { x: number; y: number }
  /** Substring after `@`, used to filter the picker. */
  query: string
}

interface UseMentionPickerOpts {
  value: string
  onChange: (next: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  mentioned: PaperRef[]
  onMentionedChange?: (next: PaperRef[]) => void
}

/**
 * @-mention state machine for ChatInput. Detects `@` triggers in the
 * input value, exposes a picker state, and on selection rewrites the
 * value with the picked paper title and appends the paper to the
 * mentioned list (deduped).
 *
 * Detection rule: most recent `@` before the caret, preceded by start-
 * of-string or whitespace, with no newline in the suffix.
 */
export function useMentionPicker({
  value, onChange, inputRef, mentioned, onMentionedChange,
}: UseMentionPickerOpts) {
  const [state, setState] = useState<MentionState | null>(null)

  /** Run after each input change to update / clear the picker state. */
  const detect = (el: HTMLInputElement, next: string) => {
    const caret = el.selectionStart ?? next.length
    const upTo = next.slice(0, caret)
    const at = upTo.lastIndexOf('@')
    if (at < 0) { setState(null); return }
    const before = at === 0 ? ' ' : upTo[at - 1]
    if (!/\s/.test(before)) { setState(null); return }
    const after = upTo.slice(at + 1)
    if (/[\n\r]/.test(after)) { setState(null); return }
    const rect = el.getBoundingClientRect()
    setState({
      triggerPos: at,
      coords: { x: rect.left + 16, y: rect.top },
      query: after,
    })
  }

  const cancel = () => setState(null)

  const pick = (paper: PaperRef) => {
    if (!state) return
    const before = value.slice(0, state.triggerPos)
    const afterCaret = value.slice(state.triggerPos + 1 + state.query.length)
    const token = `@${paper.title || paper.id}`
    onChange(before + token + (afterCaret.startsWith(' ') ? '' : ' ') + afterCaret)
    if (onMentionedChange && !mentioned.some((p) => p.id === paper.id)) {
      onMentionedChange([...mentioned, paper])
    }
    setState(null)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const pos = before.length + token.length + 1
      el.setSelectionRange(pos, pos)
    })
  }

  return { state, detect, cancel, pick }
}
