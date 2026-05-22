/**
 * Crypto-random hex id. Defaults to 8 bytes (16 hex chars), enough for
 * any local enumerable namespace (highlights, undo entries, wire logs).
 * Paper IDs have their own deterministic generator in `paperdb/id.ts`.
 */
export function randomId(bytes = 8): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}
