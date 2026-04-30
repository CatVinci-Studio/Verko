import { promises as fs } from 'fs'
import mammoth from 'mammoth'
import type { Library } from '@shared/paperdb/store'
import TurndownService from 'turndown'

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndown.remove(['script', 'style', 'noscript', 'iframe'])

interface PdfPageImage {
  type: 'image'
  mimeType: 'image/png'
  data: string
  page: number
  totalPages: number
}

/**
 * Rasterize a single PDF page to a PNG image. Used by vision-capable
 * models to "look at" a paper without forcing OCR. Output is base64-encoded
 * PNG, capped at ~1200px on the long edge.
 */
export async function viewPdfPage(
  library: Library,
  paperId: string,
  page: number,
): Promise<string | PdfPageImage> {
  const stream = library.pdfStream(paperId)
  if (!stream) return JSON.stringify({ error: `No PDF associated with paper "${paperId}".` })

  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const data = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { data.set(c, off); off += c.length }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf') as typeof import('pdfjs-dist')
  const doc = await pdfjs.getDocument({ data }).promise
  if (page < 1 || page > doc.numPages) {
    return JSON.stringify({ error: `Page ${page} out of range (1-${doc.numPages}).` })
  }

  let canvasMod: typeof import('@napi-rs/canvas')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    canvasMod = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
  } catch {
    return JSON.stringify({
      error: 'PDF rasterization requires @napi-rs/canvas, which is not installed in this build. Use extract_pdf_text for text-only access.',
    })
  }

  const pdfPage = await doc.getPage(page)
  const viewport = pdfPage.getViewport({ scale: 1 })
  const targetLong = 1200
  const scale = targetLong / Math.max(viewport.width, viewport.height)
  const scaled = pdfPage.getViewport({ scale })

  const canvas = canvasMod.createCanvas(scaled.width, scaled.height)
  const ctx = canvas.getContext('2d')
  await pdfPage.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport: scaled,
  }).promise

  const png = await canvas.encode('png')
  return {
    type: 'image',
    mimeType: 'image/png',
    data: Buffer.from(png).toString('base64'),
    page,
    totalPages: doc.numPages,
  }
}

/**
 * Best-effort document → markdown converter. Supports .pdf (text-only),
 * .docx, .html, .md, .txt, .json.
 */
export async function readDocument(absPath: string): Promise<string> {
  let buf: Buffer
  try {
    buf = await fs.readFile(absPath)
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }

  const lower = absPath.toLowerCase()
  try {
    if (lower.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjs = require('pdfjs-dist/legacy/build/pdf') as typeof import('pdfjs-dist')
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
      const pages: string[] = []
      for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
        const pg = await doc.getPage(i)
        const tc = await pg.getTextContent()
        pages.push(`## Page ${i}\n\n` + tc.items.map((it) => ('str' in it ? it.str : '')).join(' '))
      }
      return pages.join('\n\n')
    }
    if (lower.endsWith('.docx')) {
      const r = await mammoth.convertToHtml({ buffer: buf })
      return turndown.turndown(r.value)
    }
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      return turndown.turndown(buf.toString('utf-8'))
    }
    if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json')) {
      return buf.toString('utf-8')
    }
    return JSON.stringify({
      error: `Unsupported file type: ${absPath}. Supported: .pdf, .docx, .html, .md, .txt, .json`,
    })
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}
