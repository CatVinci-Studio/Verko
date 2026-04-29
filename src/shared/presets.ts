import type { AgentConfig } from './types'
import { PROVIDER_DEFINITIONS } from './providers'

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  defaultProfile: 'openai',
  maxTurns: 10,
  temperature: 0.3,
  showToolCalls: true,
  profiles: PROVIDER_DEFINITIONS.map((d) => ({
    name: d.id,
    protocol: d.protocol,
    baseUrl: d.defaults.baseUrl,
    model: d.defaults.model,
  })),
}
