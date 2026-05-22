import { useEffect, useState } from 'react'
import { Layers, FileText, ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCollectionsQuery, usePapersQuery } from '@/features/library/queries'
import { api } from '@/lib/ipc'
import type { PaperRef } from '@shared/types'

interface MentionPickerProps {
  /** Anchor position in viewport coordinates (typically the caret). */
  x: number
  y: number
  /** Substring after the `@` character — used to filter the visible list. */
  query: string
  onPick: (paper: PaperRef) => void
  onCancel: () => void
}

/**
 * Two-level picker rendered as a fixed-position popover. Level 1 shows
 * collections plus an "All papers" entry; level 2 shows papers within
 * the selected collection (or the full library). Filtered live by the
 * trailing query the user types after `@`.
 */
export function MentionPicker({ x, y, query, onPick, onCancel }: MentionPickerProps) {
  const { t } = useTranslation()
  const { data: collections = [] } = useCollectionsQuery()
  const { data: papers = [] } = usePapersQuery()
  const [collection, setCollection] = useState<string | null>(null)  // null = top level
  const [scopedPapers, setScopedPapers] = useState<PaperRef[] | null>(null)
  const [highlight, setHighlight] = useState(0)

  // Load papers for the chosen collection (or fall back to the cached full list).
  useEffect(() => {
    if (collection == null) { setScopedPapers(null); return }
    void api.papers.list(undefined, collection).then(setScopedPapers).catch(() => setScopedPapers([]))
  }, [collection])

  const lowerQuery = query.toLowerCase()
  const visibleCollections = collections.filter((c) => c.name.toLowerCase().includes(lowerQuery))
  const allPapers = scopedPapers ?? papers
  const visiblePapers = allPapers.filter((p) =>
    p.title.toLowerCase().includes(lowerQuery) ||
    p.authors.some((a) => a.toLowerCase().includes(lowerQuery)),
  )

  // Reset highlight whenever the visible list changes.
  useEffect(() => { setHighlight(0) }, [collection, query])

  // Compose the navigable item list. At top level we show collections
  // first, then a divider, then a flat paper list as a shortcut.
  const items: Array<
    | { kind: 'collection'; name: string }
    | { kind: 'paper'; paper: PaperRef }
    | { kind: 'back' }
  > = collection == null
    ? [
        ...visibleCollections.map((c) => ({ kind: 'collection' as const, name: c.name })),
        ...visiblePapers.map((p) => ({ kind: 'paper' as const, paper: p })),
      ]
    : [
        { kind: 'back' as const },
        ...visiblePapers.map((p) => ({ kind: 'paper' as const, paper: p })),
      ]

  const choose = (idx: number) => {
    const item = items[idx]
    if (!item) return
    if (item.kind === 'collection') setCollection(item.name)
    else if (item.kind === 'back')  setCollection(null)
    else                             onPick(item.paper)
  }

  // Keyboard navigation. We listen at the document level so the textarea
  // keeps focus while the picker is open — this matches Slack / Notion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        choose(highlight)
      } else if (e.key === 'Backspace' && query === '' && collection != null) {
        e.preventDefault()
        setCollection(null)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, highlight, query, collection])

  // Position the popover above the caret, clamping to viewport edges.
  const popoverHeight = 320
  const popoverWidth = 280
  const top = Math.max(8, y - popoverHeight - 8)
  const left = Math.min(window.innerWidth - popoverWidth - 8, Math.max(8, x))

  return (
    <div
      style={{ position: 'fixed', top, left, width: popoverWidth, height: popoverHeight, zIndex: 60 }}
      className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[10px] shadow-lg overflow-hidden flex flex-col"
      onMouseDown={(e) => e.preventDefault()}  // keep textarea focus
    >
      <div className="px-3 py-1.5 text-[13px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)]">
        {collection == null
          ? t('agent.mention.title')
          : <>{collection} <span className="text-[var(--text-dim)] normal-case lowercase">{t('agent.mention.papersIn')}</span></>}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-[14px] text-[var(--text-muted)]">
            {t('agent.mention.empty')}
          </div>
        )}
        {items.map((item, i) => (
          <button
            key={
              item.kind === 'collection' ? `c:${item.name}`
              : item.kind === 'back' ? 'back'
              : `p:${item.paper.id}`
            }
            onClick={() => choose(i)}
            onMouseEnter={() => setHighlight(i)}
            className={
              'w-full flex items-center gap-2 px-3 py-1.5 text-left text-[14.5px] transition-colors '
              + (highlight === i
                ? 'bg-[var(--bg-sidebar-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-sidebar-hover)]')
            }
          >
            {item.kind === 'collection' && (
              <>
                <Layers size={11} className="shrink-0 text-[var(--text-muted)]" />
                <span className="flex-1 truncate">{item.name}</span>
              </>
            )}
            {item.kind === 'back' && (
              <>
                <ChevronLeft size={11} className="shrink-0 text-[var(--text-muted)]" />
                <span className="flex-1 truncate">{t('agent.mention.back')}</span>
              </>
            )}
            {item.kind === 'paper' && (
              <>
                <FileText size={11} className="shrink-0 text-[var(--text-muted)]" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.paper.title || item.paper.id}</div>
                  {item.paper.authors.length > 0 && (
                    <div className="text-[13px] text-[var(--text-muted)] truncate">
                      {item.paper.authors.slice(0, 3).join('; ')}{item.paper.year ? ` · ${item.paper.year}` : ''}
                    </div>
                  )}
                </div>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
