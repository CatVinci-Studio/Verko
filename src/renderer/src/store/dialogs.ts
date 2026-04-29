import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface PromptField {
  name: string
  label: string
  placeholder?: string
  initialValue?: string
  type?: 'text' | 'password'
  required?: boolean
}

export interface PromptOptions {
  title: string
  description?: string
  fields: PromptField[]
  confirmLabel?: string
}

interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

interface PromptRequest extends PromptOptions {
  id: number
  resolve: (values: Record<string, string> | null) => void
}

interface DialogState {
  confirms: ConfirmRequest[]
  prompts: PromptRequest[]
  pushConfirm: (req: Omit<ConfirmRequest, 'id'>) => void
  pushPrompt: (req: Omit<PromptRequest, 'id'>) => void
  resolveConfirm: (id: number, ok: boolean) => void
  resolvePrompt: (id: number, values: Record<string, string> | null) => void
}

let nextId = 0

export const useDialogStore = create<DialogState>((set, get) => ({
  confirms: [],
  prompts: [],
  pushConfirm: (req) =>
    set((s) => ({ confirms: [...s.confirms, { ...req, id: ++nextId }] })),
  pushPrompt: (req) =>
    set((s) => ({ prompts: [...s.prompts, { ...req, id: ++nextId }] })),
  resolveConfirm: (id, ok) => {
    const r = get().confirms.find((c) => c.id === id)
    r?.resolve(ok)
    set((s) => ({ confirms: s.confirms.filter((c) => c.id !== id) }))
  },
  resolvePrompt: (id, values) => {
    const r = get().prompts.find((p) => p.id === id)
    r?.resolve(values)
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }))
  },
}))

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) =>
    useDialogStore.getState().pushConfirm({ ...opts, resolve })
  )
}

export function promptDialog(opts: PromptOptions): Promise<Record<string, string> | null> {
  return new Promise((resolve) =>
    useDialogStore.getState().pushPrompt({ ...opts, resolve })
  )
}
