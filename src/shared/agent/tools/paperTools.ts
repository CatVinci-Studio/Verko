import type { PaperDraft, PaperPatch, Filter } from '@shared/types'
import { type ToolRegistry, decodeUtf8 } from './types'

/** Read / write tools that operate purely on a Library. Browser-safe. */
export const paperTools: ToolRegistry = {
  read_library_csv: {
    def: {
      name: 'read_library_csv',
      description:
        'Read the entire papers.csv index for the active library. Use this first to get an overview of all papers and their metadata.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async call(_args, { library }) {
      try {
        return decodeUtf8(await library.backend.readFile('papers.csv'))
      } catch {
        return 'Error: Could not read library CSV. The library may be empty.'
      }
    },
  },

  read_paper: {
    def: {
      name: 'read_paper',
      description:
        'Read the full markdown content (including frontmatter and notes) of a specific paper.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Paper ID' } },
        required: ['id'],
      },
    },
    async call(args, { library }) {
      const id = args['id'] as string
      try {
        return decodeUtf8(await library.backend.readFile(`papers/${id}.md`))
      } catch {
        return `Error: Could not read paper "${id}". File may not exist.`
      }
    },
  },

  list_paper_ids: {
    def: {
      name: 'list_paper_ids',
      description: 'List all paper IDs in the active library by scanning the papers directory.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async call(_args, { library }) {
      try {
        const files = await library.backend.listFiles('papers')
        const ids = files
          .filter((f) => f.endsWith('.md'))
          .map((f) => {
            const name = f.split('/').pop() ?? f
            return name.slice(0, -3)
          })
        return JSON.stringify(ids)
      } catch {
        return JSON.stringify([])
      }
    },
  },

  add_paper: {
    def: {
      name: 'add_paper',
      description: 'Add a new paper to the active library.',
      parameters: {
        type: 'object',
        properties: {
          title:    { type: 'string', description: 'Paper title' },
          authors:  { type: 'array', items: { type: 'string' }, description: 'List of author names' },
          year:     { type: 'number', description: 'Publication year' },
          venue:    { type: 'string', description: 'Journal or conference name' },
          doi:      { type: 'string', description: 'DOI identifier' },
          url:      { type: 'string', description: 'URL to the paper' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
          status:   { type: 'string', enum: ['unread', 'reading', 'read', 'archived'], description: 'Reading status' },
          markdown: { type: 'string', description: 'Initial notes in markdown format' },
        },
        required: ['title'],
      },
    },
    async call(args, { library }) {
      const draft: PaperDraft = {
        title:    args['title'] as string,
        authors:  (args['authors'] as string[] | undefined) ?? [],
        year:     args['year'] as number | undefined,
        venue:    args['venue'] as string | undefined,
        doi:      args['doi'] as string | undefined,
        url:      args['url'] as string | undefined,
        tags:     (args['tags'] as string[] | undefined) ?? [],
        status:   (args['status'] as PaperDraft['status']) ?? 'unread',
        markdown: args['markdown'] as string | undefined,
      }
      try {
        const id = await library.add(draft)
        return JSON.stringify({ success: true, id })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  update_paper: {
    def: {
      name: 'update_paper',
      description: 'Update metadata fields of an existing paper.',
      parameters: {
        type: 'object',
        properties: {
          id:       { type: 'string', description: 'Paper ID to update' },
          title:    { type: 'string', description: 'New title' },
          authors:  { type: 'array', items: { type: 'string' }, description: 'New author list' },
          year:     { type: 'number', description: 'New publication year' },
          venue:    { type: 'string', description: 'New venue' },
          doi:      { type: 'string', description: 'New DOI' },
          url:      { type: 'string', description: 'New URL' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'New tags' },
          status:   { type: 'string', enum: ['unread', 'reading', 'read', 'archived'], description: 'New reading status' },
          rating:   { type: 'number', description: 'Rating 0-5' },
          markdown: { type: 'string', description: 'Replace the full markdown body' },
        },
        required: ['id'],
      },
    },
    async call(args, { library }) {
      const id = args['id'] as string
      const patch: PaperPatch = {}
      if (args['title']    !== undefined) patch.title    = args['title']    as string
      if (args['authors']  !== undefined) patch.authors  = args['authors']  as string[]
      if (args['year']     !== undefined) patch.year     = args['year']     as number
      if (args['venue']    !== undefined) patch.venue    = args['venue']    as string
      if (args['doi']      !== undefined) patch.doi      = args['doi']      as string
      if (args['url']      !== undefined) patch.url      = args['url']      as string
      if (args['tags']     !== undefined) patch.tags     = args['tags']     as string[]
      if (args['status']   !== undefined) patch.status   = args['status']   as PaperPatch['status']
      if (args['rating']   !== undefined) patch.rating   = args['rating']   as number
      if (args['markdown'] !== undefined) patch.markdown = args['markdown'] as string
      try {
        await library.update(id, patch)
        return JSON.stringify({ success: true })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  append_note: {
    def: {
      name: 'append_note',
      description:
        'Append text to a specific section of a paper\'s notes. Prefer this over update_paper for adding notes.',
      parameters: {
        type: 'object',
        properties: {
          id:      { type: 'string', description: 'Paper ID' },
          section: { type: 'string', description: 'Section heading to append to (e.g. "Notes")' },
          text:    { type: 'string', description: 'Text to append' },
        },
        required: ['id', 'section', 'text'],
      },
    },
    async call(args, { library }) {
      try {
        await library.appendNote(args['id'] as string, args['section'] as string, args['text'] as string)
        return JSON.stringify({ success: true })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  import_doi: {
    def: {
      name: 'import_doi',
      description: 'Import a paper by its DOI, fetching metadata automatically.',
      parameters: {
        type: 'object',
        properties: { doi: { type: 'string', description: 'DOI string, e.g. "10.1145/3290605.3300747"' } },
        required: ['doi'],
      },
    },
    async call(args, { library }) {
      try {
        const id = await library.importDoi(args['doi'] as string)
        return JSON.stringify({ success: true, id })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  search_papers: {
    def: {
      name: 'search_papers',
      description: 'Full-text search across papers in the active library.',
      parameters: {
        type: 'object',
        properties: {
          query:    { type: 'string', description: 'Search query' },
          status:   { type: 'array', items: { type: 'string', enum: ['unread', 'reading', 'read', 'archived'] }, description: 'Filter by reading status' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          yearFrom: { type: 'number', description: 'Minimum publication year' },
          yearTo:   { type: 'number', description: 'Maximum publication year' },
        },
        required: ['query'],
      },
    },
    async call(args, { library }) {
      const query = args['query'] as string
      const filter: Filter = {}
      if (args['status']   !== undefined) filter.status   = args['status']   as Filter['status']
      if (args['tags']     !== undefined) filter.tags     = args['tags']     as string[]
      if (args['yearFrom'] !== undefined) filter.yearFrom = args['yearFrom'] as number
      if (args['yearTo']   !== undefined) filter.yearTo   = args['yearTo']   as number
      try {
        return JSON.stringify(await library.search(query, filter))
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
