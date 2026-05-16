import { useTranslation } from 'react-i18next'
import type { PaperStatus } from '@shared/types'
import { useLibraryStore } from '@/store/library'
import { cn } from '@/lib/utils'

/**
 * Quick filter strip mirroring read-later inbox states. Sets
 * `filter.status` to a single-element array (or undefined for All).
 * Multi-status filtering still works through the full Filter modal.
 */

type Pill = { key: string; status?: PaperStatus; labelKey: string }

const PILLS: Pill[] = [
  { key: 'all',      labelKey: 'library.inbox.filterAll' },
  { key: 'unread',   status: 'unread',   labelKey: 'library.inbox.filterUnread' },
  { key: 'reading',  status: 'reading',  labelKey: 'library.inbox.filterReading' },
  { key: 'read',     status: 'read',     labelKey: 'library.inbox.filterRead' },
  { key: 'archived', status: 'archived', labelKey: 'library.inbox.filterArchived' },
]

export function StatusFilterStrip() {
  const { t } = useTranslation()
  const filter = useLibraryStore((s) => s.filter)
  const setFilter = useLibraryStore((s) => s.setFilter)

  // A pill is active if it matches the *only* status currently filtered.
  // 'All' is active when no status filter is set.
  const activeKey = (() => {
    const s = filter.status
    if (!s || s.length === 0) return 'all'
    if (s.length === 1) return s[0]
    return null
  })()

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0">
      {PILLS.map((p) => {
        const active = p.key === activeKey
        return (
          <button
            key={p.key}
            onClick={() => setFilter({ status: p.status ? [p.status] : undefined })}
            className={cn(
              'px-2.5 py-0.5 text-[13px] rounded-full transition-colors',
              active
                ? 'bg-[var(--accent-color)]/15 text-[var(--accent-color)] border border-[var(--accent-color)]/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] border border-transparent',
            )}
          >
            {t(p.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
