import type { ToolRegistry } from './types'

/** Collection management tools — pure Library ops. Browser-safe. */
export const collectionTools: ToolRegistry = {
  list_collections: {
    def: {
      name: 'list_collections',
      description: 'List all collections in the active library with their paper counts.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async call(_args, { library }) {
      return JSON.stringify(library.listCollections())
    },
  },

  create_collection: {
    def: {
      name: 'create_collection',
      description: 'Create a new empty collection in the active library.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Collection name' } },
        required: ['name'],
      },
    },
    async call(args, { library }) {
      const name = args['name'] as string
      try {
        await library.createCollection(name)
        return JSON.stringify({ success: true, name })
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  },

  add_to_collection: {
    def: {
      name: 'add_to_collection',
      description: 'Add a paper to a collection. Creates the collection if it does not exist.',
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
