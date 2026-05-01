import { createProvider, type ProviderProtocol } from '@shared/agent/providers'
import { oauthKey, parseStoredTokens, refreshTokens } from '@shared/oauth/codex'

export interface ProfileLike {
  name: string
  protocol: 'openai' | 'anthropic' | 'gemini'
  baseUrl?: string
  model: string
}

export interface ProviderHandle {
  provider: ProviderProtocol
  model: string
}

export interface KeyStore {
  /** Read a stored secret by profile id (or `${id}:oauth`). */
  load(name: string): Promise<string | null> | (string | null)
  /** Persist refreshed OAuth tokens. Always called with `${id}:oauth`. */
  save(name: string, value: string): Promise<void> | void
}

/**
 * Build a provider for `profile`, preferring OAuth tokens when present.
 * Returns `null` if no usable credential is found.
 */
export async function buildProviderForProfile(
  profile: ProfileLike,
  store: KeyStore,
): Promise<ProviderHandle | null> {
  const oauthRaw = await Promise.resolve(store.load(oauthKey(profile.name)))
  const tokens = oauthRaw ? parseStoredTokens(oauthRaw) : null
  if (tokens) {
    const provider = createProvider({
      protocol: profile.protocol,
      baseUrl: profile.baseUrl,
      apiKey: '',
      model: profile.model,
      oauth: {
        kind: 'codex',
        tokens: { ...tokens },
        refresh: async (rt) => {
          const next = await refreshTokens(rt)
          await Promise.resolve(store.save(oauthKey(profile.name), JSON.stringify(next)))
          return next
        },
      },
    })
    return { provider, model: profile.model }
  }

  const apiKey = await Promise.resolve(store.load(profile.name))
  if (!apiKey) return null
  const provider = createProvider({
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    apiKey,
    model: profile.model,
  })
  return { provider, model: profile.model }
}
