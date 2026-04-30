import type { ToolDef } from '@shared/agent/providers'
import type { Library } from '@shared/paperdb/store'

/**
 * Reduced tool subset for the web build.
 *
 * Read-only operations only — no add/update/delete/import (web is S3
 * read-only), no library switching (single-library web), no PDF
 * rasterization (would need OffscreenCanvas wiring; punted).
 */

export const WEB_TOOL_DEFS: ToolDef[] = [
  {
    name: 'read_library_csv',
    description:
      'Read the entire papers.csv index for the active library. Use this first to get an overview of all papers and their metadata.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_paper',
    description:
      'Read the full markdown content (including frontmatter and notes) of a specific paper.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Paper ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_paper_ids',
    description: 'List all paper IDs in the active library.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_papers',
    description: 'Full-text search across papers in the active library.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_collections',
    description: 'List all collections in the active library with their paper counts.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'web_fetch',
    description:
      'Fetch a URL and return its body as text. CORS-restricted to publicly accessible endpoints. ' +
      'Useful for following links from a paper.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL.' },
      },
      required: ['url'],
    },
  },
]

const decoder = new TextDecoder('utf-8')

export async function dispatchWebTool(
  name: string,
  args: Record<string, unknown>,
  lib: Library,
): Promise<string> {
  switch (name) {
    case 'read_library_csv': {
      try {
        return decoder.decode(await lib.backend.readFile('papers.csv'))
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    }

    case 'read_paper': {
      const id = String(args.id ?? '')
      if (!id) return JSON.stringify({ error: 'id required' })
      try {
        return decoder.decode(await lib.backend.readFile(`papers/${id}.md`))
      } catch {
        return JSON.stringify({ error: `Paper "${id}" not found` })
      }
    }

    case 'list_paper_ids': {
      const refs = await lib.list()
      return JSON.stringify(refs.map((r) => r.id))
    }

    case 'search_papers': {
      const q = String(args.query ?? '')
      const hits = await lib.search(q)
      return JSON.stringify(hits.slice(0, 25).map((h) => ({
        id: h.paper.id,
        title: h.paper.title,
        authors: h.paper.authors,
        year: h.paper.year,
      })))
    }

    case 'list_collections': {
      return JSON.stringify(lib.listCollections())
    }

    case 'web_fetch': {
      const url = String(args.url ?? '')
      if (!/^https?:\/\//i.test(url)) {
        return JSON.stringify({ error: 'URL must start with http:// or https://' })
      }
      try {
        const res = await fetch(url)
        if (!res.ok) {
          return JSON.stringify({ error: `Fetch failed: ${res.status} ${res.statusText}` })
        }
        const text = await res.text()
        return JSON.stringify({ url, body: text.slice(0, 50_000) })
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    }

    default:
      return JSON.stringify({
        error: `Tool "${name}" is not available in the web build. Try the desktop app for full functionality.`,
      })
  }
}
