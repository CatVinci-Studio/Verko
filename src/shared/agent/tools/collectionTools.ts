import type { ToolRegistry } from './types'

/**
 * Collection-membership mutations. Listing is done via
 * `read_file('collections.json')` — same data, no extra tool.
 *
 * `add_to_collection` auto-creates the collection if it does not exist,
 * so a separate `create_collection` tool isn't needed.
 */
export const collectionTools: ToolRegistry = {
  add_to_collection: {
    def: {
      name: 'add_to_collection',
      description: 'Add a paper to a collection. Creates the collection on first use.',
      parameters: {
        type: 'object',
        properties: {
          id:   { type: 'string', description: 'Paper ID' },
          name: { type: 'string', description: 'Collection name' },
        },
        required: ['id', 'name'],
      },
    },
    async call(args, { library }) {
      try {
        await library.addToCollection(args['id'] as string, args['name'] as string)
        return JSON.stringify({ success: true })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  remove_from_collection: {
    def: {
      name: 'remove_from_collection',
      description: 'Remove a paper from a collection.',
      parameters: {
        type: 'object',
        properties: {
          id:   { type: 'string', description: 'Paper ID' },
          name: { type: 'string', description: 'Collection name' },
        },
        required: ['id', 'name'],
      },
    },
    async call(args, { library }) {
      try {
        await library.removeFromCollection(args['id'] as string, args['name'] as string)
        return JSON.stringify({ success: true })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
