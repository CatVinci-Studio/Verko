/* eslint-disable react-refresh/only-export-components -- shadcn convention: badgeVariants (cva) ships alongside the Badge component */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full text-[13.5px] font-medium px-1.5 py-0.5 border',
  {
    variants: {
      variant: {
        default:  'bg-[var(--bg-elevated)] border-[var(--bg-active)] text-[var(--text-secondary)]',
        unread:   'bg-[var(--bg-elevated)] border-[var(--bg-active)] text-[var(--text-secondary)]',
        reading:  'bg-[var(--accent-color)]/10 border-[var(--accent-color)]/40 text-[var(--accent-color)]',
        read:     'bg-[var(--status-read)]/10 border-[var(--status-read)]/40 text-[var(--status-read)]',
        archived: 'bg-[var(--bg-elevated)] border-[var(--bg-active)] text-[var(--text-muted)]',
        tag:      'bg-[var(--bg-elevated)] border-[var(--bg-active)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-default',
        blue:     'bg-[var(--accent-color)]/10 border-[var(--accent-color)]/30 text-[var(--accent-color)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
