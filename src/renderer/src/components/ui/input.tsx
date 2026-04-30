import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'h-10 w-full px-3 rounded-[10px] border text-[15.5px] bg-[var(--bg-elevated)]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-dim)]',
          'border-[var(--border-color)] focus:border-[var(--accent-color)]',
          'focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-all duration-150',
          className
        )}
        style={{ userSelect: 'text', ...props.style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
