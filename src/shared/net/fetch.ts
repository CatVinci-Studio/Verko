// Network indirection so shared code (arxiv import, web_fetch tool, anywhere
// else that talks to the open internet) can be routed through the desktop
// shell's native HTTP path. The webview's `fetch` is subject to CORS, which
// blocks most paper-host pages outright. The desktop shell installs a
// Rust-backed fetcher at boot via `setNativeFetch`; the web build leaves the
// default in place and uses the browser's own fetch.

export interface SimpleResponse {
  status: number
  ok: boolean
  headers: Record<string, string>
  body: string
}

export interface SimpleRequest {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  headers?: Record<string, string>
  body?: string
}

export type Fetcher = (req: SimpleRequest) => Promise<SimpleResponse>

/** Browser-fetch-backed fetcher. The web build uses this directly;
 *  desktop swaps in a Rust-backed fetcher at boot. */
export const browserFetcher: Fetcher = async (req) => {
  const res = await fetch(req.url, {
    method: req.method ?? 'GET',
    headers: req.headers,
    body: req.body,
  })
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => { headers[k] = v })
  return { status: res.status, ok: res.ok, headers, body: await res.text() }
}

let active: Fetcher = browserFetcher

/** Install the native (CORS-free) fetcher. Call once at app boot. */
export function setNativeFetch(fn: Fetcher): void {
  active = fn
}

/** Shared HTTP entry point — uses the native fetcher when one is installed. */
export function nativeFetch(req: SimpleRequest): Promise<SimpleResponse> {
  return active(req)
}
