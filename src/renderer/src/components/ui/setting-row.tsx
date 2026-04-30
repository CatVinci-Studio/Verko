import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SettingRowProps {
  label: string
  description?: string
  children?: ReactNode
  className?: string
}

export function SettingRow({ label, description, children, className }: SettingRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium text-[var(--text-primary)]">{label}</p>
        {description && (
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}
