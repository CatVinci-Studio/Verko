import path from 'path'
import { realpath } from 'fs/promises'

/**
 * Zero-trust scope enforcement for `fs:*` IPC.
 *
 * The renderer never sends absolute paths over IPC — it sends a `rootId`
 * (a stable identifier registered by main) plus a relative path. This
 * module maintains the rootId → absolute root mapping and verifies every
 * resolved path stays inside its declared root, post symlink resolution.
 *
 * If renderer is compromised, the blast radius is bounded to the union of
 * registered roots — the same files the user could already see by opening
 * a file manager.
 */

const roots = new Map<string, string>()

export function registerRoot(id: string, abs: string): void {
  roots.set(id, path.resolve(abs))
}

export function unregisterRoot(id: string): void {
  roots.delete(id)
}

export function listRoots(): Map<string, string> {
  return new Map(roots)
}

export function getRoot(id: string): string | null {
  return roots.get(id) ?? null
}

/**
 * Resolve `rootId` + `rel` into an absolute path, verifying:
 *   1. `rootId` is a registered root
 *   2. The joined path doesn't escape via `..`
 *   3. After symlink resolution (when the target exists), the realpath
 *      still lies inside the root
 *
 * Throws on any violation. For non-existent targets (writes / probes),
 * returns the joined path without realpath.
 */
export async function resolveScoped(rootId: string, rel: string): Promise<string> {
  const root = roots.get(rootId)
  if (!root) throw new Error(`Root not allowed: ${rootId}`)

  // Normalize the relative path. Strip leading slashes; reject absolute paths.
  if (path.isAbsolute(rel)) throw new Error(`Absolute path not allowed: ${rel}`)
  const safeRel = rel.replace(/^[\\/]+/, '')
  const joined = path.resolve(root, ...safeRel.split(/[\\/]/))

  // Block .. escape pre-realpath.
  if (joined !== root && !joined.startsWith(root + path.sep)) {
    throw new Error(`Path escapes root: ${rel}`)
  }

  // Block symlink escape if the target exists.
  try {
    const real = await realpath(joined)
    if (real !== root && !real.startsWith(root + path.sep)) {
      throw new Error(`Symlink escapes root: ${rel}`)
    }
    return real
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return joined
    throw e
  }
}

/** Reset for tests. */
export function _resetRootsForTesting(): void {
  roots.clear()
}
