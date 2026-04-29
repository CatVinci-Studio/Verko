import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SettingSectionProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function SettingSection({ title, description, children, className }: SettingSectionProps) {
  return (
    <section className={cn('space-y-2', className)}>
      <header>
        <h4 className="text-[12.5px] font-semibold text-[var(--text-primary)]">{title}</h4>
        {description && (
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </header>
      <div className="divide-y divide-[var(--border-color)]">{children}</div>
    </section>
  )
}
