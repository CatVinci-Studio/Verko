import { useState } from 'react'
import { ArrowUpRight, MoreHorizontal, Trash2 } from 'lucide-react'
import { flexRender, type Row } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import type { PaperRef, CollectionInfo } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface PaperRowProps {
  row: Row<PaperRef>
  paper: PaperRef
  collections: CollectionInfo[]
  activeCollection?: string | null
  selected: boolean
  onClick: () => void
  onDelete: () => void
  onCopyDoi?: () => void
  onAddToCollection?: (name: string) => void
  onRemoveFromCollection?: (name: string) => void
}

export function PaperRow({
  row,
  paper,
  collections,
  activeCollection,
  selected,
  onClick,
  onDelete,
  onCopyDoi,
  onAddToCollection,
  onRemoveFromCollection,
}: PaperRowProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      data-selected={selected || undefined}
      onDoubleClick={(e) => {
        // Cells start text editing on double-click; clear any selection first
        // and only open if the user double-clicked outside an editable cell.
        if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return
        window.getSelection()?.removeAllRanges()
        onClick()
      }}
      className={cn(
        'group relative flex items-stretch border-b border-[var(--border-color)]/50 cursor-default h-9 transition-colors w-fit min-w-full',
        // Single-click is owned by individual cells (edit / open). Double-
        // click on the row anywhere outside an active editor opens the
        // paper detail page.
        selected
          ? 'bg-[var(--bg-accent-subtle)]'
          : 'hover:bg-[var(--bg-sidebar-hover)]'
      )}
    >
      {selected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--accent-color)] z-10" />
      )}

      {row.getVisibleCells().map((cell) => (
        <div
          key={cell.id}
          style={{ width: cell.column.getSize() }}
          className="flex items-center px-3 overflow-hidden border-r border-[var(--border-color)]/50"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}

      <div
        className="w-9 shrink-0 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onClick}>
              <ArrowUpRight size={12} className="mr-2" />
              {t('common.open')}
            </DropdownMenuItem>
            {paper.doi && onCopyDoi && (
              <DropdownMenuItem onClick={onCopyDoi}>Copy DOI</DropdownMenuItem>
            )}
            {collections.length > 0 && onAddToCollection && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Add to Collection</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {collections.map((c) => (
                    <DropdownMenuItem key={c.name} onClick={() => onAddToCollection(c.name)}>
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {activeCollection && onRemoveFromCollection && (
              <DropdownMenuItem onClick={() => onRemoveFromCollection(activeCollection)}>
                Remove from &ldquo;{activeCollection}&rdquo;
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-[var(--danger)] focus:text-[var(--danger)] focus:bg-[var(--danger)]/10"
            >
              <Trash2 size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
