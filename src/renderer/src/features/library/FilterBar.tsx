import React from 'react'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * Modal filter / search dialog. Triggered globally via Cmd+F (see App.tsx).
 * Holds only the search input today; tag / status / year fields can be
 * added here without re-architecting the trigger.
 */
export function FilterModal() {
  const { t } = useTranslation()
  const { filter, setFilter } = useLibraryStore()
  const open = useUIStore((s) => s.filterOpen)
  const setOpen = useUIStore((s) => s.setFilterOpen)
  const [searchValue, setSearchValue] = React.useState(filter.query ?? '')

  // Re-sync local input when the filter changes externally (e.g. cleared from elsewhere).
  React.useEffect(() => {
    setSearchValue(filter.query ?? '')
  }, [filter.query])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearchValue(q)
    setFilter({ query: q || undefined })
  }

  const clear = () => {
    setSearchValue('')
    setFilter({ query: undefined })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0 gap-0 bg-[var(--bg-elevated)] border-[var(--border-color)]">
        <DialogTitle className="sr-only">{t('library.filterPlaceholder')}</DialogTitle>
        <div className="relative px-3 py-3">
          <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={searchValue}
            onChange={handleSearchChange}
            placeholder={t('library.filterPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            className="w-full bg-[var(--bg-base)] border border-[var(--border-color)] rounded-[8px] pl-8 pr-8 py-2 text-[15.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/40"
          />
          {searchValue && (
            <button
              onClick={clear}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
