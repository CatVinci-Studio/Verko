import { useState } from 'react'
import { X, Bot, Table2, Library, Palette } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/store/ui'
import { AgentTab } from './tabs/AgentTab'
import { SchemaTab } from './tabs/SchemaTab'
import { LibraryTab } from './tabs/LibraryTab'
import { AppearanceTab } from './tabs/AppearanceTab'
import { cn } from '@/lib/utils'

type SettingsTab = 'agent' | 'schema' | 'library' | 'appearance'

interface TabMeta {
  id: SettingsTab
  label: string
  icon: LucideIcon
  description: string
}

const TABS: TabMeta[] = [
  {
    id: 'agent',
    label: 'AI Agent',
    icon: Bot,
    description: 'Provider profiles and API keys.',
  },
  {
    id: 'schema',
    label: 'Schema',
    icon: Table2,
    description: 'Custom columns on top of the core paper schema.',
  },
  {
    id: 'library',
    label: 'Libraries',
    icon: Library,
    description: 'Manage and switch paper library folders.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'Theme and visual preferences.',
  },
]

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const [tab, setTab] = useState<SettingsTab>('agent')

  if (!settingsOpen) return null

  const current = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false)
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[14px]" />

      <div className="relative w-[760px] max-h-[80vh] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-[20px] shadow-2xl flex flex-col fade-in overflow-hidden">
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
          <nav className="w-56 shrink-0 border-r border-[var(--border-color)] p-2 space-y-0.5 overflow-y-auto">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'w-full grid items-start gap-2.5 px-3 py-2.5 rounded-[8px] text-left transition-all duration-150',
                    'grid-cols-[14px_1fr]',
                    active
                      ? 'bg-[var(--bg-accent-subtle)] border border-[var(--accent-color)]/20 text-[var(--text-primary)]'
                      : 'border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-color)]'
                  )}
                >
                  <Icon
                    size={13}
                    className={cn('mt-[3px]', active ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]')}
                  />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium leading-tight">{t.label}</div>
                    <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 leading-snug">{t.description}</div>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <header className="px-6 pt-5 pb-4 border-b border-[var(--border-color)]">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{current.label}</h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{current.description}</p>
            </header>
            <div className="px-6 py-5">
              {tab === 'agent' && <AgentTab />}
              {tab === 'schema' && <SchemaTab />}
              {tab === 'library' && <LibraryTab />}
              {tab === 'appearance' && <AppearanceTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
