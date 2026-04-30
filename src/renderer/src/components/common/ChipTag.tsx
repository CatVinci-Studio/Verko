import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChipTagProps {
  tag: string
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
  className?: string
}

export function ChipTag({ tag, onRemove, onClick, active, className }: ChipTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md text-[12.5px] font-medium px-1.5 py-0.5 transition-colors',
        active
          ? 'bg-[var(--accent-color)]/15 text-[var(--accent-color)]'
          : 'bg-[var(--bg-active)] text-[var(--text-secondary)]',
        onClick && 'cursor-pointer hover:bg-[var(--bg-hover)]',
        className
      )}
      onClick={onClick}
    >
      {tag}
      {onRemove && (
        <button
          className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          <X size={9} />
        </button>
      )}
    </span>
  )
}
