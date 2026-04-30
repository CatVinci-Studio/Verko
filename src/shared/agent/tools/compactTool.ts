import { type ToolRegistry } from './types'

/**
 * Manual context compaction trigger. The agent loop watches for this
 * tool name and runs `autoCompact` after the current turn finishes.
 *
 * The tool itself returns nothing useful — its purpose is the side
 * effect. The agent should call it when a coherent chunk of work has
 * concluded and earlier context is no longer needed.
 */
export const compactTool: ToolRegistry = {
  compact: {
    def: {
      name: 'compact',
      description:
        'Trigger context compaction when a chunk of work has concluded and earlier turns are no longer needed. Save tokens for upcoming turns. Optional `focus` argument hints what to keep.',
      parameters: {
        type: 'object',
        properties: {
          focus: { type: 'string', description: 'What to preserve in the summary.' },
        },
      },
    },
    async call() {
      return JSON.stringify({ ok: true, note: 'Context will be compacted at end of turn.' })
    },
  },
}
