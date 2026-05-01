import type { Library } from '@shared/paperdb/store'
import type { IApi } from './ipc'

type LibraryGetter = () => Library | Promise<Library | null> | null

/**
 * Build the `papers / schema / collections / pdf` slice of `IApi` against an
 * active Library. Both desktop and web platforms instantiate this with their
 * own backend (IpcBackend, S3Backend) — the slice itself is identical.
 *
 * `getLibrary` may be sync or async; we await it on every call so platforms
 * can defer construction until the first request.
 */
export function buildLibraryFacade(
  getLibrary: LibraryGetter,
): Pick<IApi, 'papers' | 'schema' | 'collections' | 'pdf' | 'highlights'> {
  const lib = async (): Promise<Library | null> => {
    const result = getLibrary()
    return result instanceof Promise ? result : result
  }
  const need = async (): Promise<Library> => {
    const l = await lib()
    if (!l) throw new Error('No active library')
    return l
  }

  return {
    papers: {
      list:        async (filter, collection) => (await lib())?.list(filter, collection) ?? [],
      get:         async (id)                  => (await need()).get(id),
      add:         async (draft)               => (await need()).add(draft),
      update:      async (id, patch)           => (await need()).update(id, patch),
      delete:      async (id)                  => (await need()).delete(id),
      search:      async (q, filter)           => (await lib())?.search(q, filter) ?? [],
      importArxiv: async (input)               => (await need()).importArxiv(input),
      importPdf:   async () => {
        throw new Error('importPdf must be provided by the platform adapter')
      },
    },
    schema: {
      get:          async ()           => (await lib())?.schema() ?? { version: 1, columns: [] },
      addColumn:    async (col)        => (await need()).addColumn(col),
      removeColumn: async (name)       => (await need()).removeColumn(name),
      renameColumn: async (from, to)   => (await need()).renameColumn(from, to),
    },
    collections: {
      list:        async ()                  => (await lib())?.listCollections() ?? [],
      create:      async (name)              => (await need()).createCollection(name),
      delete:      async (name)              => (await need()).deleteCollection(name),
      rename:      async (from, to)          => (await need()).renameCollection(from, to),
      addPaper:    async (id, name)          => (await need()).addToCollection(id, name),
      removePaper: async (id, name)          => (await need()).removeFromCollection(id, name),
    },
    pdf: {
      getPath: async (id) => (await lib())?.pdfPath(id) ?? null,
    },
    highlights: {
      list:   async (id)                     => (await lib())?.listHighlights(id) ?? [],
      add:    async (id, draft)              => (await need()).addHighlight(id, draft),
      update: async (id, highlightId, patch) => (await need()).updateHighlight(id, highlightId, patch),
      delete: async (id, highlightId)        => (await need()).deleteHighlight(id, highlightId),
    },
  }
}
