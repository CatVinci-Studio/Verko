import { create } from 'zustand'
import type {
  AgentEvent,
  AgentEventEnvelope,
  ChatContentPart,
  ConversationSummary,
} from '@shared/types'
import { api } from '@/lib/ipc'
import { getCurrentLanguage } from '@/lib/i18n'

export interface ToolCall {
  id: string
  name: string
  args: unknown
  result?: unknown
  expanded: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Image attachments displayed inline (base64 data URLs). */
  images?: { mimeType: string; data: string }[]
  toolCalls?: ToolCall[]
  timestamp: Date
}

interface ConversationState {
  messages: Message[]
  isStreaming: boolean
  streamingText: string
}

interface AgentStore {
  conversations: ConversationSummary[]
  activeId: string | null
  byId: Record<string, ConversationState>
  currentPaperId: string | undefined

  refreshConversations: () => Promise<void>
  selectConversation: (id: string | null) => Promise<void>
  newConversation: () => void
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>

  send: (message: string, attachments?: ChatContentPart[], paperId?: string) => Promise<void>
  abort: () => void
  compact: () => Promise<void>
  handleEnvelope: (env: AgentEventEnvelope) => void
  toggleToolCall: (msgId: string, toolId: string) => void
  setCurrentPaperId: (id: string | undefined) => void
}

let msgCounter = 0
function newId(): string { return `msg-${++msgCounter}-${Date.now()}` }

const emptyState = (): ConversationState => ({
  messages: [],
  isStreaming: false,
  streamingText: '',
})

export const useAgentStore = create<AgentStore>((set, get) => ({
  conversations: [],
  activeId: null,
  byId: {},
  currentPaperId: undefined,

  refreshConversations: async () => {
    const list = await api.conversations.list()
    set({ conversations: list })
  },

  selectConversation: async (id) => {
    if (!id) {
      set({ activeId: null })
      return
    }
    const cached = get().byId[id]
    if (!cached || cached.messages.length === 0) {
      try {
        const conv = await api.conversations.get(id)
        const messages: Message[] = []
        for (const m of conv.messages) {
          if (m.role === 'user') {
            const text = m.content.find((p) => p.type === 'text')
            const imgs = m.content.filter((p): p is { type: 'image'; data: string; mimeType: string } => p.type === 'image')
            messages.push({
              id: newId(),
              role: 'user',
              content: text && text.type === 'text' ? text.text : '',
              images: imgs.length > 0 ? imgs.map((i) => ({ mimeType: i.mimeType, data: i.data })) : undefined,
              timestamp: new Date(m.createdAt ?? Date.now()),
            })
          } else if (m.role === 'assistant') {
            const text = m.content.find((p) => p.type === 'text')
            const tcs: ToolCall[] = (m.toolCalls ?? []).map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: safeParse(tc.arguments),
              expanded: false,
            }))
            messages.push({
              id: newId(),
              role: 'assistant',
              content: text && text.type === 'text' ? text.text : '',
              toolCalls: tcs.length > 0 ? tcs : undefined,
              timestamp: new Date(m.createdAt ?? Date.now()),
            })
          } else if (m.role === 'tool') {
            // attach result to the matching tool_call on the previous assistant message
            const last = messages[messages.length - 1]
            if (last && last.role === 'assistant' && last.toolCalls) {
              const tc = last.toolCalls.find((t) => t.id === m.toolCallId)
              if (tc) {
                const txt = m.content.find((p) => p.type === 'text')
                tc.result = txt && txt.type === 'text' ? txt.text : ''
              }
            }
          }
        }
        set((s) => ({
          activeId: id,
          byId: { ...s.byId, [id]: { messages, isStreaming: false, streamingText: '' } },
        }))
        return
      } catch {
        // fall through and just activate the empty conversation
      }
    }
    set({ activeId: id })
  },

  newConversation: () => {
    // Don't create on the backend yet — wait for the first message.
    set({ activeId: null })
  },

  deleteConversation: async (id) => {
    await api.conversations.delete(id)
    set((s) => {
      const { [id]: _, ...rest } = s.byId
      return {
        byId: rest,
        activeId: s.activeId === id ? null : s.activeId,
        conversations: s.conversations.filter((c) => c.id !== id),
      }
    })
  },

  renameConversation: async (id, title) => {
    await api.conversations.rename(id, title)
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === id ? { ...c, title } : c),
    }))
  },

  send: async (message, attachments, paperId) => {
    const userMsg: Message = {
      id: newId(),
      role: 'user',
      content: message,
      images: attachments?.filter((p): p is { type: 'image'; data: string; mimeType: string } => p.type === 'image')
        .map((p) => ({ mimeType: p.mimeType, data: p.data })),
      timestamp: new Date(),
    }
    const beforeId = get().activeId
    // Local optimistic insert
    set((s) => {
      const target = beforeId ?? '__pending__'
      const cur = s.byId[target] ?? emptyState()
      return {
        byId: {
          ...s.byId,
          [target]: { ...cur, messages: [...cur.messages, userMsg], isStreaming: true, streamingText: '' },
        },
        currentPaperId: paperId ?? s.currentPaperId,
      }
    })

    try {
      const id = await api.agent.send(
        message,
        attachments,
        paperId,
        getCurrentLanguage(),
        beforeId ?? undefined,
      )
      if (!beforeId) {
        // Move pending state under the real id, set active.
        set((s) => {
          const pending = s.byId['__pending__'] ?? emptyState()
          const { __pending__: _, ...rest } = s.byId
          return {
            byId: { ...rest, [id]: pending },
            activeId: id,
          }
        })
        await get().refreshConversations()
      }
    } catch (e) {
      const errMsg: Message = {
        id: newId(),
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: new Date(),
      }
      set((s) => {
        const target = beforeId ?? '__pending__'
        const cur = s.byId[target] ?? emptyState()
        return {
          byId: { ...s.byId, [target]: { ...cur, messages: [...cur.messages, errMsg], isStreaming: false } },
        }
      })
    }
  },

  abort: () => {
    const id = get().activeId
    api.agent.abort(id ?? undefined)
    if (id) {
      set((s) => ({ byId: { ...s.byId, [id]: { ...(s.byId[id] ?? emptyState()), isStreaming: false } } }))
    }
  },

  compact: async () => {
    const id = get().activeId
    if (!id) return
    // Drop local cache so next selectConversation re-pulls the compacted history.
    await api.agent.compact(id)
    set((s) => {
      const { [id]: _, ...rest } = s.byId
      return { byId: rest }
    })
    // Re-hydrate the now-compact conversation into local cache.
    await get().selectConversation(id)
  },

  handleEnvelope: ({ conversationId, event }) => {
    const id = conversationId || get().activeId
    if (!id) return
    applyEvent(id, event, set, get)
  },

  toggleToolCall: (msgId, toolId) => {
    const id = get().activeId
    if (!id) return
    set((s) => {
      const cur = s.byId[id]
      if (!cur) return s
      return {
        byId: {
          ...s.byId,
          [id]: {
            ...cur,
            messages: cur.messages.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    toolCalls: m.toolCalls?.map((tc) =>
                      tc.id === toolId ? { ...tc, expanded: !tc.expanded } : tc,
                    ),
                  }
                : m,
            ),
          },
        },
      }
    })
  },

  setCurrentPaperId: (id) => set({ currentPaperId: id }),
}))

// ── Event handler split out for readability ───────────────────────────────

function applyEvent(
  id: string,
  event: AgentEvent,
  set: (fn: (s: AgentStore) => Partial<AgentStore>) => void,
  get: () => AgentStore,
): void {
  if (event.type === 'text') {
    const cur = get().byId[id] ?? emptyState()
    set((s) => ({ byId: { ...s.byId, [id]: { ...cur, streamingText: cur.streamingText + event.delta } } }))
    return
  }

  if (event.type === 'tool_start') {
    const cur = get().byId[id] ?? emptyState()
    const tc: ToolCall = { id: newId(), name: event.name, args: event.args, expanded: false }
    const last = cur.messages[cur.messages.length - 1]
    let messages: Message[]
    if (last && last.role === 'assistant') {
      messages = [...cur.messages.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls ?? []), tc] }]
    } else {
      const assistantMsg: Message = {
        id: newId(),
        role: 'assistant',
        content: cur.streamingText,
        toolCalls: [tc],
        timestamp: new Date(),
      }
      messages = [...cur.messages, assistantMsg]
    }
    set((s) => ({ byId: { ...s.byId, [id]: { ...cur, messages, streamingText: '' } } }))
    return
  }

  if (event.type === 'tool_result') {
    const cur = get().byId[id] ?? emptyState()
    const messages = cur.messages.map((m) => {
      if (m.role !== 'assistant' || !m.toolCalls) return m
      return {
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.name === event.name && tc.result === undefined ? { ...tc, result: event.result } : tc,
        ),
      }
    })
    set((s) => ({ byId: { ...s.byId, [id]: { ...cur, messages } } }))
    return
  }

  if (event.type === 'done') {
    const cur = get().byId[id] ?? emptyState()
    const text = cur.streamingText
    let messages = cur.messages
    if (text) {
      // Either append streaming text to a trailing assistant msg, or create a new one.
      const last = cur.messages[cur.messages.length - 1]
      if (last && last.role === 'assistant' && !last.content) {
        messages = [...cur.messages.slice(0, -1), { ...last, content: text }]
      } else {
        messages = [...cur.messages, {
          id: newId(),
          role: 'assistant',
          content: text,
          timestamp: new Date(),
        }]
      }
    }
    set((s) => ({ byId: { ...s.byId, [id]: { messages, isStreaming: false, streamingText: '' } } }))
    return
  }

  if (event.type === 'error') {
    const cur = get().byId[id] ?? emptyState()
    set((s) => ({
      byId: { ...s.byId, [id]: {
        ...cur,
        isStreaming: false,
        streamingText: '',
        messages: [...cur.messages, {
          id: newId(),
          role: 'assistant',
          content: `⚠ ${event.message}`,
          timestamp: new Date(),
        }],
      } },
    }))
    return
  }

  if (event.type === 'compacted') {
    const cur = get().byId[id] ?? emptyState()
    set((s) => ({
      byId: { ...s.byId, [id]: {
        ...cur,
        messages: [...cur.messages, {
          id: newId(),
          role: 'assistant',
          content: '— earlier conversation compacted —',
          timestamp: new Date(),
        }],
      } },
    }))
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}
