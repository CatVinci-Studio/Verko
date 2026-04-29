import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { Readable, PassThrough } from 'node:stream'
import type { StorageBackend } from './backend'
import {
  BackendAuthError,
  BackendError,
  BackendNetworkError,
  BackendNotFoundError,
} from './backend'

export interface S3BackendConfig {
  endpoint?: string
  region: string
  bucket: string
  prefix?: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

function buildKey(prefix: string | undefined, relPath: string): string {
  const safe = relPath.replace(/^[\\/]+/, '')
  if (!prefix) return safe
  return `${prefix.replace(/\/$/, '')}/${safe}`
}

function normalizeError(e: unknown, relPath: string): Error {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string }
  const status = err?.$metadata?.httpStatusCode
  if (status === 404 || err?.name === 'NoSuchKey' || err?.name === 'NotFound') {
    return new BackendNotFoundError(relPath, e)
  }
  if (status === 401 || status === 403 || err?.name === 'AccessDenied' || err?.name === 'InvalidAccessKeyId' || err?.name === 'SignatureDoesNotMatch') {
    return new BackendAuthError(err?.message ?? 'Access denied', e)
  }
  if (err?.name?.includes('Network') || err?.name === 'TimeoutError') {
    return new BackendNetworkError(err?.message ?? 'Network error', e)
  }
  return new BackendError(err?.message ?? `S3 error: ${relPath}`, e)
}

/** S3-compatible StorageBackend (AWS S3, Cloudflare R2, Backblaze B2, MinIO, …). */
export class S3Backend implements StorageBackend {
  private client: S3Client
  readonly bucket: string
  readonly prefix: string | undefined

  constructor(public readonly config: S3BackendConfig) {
    this.bucket = config.bucket
    this.prefix = config.prefix?.replace(/^\/+|\/+$/g, '') || undefined
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  private key(relPath: string): string {
    return buildKey(this.prefix, relPath)
  }

  async readFile(relPath: string): Promise<Buffer> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(relPath) })
      )
      const body = out.Body as Readable | undefined
      if (!body) throw new BackendNotFoundError(relPath)
      const chunks: Buffer[] = []
      for await (const c of body) chunks.push(c as Buffer)
      return Buffer.concat(chunks)
    } catch (e) {
      throw normalizeError(e, relPath)
    }
  }

  async writeFile(relPath: string, data: Buffer | string): Promise<void> {
    try {
      const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key(relPath),
          Body: body,
        })
      )
    } catch (e) {
      throw normalizeError(e, relPath)
    }
  }

  async deleteFile(relPath: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(relPath) })
      )
    } catch (e) {
      // 404 on delete is a no-op.
      const err = e as { $metadata?: { httpStatusCode?: number } }
      if (err?.$metadata?.httpStatusCode === 404) return
      throw normalizeError(e, relPath)
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const fullPrefix = buildKey(
      this.prefix,
      prefix === '.' || prefix === '' ? '' : prefix.replace(/\/?$/, '/')
    )
    const stripFrom = this.prefix ? `${this.prefix}/` : ''
    const out: string[] = []
    let continuationToken: string | undefined
    try {
      do {
        const res = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: fullPrefix,
            ContinuationToken: continuationToken,
          })
        )
        for (const obj of res.Contents ?? []) {
          if (!obj.Key) continue
          const rel = stripFrom && obj.Key.startsWith(stripFrom)
            ? obj.Key.slice(stripFrom.length)
            : obj.Key
          out.push(rel)
        }
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
      } while (continuationToken)
    } catch (e) {
      throw normalizeError(e, prefix)
    }
    return out.sort()
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(relPath) })
      )
      return true
    } catch (e) {
      const err = e as { $metadata?: { httpStatusCode?: number }; name?: string }
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false
      throw normalizeError(e, relPath)
    }
  }

  createReadStream(relPath: string): Readable {
    const out = new PassThrough()
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(relPath) }))
      .then((res) => {
        const body = res.Body as Readable | undefined
        if (!body) {
          out.destroy(new BackendNotFoundError(relPath))
          return
        }
        body.on('error', (err) => out.destroy(normalizeError(err, relPath)))
        body.pipe(out)
      })
      .catch((err) => out.destroy(normalizeError(err, relPath)))
    return out
  }

  localPath(): string | null {
    return null
  }

  describe(): string {
    return `s3: ${this.bucket}${this.prefix ? '/' + this.prefix : ''}`
  }

  /** Probe: can we reach the bucket and list at least one object? */
  async probe(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (e) {
      throw normalizeError(e, this.bucket)
    }
  }
}
