import { type ToolRegistry, decodeUtf8, safeRelPath } from './types'

/** Raw file access scoped to the library root. Browser-safe. */
export const fileTools: ToolRegistry = {
  read_file: {
    def: {
      name: 'read_file',
      description:
        'Read any file within the active library directory. Path is relative to the library root. ' +
        'Use this to read schema.md, collections.json, or any paper markdown file directly.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from library root, e.g. "schema.md" or "papers/2024-ho-ddpm.md"',
          },
        },
        required: ['path'],
      },
    },
    async call(args, { library }) {
      const relInput = args['path'] as string
      const relPath = safeRelPath(relInput)
      if (relPath == null) return JSON.stringify({ error: 'Path is outside the library directory.' })
      try {
        return decodeUtf8(await library.backend.readFile(relPath))
      } catch (e) {
        return JSON.stringify({ error: `Cannot read "${relInput}": ${e instanceof Error ? e.message : String(e)}` })
      }
    },
  },

  write_file: {
    def: {
      name: 'write_file',
      description:
        'Write content to a file within the active library directory. Path is relative to the library root. ' +
        'WARNING: Prefer update_paper / append_note for paper files to keep the index in sync.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'Relative path from library root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
    async call(args, { library }) {
      const relInput = args['path'] as string
      const content = args['content'] as string
      const relPath = safeRelPath(relInput)
      if (relPath == null) return JSON.stringify({ error: 'Path is outside the library directory.' })
      try {
        await library.backend.writeFile(relPath, content)
        return JSON.stringify({ success: true, path: relPath })
      } catch (e) {
        return JSON.stringify({ error: `Cannot write "${relInput}": ${e instanceof Error ? e.message : String(e)}` })
      }
    },
  },

  list_files: {
    def: {
      name: 'list_files',
      description: 'List files and folders within the active library directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from library root. Omit or use "." for the root.',
          },
        },
        required: [],
      },
    },
    async call(args, { library }) {
      const relInput = (args['path'] as string | undefined) ?? '.'
      const relPath = safeRelPath(relInput)
      if (relPath == null) return JSON.stringify({ error: 'Path is outside the library directory.' })
      try {
        const all = await library.backend.listFiles(relPath)
        const prefix = relPath ? `${relPath}/` : ''
        const seen = new Set<string>()
        const items: Array<{ name: string; type: 'file' | 'dir' }> = []
        for (const f of all) {
          if (prefix && !f.startsWith(prefix)) continue
          const rest = f.slice(prefix.length)
          const slash = rest.indexOf('/')
          if (slash === -1) {
            if (!seen.has(rest)) { seen.add(rest); items.push({ name: rest, type: 'file' }) }
          } else {
            const dir = rest.slice(0, slash)
            if (!seen.has(dir)) { seen.add(dir); items.push({ name: dir, type: 'dir' }) }
          }
        }
        return JSON.stringify(items)
      } catch (e) {
        return JSON.stringify({ error: `Cannot list "${relInput}": ${e instanceof Error ? e.message : String(e)}` })
      }
    },
  },
}
