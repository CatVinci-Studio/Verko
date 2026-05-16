import { FileText, FileType2, Globe, StickyNote, Video } from 'lucide-react'
import type { ItemKind } from '@shared/types'

const KIND_ICON: Record<ItemKind, typeof FileText> = {
  paper: FileText,
  web:   Globe,
  pdf:   FileType2,
  note:  StickyNote,
  video: Video,
}

/**
 * Tiny prefix icon for a library row indicating what kind of item it is.
 * Lives in its own file so the columns module stays a single
 * non-component export (keeps Fast Refresh happy for the table).
 */
export function KindGlyph({ kind, hasPdf }: { kind: ItemKind | undefined; hasPdf: boolean }) {
  const resolved: ItemKind = kind ?? (hasPdf ? 'pdf' : 'paper')
  const Icon = KIND_ICON[resolved] ?? FileText
  return <Icon size={12} className="shrink-0 text-[var(--text-dim)]" />
}
