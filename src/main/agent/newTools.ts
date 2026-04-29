import { promises as fs } from 'fs'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import type { Library } from '@main/paperdb/store'

// ── web_fetch ──────────────────────────────────────────────────────────────

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndown.remove(['script', 'style', 'noscript', 'iframe'])

export async function webFetch(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    return JSON.stringify({ error: 'URL must start with http:// or https://' })
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Verko/0.1 (mailto:leonardoshen@icloud.com)' },
    })
    if (!res.ok) {
      return JSON.stringify({ error: `Fetch failed: ${res.status} ${res.statusText}` })
    }
    const ct = res.headers.get('content-type') ?? ''
    const text = await res.text()
    if (ct.includes('text/html')) {
      const md = turndown.turndown(text)
      return JSON.stringify({ url, contentType: ct, markdown: md.slice(0, 50_000) })
    }
    if (ct.includes('json')) {
      return JSON.stringify({ url, contentType: ct, body: text.slice(0, 50_000) })
    }
    return JSON.stringify({ url, contentType: ct, text: text.slice(0, 50_000) })
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

// ── view_pdf_page ──────────────────────────────────────────────────────────

interface PdfPageImage {
  type: 'image'
  mimeType: 'image/png'
  data: string  // base64
  page: number
  totalPages: number
}

/**
 * Rasterize a single PDF page to a PNG image. Used by vision-capable
 * models to "look at" a paper without forcing OCR. Output is a
 * base64-encoded PNG, capped at ~1200px on the long edge.
 *
 * NOTE: Image-rendering needs a canvas implementation. In the main process
 * we use `@napi-rs/canvas` if installed; otherwise we fall back to text
 * extraction (already covered by extract_pdf_text) and report the limitation.
 */
export async function viewPdfPage(
  library: Library,
  paperId: string,
  page: number,
): Promise<string | PdfPageImage> {
  const stream = library.pdfStream(paperId)
  if (!stream) return JSON.stringify({ error: `No PDF associated with paper "${paperId}".` })

  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  const data = Buffer.concat(chunks)

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf') as typeof import('pdfjs-dist')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  if (page < 1 || page > doc.numPages) {
    return JSON.stringify({ error: `Page ${page} out of range (1-${doc.numPages}).` })
  }

  let canvasMod: typeof import('@napi-rs/canvas') | null = null
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

// ── read_document ──────────────────────────────────────────────────────────

/**
 * Best-effort document → markdown converter. Inspired by markitdown but
 * using JS-native libraries to keep the bundle Electron-friendly.
 *
 * Supported: .pdf (text-only), .docx, .html, .md, .txt, .json
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
