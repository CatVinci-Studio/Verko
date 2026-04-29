import { Check, Plus } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { api } from '@/lib/ipc'
import { SettingSection } from '@/components/ui/setting-section'
import { cn } from '@/lib/utils'
import type { LibraryInfo } from '@shared/types'

export function LibraryTab() {
  const { libraries, refreshLibraries, switchLibrary } = useLibraryStore()

  const handleAddLibrary = async () => {
    const name = window.prompt('Library name:')
    if (!name) return
    const path = window.prompt('Library path (absolute):')
    if (!path) return
    try {
      await api.libraries.add(name, path)
      await refreshLibraries()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <SettingSection title="Libraries" description="Each library is a self-contained folder of papers, attachments, and schema.">
      <div className="space-y-2 pt-2">
        {libraries.map((lib: LibraryInfo) => (
          <div
            key={lib.name}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-[12px] border transition-colors',
              lib.active
                ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent-color)]/25'
                : 'bg-[var(--bg-elevated)] border-[var(--border-color)]'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-[var(--text-primary)]">{lib.name}</div>
              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{lib.path}</div>
              <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{lib.paperCount} papers</div>
            </div>
            {lib.active ? (
              <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/25">
                <Check size={10} className="text-[var(--accent-color)]" />
                <span className="text-[10.5px] text-[var(--accent-color)] font-medium">Active</span>
              </div>
            ) : (
              <button
                onClick={() => switchLibrary(lib.name)}
                className="shrink-0 px-3 py-1.5 rounded-[8px] text-[11.5px] font-medium text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] transition-colors"
              >
                Switch
              </button>
            )}
          </div>
        ))}

        <button
          onClick={handleAddLibrary}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-[10px] border border-dashed border-[var(--border-color)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-focus)] transition-colors"
        >
          <Plus size={13} />
          Add existing library
        </button>
      </div>
    </SettingSection>
  )
}
