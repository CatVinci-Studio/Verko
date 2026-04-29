import React from 'react'
import { Search, X } from 'lucide-react'
import { useLibraryStore } from '@/store/library'

export function FilterBar() {
  const { filter, setFilter } = useLibraryStore()
  const [searchValue, setSearchValue] = React.useState(filter.query ?? '')

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearchValue(q)
    setFilter({ query: q || undefined })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--bg-active)] shrink-0">
      <div className="relative flex-1 min-w-0">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Filter papers…"
          className="w-full bg-[var(--bg-sidebar-hover)] border border-[var(--bg-active)] rounded-[4px] pl-6 pr-2 py-1 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-dim)]"
        />
        {searchValue && (
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            onClick={() => { setSearchValue(''); setFilter({ query: undefined }) }}
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
