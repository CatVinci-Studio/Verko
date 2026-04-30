import { ChevronRight, ChevronDown, Wrench, CheckCircle, Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ToolCall } from '@/store/agent'
import { cn } from '@/lib/utils'

interface ToolCallRowProps {
  toolCall: ToolCall
  msgId: string
  onToggle: (msgId: string, toolId: string) => void
}

export function ToolCallRow({ toolCall, msgId, onToggle }: ToolCallRowProps) {
  const { t } = useTranslation()
  const hasResult = toolCall.result !== undefined

  return (
    <div className="my-1 rounded-[6px] border border-[var(--bg-active)] bg-[var(--bg-surface)] overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-[var(--bg-elevated)] transition-colors"
        onClick={() => onToggle(msgId, toolCall.id)}
      >
        <div className={cn(
          'flex-shrink-0',
          hasResult ? 'text-[var(--status-read)]' : 'text-[var(--warning)]'
        )}>
          {hasResult
            ? <CheckCircle size={11} />
            : <Loader size={11} className="animate-spin" />
          }
        </div>

        <Wrench size={10} className="text-[var(--text-muted)] shrink-0" />

        <span className="font-mono text-[var(--text-secondary)]">{toolCall.name}</span>

        <div className="flex-1" />

        {toolCall.expanded
          ? <ChevronDown size={10} className="text-[var(--text-muted)]" />
          : <ChevronRight size={10} className="text-[var(--text-muted)]" />
        }
      </button>

      {toolCall.expanded && (
        <div className="border-t border-[var(--bg-active)]">
          {/* Args */}
          <div className="px-3 py-2">
            <p className="text-[11.5px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
              {t('agent.tool.input')}
            </p>
            <pre className="text-[12.5px] text-[var(--text-secondary)] font-mono whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>

          {/* Result */}
          {hasResult && (
            <div className="px-3 py-2 border-t border-[var(--bg-elevated)]">
              <p className="text-[11.5px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                {t('agent.tool.output')}
              </p>
              <pre className="text-[12.5px] text-[var(--status-read)]/80 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)
                }
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
