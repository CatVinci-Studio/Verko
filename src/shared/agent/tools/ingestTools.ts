import type { PaperDraft } from '@shared/types'
import type { ToolRegistry } from './types'

/**
 * Read-later ingest tools. Thin wrapper over `Library.ingestUrl()` so the
 * agent's verb-set mirrors the UI's drop-bar — "drop a URL in the inbox"
 * is the same verb whether a human or the model triggers it.
 *
 * No LLM call happens here; summarization is a follow-up turn that calls
 * update_paper with the generated brief.
 */
export const ingestTools: ToolRegistry = {
  ingest_url: {
    def: {
      name: 'ingest_url',
      description:
        'Drop a URL into the read-later inbox. Fetches the page, extracts title + description + a cleaned text excerpt, and creates a kind=web item. Returns the new item id. Follow up with update_paper to fill in summary + markdown after reasoning over the excerpt.',
      parameters: {
        type: 'object',
        properties: {
          url:    { type: 'string', description: 'Absolute http(s) URL to ingest.' },
          tags:   { type: 'array', items: { type: 'string' }, description: 'Optional tags to apply at creation time.' },
          status: { type: 'string', enum: ['unread', 'reading', 'read', 'archived'], description: 'Override the default status (unread).' },
        },
        required: ['url'],
      },
    },
    async call(args, { library }) {
      const url = String(args['url'] ?? '').trim()
      const tags = args['tags'] as string[] | undefined
      const status = args['status'] as PaperDraft['status'] | undefined
      try {
        const id = await library.ingestUrl(url, { tags, status })
        return JSON.stringify({ success: true, id })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
