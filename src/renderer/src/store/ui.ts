import { create } from 'zustand'

/** User's stated theme choice. 'system' tracks the OS color scheme. */
export type ThemePreference = 'system' | 'dark' | 'light'
/** What's actually applied to the DOM after resolving 'system'. */
export type ResolvedTheme = 'dark' | 'light'

export type ActiveView = 'library' | 'agent' | 'paper'

interface UIStore {
  sidebarCollapsed: boolean
  activeView: ActiveView
  agentOpen: boolean
  settingsOpen: boolean
  commandOpen: boolean
  activeDetailTab: 'read' | 'edit' | 'pdf'
  theme: ThemePreference
  resolvedTheme: ResolvedTheme

  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setActiveView: (v: ActiveView) => void
  toggleAgent: () => void
  setAgentOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setCommandOpen: (v: boolean) => void
  setActiveDetailTab: (tab: 'read' | 'edit' | 'pdf') => void
  setTheme: (theme: ThemePreference) => void
}

const STORAGE_KEY = 'theme'

function readSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readSavedTheme(): ThemePreference {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'dark' || v === 'light' || v === 'system') return v
  // Legacy: pre-system installs only stored 'dark' / 'light'. Promote to 'system' as default.
  return 'system'
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? readSystemPreference() : pref
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('light', resolved === 'light')
}

// Initial paint
const initialPref = readSavedTheme()
const initialResolved = resolveTheme(initialPref)
applyTheme(initialResolved)

// React to OS-level changes when in 'system' mode
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', () => {
    const state = useUIStore.getState()
    if (state.theme === 'system') {
      const next = readSystemPreference()
      applyTheme(next)
      useUIStore.setState({ resolvedTheme: next })
    }
  })
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  activeView: 'library',
  agentOpen: true,
  settingsOpen: false,
  commandOpen: false,
  activeDetailTab: 'read',
  theme: initialPref,
  resolvedTheme: initialResolved,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setActiveView: (v) => set({ activeView: v }),
  toggleAgent: () =>
    set((s) => ({
      activeView: s.activeView === 'agent' ? 'library' : 'agent',
    })),
  setAgentOpen: (v) => set({ agentOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setCommandOpen: (v) => set({ commandOpen: v }),
  setActiveDetailTab: (tab) => set({ activeDetailTab: tab }),
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    const resolved = resolveTheme(theme)
    applyTheme(resolved)
    set({ theme, resolvedTheme: resolved })
  },
}))
