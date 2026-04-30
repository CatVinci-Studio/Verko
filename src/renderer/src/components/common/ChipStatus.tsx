import type { PaperStatus } from '@shared/types'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<PaperStatus, { label: string; dot: string; text: string; bg: string }> = {
  unread:   { label: 'Unread',   dot: 'bg-[var(--text-muted)]',    text: 'text-[var(--text-secondary)]', bg: 'bg-transparent' },
  reading:  { label: 'Reading',  dot: 'bg-[var(--accent-color)]',  text: 'text-[var(--accent-color)]',   bg: 'bg-[var(--accent-color)]/10' },
  read:     { label: 'Read',     dot: 'bg-[var(--status-read)]',   text: 'text-[var(--status-read)]',    bg: 'bg-[var(--status-read)]/10' },
  archived: { label: 'Archived', dot: 'bg-[var(--text-dim)]',      text: 'text-[var(--text-muted)]',     bg: 'bg-transparent' },
}

interface ChipStatusProps {
  status: PaperStatus
  onClick?: () => void
  className?: string
  showDot?: boolean
}

export function ChipStatus({ status, onClick, className, showDot = true }: ChipStatusProps) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.unread
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md text-[12.5px] font-medium px-1.5 py-0.5',
        c.bg, c.text,
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {showDot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />}
      {c.label}
    </span>
  )
}

export type { ChipStatusProps }
