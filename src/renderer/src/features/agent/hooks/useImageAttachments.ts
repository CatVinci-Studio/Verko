import { useRef } from 'react'
import type { ChatContentPart } from '@shared/types'

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(file)
  })
}

interface UseImageAttachmentsOpts {
  attachments: ChatContentPart[]
  onChange?: (next: ChatContentPart[]) => void
}

/**
 * Image attachment plumbing for ChatInput. Owns the hidden file input
 * ref, exposes `openFilePicker()` for a click-to-pick button, a paste
 * handler for clipboard images, and a remove helper.
 *
 * Files are read as base64 and stored as `{ type: 'image', mimeType,
 * data }` content parts so the agent loop can hand them straight to a
 * vision-capable provider.
 */
export function useImageAttachments({ attachments, onChange }: UseImageAttachmentsOpts) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const append = async (files: File[]) => {
    if (!onChange || files.length === 0) return
    const parts: ChatContentPart[] = []
    for (const f of files) {
      try {
        const data = await readFileAsBase64(f)
        parts.push({ type: 'image', mimeType: f.type, data })
      } catch { /* skip */ }
    }
    if (parts.length > 0) onChange([...attachments, ...parts])
  }

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    await append(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      await append(files)
    }
  }

  const remove = (index: number) => {
    if (!onChange) return
    onChange(attachments.filter((_, i) => i !== index))
  }

  const openFilePicker = () => fileInputRef.current?.click()

  return { fileInputRef, openFilePicker, onFileInputChange, onPaste, remove }
}
