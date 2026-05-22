import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Highlighter, MessageSquare, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/store/dialogs'
import { randomId } from '@shared/util/randomId'
import {
  useAddHighlight,
  useDeleteHighlight,
  useHighlights,
  usePdfPath,
  useUpdateHighlight,
} from './usePaper'
import { useUndoStore } from './highlightUndo'
import type { Highlight, HighlightColor, HighlightDraft, HighlightRect } from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfPageProxy = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsModule = any

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']
const LAST_COLOR_LS = 'verko:highlight-color'
const NEAR_VIEWPORT_PAGES = 2

// One-time cached pdfjs module promise. The dynamic import is cached by the
// bundler but we still pay a microtask per call when reaching for it from a
// hot path; resolve once on first use, reuse the resolved module.
let pdfjsPromise: Promise<PdfjsModule> | null = null
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      if (!m.GlobalWorkerOptions.workerSrc) {
        m.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href
      }
      return m
    })
  }
  return pdfjsPromise
}

interface PdfViewerProps {
  paperId: string
}

interface PageMeta {
  index: number     // 1-based
  width: number     // px at scale=1
  height: number
}

interface PendingSelection {
  /** Per-page rect groups derived from a possibly cross-page browser selection. */
  segments: Array<{ page: number; text: string; rects: HighlightRect[] }>
  /** Combined text across pages, for the toolbar preview / agent storage. */
  text: string
  /** Anchor for the floating toolbar — viewport-relative. */
  anchor: { left: number; top: number }
}

interface NotePopover {
  highlight: Highlight
  /** Anchor — relative to viewport. */
  anchor: { left: number; top: number }
}

// ── Component ────────────────────────────────────────────────────────────────

export function PdfViewer({ paperId }: PdfViewerProps) {
  const { data: pdfPath, isLoading } = usePdfPath(paperId)
  const { data: highlights = [] } = useHighlights(paperId)
  const addHighlight = useAddHighlight(paperId)
  const updateHighlight = useUpdateHighlight(paperId)
  const deleteHighlight = useDeleteHighlight(paperId)
  const pushUndo = useUndoStore((s) => s.push)

  const scrollRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PdfDoc | null>(null)
  /** In-flight render tasks per page — for cancellation on scale change / unmount. */
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())
  /** Pages whose canvas has been painted at the current scale. Cleared on scale change. */
  const renderedRef = useRef<Set<number>>(new Set())
  /** Ref-callback target for each page wrap; replaces brittle querySelector lookups. */
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [pages, setPages] = useState<PageMeta[]>([])
  const [scale, setScale] = useState(1.2)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PendingSelection | null>(null)
  const [notePopover, setNotePopover] = useState<NotePopover | null>(null)
  const [color, setColor] = useState<HighlightColor>(() => {
    const saved = localStorage.getItem(LAST_COLOR_LS) as HighlightColor | null
    return COLORS.includes(saved as HighlightColor) ? (saved as HighlightColor) : 'yellow'
  })

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>()
    for (const h of highlights) {
      const arr = map.get(h.page) ?? []
      arr.push(h)
      map.set(h.page, arr)
    }
    return map
  }, [highlights])

  const pickColor = useCallback((next: HighlightColor) => {
    setColor(next)
    localStorage.setItem(LAST_COLOR_LS, next)
  }, [])

  // ── Load PDF ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!pdfPath) return
    setError(null)
    setSelection(null)
    setNotePopover(null)

    const cancelled = { v: false }
    const tasks = renderTasksRef.current
    const loadPdf = async () => {
      try {
        const pdfjs = await loadPdfjs()
        const url = `file://${pdfPath}`
        const pdfDoc: PdfDoc = await pdfjs.getDocument({ url }).promise
        if (cancelled.v) return
        docRef.current = pdfDoc

        // Pre-fetch every page's intrinsic size in parallel so the placeholder
        // wraps reserve scroll space before any canvas exists. For long PDFs
        // (1000+ pages) this is bounded by pdfjs's internal worker concurrency.
        const metas = await Promise.all(
          Array.from({ length: pdfDoc.numPages }, async (_, i) => {
            const page: PdfPageProxy = await pdfDoc.getPage(i + 1)
            const vp = page.getViewport({ scale: 1 })
            return { index: i + 1, width: vp.width, height: vp.height }
          }),
        )
        if (cancelled.v) return
        renderedRef.current.clear()
        setPages(metas)
      } catch (e) {
        if (!cancelled.v) setError(`Failed to load PDF: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    loadPdf()

    return () => {
      cancelled.v = true
      for (const t of tasks.values()) t.cancel()
      tasks.clear()
    }
  }, [pdfPath])

  // ── Page render (async, cancellable) ───────────────────────────────────────

  const renderPage = useCallback(async (pageIndex: number, sc: number) => {
    if (renderedRef.current.has(pageIndex)) return
    const doc = docRef.current
    const wrap = pageRefs.current.get(pageIndex)
    if (!doc || !wrap) return
    renderedRef.current.add(pageIndex)

    try {
      const pdfjs = await loadPdfjs()
      const page: PdfPageProxy = await doc.getPage(pageIndex)
      const viewport = page.getViewport({ scale: sc })

      let canvas = wrap.querySelector<HTMLCanvasElement>('canvas.pdf-page-canvas')
      if (!canvas) {
        canvas = document.createElement('canvas')
        canvas.className = 'pdf-page-canvas'
        wrap.prepend(canvas)
      }
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')!
      const task = page.render({ canvasContext: ctx, viewport })
      renderTasksRef.current.set(pageIndex, task)
      try {
        await task.promise
      } finally {
        renderTasksRef.current.delete(pageIndex)
      }

      let textLayer = wrap.querySelector<HTMLDivElement>('div.pdf-text-layer')
      if (!textLayer) {
        textLayer = document.createElement('div')
        textLayer.className = 'pdf-text-layer'
        wrap.appendChild(textLayer)
      } else {
        textLayer.replaceChildren()
      }
      textLayer.style.width = `${viewport.width}px`
      textLayer.style.height = `${viewport.height}px`

      const textContent = await page.getTextContent()
      const PdfTextLayer = pdfjs.TextLayer
      if (PdfTextLayer) {
        const layer = new PdfTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
        })
        await layer.render()
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') {
        renderedRef.current.delete(pageIndex)
      }
    }
  }, [])

  // ── Virtual rendering: only paint pages near the viewport ───────────────────
  //
  // This effect also covers scale changes — we cancel in-flight tasks, clear
  // the rendered-set, then build a fresh observer. The observer fires
  // initial entries for currently-intersecting elements, which kicks off a
  // re-render at the new scale.

  useEffect(() => {
    if (pages.length === 0) return
    const root = scrollRef.current
    if (!root) return

    for (const t of renderTasksRef.current.values()) t.cancel()
    renderTasksRef.current.clear()
    renderedRef.current.clear()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const idx = Number((entry.target as HTMLElement).dataset.pdfPage)
          if (!idx) continue
          for (let p = idx; p <= Math.min(pages.length, idx + NEAR_VIEWPORT_PAGES); p++) {
            void renderPage(p, scale)
          }
        }
      },
      { root, rootMargin: '200px 0px' },
    )
    for (const wrap of pageRefs.current.values()) observer.observe(wrap)
    return () => observer.disconnect()
  }, [pages, scale, renderPage])

  // ── Selection capture (works across pages) ──────────────────────────────────

  const captureSelection = useCallback(() => {
    if (!scrollRef.current) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    const root = scrollRef.current
    if (!root.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }

    const clientRects = Array.from(range.getClientRects())
    if (clientRects.length === 0) {
      setSelection(null)
      return
    }

    // Cache page wrap bounds so we don't re-measure once per rect.
    const wrapBoxes = Array.from(pageRefs.current.entries())
      .map(([page, el]) => ({ page, box: el.getBoundingClientRect() }))

    const segments = new Map<number, HighlightRect[]>()
    for (const r of clientRects) {
      if (r.width < 1 || r.height < 1) continue
      const cy = r.top + r.height / 2
      const cx = r.left + r.width / 2
      const wrap = wrapBoxes.find((wb) =>
        cx >= wb.box.left && cx <= wb.box.right && cy >= wb.box.top && cy <= wb.box.bottom,
      )
      if (!wrap) continue
      const list = segments.get(wrap.page) ?? []
      list.push({
        x: (r.left   - wrap.box.left) / wrap.box.width,
        y: (r.top    - wrap.box.top)  / wrap.box.height,
        w: r.width  / wrap.box.width,
        h: r.height / wrap.box.height,
      })
      segments.set(wrap.page, list)
    }
    if (segments.size === 0) {
      setSelection(null)
      return
    }

    // Per-rect text isn't recoverable from `Range.getClientRects` without
    // re-querying each glyph. Approximate by slicing the joined text in
    // proportion to each page's rect count — close enough for storage and
    // for the agent's `list_highlights` consumer.
    const fullText = sel.toString()
    const lastClient = clientRects[clientRects.length - 1]
    const segmentsArray = Array.from(segments.entries())
      .sort(([a], [b]) => a - b)
      .map(([page, rects]) => ({ page, text: '', rects }))

    if (segmentsArray.length === 1) {
      segmentsArray[0].text = fullText
    } else {
      const totalRects = segmentsArray.reduce((n, s) => n + s.rects.length, 0)
      let consumed = 0
      for (const s of segmentsArray) {
        const take = Math.round(fullText.length * (s.rects.length / totalRects))
        s.text = fullText.slice(consumed, consumed + take)
        consumed += take
      }
      if (consumed < fullText.length) {
        segmentsArray[segmentsArray.length - 1].text += fullText.slice(consumed)
      }
    }

    setSelection({
      segments: segmentsArray,
      text: fullText,
      anchor: { left: lastClient.right, top: lastClient.bottom },
    })
  }, [])

  useEffect(() => {
    const onUp = () => { setTimeout(captureSelection, 0) }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [captureSelection])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const onHighlight = async (chosenColor: HighlightColor) => {
    if (!selection) return
    pickColor(chosenColor)
    const groupId = selection.segments.length > 1 ? `g-${randomId(4)}` : undefined
    const drafts: HighlightDraft[] = selection.segments.map((s) => ({
      page: s.page,
      text: s.text,
      rects: s.rects,
      color: chosenColor,
      ...(groupId ? { groupId } : {}),
    }))
    setSelection(null)
    window.getSelection()?.removeAllRanges()

    const created: Highlight[] = []
    for (const d of drafts) created.push(await addHighlight.mutateAsync(d))

    pushUndo(
      drafts.length > 1 ? `${drafts.length} highlights` : '1 highlight',
      async () => {
        for (const h of created) await deleteHighlight.mutateAsync(h.id)
      },
    )
  }

  const onClickHighlight = (h: Highlight, target: HTMLElement) => {
    const box = target.getBoundingClientRect()
    setNotePopover({ highlight: h, anchor: { left: box.left, top: box.bottom + 4 } })
  }

  const onDeleteHighlight = async (h: Highlight) => {
    const ok = await confirmDialog({
      title: 'Delete highlight?',
      message: `"${h.text.slice(0, 200)}${h.text.length > 200 ? '…' : ''}"`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setNotePopover(null)
    const targets = h.groupId
      ? highlights.filter((x) => x.groupId === h.groupId)
      : [h]
    for (const t of targets) await deleteHighlight.mutateAsync(t.id)
    pushUndo(
      targets.length > 1 ? `${targets.length} highlights` : '1 highlight',
      async () => {
        for (const t of targets) {
          await addHighlight.mutateAsync({
            page: t.page,
            text: t.text,
            rects: t.rects,
            ...(t.color != null ? { color: t.color } : {}),
            ...(t.note != null ? { note: t.note } : {}),
            ...(t.groupId != null ? { groupId: t.groupId } : {}),
          })
        }
      },
    )
  }

  const onSaveNote = async (h: Highlight, note: string, nextColor?: HighlightColor) => {
    const patch: { note?: string; color?: HighlightColor } = {}
    if (note.trim()) patch.note = note.trim()
    else if (h.note != null) patch.note = ''
    if (nextColor && nextColor !== (h.color ?? 'yellow')) patch.color = nextColor
    if (Object.keys(patch).length === 0) { setNotePopover(null); return }
    await updateHighlight.mutateAsync({ highlightId: h.id, patch })
    setNotePopover(null)
  }

  const setPageRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(index, el)
    else pageRefs.current.delete(index)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) return <Centered text="Loading PDF path…" muted />
  if (!pdfPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
          <span className="text-[19px]">📄</span>
        </div>
        <p className="text-[15.5px] text-[var(--text-muted)]">No PDF attached</p>
      </div>
    )
  }
  if (error) return <Centered text={error} danger />

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--bg-active)] shrink-0">
        <span className="text-[13.5px] text-[var(--text-secondary)] tabular-nums">
          {pages.length} page{pages.length === 1 ? '' : 's'}
        </span>
        {highlights.length > 0 && (
          <span className="text-[12.5px] text-[var(--text-muted)] ml-1">
            · {highlights.length} highlight{highlights.length === 1 ? '' : 's'}
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost" size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} title="Zoom out"
        >
          <ZoomOut size={13} />
        </Button>
        <span className="text-[13.5px] text-[var(--text-muted)] w-10 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost" size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setScale((s) => Math.min(3, s + 0.2))} title="Zoom in"
        >
          <ZoomIn size={13} />
        </Button>
        <Button
          variant="ghost" size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setScale(1.2)} title="Reset zoom"
        >
          <RotateCcw size={12} />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-[var(--bg-base)] flex flex-col items-center pt-4 relative">
        {pages.map((p) => (
          <div
            key={p.index}
            data-pdf-page={p.index}
            ref={(el) => setPageRef(p.index, el)}
            className="pdf-page-wrap"
            style={{ width: p.width * scale, height: p.height * scale }}
          >
            <div className="pdf-highlight-layer">
              {(highlightsByPage.get(p.index) ?? []).flatMap((h) =>
                h.rects.map((r, i) => (
                  <div
                    key={`${h.id}-${i}`}
                    className="pdf-highlight-rect"
                    data-color={h.color ?? 'yellow'}
                    data-has-note={Boolean(h.note)}
                    title={h.note ? `${h.text}\n\n📝 ${h.note}` : h.text}
                    style={{
                      left:   `${r.x * 100}%`,
                      top:    `${r.y * 100}%`,
                      width:  `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onClickHighlight(h, e.currentTarget)
                    }}
                  />
                )),
              )}
            </div>
          </div>
        ))}

        {selection && (
          <div
            className="fixed z-50 flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] shadow-lg"
            style={{ left: selection.anchor.left + 4, top: selection.anchor.top + 4 }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Highlighter size={12} className="text-[var(--text-muted)]" />
            <ColorSwatches active={color} onPick={onHighlight} />
            <Button
              variant="ghost" size="icon-sm" className="h-7 w-7 text-[var(--text-muted)]"
              onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges() }}
              title="Cancel"
            >
              <X size={11} />
            </Button>
          </div>
        )}

        {notePopover && (
          <NoteEditor
            key={notePopover.highlight.id}
            highlight={notePopover.highlight}
            anchor={notePopover.anchor}
            onSave={(note, nextColor) => onSaveNote(notePopover.highlight, note, nextColor)}
            onDelete={() => onDeleteHighlight(notePopover.highlight)}
            onCancel={() => setNotePopover(null)}
          />
        )}
      </div>

      <UndoToast />
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Centered({ text, muted, danger }: { text: string; muted?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-center h-full">
      <span className={`text-[14.5px] ${danger ? 'text-[var(--danger)]' : muted ? 'text-[var(--text-muted)]' : ''}`}>
        {text}
      </span>
    </div>
  )
}

function ColorSwatches({ active, onPick }: { active: HighlightColor; onPick: (c: HighlightColor) => void }) {
  return (
    <>
      {COLORS.map((c) => (
        <button
          key={c}
          className="pdf-color-swatch"
          data-color={c}
          data-active={c === active}
          onClick={() => onPick(c)}
          title={c}
        />
      ))}
    </>
  )
}

interface NoteEditorProps {
  highlight: Highlight
  anchor: { left: number; top: number }
  onSave: (note: string, color?: HighlightColor) => void
  onDelete: () => void
  onCancel: () => void
}

function NoteEditor({ highlight, anchor, onSave, onDelete, onCancel }: NoteEditorProps) {
  const [note, setNote] = useState(highlight.note ?? '')
  const [chosenColor, setChosenColor] = useState<HighlightColor>(highlight.color ?? 'yellow')

  const style = useMemo(() => {
    const popoverHeight = 180
    const top = anchor.top + popoverHeight > window.innerHeight
      ? Math.max(8, anchor.top - popoverHeight - 16)
      : anchor.top
    const left = Math.min(anchor.left, window.innerWidth - 320)
    return { left, top }
  }, [anchor])

  return (
    <div
      className="fixed z-50 w-[300px] rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] shadow-xl p-3 flex flex-col gap-2"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="text-[13px] text-[var(--text-muted)] line-clamp-3">
        “{highlight.text}”
      </p>
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note…"
        className="w-full resize-none bg-[var(--bg-base)] border border-[var(--border-color)] rounded-md px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]"
        rows={3}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSave(note, chosenColor)
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex items-center gap-2">
        <ColorSwatches active={chosenColor} onPick={setChosenColor} />
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 text-[var(--danger)]" onClick={onDelete}>
          <Trash2 size={11} />
        </Button>
        <Button variant="accent" size="sm" className="h-7 rounded-full" onClick={() => onSave(note, chosenColor)}>
          Save
        </Button>
      </div>
    </div>
  )
}

function UndoToast() {
  const entry = useUndoStore((s) => s.entry)
  const trigger = useUndoStore((s) => s.trigger)
  const dismiss = useUndoStore((s) => s.dismiss)
  if (!entry) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] shadow-lg">
      <MessageSquare size={11} className="text-[var(--text-muted)]" />
      <span className="text-[13px] text-[var(--text-primary)]">{entry.label}</span>
      <Button variant="accent" size="sm" className="h-7 rounded-full" onClick={() => void trigger()}>
        Undo
      </Button>
      <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-[var(--text-muted)]" onClick={dismiss}>
        <X size={11} />
      </Button>
    </div>
  )
}
