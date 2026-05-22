import { type ToolRegistry } from './types'

/**
 * Skills are user-authored markdown files at `<library>/skills/<name>.md`,
 * with YAML frontmatter (`name`, `description`) and a body. The system
 * prompt only carries the names + descriptions; full bodies arrive on
 * demand through this tool — the same two-layer pattern as Claude Code's
 * skill loading.
 */
export const skillTools: ToolRegistry = {
  load_skill: {
    parallelSafe: true,
    def: {
      name: 'load_skill',
      description:
        'Load the full instructions of a user-defined skill by name. The skill list (with descriptions) appears in the system prompt; call this only after deciding the skill applies to the current task.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name as listed in the system prompt.' },
        },
        required: ['name'],
      },
    },
    async call(args, { library }) {
      const name = args['name'] as string
      const body = await library.getSkill(name)
      if (body == null) {
        const available = (await library.listSkills()).map((s) => s.name)
        return JSON.stringify({
          error: `Unknown skill "${name}".`,
          available,
        })
      }
      return `<skill name="${name}">\n${body}\n</skill>`
    },
  },
}
