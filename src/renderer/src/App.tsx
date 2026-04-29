import { useEffect } from 'react'
import { Bot, Settings, PanelLeft } from 'lucide-react'
import { useLibraryStore } from './store/library'
import { useUIStore } from './store/ui'
import { Sidebar } from './features/library/Sidebar'
import { LibraryView } from './features/library/LibraryView'
import { PaperDetail } from './features/paper/PaperDetail'
import { AgentPage } from './features/agent/AgentPage'
import { CommandPalette } from './features/command/CommandPalette'
import { SettingsModal } from './features/settings/SettingsModal'
import { api } from './lib/ipc'
import { useAgentEvents } from './features/agent/useAgent'

export default function App() {
  const { refreshPapers, refreshLibraries, refreshSchema, refreshCollections } = useLibraryStore()
  const {
    sidebarCollapsed,
    activeView,
    commandOpen,
    setCommandOpen,
    setSettingsOpen,
    toggleSidebar,
    toggleAgent,
  } = useUIStore()

  // Subscribe to agent IPC events at the top level
  useAgentEvents()

  // Initial data load
  useEffect(() => {
    refreshLibraries().then(() =>
      Promise.all([refreshPapers(), refreshSchema(), refreshCollections()])
    )
  }, [])

  // Listen for library switch events
  useEffect(() => {
    const unsub = api.libraries.onSwitched(() => {
      refreshLibraries()
      refreshPapers()
    })
    return unsub
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(!commandOpen)
      }
      if (meta && e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
      }
      if (meta && e.key === '.') {
        e.preventDefault()
        toggleAgent()  // toggles between library and agent view
      }
      if (meta && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [commandOpen, setCommandOpen, toggleSidebar, toggleAgent, setSettingsOpen])

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-hidden">
      {/* Titlebar */}
      <div className="flex items-center h-11 border-b border-[var(--border-color)] shrink-0 titlebar-drag select-none">
        {/* macOS traffic lights spacer */}
        <div className="w-20 shrink-0" />

        {/* App name */}
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[12px] font-semibold text-[var(--text-dim)] tracking-wider uppercase">
            PaperwithAgent
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-0.5 pr-3 no-drag shrink-0">
          <button
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-[6px] transition-colors"
            title="Ask Agent (⌘K)"
          >
            <Bot size={11} />
            <span className="text-[10.5px] font-medium">⌘K</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] rounded-[6px] transition-colors"
            title="Settings (⌘,)"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div className="w-[240px] shrink-0 overflow-hidden">
            <Sidebar />
          </div>
        )}

        {/* Collapsed sidebar — show re-open button */}
        {sidebarCollapsed && (
          <div className="w-9 shrink-0 flex flex-col items-center pt-2 border-r border-[var(--border-color)]">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              title="Expand sidebar (⌘\\)"
            >
              <PanelLeft size={13} />
            </button>
          </div>
        )}

        {/* Main content — one view at a time */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {activeView === 'library' && <LibraryView />}
          {activeView === 'agent'   && <AgentPage />}
          {activeView === 'paper'   && <PaperDetail />}
        </div>
      </div>

      {/* Overlays */}
      <CommandPalette />
      <SettingsModal />
    </div>
  )
}
