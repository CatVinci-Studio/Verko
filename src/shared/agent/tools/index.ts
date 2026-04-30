/**
 * Shared tool registry — runs anywhere a Library does (main process, web).
 *
 * Main process composes this with its own platform-specific tools
 * (PDF rasterization, library manager, document conversion). The web
 * build uses the shared registry directly.
 */

import type { ToolDef } from '../providers'
import { paperTools } from './paperTools'
import { collectionTools } from './collectionTools'
import { fileTools } from './fileTools'
import { webTools } from './webTools'
import { pdfTools } from './pdfTools'
import { documentTools } from './documentTools'
import { skillTools } from './skillTools'
import { compactTool } from './compactTool'
import type { ToolContext, ToolRegistry } from './types'
import { dispatchFromRegistry } from './types'

export type { ToolContext, ToolHandler, ToolRegistry } from './types'
export { dispatchFromRegistry, safeRelPath, decodeUtf8 } from './types'

export const SHARED_TOOLS: ToolRegistry = {
  ...paperTools,
  ...collectionTools,
  ...fileTools,
  ...webTools,
  ...pdfTools,
  ...documentTools,
  ...skillTools,
  ...compactTool,
}

export const SHARED_TOOL_DEFS: ToolDef[] = Object.values(SHARED_TOOLS).map((h) => h.def)

/**
 * Dispatch a tool call against the shared registry. Returns the JSON-string
 * response, or an `{error: ...}` JSON if the tool is unknown.
 */
export async function dispatchSharedTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  return dispatchFromRegistry(SHARED_TOOLS, name, args, ctx)
}
