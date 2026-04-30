import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import {
  registerRoot, unregisterRoot, resolveScoped, _resetRootsForTesting,
} from '../scope'

describe('zero-trust scope', () => {
  let dir: string
  let outside: string

  beforeEach(async () => {
    _resetRootsForTesting()
    dir = await mkdtemp(path.join(tmpdir(), 'verko-scope-'))
    outside = await mkdtemp(path.join(tmpdir(), 'verko-outside-'))
    registerRoot('test', dir)
  })

  afterEach(async () => {
    _resetRootsForTesting()
    await rm(dir, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('resolves a normal relative path inside the root', async () => {
    const abs = await resolveScoped('test', 'papers/foo.md')
    expect(abs).toBe(path.join(dir, 'papers', 'foo.md'))
  })

  it('rejects unregistered roots', async () => {
    await expect(resolveScoped('unknown', 'foo')).rejects.toThrow(/not allowed/i)
  })

  it('rejects absolute paths', async () => {
    await expect(resolveScoped('test', '/etc/passwd')).rejects.toThrow(/absolute path/i)
  })

  it('rejects ../ escape', async () => {
    await expect(resolveScoped('test', '../../etc/passwd')).rejects.toThrow(/escapes root/i)
  })

  it('rejects symlink that points outside the root', async () => {
    const sensitive = path.join(outside, 'secret.txt')
    await writeFile(sensitive, 'classified')
    await symlink(sensitive, path.join(dir, 'leak'))
    await expect(resolveScoped('test', 'leak')).rejects.toThrow(/symlink escapes/i)
  })

  it('allows symlink that stays inside the root', async () => {
    await mkdir(path.join(dir, 'sub'), { recursive: true })
    const target = path.join(dir, 'sub', 'real.txt')
    await writeFile(target, 'ok')
    await symlink(target, path.join(dir, 'alias'))
    const abs = await resolveScoped('test', 'alias')
    expect(abs).toBe(target)
  })

  it('returns the joined path for non-existent targets (writes / probes)', async () => {
    const abs = await resolveScoped('test', 'new/deep/file.txt')
    expect(abs).toBe(path.join(dir, 'new', 'deep', 'file.txt'))
  })

  it('honors unregisterRoot', async () => {
    unregisterRoot('test')
    await expect(resolveScoped('test', 'foo')).rejects.toThrow(/not allowed/i)
  })

  it('reject path that pretends to nest by prefix without separator', async () => {
    // root = /tmp/verko-scope-XYZ ; sibling = /tmp/verko-scope-XYZ-evil
    const evil = `${dir}-evil`
    await mkdir(evil, { recursive: true })
    try {
      // Construct a relative path that, when resolved naively, points at the sibling.
      // path.resolve handles this correctly, but verify the guard rejects it.
      const rel = path.relative(dir, path.join(evil, 'x'))
      await expect(resolveScoped('test', rel)).rejects.toThrow(/escapes root/i)
    } finally {
      await rm(evil, { recursive: true, force: true })
    }
  })
})
