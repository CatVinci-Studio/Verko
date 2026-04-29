import { safeStorage } from 'electron'
import Store from 'electron-store'

/**
 * Two-tier API key storage:
 *   - Persistent (safeStorage encrypted) — set via `saveKey(profile, key, true)`.
 *   - Session-only (in-memory Map) — set via `saveKey(profile, key, false)`,
 *     forgotten on app quit. Useful on shared machines.
 *
 * `loadKey` checks session first, then falls through to disk. `hasKey` is OR'd.
 */

const store = new Store<{ keys: Record<string, string> }>({
  name: 'agent-keys',
  defaults: { keys: {} }
})

const sessionKeys = new Map<string, string>()

export function saveKey(profile: string, key: string, remember: boolean): void {
  if (remember) {
    const encrypted = safeStorage.encryptString(key)
    const encoded = encrypted.toString('base64')
    const keys = store.get('keys')
    store.set('keys', { ...keys, [profile]: encoded })
    sessionKeys.delete(profile)
    return
  }
  // Session-only — clear any persisted copy so "forget" semantics are explicit.
  sessionKeys.set(profile, key)
  const keys = store.get('keys')
  if (profile in keys) {
    const { [profile]: _, ...rest } = keys
    store.set('keys', rest)
  }
}

export function loadKey(profile: string): string | null {
  const session = sessionKeys.get(profile)
  if (session) return session
  const keys = store.get('keys')
  const encoded = keys[profile]
  if (!encoded) return null
  try {
    const buf = Buffer.from(encoded, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export function hasKey(profile: string): boolean {
  if (sessionKeys.has(profile)) return true
  const keys = store.get('keys')
  return profile in keys && keys[profile].length > 0
}

/** Whether the persisted (encrypted-on-disk) copy exists, regardless of session memory. */
export function hasPersistedKey(profile: string): boolean {
  const keys = store.get('keys')
  return profile in keys && keys[profile].length > 0
}
