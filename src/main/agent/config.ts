import Store from 'electron-store'
import { DEFAULT_AGENT_CONFIG } from '@shared/presets'
import type { AgentConfig, AgentProfile } from '@shared/types'
import { hasKey, loadKey } from './auth'

const store = new Store<{ config: AgentConfig }>({
  name: 'agent-config',
  defaults: { config: DEFAULT_AGENT_CONFIG }
})

export function getConfig(): AgentConfig {
  return store.get('config')
}

export function setActiveProfile(name: string): void {
  const config = store.get('config')
  const exists = config.profiles.find((p) => p.name === name)
  if (!exists) throw new Error(`Profile "${name}" not found`)
  store.set('config', { ...config, defaultProfile: name })
}

export function addProfile(profile: Omit<AgentProfile, 'hasKey'>): void {
  const config = store.get('config')
  const existing = config.profiles.find((p) => p.name === profile.name)
  if (existing) throw new Error(`Profile "${profile.name}" already exists`)
  store.set('config', {
    ...config,
    profiles: [...config.profiles, profile]
  })
}

export function removeProfile(name: string): void {
  const config = store.get('config')
  store.set('config', {
    ...config,
    profiles: config.profiles.filter((p) => p.name !== name)
  })
}

export function updateConfig(patch: Partial<AgentConfig>): void {
  const config = store.get('config')
  store.set('config', { ...config, ...patch })
}

export function getProfiles(): AgentProfile[] {
  const config = store.get('config')
  return config.profiles.map((p) => ({
    ...p,
    hasKey: hasKey(p.name)
  }))
}

export function getActiveProfile(): AgentProfile & { key: string | null } {
  const config = store.get('config')
  const profileData = config.profiles.find((p) => p.name === config.defaultProfile)
  if (!profileData) throw new Error(`Active profile "${config.defaultProfile}" not found`)
  return {
    ...profileData,
    hasKey: hasKey(profileData.name),
    key: loadKey(profileData.name)
  }
}
