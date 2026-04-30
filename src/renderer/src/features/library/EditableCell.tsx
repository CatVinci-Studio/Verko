import { useState, useRef, useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Click-to-edit text cell. Renders display markup until clicked, then
 * swaps to an inline `<input>` that commits on blur or Enter and cancels
 * on Escape. Stops click propagation so it doesn't bubble to the row's
 * "open paper" handler.
 */
interface EditableTextCellProps {
  value: string
  placeholder?: string
  inputType?: 'text' | 'number'
  align?: 'left' | 'right'
  onSave: (next: string) => void | Promise<void>
  /** What to render when not editing. Defaults to the value or an em-dash. */
  display?: React.ReactNode
  /** When true on first render, enter edit mode immediately (e.g. for new rows). */
  startEditing?: boolean
  /** Fires when an in-progress edit either commits or cancels. */
  onEditEnd?: () => void
}

export function EditableTextCell({
  value,
  placeholder,
  inputType = 'text',
  align = 'left',
  onSave,
  display,
  startEditing,
  onEditEnd,
}: EditableTextCellProps) {
  const [editing, setEditing] = useState(!!startEditing)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = async () => {
    setEditing(false)
    if (draft !== value) await onSave(draft)
    onEditEnd?.()
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
    onEditEnd?.()
  }

  if (!editing) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'block w-full cursor-text px-1 -mx-1 rounded-[4px] hover:bg-[var(--bg-elevated)] truncate',
          align === 'right' && 'text-right'
        )}
      >
        {display ??
          (value || (
            <span className="text-[var(--text-dim)]">{placeholder ?? '—'}</span>
          ))}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
      placeholder={placeholder}
      className={cn(
        'w-full bg-[var(--bg-elevated)] border border-[var(--accent-color)] rounded-[4px]',
        'px-1 -mx-1 text-[14.5px] text-[var(--text-primary)] focus:outline-none',
        align === 'right' && 'text-right'
      )}
      style={{ userSelect: 'text' }}
    />
  )
}

/**
 * Click-to-pick select cell. Wraps a custom trigger element in a
 * DropdownMenu — the trigger's click opens the menu and stops event
 * propagation up to the row.
 */
interface EditableSelectCellProps<T extends string> {
  value: T
  options: Array<{ value: T; label?: string }>
  onSave: (next: T) => void | Promise<void>
  trigger: React.ReactNode
  renderOption?: (value: T) => React.ReactNode
}

export function EditableSelectCell<T extends string>({
  value,
  options,
  onSave,
  trigger,
  renderOption,
}: EditableSelectCellProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="block w-full text-left rounded-[4px] hover:bg-[var(--bg-elevated)]"
        >
          {trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={async () => {
              if (opt.value !== value) await onSave(opt.value)
            }}
          >
            {renderOption ? renderOption(opt.value) : (opt.label ?? opt.value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
