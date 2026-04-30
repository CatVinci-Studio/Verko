import type { ToolRegistry } from '@shared/agent/tools'
import { viewPdfPage } from './documents'

/** PDF text extraction (pdfjs-dist Node entry). */
async function extractPdfText(data: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf') as typeof import('pdfjs-dist')
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise
  const maxPages = Math.min(pdfDoc.numPages, 50)
  const pageTexts: string[] = []
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(`--- Page ${pageNum} ---\n${pageText}`)
  }
  return pageTexts.join('\n\n')
}

async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

/** PDF tools — desktop-only (rely on Node entries of pdfjs / @napi-rs/canvas). */
export const pdfTools: ToolRegistry = {
  extract_pdf_text: {
    def: {
      name: 'extract_pdf_text',
      description:
        'Extract text content from a PDF file associated with a paper. Returns the first 50 pages of text.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Paper ID whose PDF should be extracted' } },
        required: ['id'],
      },
    },
    async call(args, { library }) {
      const id = args['id'] as string
      const stream = library.pdfStream(id)
      if (!stream) return `Error: No PDF associated with paper "${id}".`
      try {
        const data = await readStreamToBytes(stream)
        return await extractPdfText(data)
      } catch (e) {
        return `Error extracting PDF text: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  },

  view_pdf_page: {
    def: {
      name: 'view_pdf_page',
      description:
        "Rasterize a single page of a paper's PDF to a PNG image. Returns a base64-encoded image so vision-capable models can read figures, equations, and tables. Use this when text extraction is insufficient.",
      parameters: {
        type: 'object',
        properties: {
          id:   { type: 'string', description: 'Paper ID.' },
          page: { type: 'number', description: '1-based page number.' },
        },
        required: ['id', 'page'],
      },
    },
    async call(args, { library }) {
      const result = await viewPdfPage(library, args['id'] as string, (args['page'] as number) ?? 1)
      if (typeof result === 'string') return result
      return JSON.stringify({
        type: 'image',
        mimeType: result.mimeType,
        data: result.data,
        page: result.page,
        totalPages: result.totalPages,
      })
    },
  },
}
