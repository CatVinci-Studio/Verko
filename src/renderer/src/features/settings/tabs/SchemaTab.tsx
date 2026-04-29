import { useState } from 'react'
import { Plus, Trash2, Loader } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import { confirmDialog } from '@/store/dialogs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingSection } from '@/components/ui/setting-section'
import { cn } from '@/lib/utils'
import type { ColumnType } from '@shared/types'

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'bool', label: 'Boolean' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'tags', label: 'Tags' },
  { value: 'url', label: 'URL' },
]

const CORE_COLS = new Set([
  'title', 'authors', 'year', 'venue', 'doi', 'url', 'pdf',
  'tags', 'status', 'rating', 'added_at', 'updated_at',
])

export function SchemaTab() {
  const queryClient = useQueryClient()
  const { data: schema, isLoading } = useQuery({
    queryKey: ['schema'],
    queryFn: () => api.schema.get(),
  })

  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState<ColumnType>('text')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const handleAddColumn = async () => {
    if (!newColName.trim()) return
    setAdding(true)
    try {
      await api.schema.addColumn({ name: newColName.trim(), type: newColType, inCsv: true })
      setNewColName('')
      setNewColType('text')
      queryClient.invalidateQueries({ queryKey: ['schema'] })
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveColumn = async (name: string) => {
    const ok = await confirmDialog({
      title: `Remove column "${name}"?`,
      message: 'Existing papers keep their data in the Markdown frontmatter, but the column will no longer appear in the library view or CSV index.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    setRemoving(name)
    try {
      await api.schema.removeColumn(name)
      queryClient.invalidateQueries({ queryKey: ['schema'] })
    } finally {
      setRemoving(null)
    }
  }

  if (isLoading) {
    return <div className="text-[12px] text-[var(--text-muted)]">Loading schema…</div>
  }

  const userColumns = schema?.columns.filter((c) => !CORE_COLS.has(c.name)) ?? []

  return (
    <div className="space-y-6">
      <SettingSection title="Custom columns" description="Extra fields you've added on top of the core paper schema. They appear in the library view and CSV index.">
        {userColumns.length > 0 ? (
          <div className="space-y-1.5 pt-2">
            {userColumns.map((col) => (
              <div
                key={col.name}
                className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[10px]"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{col.name}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-muted)] capitalize">{col.type}</span>
                </div>
                <button
                  onClick={() => handleRemoveColumn(col.name)}
                  disabled={removing === col.name}
                  className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                >
                  {removing === col.name ? (
                    <Loader size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)] italic px-1 pt-2">No custom columns yet.</p>
        )}
      </SettingSection>

      <SettingSection title="Add column" description="New columns become available immediately on every paper.">
        <div className="flex gap-2 pt-2">
          <input
            placeholder="Column name…"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
            className={cn(
              'flex-1 h-10 px-3 rounded-[10px] border text-[13px] bg-[var(--bg-elevated)]',
              'text-[var(--text-primary)] placeholder:text-[var(--text-dim)]',
              'border-[var(--border-color)] focus:border-[var(--accent-color)]',
              'focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none',
              'transition-all duration-150'
            )}
            style={{ userSelect: 'text' }}
          />
          <Select value={newColType} onValueChange={(v) => setNewColType(v as ColumnType)}>
            <SelectTrigger className="w-32 h-10 rounded-[10px] border-[var(--border-color)] bg-[var(--bg-elevated)] text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMN_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleAddColumn}
            disabled={adding || !newColName.trim()}
            className={cn(
              'px-4 h-10 rounded-[10px] text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98]',
              newColName.trim() && !adding
                ? 'bg-[var(--accent-color)] text-[var(--accent-on)] hover:opacity-90'
                : 'bg-[var(--bg-active)] text-[var(--text-dim)] cursor-not-allowed'
            )}
          >
            {adding ? <Loader size={12} className="animate-spin" /> : <Plus size={13} />}
          </button>
        </div>
      </SettingSection>
    </div>
  )
}
