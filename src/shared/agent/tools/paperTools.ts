import type { PaperDraft, PaperPatch, Filter } from '@shared/types'
import { type ToolRegistry } from './types'

/**
 * Paper-level operations. Reads of papers.csv / papers/<id>.md / etc. are
 * not exposed here — the model uses `read_file` for those. This module
 * only owns mutations that need Library invariants (id generation, schema
 * defaults, search-index sync, CSV round-trip safety).
 */
export const paperTools: ToolRegistry = {
  add_paper: {
    def: {
      name: 'add_paper',
      description: 'Add a new item to the library. Field values land in papers.csv; the `markdown` argument seeds the body file. Use `kind` to mark non-paper items (web/pdf/note/video).',
      parameters: {
        type: 'object',
        properties: {
          title:    { type: 'string', description: 'Item title' },
          kind:     { type: 'string', enum: ['paper', 'web', 'pdf', 'note', 'video'], description: 'What this item is. Defaults to paper.' },
          authors:  { type: 'array', items: { type: 'string' }, description: 'List of author names (for papers / articles)' },
          year:     { type: 'number', description: 'Publication year' },
          venue:    { type: 'string', description: 'Journal, conference, or source name (e.g. blog name)' },
          doi:      { type: 'string', description: 'DOI identifier (papers only)' },
          url:      { type: 'string', description: 'Source URL' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
          status:   { type: 'string', enum: ['unread', 'reading', 'read', 'archived'], description: 'Reading status' },
          summary:  { type: 'string', description: 'Short brief (one or two sentences) shown in inbox previews. Leave blank if not yet known.' },
          markdown: { type: 'string', description: 'Initial body (notes / reading guide) in markdown format' },
        },
        required: ['title'],
      },
    },
    async call(args, { library }) {
      const draft: PaperDraft = {
        title:    args['title'] as string,
        kind:     args['kind'] as PaperDraft['kind'],
        authors:  (args['authors'] as string[] | undefined) ?? [],
        year:     args['year'] as number | undefined,
        venue:    args['venue'] as string | undefined,
        doi:      args['doi'] as string | undefined,
        url:      args['url'] as string | undefined,
        tags:     (args['tags'] as string[] | undefined) ?? [],
        status:   (args['status'] as PaperDraft['status']) ?? 'unread',
        summary:  args['summary'] as string | undefined,
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
      description: 'Update field values (writes to papers.csv) or replace the body (writes to papers/<id>.md). Pass only the fields you want to change.',
      parameters: {
        type: 'object',
        properties: {
          id:       { type: 'string', description: 'Item ID to update' },
          title:    { type: 'string', description: 'New title' },
          kind:     { type: 'string', enum: ['paper', 'web', 'pdf', 'note', 'video'], description: 'New kind (rare — usually set at add time).' },
          authors:  { type: 'array', items: { type: 'string' }, description: 'New author list' },
          year:     { type: 'number', description: 'New publication year' },
          venue:    { type: 'string', description: 'New venue / source' },
          doi:      { type: 'string', description: 'New DOI' },
          url:      { type: 'string', description: 'New URL' },
          tags:     { type: 'array', items: { type: 'string' }, description: 'New tags' },
          status:   { type: 'string', enum: ['unread', 'reading', 'read', 'archived'], description: 'New reading status' },
          rating:   { type: 'number', description: 'Rating 0-5' },
          summary:  { type: 'string', description: 'New short brief shown in inbox previews.' },
          markdown: { type: 'string', description: 'Replace the full markdown body (导读 / notes)' },
        },
        required: ['id'],
      },
    },
    async call(args, { library }) {
      const id = args['id'] as string
      const patch: PaperPatch = {}
      if (args['title']    !== undefined) patch.title    = args['title']    as string
      if (args['kind']     !== undefined) patch.kind     = args['kind']     as PaperPatch['kind']
      if (args['authors']  !== undefined) patch.authors  = args['authors']  as string[]
      if (args['year']     !== undefined) patch.year     = args['year']     as number
      if (args['venue']    !== undefined) patch.venue    = args['venue']    as string
      if (args['doi']      !== undefined) patch.doi      = args['doi']      as string
      if (args['url']      !== undefined) patch.url      = args['url']      as string
      if (args['tags']     !== undefined) patch.tags     = args['tags']     as string[]
      if (args['status']   !== undefined) patch.status   = args['status']   as PaperPatch['status']
      if (args['rating']   !== undefined) patch.rating   = args['rating']   as number
      if (args['summary']  !== undefined) patch.summary  = args['summary']  as string
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
        'Append text to a section of a paper\'s notes (body markdown). Creates the section if absent. Prefer this over `update_paper(markdown)` for adding to existing notes — it preserves prior content. Field changes belong in `update_paper`, not here.',
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

  import_arxiv: {
    def: {
      name: 'import_arxiv',
      description:
        'Import a paper from arXiv. Accepts an arXiv ID (e.g. "1706.03762"), an abs URL, or a pdf URL.',
      parameters: {
        type: 'object',
        properties: { input: { type: 'string', description: 'arXiv ID or URL.' } },
        required: ['input'],
      },
    },
    async call(args, { library }) {
      try {
        const id = await library.importArxiv(args['input'] as string)
        return JSON.stringify({ success: true, id })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  search_papers: {
    parallelSafe: true,
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
