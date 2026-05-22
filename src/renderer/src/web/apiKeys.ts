/**
 * Per-provider API key store for the web build.
 *
 * Two-tier mirror of desktop auth.ts:
 *   - Persistent: localStorage 'verko:api-keys' as JSON map { providerId: key }
 *   - Session-only: module-level Map, cleared on page close
 *
 * The "remember on this device" toggle controls which tier a save lands in.
 */

const LS_KEY = 'verko:api-keys'

const sessionKeys = new Map<string, string>()

function readPersisted(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writePersisted(map: Record<string, string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {
    // localStorage full / blocked
  }
}

export function saveApiKey(providerId: string, key: string, remember: boolean): void {
  if (remember) {
    const map = readPersisted()
    map[providerId] = key
    writePersisted(map)
    sessionKeys.delete(providerId)
    return
  }
  sessionKeys.set(providerId, key)
  const map = readPersisted()
  if (providerId in map) {
    delete map[providerId]
    writePersisted(map)
  }
}

export function loadApiKey(providerId: string): string | null {
  const session = sessionKeys.get(providerId)
  if (session) return session
  const map = readPersisted()
  return map[providerId] || null
}

export function hasApiKey(providerId: string): boolean {
  if (sessionKeys.has(providerId)) return true
  const map = readPersisted()
  return Boolean(map[providerId])
}
