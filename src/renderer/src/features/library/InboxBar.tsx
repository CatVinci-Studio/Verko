import { useCallback, useRef, useState } from 'react'
import { Inbox, Loader2, Menu, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/ipc'
import { useInvalidateLibrary } from './queries'
import { useLibraryStore } from '@/store/library'
import { useUIStore } from '@/store/ui'
import { useMobile } from '@/lib/useMobile'
import { confirmDialog } from '@/store/dialogs'
import { summarizeIngestedItemPrompt } from '@shared/agent/workerPrompts'

const URL_RE = /^https?:\/\/\S+$/i

/**
 * Drop-bar for the read-later inbox. The primary verb in the new UI is
 * "paste a URL"; this component is that entry point.
 *
 *   - Paste of a URL auto-submits (no Enter needed). Paste of other text
 *     stays in the input until the user presses Enter.
 *   - Drop a `.pdf` onto the bar imports it as a kind=pdf item.
 *
 * Errors surface through the async dialog system rather than browser
 * `alert()` — see CLAUDE.md "Async Dialog API".
 */
export function InboxBar() {
  const { t } = useTranslation()
  const invalidate = useInvalidateLibrary()
  const setSelected = useLibraryStore((s) => s.setSelected)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  const isMobile = useMobile()

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ingest = useCallback(async (url: string) => {
    setBusy(true)
    try {
      const id = await api.papers.ingestUrl(url.trim())
      invalidate.papers()
      setSelected(id)
      setValue('')
      // Fire-and-forget background summarize. The row already exists with
      // a placeholder body; this fills in `summary` + rewrites the markdown
      // into a TL;DR/key-points/source layout. Failure here is silent.
      void api.agent
        .runWorker(summarizeIngestedItemPrompt(id), id)
        .then(() => invalidate.papers())
        .catch(() => {})
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await confirmDialog({
        title: t('library.inbox.errorTitle'),
        message,
        confirmLabel: t('common.ok'),
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }, [invalidate, setSelected, t])

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (URL_RE.test(pasted)) {
      e.preventDefault()
      void ingest(pasted)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const trimmed = value.trim()
    if (!trimmed) return
    if (URL_RE.test(trimmed)) void ingest(trimmed)
  }

  // ── Drag & drop PDFs ────────────────────────────────────────────────────
  // Webview drag-drop is limited: we accept files dropped onto the bar and
  // route .pdf into the same library.add() path used by importPdf.
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    setBusy(true)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const id = await api.papers.importPdfBlob(file.name, buf)
      invalidate.papers()
      setSelected(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await confirmDialog({
        title: t('library.inbox.errorTitle'),
        message,
        confirmLabel: t('common.ok'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0 transition-colors ${
        isMobile ? 'py-2.5 pt-[max(env(safe-area-inset-top),10px)]' : 'py-2'
      } ${dragging ? 'bg-[var(--accent-color)]/10' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* On mobile the sidebar lives behind a hamburger toggle inside the
          bar so the inbox is the entire vertical real estate. */}
      {isMobile && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="shrink-0 p-1.5 -ml-1 rounded-[6px] text-[var(--text-muted)] active:bg-[var(--bg-elevated)]"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      )}
      <Inbox size={isMobile ? 16 : 14} className="shrink-0 text-[var(--text-muted)]" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        disabled={busy}
        placeholder={t('library.inbox.placeholder')}
        spellCheck={false}
        autoComplete="off"
        inputMode="url"
        className={`flex-1 bg-transparent outline-none border-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ${
          isMobile ? 'text-[16px] min-h-[28px]' : 'text-[14.5px]'
        }`}
      />
      {busy && (
        <span className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" />
          {!isMobile && t('library.inbox.ingesting')}
        </span>
      )}
      {isMobile && (
        <button
          onClick={() => setSettingsOpen(true)}
          className="shrink-0 p-1.5 -mr-1 rounded-[6px] text-[var(--text-muted)] active:bg-[var(--bg-elevated)]"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      )}
    </div>
  )
}
