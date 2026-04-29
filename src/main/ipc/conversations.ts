import type { IpcMain } from 'electron'
import { ConversationStore } from '../agent/conversations'
import type { AgentSession } from './agent'

const store = ConversationStore.fromUserData()

export function registerConversationHandlers(
  ipc: IpcMain,
  getAgent: () => AgentSession,
): void {
  ipc.handle('conversations:list', async () => store.list())

  ipc.handle('conversations:get', async (_, id: string) => store.get(id))

  ipc.handle('conversations:create', async (_, title?: string) => {
    const c = await store.create(title)
    return {
      id: c.id, title: c.title, createdAt: c.createdAt,
      updatedAt: c.updatedAt, messageCount: 0,
    }
  })

  ipc.handle('conversations:rename', async (_, id: string, title: string) => {
    await store.rename(id, title)
  })

  ipc.handle('conversations:delete', async (_, id: string) => {
    await store.delete(id)
    getAgent().forget?.(id)
  })
}
