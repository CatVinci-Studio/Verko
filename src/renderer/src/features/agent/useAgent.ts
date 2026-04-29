import { useEffect } from 'react'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/ipc'

export function useAgentEvents() {
  const handleEvent = useAgentStore(s => s.handleEvent)

  useEffect(() => {
    const unsub = api.agent.onEvent(handleEvent)
    return unsub
  }, [handleEvent])
}
