import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/ipc'
import { confirmDialog, promptDialog } from '@/store/dialogs'

/**
 * All business handlers for the sidebar — collections CRUD, library add,
 * conversation actions. Pulled out of Sidebar.tsx so the component can
 * focus on rendering. State remains in the relevant zustand stores.
 */
export function useSidebarActions() {
  const { t } = useTranslation()
  const {
    activeCollection, switchCollection, refreshCollections, refreshLibraries,
  } = useLibraryStore()
  const setActiveView = useUIStore((s) => s.setActiveView)
  const newConversation = useAgentStore((s) => s.newConversation)
  const selectConversation = useAgentStore((s) => s.selectConversation)
  const deleteConversation = useAgentStore((s) => s.deleteConversation)

  // ── Collections ─────────────────────────────────────────────────────────
  const createCollection = async () => {
    const result = await promptDialog({
      title: t('sidebar.collectionNew'),
      fields: [{ name: 'name', label: t('common.create'), placeholder: 'To read', required: true }],
      confirmLabel: t('common.create'),
    })
    if (!result) return
    try { await api.collections.create(result.name.trim()); await refreshCollections() }
    catch (e) { console.error(e) }
  }

  const renameCollection = async (oldName: string) => {
    const result = await promptDialog({
      title: t('sidebar.collectionRename', { name: oldName }),
      fields: [{ name: 'name', label: t('common.rename'), initialValue: oldName, required: true }],
      confirmLabel: t('common.rename'),
    })
    if (!result || result.name === oldName) return
    try {
      await api.collections.rename(oldName, result.name.trim())
      if (activeCollection === oldName) switchCollection(result.name.trim())
      await refreshCollections()
    } catch (e) { console.error(e) }
  }

  const removeCollection = async (name: string) => {
    const ok = await confirmDialog({
      title: t('sidebar.collectionDelete.title', { name }),
      message: t('sidebar.collectionDelete.message'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await api.collections.delete(name)
      if (activeCollection === name) switchCollection(null)
      await refreshCollections()
    } catch (e) { console.error(e) }
  }

  // ── Library ─────────────────────────────────────────────────────────────
  const addLibrary = async () => {
    const result = await promptDialog({
      title: t('settings.libraries.addDialog.title'),
      description: t('settings.libraries.addDialog.description'),
      fields: [
        { name: 'name', label: t('settings.libraries.addDialog.displayName'), placeholder: 'My research', required: true },
        { name: 'path', label: t('settings.libraries.addDialog.absolutePath'), placeholder: '/Users/you/Papers', required: true },
      ],
      confirmLabel: t('common.add'),
    })
    if (!result) return
    try {
      await api.libraries.add({ kind: 'local', name: result.name, path: result.path, initialize: true })
      await refreshLibraries()
    } catch (e) { console.error(e) }
  }

  // ── Conversations ───────────────────────────────────────────────────────
  const startNewConversation = () => {
    newConversation()
    setActiveView('agent')
  }

  const openConversation = (id: string) => {
    void selectConversation(id)
    setActiveView('agent')
  }

  const removeConversation = async (id: string, title: string) => {
    const ok = await confirmDialog({
      title: t('agent.conversations.delete.title'),
      message: t('agent.conversations.delete.message', { title }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (ok) await deleteConversation(id)
  }

  return {
    createCollection, renameCollection, removeCollection,
    addLibrary,
    startNewConversation, openConversation, removeConversation,
  }
}
