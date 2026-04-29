import Store from 'electron-store'
import { DEFAULT_AGENT_CONFIG } from '@shared/presets'
import type { AgentConfig, AgentProfile, AgentProtocol } from '@shared/types'
import { hasKey, loadKey } from './auth'

const store = new Store<{ config: AgentConfig }>({
  name: 'agent-config',
  defaults: { config: DEFAULT_AGENT_CONFIG }
})

/**
 * One-shot migration from earlier config shapes:
 *   - profiles missing `protocol` (added in v0.1.0)
 *   - obsolete provider names (qwen / deepseek) — fold into custom
 */
function migrateConfig(): void {
  const cfg = store.get('config')
  let dirty = false

  const PROTOCOL_BY_NAME: Record<string, AgentProtocol> = {
    openai: 'openai',
    anthropic: 'anthropic',
    gemini: 'gemini',
  }

  // Drop obsolete preset profiles, keep the user's URL/model under `custom`.
  const obsoleteNames = new Set(['qwen', 'deepseek'])
  const obsoleteSurvivor = cfg.profiles.find((p) => obsoleteNames.has(p.name) && p.baseUrl)
  cfg.profiles = cfg.profiles.filter((p) => !obsoleteNames.has(p.name))

  // Ensure all default profiles exist.
  for (const def of DEFAULT_AGENT_CONFIG.profiles) {
    if (!cfg.profiles.find((p) => p.name === def.name)) {
      cfg.profiles.push({ ...def })
      dirty = true
    }
  }

  // Backfill protocol field.
  for (const p of cfg.profiles) {
    if (!('protocol' in p) || !p.protocol) {
      ;(p as { protocol: AgentProtocol }).protocol = PROTOCOL_BY_NAME[p.name] ?? 'openai'
      dirty = true
    }
  }

  // If user had a qwen/deepseek with baseUrl set, port it to the `custom` profile if it's empty.
  if (obsoleteSurvivor) {
    const custom = cfg.profiles.find((p) => p.name === 'custom')
    if (custom && !custom.baseUrl) {
      custom.baseUrl = obsoleteSurvivor.baseUrl
      custom.model = obsoleteSurvivor.model || custom.model
      dirty = true
    }
  }

  // If activeProfile points at something that no longer exists, fall back.
  if (!cfg.profiles.find((p) => p.name === cfg.defaultProfile)) {
    cfg.defaultProfile = 'openai'
    dirty = true
  }

  if (dirty) store.set('config', cfg)
}

migrateConfig()

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
