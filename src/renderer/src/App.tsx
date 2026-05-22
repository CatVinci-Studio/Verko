import { useEffect } from 'react'
import { PanelLeft, Settings } from 'lucide-react'
import { useLibraryStore } from './store/library'
import { useInvalidateLibrary } from './features/library/queries'
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
import { useMobile } from './lib/useMobile'
import { useDeepLinkIngest } from './features/library/useDeepLinkIngest'

export default function App() {
  const status = useLibraryStore((s) => s.status)
  const setStatus = useLibraryStore((s) => s.setStatus)
  const invalidate = useInvalidateLibrary()
  const setActiveView = useUIStore((s) => s.setActiveView)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const isMobile = useMobile()
  const {
    sidebarCollapsed,
    activeView,
    commandOpen,
    setCommandOpen,
    setSettingsOpen,
    setFilterOpen,
    toggleSidebar,
    toggleAgent,
  } = useUIStore()

  // Subscribe to agent IPC events + OS share-sheet ingest at the top level
  useAgentEvents()
  useDeepLinkIngest()

  // On small viewports the sidebar takes the full screen — keep it
  // collapsed by default so the inbox is what the user sees first.
  useEffect(() => {
    if (isMobile) setSidebarCollapsed(true)
  }, [isMobile, setSidebarCollapsed])

  // Initial library presence check. Server data is fetched lazily by query
  // hooks once status flips to 'ready'.
  useEffect(() => {
    api.libraries.hasNone().then(
      (none) => {
        if (none) setStatus('none', { reason: 'empty' })
        // Read-later pivot: open the inbox by default rather than the
        // chat. The chat panel is one keystroke away (⌘.) when wanted.
        else setStatus('ready')
      },
      () => setStatus('none', { reason: 'empty' }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for library lifecycle events from the shell.
  useEffect(() => {
    const unsubSwitch = api.libraries.onSwitched(() => {
      setStatus('ready')
      setActiveView('library')
      invalidate.all()
    })
    const unsubNone = api.libraries.onNone((payload) => {
      setStatus('none', payload)
    })
    return () => { unsubSwitch(); unsubNone() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Without this, clicking an http(s) link in the Tauri webview navigates
  // the webview itself with no way back. Same-origin and `#hash` links pass
  // through unchanged.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = (e.target as HTMLElement | null)?.closest('a')
      if (!target) return
      const href = target.getAttribute('href')
      if (!href) return
      if (!/^https?:\/\//i.test(href)) return
      try {
        const url = new URL(href)
        if (url.origin === window.location.origin) return
      } catch { return }
      e.preventDefault()
      void api.net.openExternal(href)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
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
      if (meta && e.key === 'f') {
        e.preventDefault()
        setFilterOpen(true)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [commandOpen, setCommandOpen, toggleSidebar, toggleAgent, setSettingsOpen, setFilterOpen])

  if (status === 'none') {
    return (
      <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-hidden">
        {!isMobile && <TitleBar />}
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
      {!isMobile && <TitleBar />}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {/* Sidebar — desktop = inline column; mobile = overlay drawer. */}
        {!sidebarCollapsed && (
          isMobile ? (
            <>
              {/* Backdrop: tap outside to dismiss */}
              <div
                className="fixed inset-0 z-40 bg-black/40"
                onClick={() => setSidebarCollapsed(true)}
              />
              <div className="fixed inset-y-0 left-0 z-50 w-[80vw] max-w-[320px] shadow-xl">
                <Sidebar />
              </div>
            </>
          ) : (
            <div className="w-[240px] shrink-0 overflow-hidden">
              <Sidebar />
            </div>
          )
        )}

        {/* Collapsed sidebar rail — desktop only. On mobile we surface
            the open / settings affordances inside InboxBar instead so
            the layout doesn't lose horizontal real estate. */}
        {sidebarCollapsed && !isMobile && (
          <div className="w-9 shrink-0 flex flex-col items-center pt-2 pb-2 border-r border-[var(--border-color)]">
            <Button
              onClick={toggleSidebar}
              variant="ghost"
              size="icon-sm"
              title="Expand sidebar (⌘\\)"
              className="h-8 w-8 text-[var(--text-muted)] rounded-[6px]"
            >
              <PanelLeft size={14} />
            </Button>
            <div className="flex-1" />
            <Button
              onClick={() => setSettingsOpen(true)}
              variant="ghost"
              size="icon-sm"
              title="Settings (⌘,)"
              className="h-8 w-8 text-[var(--text-muted)] rounded-[6px]"
            >
              <Settings size={14} />
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
