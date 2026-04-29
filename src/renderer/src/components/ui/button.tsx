import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1 text-xs font-medium transition-colors cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        default:     'bg-[var(--bg-elevated)] border-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
        accent:      'bg-[var(--accent-color)] border-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]',
        ghost:       'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        destructive: 'bg-[var(--danger)]/10 border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/20',
        outline:     'bg-transparent border-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]',
      },
      size: {
        default: 'h-7 px-2.5 rounded-[4px]',
        sm:      'h-6 px-2 text-[11px] rounded-[3px]',
        lg:      'h-8 px-3 rounded-md',
        icon:    'h-7 w-7 rounded-[4px]',
        'icon-sm': 'h-6 w-6 rounded-[3px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
