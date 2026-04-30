import {
  type StorageBackend,
  BackendError,
  BackendNotFoundError,
} from './backend'

/**
 * Browser `StorageBackend` backed by `localStorage`. Used by the web build's
 * ConversationStore — gives the shared `ConversationStore` class the same
 * interface a filesystem would expose.
 *
 * Keys are namespaced as `<prefix>/<relPath>`. Binary data is supported via
 * base64; conversation JSON only uses text so the round-trip is cheap.
 */
export class LocalStorageBackend implements StorageBackend {
  constructor(private readonly prefix: string) {}

  private key(rel: string): string {
    return `${this.prefix}/${rel}`
  }

  async readFile(relPath: string): Promise<Uint8Array> {
    const v = localStorage.getItem(this.key(relPath))
    if (v == null) throw new BackendNotFoundError(relPath)
    if (v.startsWith('b64:')) {
      const bin = atob(v.slice(4))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes
    }
    return new TextEncoder().encode(v)
  }

  async writeFile(relPath: string, data: Uint8Array | string): Promise<void> {
    try {
      if (typeof data === 'string') {
        localStorage.setItem(this.key(relPath), data)
      } else {
        let bin = ''
        const chunk = 0x8000
        for (let i = 0; i < data.length; i += chunk) {
          bin += String.fromCharCode(...data.subarray(i, i + chunk))
        }
        localStorage.setItem(this.key(relPath), 'b64:' + btoa(bin))
      }
    } catch (e) {
      throw new BackendError(`localStorage writeFile failed: ${relPath}`, e)
    }
  }

  async deleteFile(relPath: string): Promise<void> {
    localStorage.removeItem(this.key(relPath))
  }

  async listFiles(prefix: string): Promise<string[]> {
    const fullPrefix = prefix ? `${this.prefix}/${prefix}` : `${this.prefix}/`
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(fullPrefix)) continue
      out.push(k.slice(this.prefix.length + 1))
    }
    return out.sort()
  }

  async exists(relPath: string): Promise<boolean> {
    return localStorage.getItem(this.key(relPath)) != null
  }

  createReadStream(relPath: string): ReadableStream<Uint8Array> {
    const read = (): Promise<Uint8Array> => this.readFile(relPath)
    return new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(await read())
          controller.close()
        } catch (e) {
          controller.error(e)
        }
      },
    })
  }

  localPath(): string | null {
    return null
  }

  describe(): string {
    return `localStorage:${this.prefix}`
  }
}
