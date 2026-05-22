import { type ToolRegistry, decodeUtf8, safeRelPath } from './types'

/**
 * Document → markdown conversion. Reads bytes via the active library's
 * StorageBackend so it works on any backend (local, S3, …) and in any
 * runtime that can load `pdfjs-dist`, `mammoth`, and `turndown`.
 */

let turndownInstance: import('turndown') | null = null
async function loadTurndown(): Promise<import('turndown')> {
  if (turndownInstance) return turndownInstance
  const TurndownService = (await import('turndown')).default
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  td.remove(['script', 'style', 'noscript', 'iframe'])
  turndownInstance = td as unknown as import('turndown')
  return turndownInstance
}

async function pdfToMarkdown(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
    const pg = await doc.getPage(i)
    const tc = await pg.getTextContent()
    pages.push(`## Page ${i}\n\n` + tc.items.map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  return pages.join('\n\n')
}

async function docxToMarkdown(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth')
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const r = await mammoth.convertToHtml({ arrayBuffer: ab })
  const td = await loadTurndown()
  return (td as unknown as { turndown(html: string): string }).turndown(r.value)
}

export const documentTools: ToolRegistry = {
  read_document: {
    parallelSafe: true,
    def: {
      name: 'read_document',
      description:
        'Convert a document file inside the active library into markdown. Supports .pdf, .docx, .html, .md, .txt, .json. ' +
        'Path is relative to the library root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from the library root.' },
        },
        required: ['path'],
      },
    },
    async call(args, { library }) {
      const relInput = args['path'] as string
      const rel = safeRelPath(relInput)
      if (rel == null) return JSON.stringify({ error: 'Path is outside the library directory.' })

      let bytes: Uint8Array
      try {
        bytes = await library.backend.readFile(rel)
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }

      const lower = relInput.toLowerCase()
      try {
        if (lower.endsWith('.pdf')) return await pdfToMarkdown(bytes)
        if (lower.endsWith('.docx')) return await docxToMarkdown(bytes)
        if (lower.endsWith('.html') || lower.endsWith('.htm')) {
          const td = await loadTurndown()
          return (td as unknown as { turndown(html: string): string }).turndown(decodeUtf8(bytes))
        }
        if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json')) {
          return decodeUtf8(bytes)
        }
        return JSON.stringify({
          error: `Unsupported file type: ${relInput}. Supported: .pdf, .docx, .html, .md, .txt, .json`,
        })
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
