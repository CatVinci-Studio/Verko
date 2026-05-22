/**
 * Provider catalog — single source of truth for the agent's LLM provider list.
 *
 * Renderer settings UI renders forms declaratively from `fields[]`. The
 * agent loop uses `defaults` to seed each profile and `protocol` to pick
 * the right SDK adapter. Adding a new provider is a one-file change.
 *
 * Internal IDs (`openai`, `claude`, `gemini`, `custom`) are persistence keys —
 * they appear as account names in the OS keychain and as localStorage keys.
 * The user-facing display name is `name`.
 */

import type { AgentProtocol } from './types'

export type ProviderId = 'openai' | 'claude' | 'gemini' | 'custom'

export interface ProviderFieldDefinition {
  key: 'apiKey' | 'model' | 'baseUrl'
  label: string                  // i18n key suffix under settings.provider.fields.*
  type: 'password' | 'text' | 'url'
  placeholder?: string
}

export interface ProviderDefinition {
  id: ProviderId
  /** Display name. Independent of i18n — these are brand names. */
  name: string
  /** Underlying SDK adapter to use. */
  protocol: AgentProtocol
  /** Whether the provider's API allows direct browser calls. */
  browserSupported: boolean
  /** Default settings used when this provider is first configured. */
  defaults: { model: string; baseUrl: string }
  /** Fields exposed in the settings form. Rendered top-to-bottom. */
  fields: ProviderFieldDefinition[]
  /**
   * Optional OAuth login flow. When present, the settings UI shows a
   * "Sign in" button alongside the API-key field; users can pick either
   * path. Tokens are persisted in the keychain under `<id>:oauth`,
   * separate from the API key in `<id>` so they don't clobber each
   * other when the user swaps modes.
   */
  oauth?: 'codex'
}

const COMMON_FIELDS: ProviderFieldDefinition[] = [
  { key: 'apiKey', label: 'apiKey', type: 'password', placeholder: 'sk-...' },
  { key: 'model',  label: 'model',  type: 'text' },
]

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    browserSupported: true,
    defaults: { model: 'gpt-5.4-mini', baseUrl: 'https://api.openai.com/v1' },
    fields: COMMON_FIELDS,
    oauth: 'codex',
  },
  {
    id: 'claude',
    name: 'Claude',
    protocol: 'anthropic',
    browserSupported: true,
    defaults: { model: 'claude-sonnet-4-6', baseUrl: 'https://api.anthropic.com' },
    fields: COMMON_FIELDS,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    protocol: 'gemini',
    browserSupported: true,
    defaults: { model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    fields: COMMON_FIELDS,
  },
  {
    id: 'custom',
    name: 'Custom',
    protocol: 'openai',
    browserSupported: true,
    defaults: { model: 'gpt-5.4-mini', baseUrl: 'https://api.openai.com/v1' },
    fields: [
      ...COMMON_FIELDS,
      { key: 'baseUrl', label: 'baseUrl', type: 'url', placeholder: 'https://api.example.com/v1' },
    ],
  },
]

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((p) => p.id === id)
}
