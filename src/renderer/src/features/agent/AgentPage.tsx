import { useRef, useEffect, useState } from 'react'
import { Bot, FileText, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentStore } from '@/store/agent'
import { useUIStore } from '@/store/ui'
import { useMobile } from '@/lib/useMobile'
import { usePapersQuery } from '@/features/library/queries'
import { MessageBubble, StreamingBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { expandMentionsToContent } from './expandMentions'
import { api } from '@/lib/ipc'
import logoUrl from '@/assets/logo.jpg'
import type { ChatContentPart, PaperRef } from '@shared/types'

export function AgentPage() {
  const { t } = useTranslation()
  const isMobile = useMobile()
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)

  const activeId = useAgentStore((s) => s.activeId)
  const byId = useAgentStore((s) => s.byId)
  const conversations = useAgentStore((s) => s.conversations)
  const send = useAgentStore((s) => s.send)
  const abort = useAgentStore((s) => s.abort)
  const compact = useAgentStore((s) => s.compact)
  const refreshConversations = useAgentStore((s) => s.refreshConversations)
  const toggleToolCall = useAgentStore((s) => s.toggleToolCall)
  const currentPaperId = useAgentStore((s) => s.currentPaperId)

  const { data: papers = [] } = usePapersQuery()

  const stateKey = activeId ?? '__pending__'
  const conv = byId[stateKey]
  const messages = conv?.messages ?? []
  const isStreaming = conv?.isStreaming ?? false
  const streamingText = conv?.streamingText ?? ''

  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatContentPart[]>([])
  const [mentionedPapers, setMentionedPapers] = useState<PaperRef[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    refreshConversations().catch(() => {})
  }, [refreshConversations])

  const messageCount = messages.length
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount, streamingText])

  const handleSend = async () => {
    const msg = input.trim()
    if ((!msg && attachments.length === 0 && mentionedPapers.length === 0) || isStreaming) return

    // Slash commands. Single-keyword for now; expand later as needed.
    if (msg === '/compact') {
      setInput('')
      setAttachments([])
      setMentionedPapers([])
      await compact()
      return
    }

    setInput('')
    const atts = attachments
    const refs = mentionedPapers
    setAttachments([])
    setMentionedPapers([])

    const expanded = await expandMentionsToContent(refs, api.papers.get)
    const finalAtts: ChatContentPart[] | undefined = (expanded.length || atts.length)
      ? [...expanded, ...atts]
      : undefined
    await send(msg, finalAtts, currentPaperId)
  }

  const contextPaper = currentPaperId ? papers.find((p) => p.id === currentPaperId) : null

  return (
    <div className="flex h-full bg-[var(--bg-base)]">
      {/* Chat area (conversation list lives in the main Sidebar) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 sm:px-4 h-11 max-sm:pt-[max(env(safe-area-inset-top),0px)] max-sm:h-[calc(2.75rem+max(env(safe-area-inset-top),0px))] border-b border-[var(--border-color)] shrink-0">
          {isMobile && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="shrink-0 p-1.5 -ml-1 rounded-[6px] text-[var(--text-muted)] active:bg-[var(--bg-elevated)]"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          )}
          <div className="w-6 h-6 rounded-[8px] bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/25 flex items-center justify-center shrink-0">
            <Bot size={13} className="text-[var(--accent-color)]" />
          </div>
          <span className="text-[15.5px] font-medium text-[var(--text-secondary)] truncate flex-1 min-w-0">
            {activeId ? (conversations.find((c) => c.id === activeId)?.title ?? t('agent.title')) : t('agent.title')}
          </span>
          {contextPaper && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 shrink-0 min-w-0 max-w-[40vw]">
              <FileText size={10} className="text-[var(--accent-color)] shrink-0" />
              <span className="text-[13.5px] text-[var(--accent-color)] truncate">
                {contextPaper.title}
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !isStreaming ? (
            <EmptyState />
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <div className="space-y-4 sm:space-y-5">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} onToggleToolCall={toggleToolCall} />
                ))}
                {isStreaming && <StreamingBubble text={streamingText} />}
              </div>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          mentionedPapers={mentionedPapers}
          onMentionedPapersChange={setMentionedPapers}
          onSend={handleSend}
          onAbort={abort}
          isStreaming={isStreaming}
          autoFocus
        />
      </div>
    </div>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 px-4 sm:px-6">
      <img src={logoUrl} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-[18px] shadow-sm" />
      <div className="text-center">
        <p className="text-[19px] sm:text-[22px] font-semibold text-[var(--text-primary)] tracking-tight">
          {t('agent.welcomeTitle')}
        </p>
        <p className="text-[14.5px] sm:text-[15px] text-[var(--text-muted)] mt-1">
          {t('agent.welcomeSubtitle')}
        </p>
      </div>
    </div>
  )
}
