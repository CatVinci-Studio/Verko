import MiniSearch from 'minisearch'

export type { MiniSearch }

type IndexDoc = {
  id: string
  title: string
  authors: string
  tags: string
  body: string
}

/**
 * Build a MiniSearch index from an array of document objects.
 * Searches across title, authors, tags, and body fields.
 */
export function buildIndex(
  papers: Array<{
    id: string
    title: string
    authors: string
    tags: string
    body: string
  }>
): MiniSearch {
  const index = new MiniSearch<IndexDoc>({
    fields: ['title', 'authors', 'tags', 'body'],
    storeFields: ['id'],
    searchOptions: {
      boost: { title: 3, authors: 2, tags: 2, body: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  })

  if (papers.length > 0) {
    index.addAll(papers)
  }

  return index
}

/**
 * Search the index and return an array of matching paper IDs,
 * ordered by relevance score (highest first).
 */
export function searchIndex(index: MiniSearch, query: string): string[] {
  if (!query.trim()) return []
  const results = index.search(query)
  return results.map(r => r.id as string)
}
