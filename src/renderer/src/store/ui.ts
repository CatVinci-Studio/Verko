import { create } from 'zustand'

type Theme = 'dark' | 'light'
export type ActiveView = 'library' | 'agent' | 'paper'

interface UIStore {
  sidebarCollapsed: boolean
  activeView: ActiveView
  agentOpen: boolean          // sidebar agent section expanded
  settingsOpen: boolean
  commandOpen: boolean
  activeDetailTab: 'read' | 'edit' | 'pdf'
  theme: Theme

  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setActiveView: (v: ActiveView) => void
  toggleAgent: () => void
  setAgentOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setCommandOpen: (v: boolean) => void
  setActiveDetailTab: (tab: 'read' | 'edit' | 'pdf') => void
  toggleTheme: () => void
}

const savedTheme = (localStorage.getItem('theme') as Theme | null) ?? 'dark'
document.documentElement.classList.toggle('light', savedTheme === 'light')

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  activeView: 'library',
  agentOpen: true,
  settingsOpen: false,
  commandOpen: false,
  activeDetailTab: 'read',
  theme: savedTheme,

  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setActiveView: (v) => set({ activeView: v }),
  toggleAgent: () => set(s => ({
    activeView: s.activeView === 'agent' ? 'library' : 'agent'
  })),
  setAgentOpen: (v) => set({ agentOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setCommandOpen: (v) => set({ commandOpen: v }),
  setActiveDetailTab: (tab) => set({ activeDetailTab: tab }),
  toggleTheme: () => set(s => {
    const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('light', next === 'light')
    localStorage.setItem('theme', next)
    return { theme: next }
  }),
}))
