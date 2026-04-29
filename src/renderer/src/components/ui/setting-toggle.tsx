import { cn } from '@/lib/utils'

interface SettingToggleProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function SettingToggle({ checked, onCheckedChange, disabled }: SettingToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-[var(--accent-color)]' : 'bg-[var(--border-focus)]'
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200',
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  )
}
