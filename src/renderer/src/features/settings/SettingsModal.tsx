import { useState } from 'react'
import { X, Settings2, Library, Bug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/ui'
import { Button } from '@/components/ui/button'
import { GeneralTab } from './tabs/GeneralTab'
import { LibraryTab } from './tabs/LibraryTab'
import { DebugTab } from './tabs/DebugTab'
import { cn } from '@/lib/utils'

type SettingsTab = 'general' | 'library' | 'debug'

interface TabMeta {
  id: SettingsTab
  icon: LucideIcon
}

const TABS: TabMeta[] = [
  { id: 'general', icon: Settings2 },
  { id: 'library', icon: Library },
  { id: 'debug',   icon: Bug },
]

export function SettingsModal() {
  const { t } = useTranslation()
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const [tab, setTab] = useState<SettingsTab>('general')

  if (!settingsOpen) return null

  const current = TABS.find((x) => x.id === tab) ?? TABS[0]

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
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)] tracking-tight">
              {t('settings.title')}
            </h2>
          </div>
          <Button
            onClick={() => setSettingsOpen(false)}
            variant="ghost"
            size="icon"
            className="rounded-[8px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left nav */}
          <nav className="w-56 shrink-0 border-r border-[var(--border-color)] p-2 space-y-0.5 overflow-y-auto">
            {TABS.map((meta) => {
              const Icon = meta.icon
              const active = tab === meta.id
              return (
                <button
                  key={meta.id}
                  onClick={() => setTab(meta.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-left transition-all duration-150',
                    active
                      ? 'bg-[var(--bg-accent-subtle)] border border-[var(--accent-color)]/20 text-[var(--text-primary)]'
                      : 'border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-color)]'
                  )}
                >
                  <Icon
                    size={14}
                    className={active ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}
                  />
                  <span className="text-[15px] font-medium">
                    {t(`settings.tabs.${meta.id}`)}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <header className="px-6 pt-5 pb-4 border-b border-[var(--border-color)]">
              <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">
                {t(`settings.tabs.${current.id}`)}
              </h3>
            </header>
            <div className="px-6 py-5">
              {tab === 'general' && <GeneralTab />}
              {tab === 'library' && <LibraryTab />}
              {tab === 'debug'   && <DebugTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
