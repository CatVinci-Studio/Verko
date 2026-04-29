import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatYear(year?: number): string {
  return year ? String(year) : '—'
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

export function formatAuthors(authors: string[], max = 2): string {
  if (!authors || authors.length === 0) return '—'
  const shown = authors.slice(0, max)
  const rest = authors.length - shown.length
  const result = shown.map(a => {
    // Try to shorten to "Last, F." format
    const parts = a.split(/[,\s]+/).filter(Boolean)
    if (parts.length >= 2) {
      const last = parts[0]
      const first = parts[1]
      return `${last}, ${first[0]}.`
    }
    return a
  }).join('; ')
  return rest > 0 ? `${result} +${rest}` : result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
