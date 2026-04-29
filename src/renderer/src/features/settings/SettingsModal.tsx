import { useState } from 'react'
import { X, Bot, Table2, Library, Palette, Plus, Check } from 'lucide-react'
import { useUIStore } from '@/store/ui'
import { useLibraryStore } from '@/store/library'
import { api } from '@/lib/ipc'
import { ProfileForm } from './ProfileForm'
import { SchemaEditor } from './SchemaEditor'
import { cn } from '@/lib/utils'
import type { LibraryInfo } from '@shared/types'

type SettingsTab = 'agent' | 'schema' | 'library' | 'appearance'

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'agent',      label: 'AI Agent',    icon: Bot },
  { id: 'schema',     label: 'Schema',      icon: Table2 },
  { id: 'library',    label: 'Libraries',   icon: Library },
  { id: 'appearance', label: 'Appearance',  icon: Palette },
]

// ── Appearance ───────────────────────────────────────────────────────────────

function AppearanceSettings() {
  const { theme, toggleTheme } = useUIStore()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">Appearance</h3>
        <p className="text-[12px] text-[var(--text-muted)]">Customize how PaperwithAgent looks.</p>
      </div>

      {/* Theme row */}
      <div className="flex items-center justify-between py-3 border-b border-[var(--border-color)]">
        <div>
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Theme</p>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">Choose dark or light interface.</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[10px]">
          {(['dark', 'light'] as const).map(t => (
            <button
              key={t}
              onClick={() => { if (theme !== t) toggleTheme() }}
              className={cn(
                'px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all duration-150 capitalize',
                theme === t
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Library settings ─────────────────────────────────────────────────────────

function LibrarySettings() {
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
    <div className="space-y-5">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">Libraries</h3>
        <p className="text-[12px] text-[var(--text-muted)]">Manage your paper library folders.</p>
      </div>

      <div className="space-y-2">
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
      </div>

      <button
        onClick={handleAddLibrary}
        className="flex items-center gap-2 w-full px-4 py-2.5 rounded-[10px] border border-dashed border-[var(--border-color)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-focus)] transition-colors"
      >
        <Plus size={13} />
        Add existing library
      </button>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const [tab, setTab] = useState<SettingsTab>('agent')

  if (!settingsOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[14px]" />

      <div className="relative w-[640px] max-h-[75vh] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-[20px] shadow-2xl flex flex-col fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border-color)] shrink-0">
          <div className="flex-1">
            <h2 className="text-[14.5px] font-semibold text-[var(--text-primary)] tracking-tight">Settings</h2>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-[8px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--border-color)] transition-all"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left nav */}
          <nav className="w-44 shrink-0 border-r border-[var(--border-color)] p-2 space-y-0.5">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'w-full grid items-center gap-2.5 min-h-[36px] px-3 rounded-[8px] text-left transition-all duration-150',
                    'grid-cols-[14px_1fr]',
                    active
                      ? 'bg-[var(--bg-accent-subtle)] border border-[var(--accent-color)]/20 text-[var(--text-primary)]'
                      : 'border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-color)]'
                  )}
                >
                  <Icon
                    size={13}
                    className={active ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}
                  />
                  <span className="text-[12px] font-medium">{t.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'agent'      && <ProfileForm />}
            {tab === 'schema'     && <SchemaEditor />}
            {tab === 'library'    && <LibrarySettings />}
            {tab === 'appearance' && <AppearanceSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}
