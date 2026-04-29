import React, { useState } from 'react'
import {
  Plus, Hash, ChevronRight, Library, Settings, Check,
  Layers, Trash2, Pencil, Bot, PanelLeftClose,
  BookOpen, MessageSquare,
} from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/ipc'
import { cn } from '@/lib/utils'
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
    <div className="h-7 flex items-center px-1 group/sh">
      <button
        onClick={onToggle}
        className="flex-1 flex items-center gap-1.5 h-full px-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <ChevronRight
          size={11}
          className={cn('shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
        />
        <Icon size={11} className="shrink-0" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider">{label}</span>
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
  const {
    papers, filter, setFilter,
    libraries, activeLibrary, switchLibrary, refreshLibraries,
    collections, activeCollection, switchCollection, refreshCollections,
  } = useLibraryStore()

  const { activeView, setActiveView, agentOpen, setAgentOpen, toggleSidebar, setSettingsOpen } = useUIStore()
  const { messages } = useAgentStore()

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

  // ── Collections ──────────────────────────────────────────────────────────────
  const handleCreateCollection = async () => {
    const name = window.prompt('Collection name:')
    if (!name?.trim()) return
    try { await api.collections.create(name.trim()); await refreshCollections() }
    catch (e) { console.error(e) }
  }

  const handleRenameCollection = async (oldName: string) => {
    const newName = window.prompt('New name:', oldName)
    if (!newName?.trim() || newName === oldName) return
    try {
      await api.collections.rename(oldName, newName.trim())
      if (activeCollection === oldName) switchCollection(newName.trim())
      await refreshCollections()
    } catch (e) { console.error(e) }
  }

  const handleDeleteCollection = async (name: string) => {
    if (!window.confirm(`Delete collection "${name}"?`)) return
    try {
      await api.collections.delete(name)
      if (activeCollection === name) switchCollection(null)
      await refreshCollections()
    } catch (e) { console.error(e) }
  }

  // ── Library ──────────────────────────────────────────────────────────────────
  const handleAddLibrary = async () => {
    const name = window.prompt('Library name:')
    if (!name) return
    const path = window.prompt('Library path (absolute):')
    if (!path) return
    try { await api.libraries.add(name, path); await refreshLibraries() }
    catch (e) { console.error(e) }
  }

  // Last user message for agent section preview
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content

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
              <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-[var(--text-primary)] truncate">
                {activeLibrary?.name ?? 'No Library'}
              </span>
              <ChevronRight size={10} className="text-[var(--text-muted)] shrink-0 rotate-90" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {libraries.map(lib => (
              <DropdownMenuItem key={lib.name} onClick={() => switchLibrary(lib.name)} className="flex items-center gap-2">
                {lib.active && <Check size={11} className="text-[var(--accent-color)] shrink-0" />}
                <span className={lib.active ? '' : 'ml-[15px]'}>{lib.name}</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">{lib.paperCount}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleAddLibrary}>
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
        />

        {agentOpen && (
          <button
            onClick={() => setActiveView('agent')}
            className={cn(
              'w-full text-left px-3 py-2 mx-1 mb-1 rounded-[6px] transition-colors',
              'text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-sidebar-hover)]',
              activeView === 'agent' && 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            )}
            style={{ maxWidth: 'calc(100% - 8px)' }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <MessageSquare size={12} className="shrink-0 text-[var(--text-muted)]" />
              <span className="font-medium text-[12px]">
                {messages.length > 0 ? `${messages.length} message${messages.length !== 1 ? 's' : ''}` : 'New conversation'}
              </span>
            </div>
            {lastUserMsg && (
              <p className="text-[11px] text-[var(--text-muted)] truncate pl-[20px]">
                {lastUserMsg}
              </p>
            )}
            {!lastUserMsg && (
              <p className="text-[11px] text-[var(--text-muted)] pl-[20px]">
                Ask about your papers…
              </p>
            )}
          </button>
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
              onClick={handleCreateCollection}
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
                'w-full flex items-center gap-2 pl-6 pr-3 py-1 text-[12px] transition-colors',
                activeView === 'library' && activeCollection === null && !filter.tags?.length
                  ? 'text-[var(--text-primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)]'
              )}
            >
              <BookOpen size={12} className="shrink-0 text-[var(--text-muted)]" />
              <span className="flex-1 text-left">All Papers</span>
              <span className="text-[10px] text-[var(--text-muted)]">{papers.length}</span>
            </button>

            {/* Collections */}
            {collections.map(col => {
              const active = activeCollection === col.name && activeView === 'library'
              return (
                <div
                  key={col.name}
                  className={cn(
                    'group/col w-full flex items-center gap-2 pl-6 pr-2 py-1 text-[12px] transition-colors cursor-pointer',
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
                  <span className="text-[10px] text-[var(--text-muted)] group-hover/col:hidden">
                    {col.paperCount}
                  </span>
                  <div className="hidden group-hover/col:flex items-center gap-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); handleRenameCollection(col.name) }}
                      className="p-0.5 hover:text-[var(--text-primary)] transition-colors"
                      title="Rename"
                    >
                      <Pencil size={9} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteCollection(col.name) }}
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
              <p className="pl-7 py-1 text-[11px] text-[var(--text-dim)]">No tags yet.</p>
            )}
            {tagCounts.map(([tag, count]) => {
              const active = filter.tags?.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={cn(
                    'w-full flex items-center gap-2 pl-6 pr-3 py-1 text-[12px] transition-colors',
                    active
                      ? 'text-[var(--accent-color)] bg-[var(--accent-color)]/10'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sidebar-hover)]'
                  )}
                >
                  <span className="text-[10px] text-[var(--text-muted)]">#</span>
                  <span className="flex-1 truncate text-left">{tag}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{count}</span>
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
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-[6px] transition-colors"
        >
          <Settings size={12} />
          Settings
        </button>
      </div>
    </div>
  )
}
