// Drives the Codex OAuth flow: PKCE → open browser → loopback callback
// → token exchange → persist. The OAuth tokens go in their own keychain
// slot (`oauthKey(providerId)`) so the API-key slot remains untouched —
// users can keep both configured and switch modes.

import {
  buildAuthorizeUrl,
  CODEX_LOOPBACK_PORT,
  exchangeCode,
  generatePkce,
  generateState,
  oauthKey,
  type CodexTokens,
} from '@shared/oauth/codex'
import { api } from '@/lib/ipc'

const CALLBACK_PATH = '/auth/callback'
const TIMEOUT_SECS = 5 * 60

export async function signInWithChatGpt(providerId: string): Promise<CodexTokens> {
  const { verifier, challenge } = await generatePkce()
  const state = generateState()
  const url = buildAuthorizeUrl(challenge, state)

  // Listener must bind before the browser opens — otherwise the OAuth
  // provider can redirect faster than the socket is ready.
  const callback = api.oauth.loopbackWait(CODEX_LOOPBACK_PORT, CALLBACK_PATH, TIMEOUT_SECS)
  await api.net.openExternal(url)
  const { code, state: returnedState } = await callback
  if (returnedState !== state) {
    throw new Error('OAuth state mismatch — possible CSRF attempt')
  }

  const tokens = await exchangeCode(code, verifier)
  await api.agent.saveKey(oauthKey(providerId), JSON.stringify(tokens), true)
  return tokens
}

export async function signOutChatGpt(providerId: string): Promise<void> {
  // saveKey with remember=false clears the persisted keychain entry.
  await api.agent.saveKey(oauthKey(providerId), '', false)
}
