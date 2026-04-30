import { cn } from '@/lib/utils'

export interface SegmentOption<T extends string = string> {
  value: T
  label: string
}

interface SettingSegmentedProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: SegmentOption<T>[]
  className?: string
}

export function SettingSegmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: SettingSegmentedProps<T>) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-full',
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onValueChange(opt.value)}
          className={cn(
            'px-3.5 py-1 rounded-full text-[13.5px] font-medium transition-all duration-150',
            value === opt.value
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
