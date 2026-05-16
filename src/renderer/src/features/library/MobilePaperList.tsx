import { useTranslation } from 'react-i18next'
import type { PaperRef } from '@shared/types'
import { ChipStatus } from '@/components/common/ChipStatus'
import { ChipTag } from '@/components/common/ChipTag'
import { KindGlyph } from './KindGlyph'
import { cn } from '@/lib/utils'

/**
 * Card-style list for narrow viewports. The desktop table compresses
 * badly under ~600px (column resizing + horizontal scroll defeat the
 * "drop a URL, glance at the list" inbox UX). Cards prioritise the
 * three things that matter on the phone: title, summary, status.
 *
 * Tap = open detail. Long-press / context menu actions live in the
 * detail view to keep the list clean.
 */

interface Props {
  papers: PaperRef[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function MobilePaperList({ papers, selectedId, onSelect }: Props) {
  const { t } = useTranslation()

  if (papers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-[14.5px] text-[var(--text-muted)]">
        {t('library.papers', { count: 0 })}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-[var(--border-color)]/40">
      {papers.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onSelect(p.id)}
            className={cn(
              'w-full text-left px-3 py-3 flex flex-col gap-1.5 active:bg-[var(--bg-sidebar-hover)] transition-colors',
              selectedId === p.id && 'bg-[var(--bg-accent-subtle)]',
            )}
          >
            <div className="flex items-start gap-2">
              <KindGlyph kind={p.kind} hasPdf={p.hasPdf} />
              <span className="flex-1 text-[15.5px] font-medium text-[var(--text-bright)] leading-tight">
                {p.title || (
                  <span className="text-[var(--text-muted)] italic">
                    {t('paper.untitled')}
                  </span>
                )}
              </span>
              <ChipStatus status={p.status} />
            </div>

            {p.summary && (
              <p className="text-[13.5px] text-[var(--text-secondary)] line-clamp-2 ml-5">
                {p.summary}
              </p>
            )}

            {(p.tags.length > 0 || p.year) && (
              <div className="flex items-center gap-1.5 ml-5 flex-wrap">
                {p.year && (
                  <span className="text-[12.5px] text-[var(--text-muted)] tabular-nums">
                    {p.year}
                  </span>
                )}
                {p.tags.slice(0, 3).map((tag) => (
                  <ChipTag key={tag} tag={tag} />
                ))}
                {p.tags.length > 3 && (
                  <span className="text-[12.5px] text-[var(--text-muted)]">
                    +{p.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
