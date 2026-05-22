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

const PENDING_ID = '__pending__'

let msgCounter = 0
const newId = (): string => `msg-${++msgCounter}-${Date.now()}`

const emptyState = (): ConversationState => ({
  messages: [],
  isStreaming: false,
  streamingText: '',
})

const safeParse = (s: string): unknown => {
  try { return JSON.parse(s) } catch { return s }
}

export const useAgentStore = create<AgentStore>((set, get) => {
  /**
   * Apply a patch to one conversation slot, creating it if absent.
   * Patch may be a partial state or a function of the existing slot.
   */
  const updateConv = (
    id: string,
    patch: Partial<ConversationState> | ((cur: ConversationState) => Partial<ConversationState>),
  ): void => {
    set((s) => {
      const cur = s.byId[id] ?? emptyState()
      const next = typeof patch === 'function' ? patch(cur) : patch
      return { byId: { ...s.byId, [id]: { ...cur, ...next } } }
    })
  }

  return {
    conversations: [],
    activeId: null,
    byId: {},
    currentPaperId: undefined,

    refreshConversations: async () => {
      set({ conversations: await api.conversations.list() })
    },

    selectConversation: async (id) => {
      if (!id) {
        set({ activeId: null })
        return
      }
      const cached = get().byId[id]
      if (cached && cached.messages.length > 0) {
        set({ activeId: id })
        return
      }
      try {
        const conv = await api.conversations.get(id)
        const messages = hydrateMessages(conv.messages)
        set((s) => ({
          activeId: id,
          byId: { ...s.byId, [id]: { messages, isStreaming: false, streamingText: '' } },
        }))
      } catch {
        // Fall through and just activate the empty conversation.
        set({ activeId: id })
      }
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
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
      }))
    },

    send: async (message, attachments, paperId) => {
      const userMsg: Message = {
        id: newId(),
        role: 'user',
        content: message,
        images: attachments
          ?.filter((p): p is { type: 'image'; data: string; mimeType: string } => p.type === 'image')
          .map((p) => ({ mimeType: p.mimeType, data: p.data })),
        timestamp: new Date(),
      }
      const beforeId = get().activeId
      const target = beforeId ?? PENDING_ID

      updateConv(target, (cur) => ({
        messages: [...cur.messages, userMsg],
        isStreaming: true,
        streamingText: '',
      }))
      if (paperId) set({ currentPaperId: paperId })

      try {
        const id = await api.agent.send(message, attachments, paperId, getCurrentLanguage(), beforeId ?? undefined)
        if (!beforeId) {
          // Move pending state under the real id, set active.
          set((s) => {
            const pending = s.byId[PENDING_ID] ?? emptyState()
            const { [PENDING_ID]: _, ...rest } = s.byId
            return { byId: { ...rest, [id]: pending }, activeId: id }
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
        updateConv(target, (cur) => ({
          messages: [...cur.messages, errMsg],
          isStreaming: false,
        }))
      }
    },

    abort: () => {
      const id = get().activeId
      api.agent.abort(id ?? undefined)
      if (id) updateConv(id, { isStreaming: false })
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
      await get().selectConversation(id)
    },

    handleEnvelope: ({ conversationId, event }) => {
      const id = conversationId || get().activeId
      if (!id) return
      applyEvent(id, event, updateConv)
    },

    toggleToolCall: (msgId, toolId) => {
      const id = get().activeId
      if (!id) return
      updateConv(id, (cur) => ({
        messages: cur.messages.map((m) =>
          m.id !== msgId
            ? m
            : {
                ...m,
                toolCalls: m.toolCalls?.map((tc) =>
                  tc.id === toolId ? { ...tc, expanded: !tc.expanded } : tc,
                ),
              },
        ),
      }))
    },

    setCurrentPaperId: (id) => set({ currentPaperId: id }),
  }
})

// ── Hydration: persisted Conversation → in-memory Message[] ────────────────

function hydrateMessages(raw: { role: string; content: ChatContentPart[]; toolCalls?: { id: string; name: string; arguments: string }[]; toolCallId?: string; createdAt?: number }[]): Message[] {
  const out: Message[] = []
  for (const m of raw) {
    if (m.role === 'user') {
      const text = m.content.find((p) => p.type === 'text')
      const imgs = m.content.filter((p): p is { type: 'image'; data: string; mimeType: string } => p.type === 'image')
      out.push({
        id: newId(),
        role: 'user',
        content: text && text.type === 'text' ? text.text : '',
        images: imgs.length ? imgs.map((i) => ({ mimeType: i.mimeType, data: i.data })) : undefined,
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
      out.push({
        id: newId(),
        role: 'assistant',
        content: text && text.type === 'text' ? text.text : '',
        toolCalls: tcs.length ? tcs : undefined,
        timestamp: new Date(m.createdAt ?? Date.now()),
      })
    } else if (m.role === 'tool') {
      // Attach result to the matching tool_call on the previous assistant message.
      const last = out[out.length - 1]
      if (last && last.role === 'assistant' && last.toolCalls) {
        const tc = last.toolCalls.find((t) => t.id === m.toolCallId)
        if (tc) {
          const txt = m.content.find((p) => p.type === 'text')
          tc.result = txt && txt.type === 'text' ? txt.text : ''
        }
      }
    }
  }
  return out
}

// ── Streaming events: mutate in place via updateConv ──────────────────────

type UpdateConv = (
  id: string,
  patch: Partial<ConversationState> | ((cur: ConversationState) => Partial<ConversationState>),
) => void

function applyEvent(id: string, event: AgentEvent, updateConv: UpdateConv): void {
  switch (event.type) {
    case 'text':
      updateConv(id, (cur) => ({ streamingText: cur.streamingText + event.delta }))
      return

    case 'tool_start':
      updateConv(id, (cur) => {
        const tc: ToolCall = { id: newId(), name: event.name, args: event.args, expanded: false }
        const last = cur.messages[cur.messages.length - 1]
        const messages = last && last.role === 'assistant'
          ? [...cur.messages.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls ?? []), tc] }]
          : [...cur.messages, {
              id: newId(),
              role: 'assistant' as const,
              content: cur.streamingText,
              toolCalls: [tc],
              timestamp: new Date(),
            }]
        return { messages, streamingText: '' }
      })
      return

    case 'tool_result':
      updateConv(id, (cur) => ({
        messages: cur.messages.map((m) => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) =>
              tc.name === event.name && tc.result === undefined ? { ...tc, result: event.result } : tc,
            ),
          }
        }),
      }))
      return

    case 'done':
      updateConv(id, (cur) => {
        const text = cur.streamingText
        if (!text) return { isStreaming: false, streamingText: '' }
        const last = cur.messages[cur.messages.length - 1]
        const messages = last && last.role === 'assistant' && !last.content
          ? [...cur.messages.slice(0, -1), { ...last, content: text }]
          : [...cur.messages, {
              id: newId(),
              role: 'assistant' as const,
              content: text,
              timestamp: new Date(),
            }]
        return { messages, isStreaming: false, streamingText: '' }
      })
      return

    case 'error':
      updateConv(id, (cur) => ({
        isStreaming: false,
        streamingText: '',
        messages: [...cur.messages, {
          id: newId(),
          role: 'assistant',
          content: `⚠ ${event.message}`,
          timestamp: new Date(),
        }],
      }))
      return

    case 'compacted':
      updateConv(id, (cur) => ({
        messages: [...cur.messages, {
          id: newId(),
          role: 'assistant',
          content: '— earlier conversation compacted —',
          timestamp: new Date(),
        }],
      }))
      return
  }
}
