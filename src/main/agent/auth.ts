import { safeStorage } from 'electron'
import Store from 'electron-store'

const store = new Store<{ keys: Record<string, string> }>({
  name: 'agent-keys',
  defaults: { keys: {} }
})

export function saveKey(profile: string, key: string): void {
  const encrypted = safeStorage.encryptString(key)
  const encoded = encrypted.toString('base64')
  const keys = store.get('keys')
  store.set('keys', { ...keys, [profile]: encoded })
}

export function loadKey(profile: string): string | null {
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
  const keys = store.get('keys')
  return profile in keys && keys[profile].length > 0
}

export function deleteKey(profile: string): void {
  const keys = store.get('keys')
  const updated = { ...keys }
  delete updated[profile]
  store.set('keys', updated)
}
