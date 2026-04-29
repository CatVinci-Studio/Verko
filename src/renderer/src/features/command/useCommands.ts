import { useUIStore } from '@/store/ui'
import { useLibraryStore } from '@/store/library'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/ipc'

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  shortcut?: string
  group: 'action' | 'paper' | 'navigate' | 'agent'
  action: () => void
}

export function useCommands() {
  const { setCommandOpen, setSettingsOpen, toggleAgent, setActiveView } = useUIStore()
  const { refreshPapers, setSelected, refreshLibraries } = useLibraryStore()
  const { send } = useAgentStore()

  const staticCommands: CommandItem[] = [
    {
      id: 'new-paper',
      label: 'New Paper',
      description: 'Create a blank paper entry',
      icon: '📄',
      group: 'action',
      action: async () => {
        setCommandOpen(false)
        const id = await api.papers.add({ title: 'Untitled Paper', status: 'unread', tags: [] })
        await refreshPapers()
        setSelected(id)
        setActiveView('paper')
      },
    },
    {
      id: 'import-doi',
      label: 'Import by DOI',
      description: 'Fetch paper metadata from a DOI',
      icon: '🔗',
      group: 'action',
      action: async () => {
        setCommandOpen(false)
        const doi = window.prompt('Enter DOI:')
        if (!doi) return
        try {
          const id = await api.papers.importDoi(doi.trim())
          await refreshPapers()
          setSelected(id)
          setActiveView('paper')
        } catch (e) {
          console.error(e)
        }
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Configure API keys and preferences',
      icon: '⚙️',
      shortcut: '⌘,',
      group: 'navigate',
      action: () => {
        setCommandOpen(false)
        setSettingsOpen(true)
      },
    },
    {
      id: 'toggle-agent',
      label: 'Toggle Agent Panel',
      description: 'Show or hide the AI agent',
      icon: '🤖',
      shortcut: '⌘.',
      group: 'navigate',
      action: () => {
        setCommandOpen(false)
        toggleAgent()
      },
    },
    {
      id: 'refresh',
      label: 'Refresh Library',
      description: 'Reload paper list from disk',
      icon: '🔄',
      group: 'action',
      action: async () => {
        setCommandOpen(false)
        await refreshPapers()
        await refreshLibraries()
      },
    },
  ]

  const buildAgentCommand = (query: string): CommandItem => ({
    id: 'ask-agent',
    label: `Ask Agent: "${query}"`,
    description: 'Send this as a message to the agent',
    icon: '🤖',
    group: 'agent',
    action: () => {
      setCommandOpen(false)
      toggleAgent()
      setTimeout(() => send(query), 300)
    },
  })

  return { staticCommands, buildAgentCommand }
}
