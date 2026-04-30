import { useState } from 'react'
import {
  ChevronUp, ChevronDown, EyeOff, Plus, ArrowUp, ArrowDown,
  ArrowDownUp, Pin, PinOff,
} from 'lucide-react'
import type { Header } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import type { PaperRef } from '@shared/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ColumnHeaderProps {
  header: Header<PaperRef, unknown>
  onAddColumn: () => void
}

export function ColumnHeader({ header, onAddColumn }: ColumnHeaderProps) {
  const { t } = useTranslation()
  const column = header.column
  const sorted = column.getIsSorted()
  const canSort = column.getCanSort()
  const canHide = column.getCanHide()
  const canResize = column.getCanResize()
  const isResizing = column.getIsResizing()
  const isPinned = column.getIsPinned()

  const label = String(column.columnDef.header ?? column.id)

  // Right-click menu — open at cursor by tracking position.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  // Drag-to-reorder using HTML5 native drag API.
  const [dragOver, setDragOver] = useState(false)
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/column-id', column.id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/column-id')) {
      e.preventDefault()
      setDragOver(true)
    }
  }
  const onDragLeave = () => setDragOver(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const sourceId = e.dataTransfer.getData('text/column-id')
    if (!sourceId || sourceId === column.id) return
    const table = header.getContext().table
    const all = table.getAllLeafColumns().map((c) => c.id)
    const current = table.getState().columnOrder
    const order = current.length ? current.slice() : all
    const without = order.filter((id) => id !== sourceId)
    const targetIdx = without.indexOf(column.id)
    without.splice(targetIdx, 0, sourceId)
    table.setColumnOrder(without)
  }

  return (
    <div
      data-resizing={isResizing ? '' : undefined}
      data-drag-over={dragOver ? '' : undefined}
      style={{ width: header.getSize() }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      className={cn(
        'group/header relative flex items-center h-8 px-3 text-[12.5px] font-medium select-none',
        'border-r border-[var(--border-color)]',
        'data-[resizing]:bg-[var(--bg-elevated)]',
        'data-[drag-over]:bg-[var(--accent-color)]/10',
      )}
    >
      <button
        type="button"
        disabled={!canSort}
        onClick={canSort ? column.getToggleSortingHandler() : undefined}
        className={cn(
          'flex items-center gap-1 min-w-0 text-left',
          canSort
            ? 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer'
            : 'text-[var(--text-muted)] cursor-default',
          sorted && 'text-[var(--text-secondary)]',
        )}
      >
        <span className="truncate">{label}</span>
        {sorted === 'asc'  && <ChevronUp size={10} className="shrink-0" />}
        {sorted === 'desc' && <ChevronDown size={10} className="shrink-0" />}
      </button>

      <div className="flex-1" />

      <DropdownMenu
        open={menu != null}
        onOpenChange={(open) => { if (!open) setMenu(null) }}
      >
        {/* Position the menu at the cursor by anchoring an invisible 1px trigger. */}
        {menu && (
          <div
            style={{
              position: 'fixed', left: menu.x, top: menu.y,
              width: 1, height: 1, pointerEvents: 'none',
            }}
          >
            <DropdownMenuContent align="start" sideOffset={0} className="min-w-[180px]">
              {canSort && (
                <>
                  <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                    <ArrowUp size={12} className="mr-2" />
                    {t('library.header.sortAsc')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                    <ArrowDown size={12} className="mr-2" />
                    {t('library.header.sortDesc')}
                  </DropdownMenuItem>
                  {sorted && (
                    <DropdownMenuItem onClick={() => column.clearSorting()}>
                      <ArrowDownUp size={12} className="mr-2" />
                      {t('library.header.clearSort')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              {isPinned ? (
                <DropdownMenuItem onClick={() => column.pin(false)}>
                  <PinOff size={12} className="mr-2" />
                  {t('library.header.unpin')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => column.pin('left')}>
                  <Pin size={12} className="mr-2" />
                  {t('library.header.pin')}
                </DropdownMenuItem>
              )}
              {canHide && (
                <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                  <EyeOff size={12} className="mr-2" />
                  {t('library.header.hide')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAddColumn}>
                <Plus size={12} className="mr-2" />
                {t('library.header.newColumn')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </div>
        )}
      </DropdownMenu>

      {canResize && (
        <div
          // Stop drag-start so the resize handle isn't draggable as a column.
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            header.getResizeHandler()(e)
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
            header.getResizeHandler()(e)
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize select-none touch-none',
            'after:absolute after:inset-y-1 after:left-1/2 after:-translate-x-1/2 after:w-[2px] after:rounded-full',
            'after:bg-[var(--accent-color)] after:opacity-0 after:transition-opacity',
            'hover:after:opacity-60',
            'data-[resizing=true]:after:opacity-100',
          )}
          data-resizing={isResizing}
        />
      )}
    </div>
  )
}
