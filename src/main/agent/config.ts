import Store from 'electron-store'
import { DEFAULT_AGENT_CONFIG } from '@shared/presets'
import type { AgentConfig, AgentProfile } from '@shared/types'
import { hasKey, loadKey } from './auth'

const store = new Store<{ config: AgentConfig }>({
  name: 'agent-config',
  defaults: { config: DEFAULT_AGENT_CONFIG }
})

const KNOWN_PROFILE_NAMES = new Set(DEFAULT_AGENT_CONFIG.profiles.map((p) => p.name))

/**
 * Reconcile the persisted profile list with the current built-in set.
 * Keeps user edits to baseUrl/model for surviving profiles; drops
 * obsolete profiles (e.g. groq / openrouter / ollama / lmstudio from
 * earlier defaults); fills in any newly-introduced built-ins.
 */
function migrate(config: AgentConfig): AgentConfig {
  const surviving = config.profiles.filter((p) => KNOWN_PROFILE_NAMES.has(p.name))
  const survivingByName = new Map(surviving.map((p) => [p.name, p]))
  const reconciled = DEFAULT_AGENT_CONFIG.profiles.map(
    (def) => survivingByName.get(def.name) ?? def,
  )
  const sameList =
    reconciled.length === config.profiles.length &&
    reconciled.every((p, i) => p === config.profiles[i])
  const validDefault = reconciled.some((p) => p.name === config.defaultProfile)
  if (sameList && validDefault) return config

  return {
    ...config,
    profiles: reconciled,
    defaultProfile: validDefault ? config.defaultProfile : reconciled[0].name,
  }
}

// Run once at module load: if the persisted config has stale entries,
// rewrite it. From this point on, getConfig() returns the clean shape.
{
  const current = store.get('config')
  const next = migrate(current)
  if (next !== current) store.set('config', next)
}

export function getConfig(): AgentConfig {
  return store.get('config')
}

export function setActiveProfile(name: string): void {
  const config = store.get('config')
  const exists = config.profiles.find((p) => p.name === name)
  if (!exists) throw new Error(`Profile "${name}" not found`)
  store.set('config', { ...config, defaultProfile: name })
}

/** Patch a provider profile's editable fields (baseUrl, model). */
export function updateProfile(
  name: string,
  patch: Partial<Pick<AgentProfile, 'baseUrl' | 'model'>>,
): void {
  const config = store.get('config')
  const idx = config.profiles.findIndex((p) => p.name === name)
  if (idx === -1) throw new Error(`Profile "${name}" not found`)
  const updated = [...config.profiles]
  updated[idx] = { ...updated[idx], ...patch }
  store.set('config', { ...config, profiles: updated })
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
