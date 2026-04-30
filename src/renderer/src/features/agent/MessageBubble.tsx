import { marked } from 'marked'
import { ToolCallRow } from './ToolCallRow'
import type { Message } from '@/store/agent'

const BUBBLE_USER =
  'max-w-[min(85%,600px)] rounded-[18px] rounded-br-[4px] ' +
  'bg-[var(--accent-color)] text-[var(--accent-on)] ' +
  'px-4 py-2.5 text-[15px] leading-[1.65] whitespace-pre-wrap select-text'

const BUBBLE_ASSISTANT =
  'max-w-[min(85%,680px)] rounded-[18px] rounded-bl-[4px] ' +
  'bg-[var(--bg-elevated)] border border-[var(--border-color)] ' +
  'text-[var(--text-bright)] px-4 py-3 text-[15px] leading-[1.65]'

interface MessageBubbleProps {
  message: Message
  onToggleToolCall: (msgId: string, toolId: string) => void
}

export function MessageBubble({ message, onToggleToolCall }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end fade-in">
        <div className={BUBBLE_USER}>{message.content}</div>
      </div>
    )
  }

  return (
    <div className="flex justify-start fade-in">
      <div className="flex flex-col gap-2 max-w-[min(85%,680px)]">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallRow
                key={tc.id}
                toolCall={tc}
                msgId={message.id}
                onToggle={onToggleToolCall}
              />
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={BUBBLE_ASSISTANT}
            style={{ userSelect: 'text' }}
            dangerouslySetInnerHTML={{ __html: marked(message.content) as string }}
          />
        )}
      </div>
    </div>
  )
}

export function StreamingBubble({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="flex justify-start fade-in">
        <div className={`${BUBBLE_ASSISTANT} flex items-center gap-1.5 py-3`}>
          {[0, 120, 240].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start fade-in">
      <div className={BUBBLE_ASSISTANT} style={{ userSelect: 'text' }}>
        <span className="whitespace-pre-wrap">{text}</span>
        <span className="cursor-blink" />
      </div>
    </div>
  )
}
