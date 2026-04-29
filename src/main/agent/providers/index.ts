import type { ProviderConfig, ProviderProtocol } from './types'
import { OpenAIProtocol } from './openai'
import { AnthropicProtocol } from './anthropic'
import { GeminiProtocol } from './gemini'

export * from './types'

export function createProvider(cfg: ProviderConfig): ProviderProtocol {
  switch (cfg.protocol) {
    case 'openai':    return new OpenAIProtocol(cfg)
    case 'anthropic': return new AnthropicProtocol(cfg)
    case 'gemini':    return new GeminiProtocol(cfg)
  }
}
