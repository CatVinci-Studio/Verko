import { marked } from 'marked'
import { ToolCallRow } from './ToolCallRow'
import type { Message } from '@/store/agent'

// `breaks: true` so single \n becomes <br>. LLMs (esp. OpenAI chat) emit
// lists and short bullets with single newlines between lines; the default
// CommonMark behaviour collapses those into spaces, producing one giant
// run-on paragraph. With breaks:true the rendered output also matches the
// streaming bubble (which uses whitespace-pre-wrap), so finalising a stream
// no longer shifts the layout.
marked.use({ breaks: true, gfm: true })

// Force every rendered link to carry target="_blank" + rel hardening so
// the global click interceptor in App.tsx can route it to the user's
// default browser instead of navigating the webview.
marked.use({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

const BUBBLE_USER =
  'max-w-[min(85%,600px)] rounded-[18px] rounded-br-[4px] ' +
  'bg-[var(--accent-color)] text-[var(--accent-on)] ' +
  'px-4 py-2.5 text-[16px] leading-[1.65] whitespace-pre-wrap select-text'

const BUBBLE_ASSISTANT =
  'max-w-[min(85%,680px)] rounded-[18px] rounded-bl-[4px] ' +
  'bg-[var(--bg-elevated)] border border-[var(--border-color)] ' +
  'text-[var(--text-bright)] px-4 py-3 text-[16px] leading-[1.65] chat-md'

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
