import React, { useState, useCallback } from 'react'
import { X, Star, Plus, Bot, FileText } from 'lucide-react'
import { marked } from 'marked'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { useAgentStore } from '@/store/agent'
import { usePaperDetail, useUpdatePaper } from './usePaper'
import { MarkdownEditor } from './MarkdownEditor'
import { PdfViewer } from './PdfViewer'
import { ChipStatus } from '@/components/common/ChipStatus'
import { ChipTag } from '@/components/common/ChipTag'
import { cn, formatYear } from '@/lib/utils'
import type { PaperStatus } from '@shared/types'

const STATUS_CYCLE: PaperStatus[] = ['unread', 'reading', 'read', 'archived']

export function PaperDetail() {
  const { selectedId } = useLibraryStore()
  const { activeDetailTab, setActiveDetailTab, setActiveView } = useUIStore()
  const { setCurrentPaperId } = useAgentStore()

  const { data: paper, isLoading, error } = usePaperDetail(selectedId)
  const updatePaper = useUpdatePaper()

  // Inline edit states
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingAuthors, setEditingAuthors] = useState(false)
  const [authorsDraft, setAuthorsDraft] = useState('')
  const [editingYear, setEditingYear] = useState(false)
  const [yearDraft, setYearDraft] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [markdownValue, setMarkdownValue] = useState('')

  React.useEffect(() => {
    if (paper) {
      setMarkdownValue(paper.markdown ?? '')
    }
  }, [paper?.id])

  const handleClose = () => {
    setActiveView('library')
  }

  const handleOpenAgent = () => {
    if (selectedId) setCurrentPaperId(selectedId)
    setActiveView('agent')
  }

  // Status click cycles through statuses
  const handleStatusClick = () => {
    if (!paper) return
    const idx = STATUS_CYCLE.indexOf(paper.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    updatePaper.mutate({ id: paper.id, patch: { status: next } })
  }

  // Rating click
  const handleRating = (r: number) => {
    if (!paper) return
    updatePaper.mutate({ id: paper.id, patch: { rating: r === paper.rating ? 0 : r } })
  }

  // Title save
  const handleTitleSave = () => {
    if (!paper || !titleDraft.trim()) return
    updatePaper.mutate({ id: paper.id, patch: { title: titleDraft.trim() } })
    setEditingTitle(false)
  }

  // Authors save
  const handleAuthorsSave = () => {
    if (!paper) return
    const authors = authorsDraft.split(',').map(a => a.trim()).filter(Boolean)
    updatePaper.mutate({ id: paper.id, patch: { authors } })
    setEditingAuthors(false)
  }

  // Year save
  const handleYearSave = () => {
    if (!paper) return
    const year = parseInt(yearDraft)
    if (!isNaN(year)) {
      updatePaper.mutate({ id: paper.id, patch: { year } })
    }
    setEditingYear(false)
  }

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    if (!paper) return
    updatePaper.mutate({ id: paper.id, patch: { tags: paper.tags.filter(t => t !== tag) } })
  }

  // Add tag
  const handleAddTag = () => {
    if (!paper || !tagDraft.trim()) { setAddingTag(false); setTagDraft(''); return }
    const newTag = tagDraft.trim().replace(/^#/, '')
    if (!paper.tags.includes(newTag)) {
      updatePaper.mutate({ id: paper.id, patch: { tags: [...paper.tags, newTag] } })
    }
    setTagDraft('')
    setAddingTag(false)
  }

  // Markdown save
  const handleMarkdownSave = useCallback((value: string) => {
    if (!paper) return
    updatePaper.mutate({ id: paper.id, patch: { markdown: value } })
  }, [paper, updatePaper])

  // Render markdown to HTML
  const htmlContent = React.useMemo(() => {
    if (!markdownValue) return '<p style="color:#555;font-style:italic">No notes yet. Switch to Edit to add content.</p>'
    return marked(markdownValue) as string
  }, [markdownValue])

  if (!selectedId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <FileText size={28} className="text-[var(--bg-active)]" />
        <p className="text-[13px] text-[var(--text-muted)]">Select a paper to view</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[12px] text-[var(--text-muted)]">Loading…</span>
      </div>
    )
  }

  if (error || !paper) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[12px] text-[var(--danger)]">Failed to load paper</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--bg-active)] shrink-0">
        {/* Title row */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                className="w-full bg-transparent border-none text-[15px] font-semibold text-[var(--text-primary)] focus:outline-none pb-0.5 border-b border-[var(--accent-color)]"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSave()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                style={{ userSelect: 'text' }}
              />
            ) : (
              <h2
                className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight cursor-text hover:text-white"
                onClick={() => { setTitleDraft(paper.title); setEditingTitle(true) }}
                title="Click to edit title"
              >
                {paper.title || <span className="text-[var(--text-muted)] italic">Untitled</span>}
              </h2>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleOpenAgent}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-elevated)] transition-colors"
              title="Ask agent about this paper (⌘.)"
            >
              <Bot size={15} />
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Authors & Year row */}
        <div className="flex items-center gap-2 mb-2">
          {editingAuthors ? (
            <input
              autoFocus
              className="flex-1 bg-transparent border-none text-[12px] text-[var(--text-secondary)] focus:outline-none border-b border-[var(--accent-color)]"
              value={authorsDraft}
              onChange={e => setAuthorsDraft(e.target.value)}
              onBlur={handleAuthorsSave}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAuthorsSave()
                if (e.key === 'Escape') setEditingAuthors(false)
              }}
              placeholder="Author 1, Author 2..."
              style={{ userSelect: 'text' }}
            />
          ) : (
            <span
              className="text-[12px] text-[var(--text-secondary)] cursor-text hover:text-[var(--text-muted)] truncate"
              onClick={() => { setAuthorsDraft(paper.authors.join(', ')); setEditingAuthors(true) }}
              title="Click to edit authors"
            >
              {paper.authors.length > 0 ? paper.authors.join(', ') : <span className="text-[var(--text-muted)] italic">No authors</span>}
            </span>
          )}

          <span className="text-[var(--bg-active)]">·</span>

          {editingYear ? (
            <input
              autoFocus
              className="w-14 bg-transparent border-none text-[12px] text-[var(--text-secondary)] focus:outline-none border-b border-[var(--accent-color)] text-center"
              value={yearDraft}
              onChange={e => setYearDraft(e.target.value)}
              onBlur={handleYearSave}
              onKeyDown={e => {
                if (e.key === 'Enter') handleYearSave()
                if (e.key === 'Escape') setEditingYear(false)
              }}
              style={{ userSelect: 'text' }}
            />
          ) : (
            <span
              className="text-[12px] text-[var(--text-secondary)] cursor-text hover:text-[var(--text-muted)]"
              onClick={() => { setYearDraft(String(paper.year ?? '')); setEditingYear(true) }}
              title="Click to edit year"
            >
              {formatYear(paper.year)}
            </span>
          )}

          {paper.venue && (
            <>
              <span className="text-[var(--bg-active)]">·</span>
              <span className="text-[12px] text-[var(--text-muted)] truncate max-w-[120px]">{paper.venue}</span>
            </>
          )}
        </div>

        {/* Status + Tags + Rating row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ChipStatus
            status={paper.status}
            onClick={handleStatusClick}
            className="cursor-pointer"
          />

          {paper.tags.map(tag => (
            <ChipTag
              key={tag}
              tag={tag}
              onRemove={() => handleRemoveTag(tag)}
            />
          ))}

          {addingTag ? (
            <input
              autoFocus
              className="w-20 bg-[var(--bg-elevated)] border border-[var(--bg-active)] rounded-full px-2 py-0.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onBlur={handleAddTag}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddTag()
                if (e.key === 'Escape') { setAddingTag(false); setTagDraft('') }
              }}
              placeholder="tag..."
              style={{ userSelect: 'text' }}
            />
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="inline-flex items-center gap-0.5 rounded-full text-[11px] px-1.5 py-0.5 border border-dashed border-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--text-dim)] transition-colors"
            >
              <Plus size={9} />tag
            </button>
          )}

          {/* Rating */}
          <div className="ml-auto flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(r => (
              <button
                key={r}
                onClick={() => handleRating(r)}
                className="transition-colors"
              >
                <Star
                  size={13}
                  className={cn(
                    'transition-colors',
                    (paper.rating ?? 0) >= r
                      ? 'fill-[var(--warning)] text-[var(--warning)]'
                      : 'text-[var(--bg-active)] hover:text-[var(--warning)]'
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center px-4 border-b border-[var(--bg-active)] shrink-0">
        {(['read', 'edit', 'pdf'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveDetailTab(tab)}
            className={cn(
              'px-3 py-2 text-[12px] font-medium border-b-2 transition-colors capitalize',
              activeDetailTab === tab
                ? 'border-[var(--accent-color)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            {tab === 'pdf' ? 'PDF' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeDetailTab === 'read' && (
          <div className="h-full overflow-y-auto px-5 py-4 select-text">
            <div
              className="prose-paper max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        )}

        {activeDetailTab === 'edit' && (
          <MarkdownEditor
            value={markdownValue}
            onChange={setMarkdownValue}
            onSave={handleMarkdownSave}
          />
        )}

        {activeDetailTab === 'pdf' && (
          <PdfViewer paperId={paper.id} />
        )}
      </div>
    </div>
  )
}
