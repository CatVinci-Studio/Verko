import { useState } from 'react'
import { X, Settings2, Sparkles, Library, Bug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/ui'
import { useMobile } from '@/lib/useMobile'
import { Button } from '@/components/ui/button'
import { GeneralTab } from './tabs/GeneralTab'
import { ProviderTab } from './tabs/ProviderTab'
import { LibraryTab } from './tabs/LibraryTab'
import { DebugTab } from './tabs/DebugTab'
import { cn } from '@/lib/utils'

type SettingsTab = 'general' | 'provider' | 'library' | 'debug'

interface TabMeta {
  id: SettingsTab
  icon: LucideIcon
}

const TABS: TabMeta[] = [
  { id: 'general',  icon: Settings2 },
  { id: 'provider', icon: Sparkles },
  { id: 'library',  icon: Library },
  { id: 'debug',    icon: Bug },
]

export function SettingsModal() {
  const { t } = useTranslation()
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const [tab, setTab] = useState<SettingsTab>('general')
  const isMobile = useMobile()

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

      {/* Mobile = full-screen sheet (no rounded corners, no inset); desktop
          = centered card. The two render paths share inner layout but
          differ in container shape, tab orientation, and padding. */}
      <div
        className={cn(
          'relative bg-[var(--bg-surface)] flex flex-col fade-in overflow-hidden shadow-2xl',
          isMobile
            ? 'w-full h-full max-h-full rounded-none border-0'
            : 'w-[760px] max-w-[calc(100vw-32px)] max-h-[80vh] rounded-[20px] border border-[var(--border-color)]',
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-3 border-b border-[var(--border-color)] shrink-0',
            isMobile ? 'px-4 py-3 pt-[max(env(safe-area-inset-top),12px)]' : 'px-6 py-4',
          )}
        >
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)] tracking-tight truncate">
              {isMobile ? t(`settings.tabs.${current.id}`) : t('settings.title')}
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

        {/* Mobile tab strip: horizontal scroll above content. */}
        {isMobile && (
          <nav className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-color)] shrink-0 overflow-x-auto no-scrollbar">
            {TABS.map((meta) => {
              const Icon = meta.icon
              const active = tab === meta.id
              return (
                <button
                  key={meta.id}
                  onClick={() => setTab(meta.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] whitespace-nowrap transition-colors',
                    active
                      ? 'bg-[var(--bg-accent-subtle)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] active:bg-[var(--bg-elevated)]',
                  )}
                >
                  <Icon
                    size={13}
                    className={active ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}
                  />
                  <span className="text-[14px] font-medium">
                    {t(`settings.tabs.${meta.id}`)}
                  </span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Desktop left nav */}
          {!isMobile && (
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
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {!isMobile && (
              <header className="px-6 pt-5 pb-4 border-b border-[var(--border-color)]">
                <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">
                  {t(`settings.tabs.${current.id}`)}
                </h3>
              </header>
            )}
            <div
              className={cn(
                isMobile
                  ? 'px-4 py-4 pb-[max(env(safe-area-inset-bottom),16px)]'
                  : 'px-6 py-5',
              )}
            >
              {tab === 'general'  && <GeneralTab />}
              {tab === 'provider' && <ProviderTab />}
              {tab === 'library'  && <LibraryTab />}
              {tab === 'debug'    && <DebugTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
