import { Agent, type AgentPorts } from '@shared/agent/agent'
import type { ConversationStore } from '@shared/agent/conversationStore'
import type { IApi } from './ipc'

interface AgentFacadeDeps {
  ports: AgentPorts
  store: ConversationStore
  /** `agent.*` IPC passthrough — webApi and desktopApi configure these their own way. */
  config: Pick<IApi['agent'], 'getConfig' | 'setProfile' | 'updateProfile' | 'saveKey' | 'loadKey' | 'testKey' | 'getProfiles'>
}

/**
 * Build the `agent / conversations` slice of `IApi`. Encapsulates the
 * shared `Agent` runtime and `ConversationStore` so platform adapters
 * only have to wire ports.
 */
export function buildAgentFacade({ ports, store, config }: AgentFacadeDeps): {
  agent: IApi['agent']
  conversations: IApi['conversations']
} {
  const agent = new Agent(ports)

  return {
    agent: {
      send: (message, attachments, paperId, language, conversationId) =>
        agent.send(message, attachments, paperId, language, conversationId),
      abort: async (conversationId) => { agent.abort(conversationId) },
      compact: (conversationId) => agent.compact(conversationId),
      onEvent: (cb) => agent.subscribe(cb),
      ...config,
    },
    conversations: {
      list:   () => agent.listConversations(),
      get:    (id) => agent.getConversation(id),
      create: (title) => agent.createConversation(title),
      rename: (id, title) => agent.renameConversation(id, title),
      delete: (id) => agent.deleteConversation(id),
      append: (id, msg) => store.append(id, msg),
    },
  }
}
