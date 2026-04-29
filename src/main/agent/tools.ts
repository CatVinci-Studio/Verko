import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import OpenAI from 'openai'
import type { Library } from '@main/paperdb/store'
import type { LibraryManager } from '@main/paperdb/manager'
import type { PaperDraft, PaperPatch, Filter } from '@shared/types'

export interface ToolContext {
  library: Library
  manager: LibraryManager
}

export const TOOL_DEFINITIONS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_library_csv',
      description:
        'Read the entire papers.csv index for the active library. Use this first to get an overview of all papers and their metadata.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_paper',
      description:
        'Read the full markdown content (including frontmatter and notes) of a specific paper.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Paper ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_paper_ids',
      description: 'List all paper IDs in the active library by scanning the papers directory.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_pdf_text',
      description:
        'Extract text content from a PDF file associated with a paper. Returns the first 50 pages of text.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Paper ID whose PDF should be extracted' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_paper',
      description: 'Add a new paper to the active library.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Paper title' },
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of author names'
          },
          year: { type: 'number', description: 'Publication year' },
          venue: { type: 'string', description: 'Journal or conference name' },
          doi: { type: 'string', description: 'DOI identifier' },
          url: { type: 'string', description: 'URL to the paper' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization'
          },
          status: {
            type: 'string',
            enum: ['unread', 'reading', 'read', 'archived'],
            description: 'Reading status'
          },
          markdown: { type: 'string', description: 'Initial notes in markdown format' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_paper',
      description: 'Update metadata fields of an existing paper.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Paper ID to update' },
          title: { type: 'string', description: 'New title' },
          authors: { type: 'array', items: { type: 'string' }, description: 'New author list' },
          year: { type: 'number', description: 'New publication year' },
          venue: { type: 'string', description: 'New venue' },
          doi: { type: 'string', description: 'New DOI' },
          url: { type: 'string', description: 'New URL' },
          tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
          status: {
            type: 'string',
            enum: ['unread', 'reading', 'read', 'archived'],
            description: 'New reading status'
          },
          rating: { type: 'number', description: 'Rating 0-5' },
          markdown: { type: 'string', description: 'Replace the full markdown body' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'append_note',
      description:
        'Append text to a specific section of a paper\'s notes. Prefer this over update_paper for adding notes.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Paper ID' },
          section: { type: 'string', description: 'Section heading to append to (e.g. "Notes")' },
          text: { type: 'string', description: 'Text to append' }
        },
        required: ['id', 'section', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_doi',
      description: 'Import a paper by its DOI, fetching metadata automatically.',
      parameters: {
        type: 'object',
        properties: {
          doi: { type: 'string', description: 'DOI string, e.g. "10.1145/3290605.3300747"' }
        },
        required: ['doi']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_papers',
      description: 'Full-text search across papers in the active library.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          status: {
            type: 'array',
            items: { type: 'string', enum: ['unread', 'reading', 'read', 'archived'] },
            description: 'Filter by reading status'
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          yearFrom: { type: 'number', description: 'Minimum publication year' },
          yearTo: { type: 'number', description: 'Maximum publication year' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_libraries',
      description: 'List all registered libraries with their metadata.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_library',
      description: 'Switch to a different library by name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Library name to switch to' }
        },
        required: ['name']
      }
    }
  },

  // ── Collection management ─────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_collections',
      description: 'List all collections in the active library with their paper counts.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_collection',
      description: 'Create a new empty collection in the active library.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Collection name' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_to_collection',
      description: 'Add a paper to a collection. Creates the collection if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          id:   { type: 'string', description: 'Paper ID' },
          name: { type: 'string', description: 'Collection name' }
        },
        required: ['id', 'name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_collection',
      description: 'Remove a paper from a collection.',
      parameters: {
        type: 'object',
        properties: {
          id:   { type: 'string', description: 'Paper ID' },
          name: { type: 'string', description: 'Collection name' }
        },
        required: ['id', 'name']
      }
    }
  },

  // ── Raw file access (scoped to library root) ──────────────────────────────
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read any file within the active library directory. Path is relative to the library root. ' +
        'Use this to read schema.md, collections.json, or any paper markdown file directly.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from library root, e.g. "schema.md" or "papers/2024-ho-ddpm.md"' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write content to a file within the active library directory. Path is relative to the library root. ' +
        'Use this to create or modify markdown notes, or write structured data. ' +
        'WARNING: Prefer update_paper / append_note for paper files to keep the index in sync.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'Relative path from library root' },
          content: { type: 'string', description: 'Full file content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and folders within the active library directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from library root. Omit or use "." for the root.' }
        },
        required: []
      }
    }
  }
]

function safeLibraryPath(libraryRoot: string, relativePath: string): string | null {
  const normalized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  const resolved = resolve(join(libraryRoot, normalized))
  return resolved.startsWith(libraryRoot) ? resolved : null
}

async function extractPdfText(filePath: string): Promise<string> {
  // Use dynamic require to avoid issues with pdfjs-dist in Electron main process
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf') as typeof import('pdfjs-dist')

  const data = await fs.readFile(filePath)
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) })
  const pdfDoc = await loadingTask.promise

  const maxPages = Math.min(pdfDoc.numPages, 50)
  const pageTexts: string[] = []

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(`--- Page ${pageNum} ---\n${pageText}`)
  }

  return pageTexts.join('\n\n')
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const { library, manager } = ctx

  switch (name) {
    case 'read_library_csv': {
      try {
        const content = await fs.readFile(library.csvPath, 'utf-8')
        return content
      } catch {
        return 'Error: Could not read library CSV. The library may be empty.'
      }
    }

    case 'read_paper': {
      const id = args['id'] as string
      const filePath = join(library.papersDir, `${id}.md`)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        return content
      } catch {
        return `Error: Could not read paper "${id}". File may not exist.`
      }
    }

    case 'list_paper_ids': {
      try {
        const files = await fs.readdir(library.papersDir)
        const ids = files
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.slice(0, -3))
        return JSON.stringify(ids)
      } catch {
        return JSON.stringify([])
      }
    }

    case 'extract_pdf_text': {
      const id = args['id'] as string
      const pdfPath = library.pdfPath(id)
      if (!pdfPath) {
        return `Error: No PDF associated with paper "${id}".`
      }
      try {
        const text = await extractPdfText(pdfPath)
        return text
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return `Error extracting PDF text: ${msg}`
      }
    }

    case 'add_paper': {
      const draft: PaperDraft = {
        title: args['title'] as string,
        authors: (args['authors'] as string[] | undefined) ?? [],
        year: args['year'] as number | undefined,
        venue: args['venue'] as string | undefined,
        doi: args['doi'] as string | undefined,
        url: args['url'] as string | undefined,
        tags: (args['tags'] as string[] | undefined) ?? [],
        status: (args['status'] as PaperDraft['status']) ?? 'unread',
        markdown: args['markdown'] as string | undefined
      }
      try {
        const id = await library.add(draft)
        return JSON.stringify({ success: true, id })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ success: false, error: msg })
      }
    }

    case 'update_paper': {
      const id = args['id'] as string
      const patch: PaperPatch = {}
      if (args['title'] !== undefined) patch.title = args['title'] as string
      if (args['authors'] !== undefined) patch.authors = args['authors'] as string[]
      if (args['year'] !== undefined) patch.year = args['year'] as number
      if (args['venue'] !== undefined) patch.venue = args['venue'] as string
      if (args['doi'] !== undefined) patch.doi = args['doi'] as string
      if (args['url'] !== undefined) patch.url = args['url'] as string
      if (args['tags'] !== undefined) patch.tags = args['tags'] as string[]
      if (args['status'] !== undefined)
        patch.status = args['status'] as PaperPatch['status']
      if (args['rating'] !== undefined) patch.rating = args['rating'] as number
      if (args['markdown'] !== undefined) patch.markdown = args['markdown'] as string
      try {
        await library.update(id, patch)
        return JSON.stringify({ success: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ success: false, error: msg })
      }
    }

    case 'append_note': {
      const id = args['id'] as string
      const section = args['section'] as string
      const text = args['text'] as string
      try {
        await library.appendNote(id, section, text)
        return JSON.stringify({ success: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ success: false, error: msg })
      }
    }

    case 'import_doi': {
      const doi = args['doi'] as string
      try {
        const id = await library.importDoi(doi)
        return JSON.stringify({ success: true, id })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ success: false, error: msg })
      }
    }

    case 'search_papers': {
      const query = args['query'] as string
      const filter: Filter = {}
      if (args['status'] !== undefined) filter.status = args['status'] as Filter['status']
      if (args['tags'] !== undefined) filter.tags = args['tags'] as string[]
      if (args['yearFrom'] !== undefined) filter.yearFrom = args['yearFrom'] as number
      if (args['yearTo'] !== undefined) filter.yearTo = args['yearTo'] as number
      try {
        const hits = await library.search(query, filter)
        return JSON.stringify(hits)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ error: msg })
      }
    }

    case 'list_libraries': {
      try {
        const libraries = await manager.list()
        return JSON.stringify(libraries)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ error: msg })
      }
    }

    case 'switch_library': {
      const libName = args['name'] as string
      try {
        await manager.switch(libName)
        return JSON.stringify({ success: true, active: libName })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return JSON.stringify({ success: false, error: msg })
      }
    }

    case 'list_collections': {
      return JSON.stringify(library.listCollections())
    }

    case 'create_collection': {
      const collName = args['name'] as string
      try {
        await library.createCollection(collName)
        return JSON.stringify({ success: true, name: collName })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    }

    case 'add_to_collection': {
      const paperId = args['id'] as string
      const collName = args['name'] as string
      try {
        await library.addToCollection(paperId, collName)
        return JSON.stringify({ success: true })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    }

    case 'remove_from_collection': {
      const paperId = args['id'] as string
      const collName = args['name'] as string
      try {
        await library.removeFromCollection(paperId, collName)
        return JSON.stringify({ success: true })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    }

    case 'read_file': {
      const relPath = args['path'] as string
      const absPath = safeLibraryPath(library.root, relPath)
      if (!absPath) return JSON.stringify({ error: 'Path is outside the library directory.' })
      try {
        const content = await fs.readFile(absPath, 'utf-8')
        return content
      } catch (e) {
        return JSON.stringify({ error: `Cannot read "${relPath}": ${e instanceof Error ? e.message : String(e)}` })
      }
    }

    case 'write_file': {
      const relPath = args['path'] as string
      const content = args['content'] as string
      const absPath = safeLibraryPath(library.root, relPath)
      if (!absPath) return JSON.stringify({ error: 'Path is outside the library directory.' })
      try {
        const dir = join(absPath, '..')
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(absPath, content, 'utf-8')
        return JSON.stringify({ success: true, path: relPath })
      } catch (e) {
        return JSON.stringify({ error: `Cannot write "${relPath}": ${e instanceof Error ? e.message : String(e)}` })
      }
    }

    case 'list_files': {
      const relPath = (args['path'] as string | undefined) ?? '.'
      const absPath = safeLibraryPath(library.root, relPath)
      if (!absPath) return JSON.stringify({ error: 'Path is outside the library directory.' })
      try {
        const entries = await fs.readdir(absPath, { withFileTypes: true })
        const items = entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }))
        return JSON.stringify(items)
      } catch (e) {
        return JSON.stringify({ error: `Cannot list "${relPath}": ${e instanceof Error ? e.message : String(e)}` })
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
