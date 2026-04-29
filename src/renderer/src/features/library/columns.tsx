import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Star, FileText, ArrowUpRight } from 'lucide-react'
import type { PaperRef, PaperPatch, PaperStatus, Column } from '@shared/types'
import { ChipStatus } from '@/components/common/ChipStatus'
import { ChipTag } from '@/components/common/ChipTag'
import { formatAuthors, formatYear } from '@/lib/utils'
import { EditableTextCell, EditableSelectCell } from './EditableCell'

const STATUS_OPTIONS: PaperStatus[] = ['unread', 'reading', 'read', 'archived']

// Augment TanStack Table's meta channel so cells can dispatch open/update
// without each ColumnDef closing over component-level handlers. The
// generic TData is unused here but matches the upstream signature, which
// is required for module augmentation to merge correctly.
declare module '@tanstack/react-table' {
  interface TableMeta<TData> {
    open: (id: string) => void
    update: (id: string, patch: PaperPatch) => void | Promise<void>
    _phantom?: TData
  }
}

export function buildColumns(extras: Column[], t: TFunction): ColumnDef<PaperRef>[] {
  return [
    {
      id: 'title',
      accessorKey: 'title',
      header: t('library.header.title'),
      enableHiding: false,
      size: 320,
      minSize: 200,
      cell: ({ row, table }) => {
        const p = row.original
        const meta = table.options.meta!
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              meta.open(p.id)
            }}
            className="group/title flex items-center gap-1.5 min-w-0 w-full text-left rounded-[4px] hover:bg-[var(--bg-elevated)] px-1 -mx-1"
          >
            {p.hasPdf && (
              <FileText size={12} className="shrink-0 text-[var(--text-dim)]" />
            )}
            <span className="text-[13px] truncate font-medium text-[var(--text-bright)]">
              {p.title || (
                <span className="text-[var(--text-muted)] font-normal italic">
                  {t('paper.untitled')}
                </span>
              )}
            </span>
            <ArrowUpRight
              size={12}
              className="shrink-0 text-[var(--text-muted)] opacity-0 group-hover/title:opacity-100 transition-opacity"
            />
          </button>
        )
      },
    },
    {
      id: 'authors',
      accessorKey: 'authors',
      header: t('library.header.authors'),
      size: 168,
      minSize: 80,
      cell: ({ row, table }) => {
        const p = row.original
        const meta = table.options.meta!
        // Authors round-trip as "Last, F.; Last, F." (semicolon-separated)
        // because the names themselves contain commas.
        return (
          <EditableTextCell
            value={p.authors.join('; ')}
            placeholder={t('paper.noAuthors')}
            display={
              <span className="text-[12px] text-[var(--text-secondary)] truncate">
                {formatAuthors(p.authors)}
              </span>
            }
            onSave={(next) =>
              meta.update(p.id, {
                authors: next
                  .split(';')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        )
      },
    },
    {
      id: 'year',
      accessorKey: 'year',
      header: t('library.header.year'),
      size: 64,
      minSize: 48,
      cell: ({ row, table }) => {
        const p = row.original
        const meta = table.options.meta!
        return (
          <EditableTextCell
            value={p.year ? String(p.year) : ''}
            inputType="number"
            display={
              <span className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                {formatYear(p.year)}
              </span>
            }
            onSave={(next) => {
              const n = parseInt(next, 10)
              meta.update(p.id, { year: Number.isFinite(n) ? n : undefined })
            }}
          />
        )
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: t('library.header.status'),
      size: 104,
      minSize: 80,
      cell: ({ row, table }) => {
        const p = row.original
        const meta = table.options.meta!
        return (
          <EditableSelectCell<PaperStatus>
            value={p.status}
            options={STATUS_OPTIONS.map((s) => ({ value: s }))}
            renderOption={(s) => <ChipStatus status={s} />}
            trigger={<ChipStatus status={p.status} />}
            onSave={(s) => meta.update(p.id, { status: s })}
          />
        )
      },
    },
    {
      id: 'tags',
      accessorKey: 'tags',
      header: t('library.header.tags'),
      enableSorting: false,
      size: 144,
      minSize: 80,
      cell: ({ row, table }) => {
        const p = row.original
        const meta = table.options.meta!
        // Tags edit as a comma-separated string for fast keyboard entry.
        return (
          <EditableTextCell
            value={p.tags.join(', ')}
            placeholder="—"
            display={
              p.tags.length > 0 ? (
                <div className="flex items-center gap-1 overflow-hidden">
                  {p.tags.slice(0, 2).map((tag) => (
                    <ChipTag key={tag} tag={tag} />
                  ))}
                  {p.tags.length > 2 && (
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                      +{p.tags.length - 2}
                    </span>
                  )}
                </div>
              ) : null
            }
            onSave={(next) =>
              meta.update(p.id, {
                tags: next
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        )
      },
    },
    ...extras.map((col): ColumnDef<PaperRef> => ({
      id: col.name,
      accessorFn: (paper) => paper[col.name],
      header: col.name,
      size: 96,
      minSize: 60,
      cell: ({ row, table, getValue }) => {
        const p = row.original
        const meta = table.options.meta!
        const raw = getValue()
        return (
          <EditableTextCell
            value={raw == null ? '' : String(raw)}
            placeholder="—"
            inputType={col.type === 'number' ? 'number' : 'text'}
            display={renderExtraValue(col, raw)}
            onSave={(next) => {
              const value =
                col.type === 'number'
                  ? next === '' ? undefined : Number(next)
                  : next || undefined
              meta.update(p.id, { [col.name]: value } as PaperPatch)
            }}
          />
        )
      },
    })),
  ]
}

function renderExtraValue(col: Column, value: unknown) {
  if (value == null || value === '') return null
  if (col.name === 'rating' && typeof value === 'number' && value > 0) {
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: value }).map((_, i) => (
          <Star key={i} size={9} className="fill-[var(--warning)] text-[var(--warning)]" />
        ))}
      </div>
    )
  }
  if (col.type === 'tags' && Array.isArray(value)) {
    return (
      <span className="text-[11px] text-[var(--text-muted)] truncate">
        {(value as string[]).join(', ')}
      </span>
    )
  }
  return (
    <span className="text-[11px] text-[var(--text-secondary)] truncate">
      {String(value)}
    </span>
  )
}
