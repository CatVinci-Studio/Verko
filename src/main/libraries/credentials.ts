import { app, safeStorage } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
}

type CredentialsFile = Record<string, S3Credentials>

/**
 * Encrypted credential store for S3 access keys. Uses Electron `safeStorage`
 * (OS-level encryption) when available and falls back to plaintext on
 * platforms where the OS keychain is unavailable. The fallback is logged
 * loudly; the welcome screen surfaces a warning to the user.
 */
export class CredentialStore {
  private cache: CredentialsFile = {}
  private loaded = false
  private encryptionAvailable: boolean = true

  constructor(private readonly path: string) {}

  static fromUserData(): CredentialStore {
    return new CredentialStore(join(app.getPath('userData'), 'credentials.bin'))
  }

  async load(): Promise<void> {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    try {
      const raw = await readFile(this.path)
      const json = this.encryptionAvailable
        ? safeStorage.decryptString(raw)
        : raw.toString('utf-8')
      this.cache = JSON.parse(json) as CredentialsFile
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Corrupt or undecryptable — fail closed: empty cache, user re-enters.
        console.error('[credentials] failed to load:', e)
      }
      this.cache = {}
    }
    this.loaded = true
  }

  private async save(): Promise<void> {
    await mkdir(join(this.path, '..'), { recursive: true })
    const json = JSON.stringify(this.cache)
    const buf = this.encryptionAvailable
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf-8')
    await writeFile(this.path, buf)
  }

  isEncryptionAvailable(): boolean {
    return this.encryptionAvailable
  }

  get(ref: string): S3Credentials | undefined {
    if (!this.loaded) throw new Error('CredentialStore.load() not called')
    return this.cache[ref]
  }

  async set(ref: string, creds: S3Credentials): Promise<void> {
    this.cache[ref] = creds
    await this.save()
  }

  async create(creds: S3Credentials): Promise<string> {
    const ref = randomUUID()
    await this.set(ref, creds)
    return ref
  }

  async delete(ref: string): Promise<void> {
    delete this.cache[ref]
    await this.save()
  }
}
