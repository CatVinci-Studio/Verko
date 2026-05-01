// Codex / ChatGPT OAuth flow. Endpoints, client ID, scopes, and the
// `codex_cli_simplified_flow` flag mirror the official codex CLI. The
// only non-portable piece is the loopback callback (desktop binds a
// TCP socket via Rust; web rejects).

import { nativeFetch } from '@shared/net/fetch'

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_ISSUER = 'https://auth.openai.com'
export const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
export const CODEX_LOOPBACK_PORT = 1455
export const CODEX_REDIRECT_URI = `http://localhost:${CODEX_LOOPBACK_PORT}/auth/callback`

/**
 * Keychain slot for a provider's OAuth tokens — separate from the
 * provider's API-key slot so users can keep both configured and switch
 * between auth modes without losing either.
 */
export function oauthKey(providerId: string): string {
  return `${providerId}:oauth`
}

/** Persisted OAuth tokens. Stored as JSON in the keychain. */
export interface CodexTokens {
  kind: 'codex'
  accessToken: string
  refreshToken: string
  /** epoch ms when the access token expires */
  expiresAt: number
  accountId?: string
}

interface RawTokenResponse {
  access_token: string
  refresh_token: string
  id_token?: string
  expires_in?: number
}

interface IdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  'https://api.openai.com/auth'?: { chatgpt_account_id?: string }
}

/** Generate a PKCE verifier + S256 challenge. RFC 7636 — verifier is
 *  43 unreserved chars; we use base64url(32 random bytes) which lands at
 *  exactly 43 chars and avoids modulo bias from a hand-rolled alphabet. */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return { verifier, challenge: base64Url(new Uint8Array(hash)) }
}

export function generateState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CODEX_REDIRECT_URI,
    scope: 'openid profile email offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'verko',
  })
  return `${CODEX_ISSUER}/oauth/authorize?${params.toString()}`
}

/** Exchange the authorization code for tokens. */
export async function exchangeCode(code: string, verifier: string): Promise<CodexTokens> {
  const res = await nativeFetch({
    url: `${CODEX_ISSUER}/oauth/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CODEX_REDIRECT_URI,
      client_id: CODEX_CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return toTokens(JSON.parse(res.body) as RawTokenResponse)
}

/** Use a refresh token to get a new access token. */
export async function refreshTokens(refreshToken: string): Promise<CodexTokens> {
  const res = await nativeFetch({
    url: `${CODEX_ISSUER}/oauth/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }).toString(),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const next = toTokens(JSON.parse(res.body) as RawTokenResponse)
  // Some refresh responses omit refresh_token; reuse the existing one.
  if (!next.refreshToken) next.refreshToken = refreshToken
  return next
}

function toTokens(raw: RawTokenResponse): CodexTokens {
  const accountId = (raw.id_token && extractAccountId(raw.id_token))
    ?? extractAccountId(raw.access_token)
  return {
    kind: 'codex',
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: Date.now() + (raw.expires_in ?? 3600) * 1000,
    accountId,
  }
}

function extractAccountId(jwt: string): string | undefined {
  const parts = jwt.split('.')
  if (parts.length !== 3) return undefined
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as IdTokenClaims
    return (
      payload.chatgpt_account_id
      ?? payload['https://api.openai.com/auth']?.chatgpt_account_id
      ?? payload.organizations?.[0]?.id
    )
  } catch {
    return undefined
  }
}

/** Try to JSON-decode a stored keychain value as Codex tokens. */
export function parseStoredTokens(raw: string): CodexTokens | null {
  try {
    const obj = JSON.parse(raw) as Partial<CodexTokens>
    if (obj && obj.kind === 'codex' && typeof obj.accessToken === 'string') {
      return obj as CodexTokens
    }
  } catch {
    return null
  }
  return null
}

function base64Url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
