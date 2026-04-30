import type { ToolRegistry } from '@shared/agent/tools'

/**
 * Browser-side PDF tools. Uses pdfjs-dist's ESM entry + OffscreenCanvas
 * to rasterize pages without any Node-native module. Mirrors the desktop
 * `view_pdf_page` tool feature-for-feature.
 */

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

let workerConfigured = false
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href
    workerConfigured = true
  }
  return pdfjs
}

async function offscreenToPngBase64(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const buf = await blob.arrayBuffer()
  // base64 from Uint8Array via btoa(String.fromCharCode) — chunked for big PNGs.
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export const webPdfTools: ToolRegistry = {
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
      const id = args['id'] as string
      const page = (args['page'] as number) ?? 1
      const stream = library.pdfStream(id)
      if (!stream) return JSON.stringify({ error: `No PDF associated with paper "${id}".` })

      try {
        const data = await readStreamToBytes(stream)
        const pdfjs = await loadPdfjs()
        const doc = await pdfjs.getDocument({ data }).promise
        if (page < 1 || page > doc.numPages) {
          return JSON.stringify({ error: `Page ${page} out of range (1-${doc.numPages}).` })
        }
        const pdfPage = await doc.getPage(page)
        const viewport = pdfPage.getViewport({ scale: 1 })
        const targetLong = 1200
        const scale = targetLong / Math.max(viewport.width, viewport.height)
        const scaled = pdfPage.getViewport({ scale })

        const canvas = new OffscreenCanvas(scaled.width, scaled.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return JSON.stringify({ error: 'Could not acquire 2d context.' })
        await pdfPage.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport: scaled,
        }).promise

        return JSON.stringify({
          type: 'image',
          mimeType: 'image/png',
          data: await offscreenToPngBase64(canvas),
          page,
          totalPages: doc.numPages,
        })
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  extract_pdf_text: {
    def: {
      name: 'extract_pdf_text',
      description:
        'Extract text content from a PDF file associated with a paper. Returns the first 50 pages of text.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Paper ID' } },
        required: ['id'],
      },
    },
    async call(args, { library }) {
      const id = args['id'] as string
      const stream = library.pdfStream(id)
      if (!stream) return `Error: No PDF associated with paper "${id}".`
      try {
        const data = await readStreamToBytes(stream)
        const pdfjs = await loadPdfjs()
        const doc = await pdfjs.getDocument({ data }).promise
        const maxPages = Math.min(doc.numPages, 50)
        const pages: string[] = []
        for (let p = 1; p <= maxPages; p++) {
          const pg = await doc.getPage(p)
          const tc = await pg.getTextContent()
          const text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ')
          pages.push(`--- Page ${p} ---\n${text}`)
        }
        return pages.join('\n\n')
      } catch (e) {
        return `Error extracting PDF text: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  },
}
