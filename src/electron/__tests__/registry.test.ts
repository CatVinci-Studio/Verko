import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { LibraryRegistry } from '../libraries/registry'

describe('LibraryRegistry', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'verko-reg-'))
    path = join(dir, 'libraries.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('starts empty when file is missing', async () => {
    const reg = new LibraryRegistry(path)
    await reg.load()
    expect(reg.isEmpty()).toBe(true)
    expect(reg.list()).toEqual([])
  })

  it('adds and persists a local entry', async () => {
    const reg = new LibraryRegistry(path)
    await reg.load()
    const e = await reg.add({ name: 'My Lib', type: 'local', path: '/foo' })
    expect(e.id).toBeTruthy()

    const reg2 = new LibraryRegistry(path)
    await reg2.load()
    expect(reg2.list().length).toBe(1)
    expect(reg2.list()[0].name).toBe('My Lib')
  })

  it('markOpened sets lastOpenedId and lastOpenedAt', async () => {
    const reg = new LibraryRegistry(path)
    await reg.load()
    const e = await reg.add({ name: 'A', type: 'local', path: '/a' })
    await reg.markOpened(e.id)
    expect(reg.getLastOpened()?.id).toBe(e.id)
    expect(reg.getLastOpened()?.lastOpenedAt).toBeTypeOf('number')
  })

  it('remove drops the entry and clears lastOpened if it was the target', async () => {
    const reg = new LibraryRegistry(path)
    await reg.load()
    const e = await reg.add({ name: 'A', type: 'local', path: '/a' })
    await reg.markOpened(e.id)
    await reg.remove(e.id)
    expect(reg.list()).toEqual([])
    expect(reg.getLastOpened()).toBeUndefined()
  })

  it('backs up a corrupt file and starts fresh', async () => {
    await writeFile(path, 'not json')
    const reg = new LibraryRegistry(path)
    await reg.load()
    expect(reg.isEmpty()).toBe(true)
    const { readdir } = await import('fs/promises')
    const entries = await readdir(dir)
    expect(entries.some((f) => f.includes('libraries.json.corrupt-'))).toBe(true)
  })
})
