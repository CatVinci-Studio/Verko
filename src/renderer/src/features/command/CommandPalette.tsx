import React, { useRef, useEffect, useState } from 'react'
import { Bot, FileText, Send, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/ui'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { SearchHit } from '@shared/types'

export function CommandPalette() {
  const { t } = useTranslation()
  const suggestions = (t('command.suggestions', { returnObjects: true }) as string[]) ?? []
  const { commandOpen, setCommandOpen, setActiveView } = useUIStore()
  const { send } = useAgentStore()

  const [input, setInput] = useState('')
  const [paperHits, setPaperHits] = useState<SearchHit[]>([])
  const [contextPaperId, setContextPaperId] = useState<string | undefined>(undefined)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Search papers as user types
  useEffect(() => {
    if (!input.trim() || input.length < 2) {
      setPaperHits([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const hits = await api.papers.search(input, {})
        setPaperHits(hits.slice(0, 5))
      } catch {
        setPaperHits([])
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [input])

  // Reset on open/close
  useEffect(() => {
    if (commandOpen) {
      setInput('')
      setPaperHits([])
      setContextPaperId(undefined)
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommandOpen(false)
    }
    if (commandOpen) {
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }
    return undefined
  }, [commandOpen, setCommandOpen])

  if (!commandOpen) return null

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg) return
    setCommandOpen(false)
    setActiveView('agent')
    await send(msg, undefined, contextPaperId)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, paperHits.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Tab' && paperHits.length > 0) {
      e.preventDefault()
      const hit = paperHits[selectedIndex]
      if (hit) setContextPaperId(hit.paper.id)
    }
  }

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => { if (e.target === e.currentTarget) setCommandOpen(false) }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative w-full max-w-lg mx-4 bg-[var(--bg-surface)] border border-[var(--bg-active)] rounded-xl shadow-2xl overflow-hidden fade-in">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/30 flex items-center justify-center shrink-0">
            <Bot size={14} className="text-[var(--accent-color)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {t('command.label')}
            </p>
          </div>
          <kbd className="text-[11.5px] text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--bg-active)] rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Context pill (if paper selected as context) */}
        {contextPaperId && (
          <div className="px-4 pb-2">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 text-[12.5px] text-[var(--accent-color)]">
              <FileText size={10} />
              <span className="truncate max-w-[240px]">
                {paperHits.find(h => h.paper.id === contextPaperId)?.paper.title ?? contextPaperId}
              </span>
              <button
                onClick={() => setContextPaperId(undefined)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >×</button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-3 border-b border-[var(--bg-active)]">
          <div className="flex gap-2 items-end bg-[var(--bg-elevated)] border border-[var(--bg-active)] rounded-lg p-2.5 focus-within:border-[var(--border-focus)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputResize}
              onKeyDown={handleKeyDown}
              placeholder={t('command.placeholder')}
              rows={1}
              className="flex-1 bg-transparent border-none text-[14.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none leading-relaxed min-h-[22px]"
              style={{ height: '22px', userSelect: 'text' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                'p-1.5 rounded-[5px] border transition-colors shrink-0',
                input.trim()
                  ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-black hover:opacity-90'
                  : 'bg-transparent border-[var(--bg-active)] text-[var(--text-dim)] cursor-not-allowed'
              )}
              title={t('command.send')}
            >
              <Send size={11} />
            </button>
          </div>
          <p className="text-[11.5px] text-[var(--text-dim)] mt-1.5">
            {t('command.shortcutHintBase')}
            {paperHits.length > 0 ? t('command.shortcutHintWithPaper') : ''}
          </p>
        </div>

        {/* Paper suggestions */}
        {paperHits.length > 0 && (
          <div className="py-2">
            <p className="px-4 pb-1 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t('command.papersHeading')}
            </p>
            {paperHits.map((hit, i) => (
              <button
                key={hit.paper.id}
                onClick={() => setContextPaperId(hit.paper.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                  i === selectedIndex
                    ? 'bg-[var(--bg-accent-subtle)]'
                    : 'hover:bg-[var(--bg-elevated)]',
                  contextPaperId === hit.paper.id && 'text-[var(--accent-color)]'
                )}
              >
                <div className="w-5 h-5 rounded bg-[var(--bg-elevated)] border border-[var(--bg-active)] flex items-center justify-center shrink-0">
                  <FileText size={10} className="text-[var(--text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] text-[var(--text-bright)] font-medium truncate">{hit.paper.title}</p>
                  <p className="text-[12.5px] text-[var(--text-muted)] truncate">
                    {hit.paper.authors.slice(0, 2).join(', ')}
                    {hit.paper.year ? ` · ${hit.paper.year}` : ''}
                  </p>
                </div>
                <ArrowRight size={11} className="text-[var(--text-dim)] shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Empty hint */}
        {!input.trim() && paperHits.length === 0 && (
          <div className="px-4 py-4 space-y-1.5">
            {suggestions.map(hint => (
              <button
                key={hint}
                onClick={() => setInput(hint)}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-md hover:bg-[var(--bg-elevated)] transition-colors group"
              >
                <Bot size={11} className="text-[var(--text-dim)] shrink-0 group-hover:text-[var(--accent-color)] transition-colors" />
                <span className="text-[13.5px] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">{hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
