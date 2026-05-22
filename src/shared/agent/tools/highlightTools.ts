// Read-only tools that expose user-authored PDF highlights to the agent.
// Mutating tools (creating/deleting highlights) are intentionally absent —
// highlights belong to the human reader; the agent should only consume them.

import type { ToolRegistry } from './types'

export const highlightTools: ToolRegistry = {
  list_highlights: {
    parallelSafe: true,
    def: {
      name: 'list_highlights',
      description:
        "List the user's PDF highlights for a paper. Useful when the user asks about their notes or wants to discuss specific passages they've marked.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Paper ID.' },
        },
        required: ['id'],
      },
    },
    async call(args, { library }) {
      const id = args['id'] as string
      try {
        const list = await library.listHighlights(id)
        // Trim coordinate noise — the model only needs page + text.
        const slim = list.map((h) => ({
          id: h.id,
          page: h.page,
          text: h.text,
          createdAt: h.createdAt,
          ...(h.note ? { note: h.note } : {}),
        }))
        return JSON.stringify(slim)
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
