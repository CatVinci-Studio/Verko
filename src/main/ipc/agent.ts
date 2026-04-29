import type { IpcMain, BrowserWindow } from 'electron'
import type { AgentEvent, AgentEventEnvelope, ChatContentPart, Language, ProfilePatch } from '@shared/types'
import { getConfig, setActiveProfile, updateProfile, getProfiles } from '../agent/config'
import { saveKey, loadKey } from '../agent/auth'
import { createProvider } from '../agent/providers'

export interface AgentSession {
  send(
    userText: string,
    attachments: ChatContentPart[] | undefined,
    currentPaperId: string | undefined,
    language: Language | undefined,
    conversationId: string | undefined,
    onEvent: (event: AgentEvent) => void,
  ): Promise<string>
  abort(conversationId?: string): void
  forget?(conversationId: string): void
}

export function registerAgentHandlers(
  ipc: IpcMain,
  getAgent: () => AgentSession,
  getWindow: () => BrowserWindow | null
): void {
  ipc.handle(
    'agent:send',
    async (
      _,
      message: string,
      attachments?: ChatContentPart[],
      paperId?: string,
      language?: Language,
      conversationId?: string,
    ) => {
      const agent = getAgent()
      // Resolve / create the conversation up front so we know the id even
      // before any event fires. Streaming events arrive via webContents.send.
      let resolved: string = conversationId ?? ''
      const send = (event: AgentEvent): void => {
        const envelope: AgentEventEnvelope = { conversationId: resolved, event }
        getWindow()?.webContents.send('agent:event', envelope)
      }
      resolved = await agent.send(message, attachments, paperId, language, conversationId, send)
      return resolved
    },
  )

  ipc.handle('agent:abort', async (_, conversationId?: string) => {
    try {
      getAgent().abort(conversationId)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:getConfig', async () => getConfig())
  ipc.handle('agent:setProfile', async (_, name: string) => setActiveProfile(name))
  ipc.handle('agent:updateProfile', async (_, name: string, patch: ProfilePatch) => updateProfile(name, patch))
  ipc.handle('agent:saveKey', async (_, profile: string, key: string, remember: boolean) => saveKey(profile, key, remember))

  ipc.handle('agent:testKey', async (_, profile: string) => {
    const config = getConfig()
    const profileData = config.profiles.find((p) => p.name === profile)
    if (!profileData) throw new Error(`Profile "${profile}" not found`)
    const key = loadKey(profile)
    if (!key) return false
    const p = createProvider({
      protocol: profileData.protocol,
      baseUrl: profileData.baseUrl,
      apiKey: key,
      model: profileData.model,
    })
    return p.testConnection()
  })

  ipc.handle('agent:getProfiles', async () => getProfiles())
}
