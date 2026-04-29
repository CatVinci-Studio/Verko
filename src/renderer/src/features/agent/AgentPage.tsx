import React, { useRef, useEffect, useState } from 'react'
import { Bot, Send, Square, Eraser, FileText } from 'lucide-react'
import { marked } from 'marked'
import { useAgentStore } from '@/store/agent'
import { useLibraryStore } from '@/store/library'
import { ToolCallRow } from './ToolCallRow'
import { cn } from '@/lib/utils'

const BUBBLE_USER =
  'max-w-[min(85%,600px)] rounded-[18px] rounded-br-[4px] ' +
  'bg-[var(--accent-color)] text-[var(--accent-on)] ' +
  'px-4 py-2.5 text-[13.5px] leading-[1.65] whitespace-pre-wrap select-text'

const BUBBLE_ASSISTANT =
  'max-w-[min(85%,680px)] rounded-[18px] rounded-bl-[4px] ' +
  'bg-[var(--bg-elevated)] border border-[var(--border-color)] ' +
  'text-[var(--text-bright)] px-4 py-3 text-[13.5px] leading-[1.65]'

const SUGGESTIONS = [
  'Summarize the key contributions of the papers I\'ve read',
  'What are the main themes across my library?',
  'Find papers related to transformer architecture',
  'Add notes on the paper I\'m currently reading',
]

export function AgentPage() {
  const { messages, isStreaming, streamingText, send, abort, clear, toggleToolCall, currentPaperId } =
    useAgentStore()
  const { papers } = useLibraryStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = '24px'
    await send(msg, currentPaperId)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  const contextPaper = currentPaperId ? papers.find(p => p.id === currentPaperId) : null

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
          <button
            onClick={clear}
            className="p-1.5 rounded-[8px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            title="Clear conversation"
          >
            <Eraser size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">

          {/* Empty state */}
          {messages.length === 0 && !isStreaming && (
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
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-left px-4 py-2.5 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          <div className="space-y-5">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={cn('flex fade-in', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'user' ? (
                  <div className={BUBBLE_USER}>{msg.content}</div>
                ) : (
                  <div className="flex flex-col gap-2 max-w-[min(85%,680px)]">
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1.5">
                        {msg.toolCalls.map(tc => (
                          <ToolCallRow key={tc.id} toolCall={tc} msgId={msg.id} onToggle={toggleToolCall} />
                        ))}
                      </div>
                    )}
                    {msg.content && (
                      <div
                        className={BUBBLE_ASSISTANT}
                        style={{ userSelect: 'text' }}
                        dangerouslySetInnerHTML={{ __html: marked(msg.content) as string }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Streaming */}
            {isStreaming && (
              <div className="flex justify-start fade-in">
                {streamingText ? (
                  <div className={BUBBLE_ASSISTANT} style={{ userSelect: 'text' }}>
                    <span className="whitespace-pre-wrap">{streamingText}</span>
                    <span className="cursor-blink" />
                  </div>
                ) : (
                  <div className={cn(BUBBLE_ASSISTANT, 'flex items-center gap-1.5 py-3')}>
                    {[0, 120, 240].map(d => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-5 pt-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[16px] px-4 py-3 focus-within:border-[var(--border-focus)] shadow-sm transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your papers… (⌘↵ to send)"
              rows={1}
              className="flex-1 bg-transparent border-none text-[13.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none leading-relaxed"
              style={{ height: '24px', minHeight: '24px', userSelect: 'text' }}
            />

            {isStreaming ? (
              <button
                onClick={abort}
                className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors shrink-0"
                title="Stop"
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-[10px] border transition-colors shrink-0',
                  input.trim()
                    ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-[var(--accent-on)] hover:opacity-90'
                    : 'bg-transparent border-[var(--border-color)] text-[var(--text-dim)] cursor-not-allowed'
                )}
                title="Send (⌘↵)"
              >
                <Send size={13} />
              </button>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-dim)] text-center mt-2">
            ⌘↵ send · ↵ newline
          </p>
        </div>
      </div>
    </div>
  )
}
