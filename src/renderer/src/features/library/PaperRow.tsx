import React from 'react'
import { ArrowUpRight, MoreHorizontal, Star, FileText } from 'lucide-react'
import type { PaperRef, Column } from '@shared/types'
import { ChipStatus } from '@/components/common/ChipStatus'
import { ChipTag } from '@/components/common/ChipTag'
import { cn, formatAuthors, formatYear } from '@/lib/utils'
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
import type { CollectionInfo } from '@shared/types'

interface PaperRowProps {
  paper: PaperRef
  extraCols: Column[]
  collections: CollectionInfo[]
  selected: boolean
  onClick: () => void
  onDelete: () => void
  onCopyDoi?: () => void
  onAddToCollection?: (name: string) => void
  onRemoveFromCollection?: (name: string) => void
  activeCollection?: string | null
}

function renderExtraValue(col: Column, value: unknown): React.ReactNode {
  if (value == null || value === '') return null
  if (col.name === 'rating' && typeof value === 'number' && value > 0) {
    return (
      <div className="flex items-center gap-0.5 justify-end">
        {Array.from({ length: value }).map((_, i) => (
          <Star key={i} size={9} className="fill-[var(--warning)] text-[var(--warning)]" />
        ))}
      </div>
    )
  }
  if (col.type === 'tags' && Array.isArray(value)) {
    return <span className="text-[11px] text-[var(--text-muted)] truncate">{(value as string[]).join(', ')}</span>
  }
  return <span className="text-[11px] text-[var(--text-secondary)] truncate">{String(value)}</span>
}

export function PaperRow({ paper, extraCols, collections, selected, onClick, onDelete, onCopyDoi, onAddToCollection, onRemoveFromCollection, activeCollection }: PaperRowProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-0 border-b border-[var(--border-color)]/50 cursor-default',
        'h-9 transition-colors',
        selected
          ? 'bg-[var(--bg-accent-subtle)]'
          : 'hover:bg-[var(--bg-sidebar-hover)]'
      )}
      onClick={onClick}
    >
      {/* Selected indicator */}
      {selected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--accent-color)]" />
      )}

      {/* Title cell */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 pl-4 pr-2">
        {paper.hasPdf && (
          <FileText size={12} className="shrink-0 text-[var(--text-dim)] group-hover:text-[var(--text-muted)]" />
        )}
        <span className={cn(
          'text-[13px] truncate font-medium',
          selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-bright)]'
        )}>
          {paper.title || <span className="text-[var(--text-muted)] font-normal italic">Untitled</span>}
        </span>
        <ArrowUpRight
          size={12}
          className="shrink-0 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Authors */}
      <div className="w-36 shrink-0 hidden md:flex items-center px-2">
        <span className="text-[12px] text-[var(--text-secondary)] truncate">
          {formatAuthors(paper.authors)}
        </span>
      </div>

      {/* Year */}
      <div className="w-12 shrink-0 flex items-center justify-end px-2">
        <span className="text-[12px] text-[var(--text-secondary)]">
          {formatYear(paper.year)}
        </span>
      </div>

      {/* Status */}
      <div className="w-24 shrink-0 flex items-center justify-end px-2">
        <ChipStatus status={paper.status} />
      </div>

      {/* Tags */}
      <div className="w-32 shrink-0 hidden lg:flex items-center gap-1 justify-end px-2 overflow-hidden">
        {paper.tags.slice(0, 2).map(tag => (
          <ChipTag key={tag} tag={tag} />
        ))}
        {paper.tags.length > 2 && (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">+{paper.tags.length - 2}</span>
        )}
      </div>

      {/* Extra dynamic columns */}
      {extraCols.map(col => (
        <div key={col.name} className="w-20 shrink-0 hidden xl:flex items-center justify-end px-2 overflow-hidden">
          {renderExtraValue(col, paper[col.name])}
        </div>
      ))}

      {/* Actions — fade in on hover */}
      <div
        className="shrink-0 flex items-center pr-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onClick}>Open</DropdownMenuItem>
            {paper.doi && (
              <DropdownMenuItem onClick={onCopyDoi}>Copy DOI</DropdownMenuItem>
            )}
            {collections.length > 0 && onAddToCollection && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Add to Collection</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {collections.map(col => (
                    <DropdownMenuItem key={col.name} onClick={() => onAddToCollection(col.name)}>
                      {col.name}
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
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
