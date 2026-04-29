import Store from 'electron-store'
import { DEFAULT_AGENT_CONFIG } from '@shared/presets'
import { PROVIDER_DEFINITIONS } from '@shared/providers'
import type { AgentConfig, AgentProfile } from '@shared/types'
import { hasKey, loadKey } from './auth'

const store = new Store<{ config: AgentConfig }>({
  name: 'agent-config',
  defaults: { config: DEFAULT_AGENT_CONFIG }
})

/**
 * Sync the persisted profile list against the canonical catalog.
 * - Adds any catalog member that's missing
 * - Drops any persisted profile not in the catalog (stale presets, old IDs)
 * - Reorders to match catalog order
 *
 * Pre-1.0 we don't carry over secret keys for renamed profiles — the user
 * just re-enters them once. Worth the simpler code.
 */
function syncProfiles(): void {
  const cfg = store.get('config')
  const validIds = new Set<string>(PROVIDER_DEFINITIONS.map((d) => d.id))
  let dirty = false

  // Drop unknown profiles.
  const before = cfg.profiles.length
  cfg.profiles = cfg.profiles.filter((p) => validIds.has(p.name))
  if (cfg.profiles.length !== before) dirty = true

  // Add missing ones using catalog defaults.
  for (const def of PROVIDER_DEFINITIONS) {
    if (!cfg.profiles.find((p) => p.name === def.id)) {
      cfg.profiles.push({
        name: def.id,
        protocol: def.protocol,
        baseUrl: def.defaults.baseUrl,
        model: def.defaults.model,
      })
      dirty = true
    }
  }

  // Reorder to catalog order.
  const order: string[] = PROVIDER_DEFINITIONS.map((d) => d.id)
  const sortedNames = cfg.profiles.map((p) => p.name)
  if (sortedNames.join('|') !== order.join('|')) {
    cfg.profiles = order.map((id) => cfg.profiles.find((p) => p.name === id)!)
    dirty = true
  }

  // Heal defaultProfile.
  if (!validIds.has(cfg.defaultProfile)) {
    cfg.defaultProfile = 'openai'
    dirty = true
  }

  if (dirty) store.set('config', cfg)
}

syncProfiles()

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
