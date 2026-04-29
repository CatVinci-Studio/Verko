import { useEffect } from 'react'
import { PanelLeft } from 'lucide-react'
import { useLibraryStore } from './store/library'
import { useUIStore } from './store/ui'
import { Sidebar } from './features/library/Sidebar'
import { LibraryView } from './features/library/LibraryView'
import { PaperDetail } from './features/paper/PaperDetail'
import { AgentPage } from './features/agent/AgentPage'
import { CommandPalette } from './features/command/CommandPalette'
import { SettingsModal } from './features/settings/SettingsModal'
import { DialogHost } from './features/dialogs/DialogHost'
import { TitleBar } from './components/common/TitleBar'
import { WelcomeScreen } from './features/onboarding/WelcomeScreen'
import { Button } from './components/ui/button'
import { api } from './lib/ipc'
import { useAgentEvents } from './features/agent/useAgent'

export default function App() {
  const { refreshAll, status, setStatus } = useLibraryStore()
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

  // Initial data load. Zustand actions are stable; mount-only is intentional.
  useEffect(() => {
    (async () => {
      const noLibrary = await api.libraries.hasNone()
      if (noLibrary) {
        setStatus('none', { reason: 'empty' })
        return
      }
      setStatus('ready')
      await refreshAll()
    })().catch(() => setStatus('none', { reason: 'empty' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for library lifecycle events from main.
  useEffect(() => {
    const unsubSwitch = api.libraries.onSwitched(() => {
      setStatus('ready')
      refreshAll()
    })
    const unsubNone = api.libraries.onNone((payload) => {
      setStatus('none', payload)
    })
    return () => { unsubSwitch(); unsubNone() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (status === 'none') {
    return (
      <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-hidden">
        <TitleBar
          onOpenCommand={() => setCommandOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <WelcomeScreen />
        </div>
        <DialogHost />
        <SettingsModal />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-hidden">
      <TitleBar
        onOpenCommand={() => setCommandOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

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
            <Button
              onClick={toggleSidebar}
              variant="ghost"
              size="icon-sm"
              title="Expand sidebar (⌘\\)"
              className="h-7 w-7 text-[var(--text-muted)] rounded-[6px]"
            >
              <PanelLeft size={13} />
            </Button>
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
      <DialogHost />
    </div>
  )
}
