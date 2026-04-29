import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LocalBackend } from '../paperdb/backendLocal'
import { BackendNotFoundError } from '../paperdb/backend'

describe('LocalBackend', () => {
  let dir: string
  let be: LocalBackend

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'verko-local-'))
    be = new LocalBackend(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes and reads back a file', async () => {
    await be.writeFile('papers/a.md', 'hello')
    const buf = await be.readFile('papers/a.md')
    expect(buf.toString()).toBe('hello')
  })

  it('creates parent directories on write', async () => {
    await be.writeFile('a/b/c/file.txt', 'x')
    expect(await be.exists('a/b/c/file.txt')).toBe(true)
  })

  it('throws BackendNotFoundError for missing file', async () => {
    await expect(be.readFile('missing.md')).rejects.toBeInstanceOf(BackendNotFoundError)
  })

  it('exists returns false for missing file', async () => {
    expect(await be.exists('missing.md')).toBe(false)
  })

  it('deleteFile is a no-op on missing path', async () => {
    await expect(be.deleteFile('missing.md')).resolves.toBeUndefined()
  })

  it('listFiles returns sorted relative POSIX paths recursively', async () => {
    await be.writeFile('papers/a.md', '')
    await be.writeFile('papers/b.md', '')
    await be.writeFile('attachments/x.pdf', '')
    const files = await be.listFiles('.')
    expect(files).toEqual(['attachments/x.pdf', 'papers/a.md', 'papers/b.md'])
  })

  it('listFiles on missing prefix returns []', async () => {
    expect(await be.listFiles('does-not-exist')).toEqual([])
  })

  it('createReadStream streams file contents', async () => {
    await be.writeFile('big.txt', 'content')
    const chunks: Buffer[] = []
    const stream = be.createReadStream('big.txt')
    for await (const c of stream) chunks.push(c as Buffer)
    expect(Buffer.concat(chunks).toString()).toBe('content')
  })

  it('localPath returns an absolute filesystem path', () => {
    expect(be.localPath('papers/a.md')).toBe(join(dir, 'papers', 'a.md'))
  })
})
