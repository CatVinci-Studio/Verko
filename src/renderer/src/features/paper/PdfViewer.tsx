import { useRef, useState, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePdfPath } from './usePaper'

interface PdfViewerProps {
  paperId: string
}

export function PdfViewer({ paperId }: PdfViewerProps) {
  const { data: pdfPath, isLoading } = usePdfPath(paperId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const pdfDocRef = useRef<unknown>(null)

  const renderPage = useCallback(async (pageNum: number, sc: number) => {
    if (!pdfDocRef.current || !containerRef.current) return

    // Cancel previous render
    renderTaskRef.current?.cancel()

    setIsRendering(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfDoc = pdfDocRef.current as any
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: sc })

      let canvas = containerRef.current.querySelector('canvas') as HTMLCanvasElement
      if (!canvas) {
        canvas = document.createElement('canvas')
        canvas.className = 'pdf-page-canvas'
        containerRef.current.innerHTML = ''
        containerRef.current.appendChild(canvas)
      }

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')!
      const renderTask = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = renderTask

      await renderTask.promise
      setIsRendering(false)
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') {
        setIsRendering(false)
      }
    }
  }, [])

  // Load PDF document when path changes
  useEffect(() => {
    if (!pdfPath) return
    setError(null)
    setCurrentPage(1)

    const loadPdf = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).href

        const url = `file://${pdfPath}`
        const loadingTask = pdfjsLib.getDocument({ url })
        const pdfDoc = await loadingTask.promise
        pdfDocRef.current = pdfDoc
        setNumPages(pdfDoc.numPages)
        renderPage(1, scale)
      } catch (e) {
        setError(`Failed to load PDF: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    loadPdf()

    return () => {
      renderTaskRef.current?.cancel()
    }
    // Only re-run when path changes (scale handled separately)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath])

  // Re-render when page or scale changes (only after doc is loaded)
  useEffect(() => {
    if (pdfDocRef.current) {
      renderPage(currentPage, scale)
    }
  }, [currentPage, scale, renderPage])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[13.5px] text-[var(--text-muted)]">Loading PDF path…</span>
      </div>
    )
  }

  if (!pdfPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
          <span className="text-[18px]">📄</span>
        </div>
        <p className="text-[14.5px] text-[var(--text-muted)]">No PDF attached</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-[13.5px] text-[var(--danger)]">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--bg-active)] shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={14} />
        </Button>

        <span className="text-[12.5px] text-[var(--text-secondary)] tabular-nums">
          {currentPage} / {numPages}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          disabled={currentPage >= numPages}
        >
          <ChevronRight size={14} />
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          title="Zoom out"
        >
          <ZoomOut size={13} />
        </Button>

        <span className="text-[12.5px] text-[var(--text-muted)] w-10 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          title="Zoom in"
        >
          <ZoomIn size={13} />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setScale(1.2)}
          title="Reset zoom"
        >
          <RotateCcw size={12} />
        </Button>

        {isRendering && (
          <span className="text-[12.5px] text-[var(--text-muted)] ml-1">Rendering…</span>
        )}
      </div>

      {/* Canvas area */}
      <div
        className="flex-1 overflow-auto bg-[var(--bg-base)] flex justify-center pt-4"
      >
        <div ref={containerRef} className="select-text" />
      </div>
    </div>
  )
}
