import { useMemo, useRef, useState } from 'react'
import { useDragAutoScroll } from './useDragAutoScroll'
import { useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { Plus, Upload, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { api } from '@/lib/ipc'
import { confirmDialog, promptDialog } from '@/store/dialogs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FilterModal } from './FilterBar'
import { PaperRow } from './PaperRow'
import { ColumnHeader } from './ColumnHeader'
import { buildColumns } from './columns'
import { useColumnPersistence } from './useColumnPersistence'
import type { Column, ColumnType, PaperRef } from '@shared/types'

const CORE_COLS = new Set(['id', 'title', 'authors', 'year', 'status', 'tags', 'rating', 'added_at', 'updated_at', 'doi', 'url', 'venue', 'pdf'])

export function LibraryView() {
  const { t } = useTranslation()
  const {
    papers,
    schema,
    selectedId,
    setSelected,
    refreshPapers,
    isLoadingPapers,
    collections,
    activeCollection,
    refreshCollections,
    libraries,
  } = useLibraryStore()
  const { setActiveView } = useUIStore()
  const queryClient = useQueryClient()

  const activeLibraryName = libraries.find((l) => l.active)?.name ?? null

  const extraCols: Column[] = useMemo(
    () => schema?.columns.filter((c) => !CORE_COLS.has(c.name)) ?? [],
    [schema]
  )

  // Re-key on i18n.language so column header labels update when the user
  // switches languages — buildColumns reads strings via t() at construction time.
  const columns = useMemo(() => buildColumns(extraCols, t), [extraCols, t])

  const [sorting, setSorting] = useState<SortingState>([{ id: 'added_at', desc: true }])
  const [editingId, setEditingId] = useState<string | null>(null)
  const {
    sizing, setSizing,
    visibility, setVisibility,
    order, setOrder,
    pinning, setPinning,
  } = useColumnPersistence(activeLibraryName)

  const handleSelect = (id: string) => {
    setSelected(id)
    setActiveView('paper')
  }

  const handleInlineUpdate = async (id: string, patch: Parameters<typeof api.papers.update>[1]) => {
    try {
      await api.papers.update(id, patch)
      await refreshPapers()
      queryClient.invalidateQueries({ queryKey: ['papers'] })
    } catch (e) {
      console.error(e)
    }
  }

  const table = useReactTable({
    data: papers,
    columns,
    state: {
      sorting,
      columnVisibility: visibility,
      columnSizing: sizing,
      columnOrder: order,
      columnPinning: pinning,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onColumnSizingChange: setSizing,
    onColumnOrderChange: setOrder,
    onColumnPinningChange: setPinning,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      open: handleSelect,
      update: handleInlineUpdate,
      editingId,
      clearEditingId: () => setEditingId(null),
    },
  })

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: t('library.deletePaper.title'),
      message: t('library.deletePaper.message'),
      confirmLabel: t('library.deletePaper.confirmLabel'),
      danger: true,
    })
    if (!ok) return
    await api.papers.delete(id)
    queryClient.invalidateQueries({ queryKey: ['papers'] })
    refreshPapers()
    if (selectedId === id) {
      setSelected(null)
      setActiveView('library')
    }
  }

  const handleNewPaper = async () => {
    try {
      const id = await api.papers.add({ title: '', status: 'unread', tags: [] })
      await refreshPapers()
      // Select the new row and put its title cell into edit mode — clicking
      // the row's arrow opens the detail page, but creation alone shouldn't
      // navigate away from the table.
      setSelected(id)
      setEditingId(id)
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
      title: t('library.importDialog.title'),
      description: t('library.importDialog.description'),
      fields: [
        { name: 'doi', label: t('library.importDialog.field'), placeholder: '10.1145/...', required: true },
      ],
      confirmLabel: t('library.importDialog.confirmLabel'),
    })
    if (!result) return
    try {
      await api.papers.importDoi(result.doi.trim())
      refreshPapers()
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddColumn = async () => {
    const result = await promptDialog({
      title: t('library.newColumn.title'),
      description: t('library.newColumn.description'),
      fields: [
        { name: 'name', label: t('library.newColumn.name'), required: true },
        {
          name: 'type',
          label: t('library.newColumn.type'),
          initialValue: 'text',
          required: true,
        },
      ],
      confirmLabel: t('library.newColumn.create'),
    })
    if (!result) return
    try {
      await api.schema.addColumn({
        name: result.name.trim(),
        type: result.type.trim() as ColumnType,
        inCsv: true,
      })
      queryClient.invalidateQueries({ queryKey: ['schema'] })
    } catch (e) {
      console.error(e)
    }
  }

  const hiddenColumns = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && !c.getIsVisible())

  const scrollRef = useRef<HTMLDivElement>(null)
  useDragAutoScroll(scrollRef)

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      <FilterModal />

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <TableHeader
          table={table}
          hiddenColumns={hiddenColumns}
          onAddColumn={handleAddColumn}
        />

        {isLoadingPapers ? (
          <div className="flex items-center justify-center h-32 text-[14.5px] text-[var(--text-muted)]">
            {t('common.loading')}
          </div>
        ) : (
          <>
            {table.getRowModel().rows.map((row) => (
              <PaperRow
                key={row.original.id}
                row={row}
                paper={row.original}
                collections={collections}
                activeCollection={activeCollection}
                selected={selectedId === row.original.id}
                onClick={() => handleSelect(row.original.id)}
                onDelete={() => handleDelete(row.original.id)}
                onCopyDoi={() => {
                  if (row.original.doi) navigator.clipboard.writeText(row.original.doi)
                }}
                onAddToCollection={(name) => handleAddToCollection(row.original.id, name)}
                onRemoveFromCollection={(name) => handleRemoveFromCollection(row.original.id, name)}
              />
            ))}

            <button
              onClick={handleNewPaper}
              className="w-full flex items-center gap-2 pl-4 h-9 text-[14.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-sidebar-hover)] transition-colors border-b border-[var(--border-color)]/30 text-left"
            >
              <Plus size={13} />
              {t('library.newPaper')}
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border-color)] shrink-0">
        <span className="text-[13.5px] text-[var(--text-muted)]">
          {t('library.papers', { count: table.getRowModel().rows.length })}
        </span>
        <Button
          onClick={handleImportDoi}
          variant="ghost"
          size="sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <Upload size={11} />
          {t('library.importDoi')}
        </Button>
      </div>
    </div>
  )
}

interface TableHeaderProps {
  table: ReturnType<typeof useReactTable<PaperRef>>
  hiddenColumns: ReturnType<ReturnType<typeof useReactTable<PaperRef>>['getAllLeafColumns']>
  onAddColumn: () => void
}

function TableHeader({ table, hiddenColumns, onAddColumn }: TableHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="sticky top-0 z-20 flex items-stretch border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0 select-none w-fit min-w-full">
      {table.getHeaderGroups().map((hg) =>
        hg.headers.map((header) => (
          <ColumnHeader key={header.id} header={header} onAddColumn={onAddColumn} />
        ))
      )}

      {hiddenColumns.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t('library.showHidden')}
              className="flex items-center justify-center w-9 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <Eye size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {hiddenColumns.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => c.toggleVisibility(true)}>
                <Eye size={12} className="mr-2" />
                {String(c.columnDef.header ?? c.id)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAddColumn}>
              <Plus size={12} className="mr-2" />
              {t('library.header.newColumn')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
