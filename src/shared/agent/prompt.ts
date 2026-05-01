import type { Language } from '../types'

interface PromptContext {
  libraryName: string
  libraryRoot: string
  currentDate: string
  paperCount: number
  collections: Array<{ name: string; paperCount: number }>
  customColumns: Array<{ name: string; type: string }>
  /** User-authored skills available via `load_skill`. Layer 1: names + descriptions only. */
  skills: Array<{ name: string; description: string }>
  currentPaperId?: string
}

const DEFAULT_COLS = new Set([
  'id', 'title', 'authors', 'year', 'venue', 'doi', 'url',
  'tags', 'status', 'rating', 'added_at', 'updated_at',
])

const LANG_NAME: Record<Language, string> = {
  en: 'English',
  zh: 'Simplified Chinese (简体中文)',
}

function envBlock(ctx: PromptContext): string {
  const lines = [
    `Library: ${ctx.libraryName}`,
    `Root:    ${ctx.libraryRoot}`,
    `Papers:  ${ctx.paperCount}`,
  ]
  if (ctx.collections.length > 0) {
    lines.push(`Collections: ${ctx.collections.map((c) => `${c.name} (${c.paperCount})`).join(', ')}`)
  }
  const customs = ctx.customColumns.filter((c) => !DEFAULT_COLS.has(c.name))
  if (customs.length > 0) {
    lines.push(`Custom columns: ${customs.map((c) => `${c.name} (${c.type})`).join(', ')}`)
  }
  lines.push(`Today:   ${ctx.currentDate}`)
  return lines.join('\n')
}

function skillsBlock(ctx: PromptContext): string {
  if (ctx.skills.length === 0) return ''
  const intro = '\n# Skills\nEach is a user-authored workflow template; call `load_skill(name)` to pull its full body before acting.\n\n'
  const lines = ctx.skills.map((s) => `- \`${s.name}\` — ${s.description || '(no description)'}`)
  return intro + lines.join('\n') + '\n'
}

/**
 * Single English system prompt — the model handles user-language replies
 * via the explicit instruction at the top, which is what current SOTA
 * models do reliably. Keeping a separate ZH translation doubled
 * maintenance and produced subtle drift between the two; merged.
 *
 * The prompt deliberately doesn't name specific tools — those are
 * carried by every API request's `tools[]` field with their own
 * descriptions. This file owns: identity, storage model, workflow
 * shape, tone, conventions.
 */
export function buildSystemPrompt(language: Language, ctx: PromptContext): string {
  const langName = LANG_NAME[language] ?? LANG_NAME.en
  const paperHint = ctx.currentPaperId
    ? `\n# Current paper\nUser is viewing \`${ctx.currentPaperId}\`. Use as the default subject only when the message and @-mentions don't reference any paper.`
    : ''

  return `You are Verko's library agent — a research-paper assistant operating across the user's full library.

Reply in ${langName}.

<env>
${envBlock(ctx)}
</env>

# Library layout
- \`papers.csv\` — every field for every paper. Read first for library-wide questions.
- \`papers/<id>.md\` — notes body, pure markdown.
- \`attachments/<id>.pdf\` — original PDFs.
- \`schema.md\`, \`collections.json\`, \`<Name>.csv\` — schema, memberships, per-collection projections.

# How to work
- Library-wide → read \`papers.csv\` once, don't probe paper-by-paper.
- Topic search → use the search tool; more accurate than scanning CSV.
- Deep dive → CSV row + notes file. PDF only if those aren't enough.
- @-mentioned papers come pre-attached as full content; don't re-read them.

# Mutations
Always use the dedicated mutation tools. Never write \`papers.csv\` or \`papers/*.md\` through a generic file-write tool — the index would desync.

# Style
- Be concise. Skip "Sure!", "Let me help", "Great question", or restating the request.
- After mutating: one line — \`<id>: <field> = <value>\` or \`<id>: notes appended to "<section>"\`.
- Ambiguous reference → list 2-3 search candidates, ask. Don't guess.

# Conventions
- IDs: \`{year}-{lastname}-{keyword}\` (e.g. \`2017-vaswani-attention\`).
- CSV \`authors\` and \`tags\` are semicolon-separated; commas live inside author names.
- Status: \`unread\` | \`reading\` | \`read\` | \`archived\`.
${skillsBlock(ctx)}${paperHint}`
}
