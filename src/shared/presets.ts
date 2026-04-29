import type { AgentConfig } from './types'

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  defaultProfile: 'openai',
  maxTurns: 10,
  temperature: 0.3,
  showToolCalls: true,
  profiles: [
    { name: 'openai',      baseUrl: 'https://api.openai.com/v1',           model: 'gpt-4o-mini' },
    { name: 'deepseek',    baseUrl: 'https://api.deepseek.com/v1',          model: 'deepseek-chat' },
    { name: 'openrouter',  baseUrl: 'https://openrouter.ai/api/v1',         model: 'openai/gpt-4o-mini' },
    { name: 'groq',        baseUrl: 'https://api.groq.com/openai/v1',       model: 'llama-3.1-70b-versatile' },
    { name: 'ollama',      baseUrl: 'http://localhost:11434/v1',             model: 'qwen2.5:14b' },
    { name: 'lmstudio',   baseUrl: 'http://localhost:1234/v1',              model: 'local-model' },
  ]
}

export const BUILT_IN_PRESETS = DEFAULT_AGENT_CONFIG.profiles
