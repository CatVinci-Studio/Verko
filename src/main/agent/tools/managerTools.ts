import type { ToolRegistry } from '@shared/agent/tools'
import type { LibraryManager } from '@main/paperdb/manager'

/** Multi-library tools — desktop-only because the web build is single-library. */
export const managerTools: ToolRegistry = {
  list_libraries: {
    def: {
      name: 'list_libraries',
      description: 'List all registered libraries with their metadata.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async call(_args, ctx) {
      const manager = ctx.manager as LibraryManager | undefined
      if (!manager) return JSON.stringify({ error: 'list_libraries is desktop-only.' })
      try {
        return JSON.stringify(await manager.list())
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  switch_library: {
    def: {
      name: 'switch_library',
      description: 'Switch to a different library by name.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Library name to switch to' } },
        required: ['name'],
      },
    },
    async call(args, ctx) {
      const manager = ctx.manager as LibraryManager | undefined
      if (!manager) return JSON.stringify({ error: 'switch_library is desktop-only.' })
      const libName = args['name'] as string
      try {
        const all = await manager.list()
        const target = all.find((l) => l.name === libName)
        if (!target) return JSON.stringify({ success: false, error: `Library "${libName}" not found` })
        await manager.open(target.id)
        return JSON.stringify({ success: true, active: libName })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
