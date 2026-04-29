import { useEffect } from 'react'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/ipc'

export function useAgentEvents(): void {
  const handleEnvelope = useAgentStore((s) => s.handleEnvelope)
  const refreshConversations = useAgentStore((s) => s.refreshConversations)

  useEffect(() => {
    const unsub = api.agent.onEvent(handleEnvelope)
    refreshConversations().catch(() => {})
    return unsub
  }, [handleEnvelope, refreshConversations])
}
