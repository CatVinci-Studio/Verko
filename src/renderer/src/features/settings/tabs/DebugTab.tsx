import { useState, useSyncExternalStore } from 'react'
import { Check, Copy, Trash2, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { wireLog, type WireLogEntry } from '@shared/agent/wireLog'
import { Button } from '@/components/ui/button'
import { SettingRow } from '@/components/ui/setting-row'
import { SettingToggle } from '@/components/ui/setting-toggle'
import { cn } from '@/lib/utils'

/**
 * Wire log inspector. Shows the last N agent turns with the raw request
 * the SDK sent and every stream event that came back. Useful for
 * diagnosing provider-specific quirks (e.g. tool-call payload validation
 * issues) without dropping to console.log. Modeled on DG-Agent's
 * Model Logs tab; trimmed to in-memory only.
 */
export function DebugTab() {
  const { t } = useTranslation()
  const entries = useSyncExternalStore(wireLog.subscribe, () => wireLog.list())
  const enabled = useSyncExternalStore(wireLog.subscribe, () => wireLog.isEnabled())

  return (
    <div className="space-y-3">
      <SettingRow
        label={t('settings.debug.enable')}
        description={t('settings.debug.enableHint')}
        className="py-1"
      >
        <SettingToggle
          checked={enabled}
          onCheckedChange={(v) => wireLog.setEnabled(v)}
          ariaLabel={t('settings.debug.enable')}
        />
      </SettingRow>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
        <p className="text-[14px] text-[var(--text-muted)]">
          {t('settings.debug.entryCount', { count: entries.length })}
        </p>
        <Button
          onClick={() => wireLog.clear()}
          variant="ghost"
          size="sm"
          disabled={entries.length === 0}
          className="rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <Trash2 size={11} /> {t('settings.debug.clear')}
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-dim)]">
          <Inbox size={20} />
          <p className="text-[14px]">{t('settings.debug.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ entry }: { entry: WireLogEntry }) {
  const { t } = useTranslation()
  const time = new Date(entry.startedAt).toLocaleTimeString()
  return (
    <div className="border border-[var(--border-color)] rounded-[10px] bg-[var(--bg-elevated)] p-3 space-y-2">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-mono text-[var(--text-primary)]">
          {entry.protocol} · {entry.model}
        </span>
        <span className="text-[var(--text-muted)]">{time}</span>
        {entry.durationMs !== undefined && (
          <span className="text-[var(--text-muted)]">{entry.durationMs}ms</span>
        )}
        {entry.finishReason && entry.finishReason !== 'stop' && (
          <span className="text-[var(--text-muted)]">finish: {entry.finishReason}</span>
        )}
        <span className="ml-auto text-[var(--text-muted)]">
          {entry.events.length} {t('settings.debug.events')}
        </span>
        {entry.error && (
          <span className="text-[var(--danger)] font-medium">⚠ {entry.error}</span>
        )}
      </div>

      <Section
        label={t('settings.debug.request')}
        value={entry.rawRequest ?? entry.request}
      />
      <Section label={t('settings.debug.response')} value={entry.events} />
    </div>
  )
}

function Section({ label, value }: { label: string; value: unknown }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault()  // don't toggle the parent <details>
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — silently ignore */ }
  }

  return (
    <details className="text-[13px] group">
      <summary className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)] select-none hover:text-[var(--text-primary)]">
        <span>{label}</span>
        <button
          onClick={onCopy}
          className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-opacity"
          title={t('settings.debug.copy')}
        >
          {copied
            ? <><Check size={10} /> {t('settings.debug.copied')}</>
            : <><Copy size={10} /> {t('settings.debug.copy')}</>}
        </button>
      </summary>
      <div className="mt-2 max-h-96 overflow-auto rounded bg-[var(--bg-base)] border border-[var(--border-color)] p-2 select-text">
        <JsonTree value={value} topLevel />
      </div>
    </details>
  )
}

// ── Recursive JSON viewer ──────────────────────────────────────────────────
//
// `topLevel`: when true, the immediate children of an array/object are
// rendered as collapsed <details> chips so the section opens to a tidy
// summary instead of dumping the whole tree at once. Nested levels stay
// fully expanded (until you hit a long string, which has its own folder).

function JsonTree({ value, topLevel }: { value: unknown; topLevel?: boolean }) {
  return <Node value={value} keyPath="" topLevel={topLevel} />
}

function Node({ value, keyPath, topLevel }: { value: unknown; keyPath: string; topLevel?: boolean }) {
  if (value === null) return <Token cls="dim">null</Token>
  if (value === undefined) return <Token cls="dim">undefined</Token>

  if (typeof value === 'string') {
    if (value.length > 80 || value.includes('\n')) {
      return (
        <details className="inline-block align-top">
          <summary className="cursor-pointer text-[var(--text-muted)] inline">
            "…" <span className="text-[12px] text-[var(--text-dim)]">({value.length} chars)</span>
          </summary>
          <pre className="whitespace-pre-wrap break-words text-[var(--text-primary)] mt-1 ml-3 max-w-full">
            {value}
          </pre>
        </details>
      )
    }
    return <Token cls="primary">{JSON.stringify(value)}</Token>
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <Token cls="primary">{String(value)}</Token>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <Token cls="dim">[]</Token>
    return (
      <div className="ml-3 border-l border-[var(--border-color)] pl-2">
        {value.map((v, i) => (
          <Entry
            key={`${keyPath}.${i}`}
            label={String(i)}
            value={v}
            keyPath={`${keyPath}.${i}`}
            collapse={topLevel}
          />
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <Token cls="dim">{'{}'}</Token>
    return (
      <div className="ml-3 border-l border-[var(--border-color)] pl-2">
        {entries.map(([k, v]) => (
          <Entry
            key={`${keyPath}.${k}`}
            label={k}
            value={v}
            keyPath={`${keyPath}.${k}`}
            collapse={topLevel}
          />
        ))}
      </div>
    )
  }

  return <Token cls="primary">{String(value)}</Token>
}

/** One key/value row. When `collapse`, wraps non-primitive values in a
 *  default-collapsed <details>; primitives render inline regardless. */
function Entry({ label, value, keyPath, collapse }: {
  label: string
  value: unknown
  keyPath: string
  collapse?: boolean
}) {
  const isComplex = value !== null && typeof value === 'object'
  if (collapse && isComplex) {
    return (
      <details className="font-mono text-[12.5px]">
        <summary className="cursor-pointer">
          <span className="text-[var(--text-muted)]">{label}: </span>
          <span className="text-[var(--text-dim)]">
            {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value as object).length}}`}
          </span>
        </summary>
        <Node value={value} keyPath={keyPath} />
      </details>
    )
  }
  return (
    <div className="font-mono text-[12.5px]">
      <span className="text-[var(--text-muted)]">{label}: </span>
      <Node value={value} keyPath={keyPath} />
    </div>
  )
}

function Token({ cls, children }: { cls: 'primary' | 'dim'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'font-mono text-[12.5px]',
        cls === 'primary' ? 'text-[var(--text-primary)]' : 'text-[var(--text-dim)]',
      )}
    >
      {children}
    </span>
  )
}
