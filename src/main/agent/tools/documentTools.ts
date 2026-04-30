import type { ToolRegistry } from '@shared/agent/tools'
import { safeRelPath } from '@shared/agent/tools'
import { readDocument } from './documents'

/** Document conversion — desktop-only (uses fs.readFile + mammoth + pdfjs Node entry). */
export const documentTools: ToolRegistry = {
  read_document: {
    def: {
      name: 'read_document',
      description:
        'Convert a document file into markdown. Supports .pdf, .docx, .html, .md, .txt, .json. ' +
        'The path must be inside the library root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative path from the library root.' } },
        required: ['path'],
      },
    },
    async call(args, { library }) {
      const relInput = args['path'] as string
      const localBase = library.backend.localPath('')
      if (!localBase) {
        return JSON.stringify({
          error: 'read_document is only supported on local libraries; this library is on a remote backend.',
        })
      }
      const rel = safeRelPath(relInput)
      if (rel == null) return JSON.stringify({ error: 'Path is outside the library directory.' })
      const { join } = await import('path')
      return readDocument(join(localBase, rel))
    },
  },
}
