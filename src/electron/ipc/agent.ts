import type { IpcMain } from 'electron'
import type { ProfilePatch } from '@shared/types'
import { getConfig, setActiveProfile, updateProfile, getProfiles } from '../agent/config'
import { saveKey, loadKey } from '../agent/keyStore'
import { createProvider } from '@shared/agent/providers'

/**
 * Agent config / profile / key IPC. The agent loop itself runs in the
 * renderer; this module only owns provider configuration plus the
 * encrypted-at-rest API key store (safeStorage).
 */
export function registerAgentHandlers(ipc: IpcMain): void {
  ipc.handle('agent:getConfig', async () => getConfig())
  ipc.handle('agent:setProfile', async (_, name: string) => setActiveProfile(name))
  ipc.handle('agent:updateProfile', async (_, name: string, patch: ProfilePatch) => updateProfile(name, patch))
  ipc.handle('agent:saveKey', async (_, profile: string, key: string, remember: boolean) => saveKey(profile, key, remember))
  ipc.handle('agent:loadKey', async (_, profile: string) => loadKey(profile))
  ipc.handle('agent:getProfiles', async () => getProfiles())

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
}
