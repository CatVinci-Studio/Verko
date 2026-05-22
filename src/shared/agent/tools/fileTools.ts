import { type ToolRegistry, decodeUtf8, safeRelPath } from './types'

/**
 * Read access into the library directory. Mutations go through the
 * dedicated paper / collection tools — direct writes would bypass the
 * in-memory index and CSV invariants, so `write_file` is intentionally
 * not exposed.
 */
export const fileTools: ToolRegistry = {
  read_file: {
    parallelSafe: true,
    def: {
      name: 'read_file',
      description:
        'Read a UTF-8 text file inside the active library. Use to read papers.csv (the canonical field data), papers/<id>.md (a paper\'s notes), schema.md, collections.json, or any per-collection CSV. Not suitable for binary files like PDFs — use extract_pdf_text or view_pdf_page for those.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from library root, e.g. "papers.csv" or "papers/2024-ho-ddpm.md"',
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

  list_files: {
    parallelSafe: true,
    def: {
      name: 'list_files',
      description: 'List files and folders inside the active library directory. Useful for discovering attachment IDs (under attachments/) or per-collection CSVs.',
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
