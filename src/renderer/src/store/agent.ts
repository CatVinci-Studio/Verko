import { create } from 'zustand'
import type { AgentEvent } from '@shared/types'
import { api } from '@/lib/ipc'

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
  toolCalls?: ToolCall[]
  timestamp: Date
}

interface AgentStore {
  messages: Message[]
  isStreaming: boolean
  streamingText: string
  currentPaperId: string | undefined

  send: (message: string, paperId?: string) => Promise<void>
  abort: () => void
  clear: () => void
  handleEvent: (event: AgentEvent) => void
  toggleToolCall: (msgId: string, toolId: string) => void
  setCurrentPaperId: (id: string | undefined) => void
}

let msgCounter = 0
function newId() { return `msg-${++msgCounter}-${Date.now()}` }

export const useAgentStore = create<AgentStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingText: '',
  currentPaperId: undefined,

  send: async (message, paperId) => {
    const userMsg: Message = {
      id: newId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    }
    set(s => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      streamingText: '',
      currentPaperId: paperId ?? s.currentPaperId,
    }))

    try {
      await api.agent.send(message, paperId)
    } catch (e) {
      set(s => ({
        isStreaming: false,
        messages: [...s.messages, {
          id: newId(),
          role: 'assistant',
          content: `Error: ${e instanceof Error ? e.message : String(e)}`,
          timestamp: new Date(),
        }],
      }))
    }
  },

  abort: () => {
    api.agent.abort()
    set({ isStreaming: false })
  },

  clear: () => set({ messages: [], isStreaming: false, streamingText: '' }),

  handleEvent: (event: AgentEvent) => {
    const state = get()

    if (event.type === 'text') {
      set({ streamingText: state.streamingText + event.delta })
    }

    if (event.type === 'tool_start') {
      const toolCall: ToolCall = {
        id: newId(),
        name: event.name,
        args: event.args,
        expanded: false,
      }
      // Attach to the last assistant message or create a streaming placeholder
      set(s => {
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') {
          const updated = {
            ...last,
            toolCalls: [...(last.toolCalls ?? []), toolCall],
          }
          msgs[msgs.length - 1] = updated
          return { messages: msgs }
        }
        // no current assistant message yet — create one with tool call
        const assistantMsg: Message = {
          id: newId(),
          role: 'assistant',
          content: s.streamingText,
          toolCalls: [toolCall],
          timestamp: new Date(),
        }
        return { messages: [...msgs, assistantMsg], streamingText: '' }
      })
    }

    if (event.type === 'tool_result') {
      set(s => {
        const msgs = s.messages.map(m => {
          if (m.role !== 'assistant' || !m.toolCalls) return m
          const toolCalls = m.toolCalls.map(tc =>
            tc.name === event.name && tc.result === undefined
              ? { ...tc, result: event.result }
              : tc
          )
          return { ...m, toolCalls }
        })
        return { messages: msgs }
      })
    }

    if (event.type === 'done') {
      set(s => {
        const text = s.streamingText
        if (!text && s.messages[s.messages.length - 1]?.role === 'assistant') {
          return { isStreaming: false, streamingText: '' }
        }
        const assistantMsg: Message = {
          id: newId(),
          role: 'assistant',
          content: text,
          timestamp: new Date(),
        }
        const msgs = text ? [...s.messages, assistantMsg] : s.messages
        return { messages: msgs, isStreaming: false, streamingText: '' }
      })
    }

    if (event.type === 'error') {
      set(s => ({
        isStreaming: false,
        streamingText: '',
        messages: [...s.messages, {
          id: newId(),
          role: 'assistant',
          content: `⚠ ${event.message}`,
          timestamp: new Date(),
        }],
      }))
    }
  },

  toggleToolCall: (msgId, toolId) => {
    set(s => ({
      messages: s.messages.map(m =>
        m.id === msgId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map(tc =>
                tc.id === toolId ? { ...tc, expanded: !tc.expanded } : tc
              ),
            }
          : m
      ),
    }))
  },

  setCurrentPaperId: (id) => set({ currentPaperId: id }),
}))
