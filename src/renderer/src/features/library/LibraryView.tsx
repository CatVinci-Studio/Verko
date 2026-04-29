import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Type, Hash, Calendar, CircleDot, Tag, ChevronUp, ChevronDown } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { api } from '@/lib/ipc'
import { confirmDialog, promptDialog } from '@/store/dialogs'
import { FilterBar } from './FilterBar'
import { PaperRow } from './PaperRow'
import { cn } from '@/lib/utils'
import type { PaperRef, Column } from '@shared/types'

type SortKey = string
type SortDir = 'asc' | 'desc'

const CORE_COLS = new Set(['id', 'title', 'authors', 'year', 'status', 'tags',
  'pdf', 'doi', 'url', 'added_at', 'updated_at'])

const TYPE_ICON: Record<string, React.ReactNode> = {
  text:   <Type size={11} />,
  number: <Hash size={11} />,
  date:   <Calendar size={11} />,
  select: <CircleDot size={11} />,
  tags:   <Tag size={11} />,
  url:    <Type size={11} />,
}

function sortPapers(papers: PaperRef[], key: SortKey, dir: SortDir): PaperRef[] {
  return [...papers].sort((a, b) => {
    const av = a[key] as string | number | undefined
    const bv = b[key] as string | number | undefined
    if (av == null) return 1
    if (bv == null) return -1
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export function LibraryView() {
  const { papers, schema, selectedId, setSelected, refreshPapers, isLoadingPapers, collections, activeCollection, refreshCollections } = useLibraryStore()
  const { setActiveView } = useUIStore()
  const queryClient = useQueryClient()

  const [sortKey, setSortKey] = React.useState<SortKey>('added_at')
  const [sortDir, setSortDir] = React.useState<SortDir>('desc')

  const extraCols: Column[] = React.useMemo(
    () => (schema?.columns ?? []).filter(c => c.inCsv && !CORE_COLS.has(c.name)),
    [schema]
  )

  const sortedPapers = React.useMemo(
    () => sortPapers(papers, sortKey, sortDir),
    [papers, sortKey, sortDir]
  )

  const handleSort = (key: SortKey) => {
    setSortKey(key)
    setSortDir(prev => sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc')
  }

  const handleSelect = (id: string) => {
    setSelected(id)
    setActiveView('paper')
  }

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Delete paper?',
      message: 'This removes the Markdown file and any attachments. The action cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await api.papers.delete(id)
    queryClient.invalidateQueries({ queryKey: ['papers'] })
    refreshPapers()
    if (selectedId === id) { setSelected(null); setActiveView('library') }
  }

  const handleNewPaper = async () => {
    try {
      const id = await api.papers.add({ title: 'Untitled', status: 'unread', tags: [] })
      await refreshPapers()
      handleSelect(id)
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddToCollection = async (paperId: string, collectionName: string) => {
    try {
      await api.collections.addPaper(paperId, collectionName)
      await refreshCollections()
    } catch (e) {
      console.error(e)
    }
  }

  const handleRemoveFromCollection = async (paperId: string, collectionName: string) => {
    try {
      await api.collections.removePaper(paperId, collectionName)
      await refreshCollections()
      refreshPapers()
    } catch (e) {
      console.error(e)
    }
  }

  const handleImportDoi = async () => {
    const result = await promptDialog({
      title: 'Import paper',
      description: 'Enter a DOI (e.g. 10.1145/...) or an arXiv URL.',
      fields: [{ name: 'doi', label: 'DOI or arXiv URL', placeholder: '10.1145/...', required: true }],
      confirmLabel: 'Import',
    })
    if (!result) return
    try {
      await api.papers.importDoi(result.doi.trim())
      refreshPapers()
    } catch (e) {
      console.error(e)
    }
  }

  const ColHeader = ({ label, col, type, align = 'left' }: {
    label: string
    col?: SortKey
    type?: string
    align?: 'left' | 'right'
  }) => {
    const active = col && sortKey === col
    return (
      <button
        className={cn(
          'flex items-center gap-1 text-[11px] font-medium transition-colors group/col',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          !col && 'cursor-default'
        )}
        onClick={col ? () => handleSort(col) : undefined}
      >
        <span className="opacity-60">{type && TYPE_ICON[type]}</span>
        {label}
        {active && (
          sortDir === 'asc'
            ? <ChevronUp size={10} />
            : <ChevronDown size={10} />
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      <FilterBar />

      {/* Column headers */}
      <div className="flex items-center gap-0 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0 select-none">
        {/* left accent placeholder */}
        <div className="w-0.5 self-stretch" />
        <div className="flex-1 min-w-0 flex items-center h-8 pl-4 pr-2">
          <ColHeader label="Title" col="title" type="text" />
        </div>
        <div className="w-36 shrink-0 hidden md:flex items-center h-8 px-2">
          <ColHeader label="Authors" col="authors" type="text" />
        </div>
        <div className="w-12 shrink-0 hidden md:flex items-center justify-end h-8 px-2">
          <ColHeader label="Year" col="year" type="number" align="right" />
        </div>
        <div className="w-24 shrink-0 flex items-center justify-end h-8 px-2">
          <ColHeader label="Status" col="status" type="select" align="right" />
        </div>
        <div className="w-32 shrink-0 hidden lg:flex items-center justify-end h-8 px-2">
          <ColHeader label="Tags" type="tags" align="right" />
        </div>
        {extraCols.map(col => (
          <div key={col.name} className="w-20 shrink-0 hidden xl:flex items-center justify-end h-8 px-2">
            <ColHeader label={col.name} col={col.name} type={col.type} align="right" />
          </div>
        ))}
        {/* actions column spacer */}
        <div className="w-9 shrink-0" />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingPapers ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-[var(--text-muted)]">
            Loading…
          </div>
        ) : (
          <>
            {sortedPapers.map(paper => (
              <PaperRow
                key={paper.id}
                paper={paper}
                extraCols={extraCols}
                collections={collections}
                activeCollection={activeCollection}
                selected={selectedId === paper.id}
                onClick={() => handleSelect(paper.id)}
                onDelete={() => handleDelete(paper.id)}
                onCopyDoi={() => { if (paper.doi) navigator.clipboard.writeText(paper.doi) }}
                onAddToCollection={(name) => handleAddToCollection(paper.id, name)}
                onRemoveFromCollection={(name) => handleRemoveFromCollection(paper.id, name)}
              />
            ))}

            {/* Inline "New paper" row */}
            <button
              onClick={handleNewPaper}
              className={cn(
                'w-full flex items-center gap-2 pl-4 h-9',
                'text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                'hover:bg-[var(--bg-sidebar-hover)] transition-colors',
                'border-b border-[var(--border-color)]/30'
              )}
            >
              <Plus size={13} />
              New paper
            </button>
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border-color)] shrink-0">
        <span className="text-[11px] text-[var(--text-muted)]">
          {sortedPapers.length} paper{sortedPapers.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleImportDoi}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-md transition-colors"
        >
          <Upload size={11} />
          Import DOI
        </button>
      </div>
    </div>
  )
}
