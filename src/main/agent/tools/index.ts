/**
 * Main-process tool registry. Composes shared tools (Library-only) with
 * main-only tools (LibraryManager, PDF rasterization, document conversion).
 */

import {
  SHARED_TOOLS, dispatchFromRegistry,
  type ToolContext, type ToolRegistry,
} from '@shared/agent/tools'
import type { ToolDef } from '@shared/agent/providers'
import type { Library } from '@shared/paperdb/store'
import type { LibraryManager } from '@main/paperdb/manager'
import { managerTools } from './managerTools'
import { pdfTools } from './pdfTools'
import { documentTools } from './documentTools'

export const ALL_TOOLS: ToolRegistry = {
  ...SHARED_TOOLS,
  ...managerTools,
  ...pdfTools,
  ...documentTools,
}

export const TOOL_DEFINITIONS: ToolDef[] = Object.values(ALL_TOOLS).map((h) => h.def)

export interface MainToolContext extends ToolContext {
  library: Library
  manager: LibraryManager
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: MainToolContext,
): Promise<string> {
  return dispatchFromRegistry(ALL_TOOLS, name, args, ctx)
}
