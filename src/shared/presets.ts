import type { AgentConfig } from './types'

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  defaultProfile: 'openai',
  maxTurns: 10,
  temperature: 0.3,
  showToolCalls: true,
  profiles: [
    {
      name: 'openai',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    },
    {
      name: 'anthropic',
      protocol: 'anthropic',
      baseUrl: '',
      model: 'claude-sonnet-4-5',
    },
    {
      name: 'gemini',
      protocol: 'gemini',
      baseUrl: '',
      model: 'gemini-2.5-flash',
    },
    {
      name: 'custom',
      protocol: 'openai',
      baseUrl: '',
      model: '',
    },
  ],
}
