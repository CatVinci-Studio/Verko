import { describe, it, expect } from 'vitest'
import { generateId } from '@shared/paperdb/id'

describe('generateId', () => {
  it('builds readable id from full metadata', async () => {
    const id = await generateId({ title: 'Attention Is All You Need', authors: ['Vaswani, A.'], year: 2017 })
    expect(id).toBe('2017-vaswani-attention')
  })

  it('handles multi-word last names', async () => {
    const id = await generateId({ title: 'DDPM Paper', authors: ['Ho, Jonathan'], year: 2020 })
    expect(id).toBe('2020-ho-ddpm')
  })

  it('strips special characters', async () => {
    const id = await generateId({ title: 'Low-Rank Adaptation: A New Method!', authors: ['Hu, E.'], year: 2021 })
    expect(id).toMatch(/^2021-hu-/)
    expect(id).not.toMatch(/[^a-z0-9-]/)
  })

  it('falls back to hash when no metadata', async () => {
    const id = await generateId({})
    expect(id).toHaveLength(7)
    expect(id).toMatch(/^[a-f0-9]{7}$/)
  })

  it('handles missing year gracefully', async () => {
    const id = await generateId({ title: 'Some Paper', authors: ['Smith, J.'] })
    expect(id).toMatch(/^smith-some$|^[a-f0-9]{7}$/)
  })

  it('generates filesystem-safe ids', async () => {
    const id = await generateId({ title: 'Paper/With\\Slashes: Test', authors: ['O\'Brien, K.'], year: 2023 })
    expect(id).not.toMatch(/[/\\:'"!@#$%^&*()+=<>?]/)
  })

  it('two calls with different titles produce different ids', async () => {
    const a = await generateId({ title: 'Alpha', authors: ['Smith'], year: 2020 })
    const b = await generateId({ title: 'Beta', authors: ['Smith'], year: 2020 })
    expect(a).not.toBe(b)
  })
})
