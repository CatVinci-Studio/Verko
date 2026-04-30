import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Library } from '@shared/paperdb/store'
import { LocalBackend } from '../paperdb/backendLocal'
import { exportLibraryZip, importLibraryZip } from '../paperdb/zip'

let srcDir: string
let dstDir: string
let zipPath: string

beforeEach(async () => {
  srcDir = await mkdtemp(join(tmpdir(), 'zip-src-'))
  dstDir = await mkdtemp(join(tmpdir(), 'zip-dst-'))
  // mkdtemp creates the dir, but importLibraryZip wants it empty — that's fine.
  zipPath = join(await mkdtemp(join(tmpdir(), 'zip-out-')), 'lib.zip')
})

afterEach(async () => {
  await rm(srcDir, { recursive: true, force: true })
  await rm(dstDir, { recursive: true, force: true })
  await rm(join(zipPath, '..'), { recursive: true, force: true })
})

describe('library zip', () => {
  it('round-trips papers and schema', async () => {
    const be = new LocalBackend(srcDir)
    await be.ensureRoot()
    const src = await Library.open(be)
    const id = await src.add({ title: 'Round Trip', authors: ['Vaswani, A.'], year: 2017, tags: ['nlp'] })

    await exportLibraryZip(src.backend, zipPath)
    await rm(dstDir, { recursive: true, force: true })  // empty target
    await importLibraryZip(zipPath, dstDir)

    const dstBe = new LocalBackend(dstDir)
    await dstBe.ensureRoot()
    const dst = await Library.open(dstBe)
    const paper = await dst.get(id)
    expect(paper.title).toBe('Round Trip')
    expect(paper.authors).toEqual(['Vaswani, A.'])
    expect(paper.year).toBe(2017)

    // The .md file content should be byte-identical.
    const a = await readFile(join(srcDir, `papers/${id}.md`))
    const b = await readFile(join(dstDir, `papers/${id}.md`))
    expect(b.equals(a)).toBe(true)
  })

  it('refuses to import into a non-empty directory', async () => {
    const be = new LocalBackend(srcDir)
    await be.ensureRoot()
    const src = await Library.open(be)
    await src.add({ title: 'X', tags: [] })
    await exportLibraryZip(src.backend, zipPath)

    // dstDir already exists and has no contents from mkdtemp; add a file.
    await (await import('fs/promises')).writeFile(join(dstDir, 'sentinel.txt'), 'no')
    await expect(importLibraryZip(zipPath, dstDir)).rejects.toThrow(/not empty/)
  })

  it('rejects archives missing schema.md', async () => {
    // Build a fake zip with only an unrelated file.
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('hello.txt', 'world')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    const { writeFile } = await import('fs/promises')
    await writeFile(zipPath, buf)
    await rm(dstDir, { recursive: true, force: true })
    await expect(importLibraryZip(zipPath, dstDir)).rejects.toThrow(/schema\.md/)
  })
})
