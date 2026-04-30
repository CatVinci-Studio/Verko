import { useRef, useEffect } from 'react'
import { Send, Square, Paperclip, X, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { ChatContentPart, PaperRef } from '@shared/types'
import { MentionPicker } from './MentionPicker'
import { useMentionPicker } from './hooks/useMentionPicker'
import { useImageAttachments } from './hooks/useImageAttachments'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  isStreaming: boolean
  autoFocus?: boolean
  placeholder?: string
  attachments?: ChatContentPart[]
  onAttachmentsChange?: (next: ChatContentPart[]) => void
  /** Papers picked via the @-mention picker; expanded into prompt context on send. */
  mentionedPapers?: PaperRef[]
  onMentionedPapersChange?: (next: PaperRef[]) => void
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onAbort,
  isStreaming,
  autoFocus,
  placeholder,
  attachments,
  onAttachmentsChange,
  mentionedPapers,
  onMentionedPapersChange,
}: ChatInputProps) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('agent.placeholder')
  const inputRef = useRef<HTMLInputElement>(null)

  const mention = useMentionPicker({
    value,
    onChange,
    inputRef,
    mentioned: mentionedPapers ?? [],
    onMentionedChange: onMentionedPapersChange,
  })

  const images = useImageAttachments({
    attachments: attachments ?? [],
    onChange: onAttachmentsChange,
  })

  useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [autoFocus])

  const hasAttachments = !!attachments && attachments.length > 0
  const hasMentions = !!mentionedPapers && mentionedPapers.length > 0
  const canSend = !!value.trim() || hasAttachments || hasMentions

  const removeMentionedPaper = (id: string) => {
    if (!onMentionedPapersChange || !mentionedPapers) return
    onMentionedPapersChange(mentionedPapers.filter((p) => p.id !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    mention.detect(e.target, e.target.value)
  }

  return (
    <div className="shrink-0 px-4 pb-5 pt-3">
      <div className="max-w-3xl mx-auto">
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[16px] px-4 py-3 focus-within:border-[var(--border-focus)] shadow-sm transition-colors">
          {hasMentions && (
            <div className="flex flex-wrap gap-1.5 pb-2 mb-2 border-b border-[var(--border-color)]">
              {mentionedPapers!.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/25 text-[13.5px] text-[var(--accent-color)] max-w-[240px]"
                >
                  <FileText size={10} className="shrink-0" />
                  <span className="truncate">{p.title || p.id}</span>
                  <button
                    onClick={() => removeMentionedPaper(p.id)}
                    className="ml-0.5 -mr-0.5 hover:text-[var(--text-primary)]"
                    title={t('agent.removeAttachment', { defaultValue: 'Remove' })}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {hasAttachments && (
            <div className="flex flex-wrap gap-2 pb-2 mb-2 border-b border-[var(--border-color)]">
              {attachments!.map((a, i) =>
                a.type === 'image' ? (
                  <div
                    key={i}
                    className="relative w-14 h-14 rounded-[8px] overflow-hidden border border-[var(--border-color)] bg-[var(--bg-base)] group"
                  >
                    <img
                      src={`data:${a.mimeType};base64,${a.data}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => images.remove(i)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t('agent.removeAttachment', { defaultValue: 'Remove' })}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          )}

          <div className="flex gap-3 items-end">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={images.onPaste}
              placeholder={resolvedPlaceholder}
              className="flex-1 bg-transparent border-none text-[16px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none leading-relaxed"
              style={{ userSelect: 'text' }}
            />

            <input
              ref={images.fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={images.onFileInputChange}
              className="hidden"
            />
            <Button
              onClick={() => images.openFilePicker()}
              variant="ghost"
              size="icon"
              title={t('agent.attachImage', { defaultValue: 'Attach image' })}
              className="rounded-[10px] w-8 h-8"
              disabled={isStreaming || !onAttachmentsChange}
            >
              <Paperclip size={13} />
            </Button>

            {isStreaming ? (
              <Button
                onClick={onAbort}
                variant="destructive"
                size="icon"
                title={t('agent.stop')}
                className="rounded-[10px] w-8 h-8"
              >
                <Square size={12} />
              </Button>
            ) : (
              <Button
                onClick={onSend}
                disabled={!canSend}
                variant="accent"
                size="icon"
                title={t('agent.send')}
                className="rounded-[10px] w-8 h-8"
              >
                <Send size={13} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {mention.state && (
        <MentionPicker
          x={mention.state!.coords.x}
          y={mention.state!.coords.y}
          query={mention.state!.query}
          onPick={mention.pick}
          onCancel={() => mention.cancel()}
        />
      )}
    </div>
  )
}
