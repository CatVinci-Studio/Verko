import OpenAI from 'openai'
import type { AgentEvent } from '@shared/types'
import type { Library } from '@main/paperdb/store'
import type { LibraryManager } from '@main/paperdb/manager'
import { getConfig, getActiveProfile } from './config'
import { createClient } from './client'
import { runAgentLoop } from './loop'
import { TOOL_DEFINITIONS } from './tools'

export class AgentSession {
  private history: OpenAI.Chat.ChatCompletionMessageParam[] = []
  private abortController: AbortController | null = null

  constructor(private appState: { library: Library; manager: LibraryManager | null }) {}

  async send(
    userMessage: string,
    onEvent: (event: AgentEvent) => void,
    currentPaperId?: string
  ): Promise<void> {
    const config = getConfig()
    let profile: ReturnType<typeof getActiveProfile>
    try {
      profile = getActiveProfile()
    } catch (e) {
      onEvent({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to load active profile'
      })
      onEvent({ type: 'done' })
      return
    }

    if (!profile.key) {
      onEvent({
        type: 'error',
        message: `No API key set for profile "${profile.name}". Please add a key in settings.`
      })
      onEvent({ type: 'done' })
      return
    }

    // Build system prompt
    const libraryName = this.appState.manager?.activeName ?? 'My Library'
    const currentDate = new Date().toISOString().split('T')[0]

    const systemLines = [
      'You are the primary interface for interacting with the user\'s research paper library.',
      'This is an agent-first application: all meaningful interactions with papers happen through you.',
      '',
      `Active library: ${libraryName}`,
      `Library root path: ${this.appState.library.root}`,
      `Current date: ${currentDate}`,
      '',
      '## Library structure',
      '  papers/        — one Markdown file per paper (YAML frontmatter + notes body)',
      '  attachments/   — PDF files named <id>.pdf',
      '  papers.csv     — derived index, rebuilt automatically on every write',
      '  schema.json    — column definitions',
      '  collections.json — collection membership { "Name": ["id1", "id2"] }',
      '  <Name>.csv     — one CSV per collection, rebuilt automatically',
      '',
      '## Your capabilities',
      '- Read and write paper notes (append_note, update_paper, read_paper)',
      '- Search the library full-text (search_papers)',
      '- Read any file within the library (read_file)',
      '- Write any file within the library (write_file) — use carefully for paper .md files; prefer update_paper/append_note to keep the index in sync',
      '- List directory contents (list_files)',
      '- Manage collections (list_collections, create_collection, add_to_collection, remove_from_collection)',
      '- Import papers by DOI (import_doi)',
      '- Extract PDF text (extract_pdf_text)',
      '',
      '## Guidelines',
      '- ALL file operations are restricted to the library root. You cannot access files outside it.',
      '- Authors in frontmatter are semicolon-separated (e.g. "Vaswani, A.; Ho, J.") — not comma-separated.',
      '- Paper IDs follow the pattern {year}-{lastname}-{keyword}, e.g. "2017-vaswani-attention".',
      '- When adding notes prefer append_note over full rewrites to preserve existing content.',
      '- Always respond in the same language the user uses.',
    ]
    if (currentPaperId) {
      systemLines.push(`\nCurrently focused paper: ${currentPaperId}`)
    }
    const systemPrompt = systemLines.join('\n')

    // Push user message to history
    this.history.push({ role: 'user', content: userMessage })

    // Build messages array: system + full history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.history
    ]

    // Create client
    const client = createClient(profile.baseUrl, profile.key)

    // Create abort controller for this request
    this.abortController = new AbortController()

    // Track how many messages exist before the loop so we can extract assistant turns
    const historyLengthBefore = this.history.length

    try {
      await runAgentLoop({
        client,
        model: profile.model,
        messages,
        tools: TOOL_DEFINITIONS,
        maxTurns: config.maxTurns,
        temperature: config.temperature,
        ctx: {
          library: this.appState.library,
          manager: this.appState.manager!
        },
        onEvent,
        abortSignal: this.abortController.signal
      })
    } finally {
      this.abortController = null
    }

    // The loop mutates `messages` in-place by appending assistant + tool messages.
    // We need to sync back those new turns into this.history.
    // messages = [system, ...history_before, ...new_turns]
    // new_turns start at index: 1 + historyLengthBefore
    const newTurns = messages.slice(1 + historyLengthBefore)
    for (const turn of newTurns) {
      this.history.push(turn)
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  clearHistory(): void {
    this.history = []
  }

  getHistory(): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [...this.history]
  }
}
