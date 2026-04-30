import React, { useState } from 'react'
import {
  Plus, Hash, ChevronRight, Library, Settings, Check,
  Layers, Trash2, Pencil, Bot, PanelLeftClose,
  BookOpen, MessageSquare,
} from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { useAgentStore } from '@/store/agent'
import { useSidebarActions } from './useSidebarActions'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── VSCode-style section header ──────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  expanded,
  onToggle,
  actions,
}: {
  icon: React.ElementType
  label: string
  expanded: boolean
  onToggle: () => void
  actions?: React.ReactNode
}) {
  return (
    <div className="h-8 flex items-center px-1 group/sh">
      <button
        onClick={onToggle}
        className="flex-1 flex items-center gap-2 h-full px-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
        />
        <Icon size={13} className="shrink-0" />
        <span className="text-[14.5px] font-semibold tracking-wide">{label}</span>
      </button>
      {actions && (
        <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/sh:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { t } = useTranslation()
  const {
    papers, filter, setFilter,
    libraries, activeLibrary, switchLibrary,
    collections, activeCollection, switchCollection,
  } = useLibraryStore()

  const { activeView, setActiveView, agentOpen, setAgentOpen, toggleSidebar, setSettingsOpen } = useUIStore()
  const activeId = useAgentStore((s) => s.activeId)
  const conversations = useAgentStore((s) => s.conversations)
  const refreshConversations = useAgentStore((s) => s.refreshConversations)

  const actions = useSidebarActions()

  React.useEffect(() => {
    refreshConversations().catch(() => {})
  }, [refreshConversations])

  const [collectionsExpanded, setCollectionsExpanded] = useState(true)
  const [tagsExpanded, setTagsExpanded] = useState(false)

  // ── Tags ─────────────────────────────────────────────────────────────────────
  const tagCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of papers) {
      for (const tag of p.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [papers])

  const toggleTagFilter = (tag: string) => {
    const current = filter.tags ?? []
    const next = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag]
    setFilter({ tags: next.length ? next : undefined })
  }

  const clearFilters = () => setFilter({ status: undefined, tags: undefined })

  return (
    <div className="flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] text-[var(--text-secondary)]">

      {/* ── Library header ────────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-[var(--border-color)] shrink-0 h-11">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex-1 flex items-center gap-2 px-3 h-full hover:bg-[var(--bg-sidebar-hover)] transition-colors text-left min-w-0">
              <div className="w-5 h-5 rounded-[6px] bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/25 flex items-center justify-center shrink-0">
                <Library size={10} className="text-[var(--accent-color)]" />
              </div>
              <span className="flex-1 min-w-0 text-[16px] font-semibold text-[var(--text-primary)] truncate">
                {activeLibrary?.name ?? 'No Library'}
              </span>
              <ChevronRight size={10} className="text-[var(--text-muted)] shrink-0 rotate-90" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {libraries.map(lib => (
              <DropdownMenuItem key={lib.id} onClick={() => switchLibrary(lib.id)} className="flex items-center gap-2">
                {lib.active && <Check size={11} className="text-[var(--accent-color)] shrink-0" />}
                <span className={lib.active ? '' : 'ml-[15px]'}>{lib.name}</span>
                <span className="ml-auto text-[13.5px] text-[var(--text-muted)]">{lib.paperCount}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={actions.addLibrary}>
              <Plus size={11} className="mr-1.5" /> Add Library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={toggleSidebar}
          className="p-2 mr-1 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-sidebar-hover)] transition-colors shrink-0"
          title="Collapse sidebar (⌘\\)"
        >
          <PanelLeftClose size={13} />
        </button>
      </div>

      {/* ── Scrollable nav ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-1.5">

        {/* ── Agent section ───────────────────────────────────────────────── */}
        <SectionHeader
          icon={Bot}
          label="Agent"
          expanded={agentOpen}
          onToggle={() => setAgentOpen(!agentOpen)}
          actions={
            <button
              onClick={(e) => { e.stopPropagation(); actions.startNewConversation() }}
              title={t('agent.conversations.new')}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <Plus size={10} />
            </button>
          }
        />

        {agentOpen && (
          <div className="mx-1 mb-1 space-y-0.5">
            {conversations.length === 0 && (
              <p className="px-3 py-1.5 text-[13.5px] text-[var(--text-dim)] italic">
                {t('agent.conversations.empty')}
              </p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => actions.openConversation(c.id)}
                className={cn(
                  'group/conv w-full text-left px-2 py-1.5 rounded-[6px] transition-colors flex items-center gap-2',
                  'text-[15.5px] hover:bg-[var(--bg-sidebar-hover)]',
                  activeId === c.id && activeView === 'agent'
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]',
                )}
              >
                <MessageSquare size={11} className="shrink-0 text-[var(--text-muted)]" />
                <span className="flex-1 min-w-0 truncate">{c.title}</span>
                <span
                  onClick={(e) => void (e.stopPropagation(), actions.removeConversation(c.id, c.title))}
                  className="opacity-0 group-hover/conv:opacity-100 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  title={t('common.delete')}
                >
                  <Trash2 size={10} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-[var(--border-color)] mx-2 my-1" />

        {/* ── Collections section ─────────────────────────────────────────── */}
        <SectionHeader
          icon={Layers}
          label="Collections"
          expanded={collectionsExpanded}
          onToggle={() => setCollectionsExpanded(v => !v)}
          actions={
            <button
              onClick={actions.createCollection}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              title="New collection"
            >
              <Plus size={10} />
            </button>
          }
        />

        {collectionsExpanded && (
          <div>
            {/* All Papers */}
            <button
              onClick={() => {
                clearFilters()
                switchCollection(null)
                setActiveView('library')
              }}
              className={cn(
                'w-full flex items-center gap-2 pl-6 pr-3 py-1.5 text-[15.5px] transition-colors',
                activeView === 'library' && activeCollection === null && !filter.tags?.length
                  ? 'text-[var(--text-primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)]'
              )}
            >
              <BookOpen size={12} className="shrink-0 text-[var(--text-muted)]" />
              <span className="flex-1 text-left">All Papers</span>
              <span className="text-[13.5px] text-[var(--text-muted)]">{papers.length}</span>
            </button>

            {/* Collections */}
            {collections.map(col => {
              const active = activeCollection === col.name && activeView === 'library'
              return (
                <div
                  key={col.name}
                  className={cn(
                    'group/col w-full flex items-center gap-2 pl-6 pr-2 py-1.5 text-[15.5px] transition-colors cursor-pointer',
                    active
                      ? 'text-[var(--accent-color)] bg-[var(--accent-color)]/10'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)]'
                  )}
                  onClick={() => {
                    switchCollection(col.name)
                    setActiveView('library')
                  }}
                >
                  <Layers size={11} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="flex-1 truncate">{col.name}</span>
                  <span className="text-[13.5px] text-[var(--text-muted)] group-hover/col:hidden">
                    {col.paperCount}
                  </span>
                  <div className="hidden group-hover/col:flex items-center gap-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); actions.renameCollection(col.name) }}
                      className="p-0.5 hover:text-[var(--text-primary)] transition-colors"
                      title="Rename"
                    >
                      <Pencil size={9} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); actions.removeCollection(col.name) }}
                      className="p-0.5 hover:text-[var(--danger)] transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-[var(--border-color)] mx-2 my-1" />

        {/* ── Tags section ────────────────────────────────────────────────── */}
        <SectionHeader
          icon={Hash}
          label="Tags"
          expanded={tagsExpanded}
          onToggle={() => setTagsExpanded(v => !v)}
        />

        {tagsExpanded && (
          <div>
            {tagCounts.length === 0 && (
              <p className="pl-7 py-1 text-[14.5px] text-[var(--text-dim)]">No tags yet.</p>
            )}
            {tagCounts.map(([tag, count]) => {
              const active = filter.tags?.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={cn(
                    'w-full flex items-center gap-2 pl-6 pr-3 py-1.5 text-[15.5px] transition-colors',
                    active
                      ? 'text-[var(--accent-color)] bg-[var(--accent-color)]/10'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)]'
                  )}
                >
                  <span className="text-[13.5px] text-[var(--text-muted)]">#</span>
                  <span className="flex-1 truncate text-left">{tag}</span>
                  <span className="text-[13.5px] text-[var(--text-muted)]">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Settings ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--border-color)] p-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-2 py-2 text-[15px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-[6px] transition-colors"
        >
          <Settings size={13} />
          Settings
        </button>
      </div>
    </div>
  )
}
