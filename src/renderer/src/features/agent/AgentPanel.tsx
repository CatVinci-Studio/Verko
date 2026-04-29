import React, { useRef, useEffect, useState } from 'react'
import { X, Send, Square, Trash2, Bot } from 'lucide-react'
import { useAgentStore } from '@/store/agent'
import { useUIStore } from '@/store/ui'
import { useAgentEvents } from './useAgent'
import { ToolCallRow } from './ToolCallRow'
import { cn } from '@/lib/utils'
import { marked } from 'marked'

export function AgentPanel() {
  const { messages, isStreaming, streamingText, send, abort, clear, toggleToolCall, currentPaperId } = useAgentStore()
  const { agentOpen, setAgentOpen } = useUIStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Subscribe to agent events
  useAgentEvents()

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Focus input when opened
  useEffect(() => {
    if (agentOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [agentOpen])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    await send(msg, currentPaperId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
    // Allow normal Enter for newlines
  }

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  if (!agentOpen) return null

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-base)] border-l border-[var(--bg-active)] slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--bg-active)] shrink-0">
        <Bot size={14} className="text-[var(--accent-color)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)] flex-1">Agent</span>

        {currentPaperId && (
          <span className="text-[10px] text-[var(--accent-color)] bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 rounded-full px-2 py-0.5">
            In context
          </span>
        )}

        {messages.length > 0 && (
          <button
            onClick={clear}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            title="Clear chat"
          >
            <Trash2 size={13} />
          </button>
        )}

        <button
          onClick={() => setAgentOpen(false)}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          title="Close agent (⌘.)"
        >
          <X size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Bot size={24} className="text-[var(--bg-active)]" />
            <p className="text-[12px] text-[var(--text-muted)] text-center leading-relaxed">
              Ask about the paper, summarize, extract key findings, or search your library.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={cn('fade-in', msg.role === 'user' ? 'flex justify-end' : '')}>
            {msg.role === 'user' ? (
              <div className="max-w-[85%] bg-[var(--bg-accent-subtle)] border border-[var(--bg-accent-subtle)] rounded-[8px] px-3 py-2">
                <p className="text-[12px] text-[var(--accent-color)] whitespace-pre-wrap" style={{ userSelect: 'text' }}>
                  {msg.content}
                </p>
              </div>
            ) : (
              <div className="flex gap-2 max-w-full">
                <div className="w-5 h-5 rounded-full bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={10} className="text-[var(--accent-color)]" />
                </div>
                <div className="flex-1 min-w-0">
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {msg.toolCalls.map(tc => (
                        <ToolCallRow
                          key={tc.id}
                          toolCall={tc}
                          msgId={msg.id}
                          onToggle={toggleToolCall}
                        />
                      ))}
                    </div>
                  )}
                  {msg.content && (
                    <div
                      className="text-[12px] text-[var(--text-bright)] leading-relaxed prose-paper"
                      style={{ userSelect: 'text' }}
                      dangerouslySetInnerHTML={{ __html: marked(msg.content) as string }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Streaming text */}
        {isStreaming && (
          <div className="flex gap-2 fade-in">
            <div className="w-5 h-5 rounded-full bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/30 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={10} className="text-[var(--accent-color)]" />
            </div>
            <div className="flex-1 min-w-0">
              {streamingText ? (
                <span
                  className="text-[12px] text-[var(--text-bright)] leading-relaxed whitespace-pre-wrap"
                  style={{ userSelect: 'text' }}
                >
                  {streamingText}
                  <span className="cursor-blink" />
                </span>
              ) : (
                <span className="flex gap-1 items-center mt-1">
                  <span className="w-1 h-1 bg-[var(--accent-color)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-[var(--accent-color)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-[var(--accent-color)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-[var(--bg-active)] shrink-0">
        <div className="flex gap-2 items-end bg-[var(--bg-surface)] border border-[var(--bg-active)] rounded-[8px] p-2 focus-within:border-[var(--border-focus)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputResize}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the paper… (⌘↵ to send)"
            rows={1}
            className="flex-1 bg-transparent border-none text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none leading-relaxed min-h-[20px]"
            style={{ userSelect: 'text', height: '20px' }}
          />

          <div className="flex items-center gap-1 shrink-0">
            {isStreaming ? (
              <button
                onClick={abort}
                className="p-1.5 rounded-[5px] bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors"
                title="Stop"
              >
                <Square size={11} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  'p-1.5 rounded-[5px] border transition-colors',
                  input.trim()
                    ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)]'
                    : 'bg-transparent border-[var(--bg-active)] text-[var(--text-dim)] cursor-not-allowed'
                )}
                title="Send (⌘↵)"
              >
                <Send size={11} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-dim)] mt-1 text-right">⌘↵ send · ↵ newline</p>
      </div>
    </div>
  )
}
