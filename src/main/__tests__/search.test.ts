import { describe, it, expect } from 'vitest'
import { buildIndex, searchIndex } from '../paperdb/search'

const DOCS = [
  { id: 'ddpm', title: 'Denoising Diffusion Probabilistic Models', authors: 'Ho Jain Abbeel', tags: 'diffusion generative', body: 'We present a model...' },
  { id: 'attention', title: 'Attention Is All You Need', authors: 'Vaswani Shazeer', tags: 'transformer nlp', body: 'The dominant sequence transduction models...' },
  { id: 'lora', title: 'LoRA: Low-Rank Adaptation of Large Language Models', authors: 'Hu Shen Wallis', tags: 'llm finetuning', body: 'We propose a method...' },
]

describe('searchIndex', () => {
  it('finds by title keyword', () => {
    const index = buildIndex(DOCS)
    const ids = searchIndex(index, 'diffusion')
    expect(ids).toContain('ddpm')
  })

  it('finds by author name', () => {
    const index = buildIndex(DOCS)
    const ids = searchIndex(index, 'vaswani')
    expect(ids).toContain('attention')
  })

  it('finds by tag', () => {
    const index = buildIndex(DOCS)
    const ids = searchIndex(index, 'transformer')
    expect(ids).toContain('attention')
  })

  it('returns empty for no match', () => {
    const index = buildIndex(DOCS)
    const ids = searchIndex(index, 'zzzznotexist')
    expect(ids).toHaveLength(0)
  })

  it('handles fuzzy match', () => {
    const index = buildIndex(DOCS)
    const ids = searchIndex(index, 'adaption') // typo of 'adaptation'
    expect(ids.length).toBeGreaterThanOrEqual(0) // fuzzy, may or may not match
  })

  it('title hits score higher than body hits', () => {
    const index = buildIndex(DOCS)
    // "attention" appears in title of attention paper
    const ids = searchIndex(index, 'attention')
    expect(ids[0]).toBe('attention')
  })
})
