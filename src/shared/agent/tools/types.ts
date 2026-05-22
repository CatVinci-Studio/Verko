import type { Library } from '@shared/paperdb/store'
import type { ToolDef } from '../providers'

/**
 * Context passed to every tool handler. Shared tools only require `library`.
 * Main-only tools may rely on extras (LibraryManager); they cast as needed.
 */
export interface ToolContext {
  library: Library
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manager?: any  // intentionally untyped here — main tools narrow on use
}

export interface ToolHandler {
  def: ToolDef
  call: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  /**
   * Whether the tool is safe to dispatch concurrently with other tool
   * calls in the same turn. Read-only tools should opt in. Anything
   * that mutates `Library` state, `papers.csv`, schema, or files
   * should leave this `undefined` (treated as false) — concurrent
   * read-modify-write through `Library.writeRefs()` can lose updates.
   */
  parallelSafe?: boolean
}

export type ToolRegistry = Record<string, ToolHandler>

/** Run a registry's `name` entry and return its string result. */
export async function dispatchFromRegistry(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const handler = registry[name]
  if (!handler) return JSON.stringify({ error: `Unknown tool: ${name}` })
  return handler.call(args, ctx)
}

/** Normalize a user-supplied relative path; reject `..` traversal. */
export function safeRelPath(relativePath: string): string | null {
  const trimmed = relativePath.replace(/^[/\\]+/, '').trim()
  if (!trimmed || trimmed === '.') return ''
  const parts = trimmed.split(/[/\\]+/)
  for (const p of parts) {
    if (p === '..' || p === '') return null
  }
  return parts.join('/')
}

const decoder = new TextDecoder('utf-8')
export const decodeUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes)
