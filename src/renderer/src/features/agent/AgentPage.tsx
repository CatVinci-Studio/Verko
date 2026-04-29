import { useRef, useEffect, useState } from 'react'
import { Bot, Eraser, FileText } from 'lucide-react'
import { useAgentStore } from '@/store/agent'
import { useLibraryStore } from '@/store/library'
import { Button } from '@/components/ui/button'
import { MessageBubble, StreamingBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'

const SUGGESTIONS = [
  "Summarize the key contributions of the papers I've read",
  'What are the main themes across my library?',
  'Find papers related to transformer architecture',
  "Add notes on the paper I'm currently reading",
]

export function AgentPage() {
  const {
    messages,
    isStreaming,
    streamingText,
    send,
    abort,
    clear,
    toggleToolCall,
    currentPaperId,
  } = useAgentStore()
  const { papers } = useLibraryStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    await send(msg, currentPaperId)
  }

  const contextPaper = currentPaperId ? papers.find((p) => p.id === currentPaperId) : null

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-[8px] bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/25 flex items-center justify-center shrink-0">
            <Bot size={13} className="text-[var(--accent-color)]" />
          </div>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">Agent</span>

          {contextPaper && (
            <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20">
              <FileText size={10} className="text-[var(--accent-color)]" />
              <span className="text-[11px] text-[var(--accent-color)] truncate max-w-[180px]">
                {contextPaper.title}
              </span>
            </div>
          )}
        </div>

        {messages.length > 0 && (
          <Button
            onClick={clear}
            variant="ghost"
            size="icon"
            title="Clear conversation"
            className="rounded-[8px]"
          >
            <Eraser size={14} />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {messages.length === 0 && !isStreaming && (
            <EmptyState onPick={(s) => setInput(s)} />
          )}

          <div className="space-y-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onToggleToolCall={toggleToolCall} />
            ))}
            {isStreaming && <StreamingBubble text={streamingText} />}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onAbort={abort}
        isStreaming={isStreaming}
        autoFocus
      />
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (suggestion: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-12">
      <div className="w-12 h-12 rounded-[14px] bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 flex items-center justify-center">
        <Bot size={22} className="text-[var(--accent-color)]" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-medium text-[var(--text-primary)] mb-1">Agent</p>
        <p className="text-[13px] text-[var(--text-muted)]">
          Ask anything about your research library.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left px-4 py-2.5 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
