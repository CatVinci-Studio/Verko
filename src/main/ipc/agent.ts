import type { IpcMain, BrowserWindow } from 'electron'
import type { AgentEvent } from '@shared/types'
import { getConfig, setActiveProfile, getProfiles } from '../agent/config'
import { saveKey, loadKey } from '../agent/auth'
import { testConnection } from '../agent/client'

export interface AgentSession {
  send(message: string, onEvent: (event: AgentEvent) => void, paperId?: string): void
  abort(): void
}

export function registerAgentHandlers(
  ipc: IpcMain,
  getAgent: () => AgentSession,
  getWindow: () => BrowserWindow | null
): void {
  ipc.handle('agent:send', async (_, message: string, paperId?: string) => {
    try {
      const agent = getAgent()
      // Fire-and-forget: do not await; streaming events arrive via webContents.send
      agent.send(
        message,
        (event: AgentEvent) => {
          getWindow()?.webContents.send('agent:event', event)
        },
        paperId
      )
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:abort', async () => {
    try {
      const agent = getAgent()
      agent.abort()
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:getConfig', async () => {
    try {
      return getConfig()
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:setProfile', async (_, name: string) => {
    try {
      setActiveProfile(name)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:saveKey', async (_, profile: string, key: string) => {
    try {
      saveKey(profile, key)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:testKey', async (_, profile: string) => {
    try {
      const config = getConfig()
      const profileData = config.profiles.find((p) => p.name === profile)
      if (!profileData) throw new Error(`Profile "${profile}" not found`)
      const key = loadKey(profile)
      if (!key) return false
      return await testConnection(profileData.baseUrl, key, profileData.model)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('agent:getProfiles', async () => {
    try {
      return getProfiles()
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
}
