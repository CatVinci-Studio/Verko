import {
  SHARED_TOOLS, dispatchFromRegistry,
  type ToolRegistry, type ToolHandler,
} from '@shared/agent/tools'
import type { Library } from '@shared/paperdb/store'
import type { IShellApi } from './shellApi'

/**
 * Build the desktop tool registry. SHARED_TOOLS handle paper / collection
 * / file / web / pdf / document operations against the active Library.
 * Manager tools (list_libraries / switch_library) call the libraries IPC.
 */
export function buildDesktopDispatch(
  api: IShellApi,
  getLibrary: () => Library | null,
): {
  tools: ToolRegistry
  dispatch: (name: string, args: Record<string, unknown>) => Promise<string>
  isParallelSafe: (name: string) => boolean
} {
  const list_libraries: ToolHandler = {
    parallelSafe: true,
    def: {
      name: 'list_libraries',
      description: 'List all registered libraries with their metadata.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async call() {
      try {
        return JSON.stringify(await api.libraries.list())
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  }

  const switch_library: ToolHandler = {
    def: {
      name: 'switch_library',
      description: 'Switch to a different library by name.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Library name to switch to' } },
        required: ['name'],
      },
    },
    async call(args) {
      const target = (args['name'] as string).trim()
      try {
        const all = await api.libraries.list()
        const hit = all.find((l) => l.name === target)
        if (!hit) return JSON.stringify({ success: false, error: `Library "${target}" not found` })
        await api.libraries.open(hit.id)
        return JSON.stringify({ success: true, active: target })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  }

  const tools: ToolRegistry = {
    ...SHARED_TOOLS,
    list_libraries,
    switch_library,
  }

  const dispatch = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const lib = getLibrary()
    if (!lib && !(name === 'list_libraries' || name === 'switch_library')) {
      return JSON.stringify({ error: 'No active library.' })
    }
    return dispatchFromRegistry(tools, name, args, { library: lib! })
  }

  const isParallelSafe = (name: string): boolean => tools[name]?.parallelSafe === true

  return { tools, dispatch, isParallelSafe }
}
