import { useRef, useEffect, useState } from 'react'
import { Bot, Plus, FileText, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentStore } from '@/store/agent'
import { useLibraryStore } from '@/store/library'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/store/dialogs'
import { MessageBubble, StreamingBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import type { ChatContentPart } from '@shared/types'

export function AgentPage() {
  const { t } = useTranslation()
  const suggestions = (t('agent.suggestions', { returnObjects: true }) as string[]) ?? []

  const activeId = useAgentStore((s) => s.activeId)
  const byId = useAgentStore((s) => s.byId)
  const conversations = useAgentStore((s) => s.conversations)
  const send = useAgentStore((s) => s.send)
  const abort = useAgentStore((s) => s.abort)
  const newConversation = useAgentStore((s) => s.newConversation)
  const selectConversation = useAgentStore((s) => s.selectConversation)
  const deleteConversation = useAgentStore((s) => s.deleteConversation)
  const refreshConversations = useAgentStore((s) => s.refreshConversations)
  const toggleToolCall = useAgentStore((s) => s.toggleToolCall)
  const currentPaperId = useAgentStore((s) => s.currentPaperId)

  const { papers } = useLibraryStore()

  const stateKey = activeId ?? '__pending__'
  const conv = byId[stateKey]
  const messages = conv?.messages ?? []
  const isStreaming = conv?.isStreaming ?? false
  const streamingText = conv?.streamingText ?? ''

  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatContentPart[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    refreshConversations().catch(() => {})
  }, [refreshConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = async () => {
    const msg = input.trim()
    if ((!msg && attachments.length === 0) || isStreaming) return
    setInput('')
    const atts = attachments
    setAttachments([])
    await send(msg, atts.length > 0 ? atts : undefined, currentPaperId)
  }

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirmDialog({
      title: t('agent.conversations.delete.title'),
      message: t('agent.conversations.delete.message', { title }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (ok) await deleteConversation(id)
  }

  const contextPaper = currentPaperId ? papers.find((p) => p.id === currentPaperId) : null

  return (
    <div className="flex h-full bg-[var(--bg-base)]">
      {/* Conversation list */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border-color)] flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--border-color)]">
          <span className="text-[11.5px] font-semibold tracking-wide text-[var(--text-muted)] flex-1 uppercase">
            {t('agent.conversations.title')}
          </span>
          <Button
            onClick={newConversation}
            variant="ghost"
            size="icon-sm"
            title={t('agent.conversations.new')}
            className="h-6 w-6 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <Plus size={12} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {conversations.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-[var(--text-muted)]">{t('agent.conversations.empty')}</div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={
                'group flex items-center gap-2 mx-1 px-2 py-2 rounded-[8px] cursor-pointer transition-colors ' +
                (activeId === c.id
                  ? 'bg-[var(--accent-color)]/12 border border-[var(--accent-color)]/25'
                  : 'border border-transparent hover:bg-[var(--bg-elevated)]')
              }
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[var(--text-primary)] truncate">{c.title}</div>
                <div className="text-[10.5px] text-[var(--text-muted)]">{c.messageCount} · {formatRel(c.updatedAt)}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); void handleDelete(c.id, c.title) }}
                className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded"
                title={t('common.delete')}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 h-11 border-b border-[var(--border-color)] shrink-0">
          <div className="w-6 h-6 rounded-[8px] bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/25 flex items-center justify-center shrink-0">
            <Bot size={13} className="text-[var(--accent-color)]" />
          </div>
          <span className="text-[13px] font-medium text-[var(--text-secondary)] truncate flex-1">
            {activeId ? (conversations.find((c) => c.id === activeId)?.title ?? t('agent.title')) : t('agent.title')}
          </span>
          {contextPaper && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20">
              <FileText size={10} className="text-[var(--accent-color)]" />
              <span className="text-[11px] text-[var(--accent-color)] truncate max-w-[180px]">
                {contextPaper.title}
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6">
            {messages.length === 0 && !isStreaming && (
              <EmptyState
                suggestions={suggestions}
                title={t('agent.emptyTitle')}
                description={t('agent.emptyDescription')}
                onPick={(s) => setInput(s)}
              />
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
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={handleSend}
          onAbort={abort}
          isStreaming={isStreaming}
          autoFocus
        />
      </div>
    </div>
  )
}

function formatRel(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

interface EmptyStateProps {
  title: string
  description: string
  suggestions: string[]
  onPick: (suggestion: string) => void
}

function EmptyState({ title, description, suggestions, onPick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-6 pt-12">
      <div className="w-12 h-12 rounded-[14px] bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 flex items-center justify-center">
        <Bot size={22} className="text-[var(--accent-color)]" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-medium text-[var(--text-primary)] mb-1">{title}</p>
        <p className="text-[13px] text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
        {suggestions.map((s) => (
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
