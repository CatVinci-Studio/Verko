import { useSyncExternalStore } from 'react'
import { Trash2, Inbox } from 'lucide-react'
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

      <details className="text-[13px]">
        <summary className="cursor-pointer text-[var(--text-secondary)] select-none hover:text-[var(--text-primary)]">
          {t('settings.debug.request')}
        </summary>
        <div className="mt-2 max-h-96 overflow-auto rounded bg-[var(--bg-base)] border border-[var(--border-color)] p-2 select-text">
          <JsonTree value={entry.rawRequest ?? entry.request} />
        </div>
      </details>

      <details className="text-[13px]">
        <summary className="cursor-pointer text-[var(--text-secondary)] select-none hover:text-[var(--text-primary)]">
          {t('settings.debug.response')}
        </summary>
        <div className="mt-2 max-h-96 overflow-auto rounded bg-[var(--bg-base)] border border-[var(--border-color)] p-2 select-text">
          <JsonTree value={entry.events} />
        </div>
      </details>
    </div>
  )
}

// ── Recursive JSON viewer ──────────────────────────────────────────────────

function JsonTree({ value }: { value: unknown }) {
  return <Node value={value} keyPath="" />
}

function Node({ value, keyPath }: { value: unknown; keyPath: string }) {
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
          <div key={`${keyPath}.${i}`} className="font-mono text-[12.5px]">
            <span className="text-[var(--text-muted)]">{i}: </span>
            <Node value={v} keyPath={`${keyPath}.${i}`} />
          </div>
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
          <div key={`${keyPath}.${k}`} className="font-mono text-[12.5px]">
            <span className="text-[var(--text-muted)]">{k}: </span>
            <Node value={v} keyPath={`${keyPath}.${k}`} />
          </div>
        ))}
      </div>
    )
  }

  return <Token cls="primary">{String(value)}</Token>
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
