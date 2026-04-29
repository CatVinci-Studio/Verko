import { useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  isStreaming: boolean
  autoFocus?: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onAbort,
  isStreaming,
  autoFocus,
  placeholder = 'Ask about your papers… (⌘↵ to send)',
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [autoFocus])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  return (
    <div className="shrink-0 px-4 pb-5 pt-3">
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3 items-end bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[16px] px-4 py-3 focus-within:border-[var(--border-focus)] shadow-sm transition-colors">
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent border-none text-[13.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none leading-relaxed"
            style={{ height: '24px', minHeight: '24px', userSelect: 'text' }}
          />

          {isStreaming ? (
            <Button
              onClick={onAbort}
              variant="destructive"
              size="icon"
              title="Stop"
              className="rounded-[10px] w-8 h-8"
            >
              <Square size={12} />
            </Button>
          ) : (
            <Button
              onClick={onSend}
              disabled={!value.trim()}
              variant="accent"
              size="icon"
              title="Send (⌘↵)"
              className="rounded-[10px] w-8 h-8"
            >
              <Send size={13} />
            </Button>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-dim)] text-center mt-2">⌘↵ send · ↵ newline</p>
      </div>
    </div>
  )
}
