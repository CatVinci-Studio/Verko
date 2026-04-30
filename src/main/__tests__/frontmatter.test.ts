import { describe, it, expect } from 'vitest'
import { parseFrontmatter, stringifyFrontmatter, normalizePaperData } from '@shared/paperdb/frontmatter'

describe('parseFrontmatter', () => {
  it('parses yaml frontmatter and body', () => {
    const content = `---
title: Test Paper
year: 2023
---
## Body content`
    const { data, body } = parseFrontmatter(content)
    expect(data.title).toBe('Test Paper')
    expect(data.year).toBe(2023)
    expect(body.trim()).toBe('## Body content')
  })

  it('handles missing frontmatter', () => {
    const { data, body } = parseFrontmatter('Just a body')
    expect(data).toEqual({})
    expect(body.trim()).toBe('Just a body')
  })
})

describe('stringifyFrontmatter', () => {
  it('round-trips data and body', () => {
    const data = { title: 'Hello', tags: ['a', 'b'], year: 2023 }
    const body = '## Notes\nsome content'
    const result = stringifyFrontmatter(data, body)
    const parsed = parseFrontmatter(result)
    expect(parsed.data.title).toBe('Hello')
    expect(parsed.body.trim()).toBe(body.trim())
  })
})

describe('normalizePaperData', () => {
  it('normalizes authors from semicolon string', () => {
    const { authors } = normalizePaperData({ authors: 'Vaswani, A.; Shazeer, N.' }) as { authors: string[] }
    expect(authors).toEqual(['Vaswani, A.', 'Shazeer, N.'])
  })

  it('normalizes authors from array passthrough', () => {
    const { authors } = normalizePaperData({ authors: ['A', 'B'] }) as { authors: string[] }
    expect(authors).toEqual(['A', 'B'])
  })

  it('normalizes tags from semicolon string', () => {
    const { tags } = normalizePaperData({ tags: 'llm;rl;vision' }) as { tags: string[] }
    expect(tags).toEqual(['llm', 'rl', 'vision'])
  })

  it('coerces year string to number', () => {
    const { year } = normalizePaperData({ year: '2023' }) as { year: number }
    expect(year).toBe(2023)
  })

  it('handles empty/missing fields', () => {
    const result = normalizePaperData({}) as { authors: string[]; tags: string[] }
    expect(result.authors ?? []).toEqual([])
    expect(result.tags ?? []).toEqual([])
  })
})
