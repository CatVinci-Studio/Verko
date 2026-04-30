import type { NormalizedMessage, ProviderProtocol } from './providers'

/**
 * Three-layer context compaction, modeled on Claude Code's pattern:
 *
 *   L1 (micro): every turn, replace stale tool_result content with a
 *               placeholder. Outputs of read-style tools are preserved
 *               (they're reference material the model may revisit).
 *   L2 (auto):  when total tokens exceed THRESHOLD, save the full
 *               transcript, ask the model for a summary, and replace
 *               the message list with that summary.
 *   L3 (manual): the model can call the `compact` tool to trigger L2
 *                immediately when it has finished a chunk of work.
 *
 * `microCompact` mutates `messages` in place. `autoCompact` returns a
 * fresh array so callers can splice it onto theirs.
 */

const KEEP_RECENT = 3
export const TOKEN_THRESHOLD = 50_000

/**
 * Tools whose results are reference material — keep them in full even
 * after they age out, so the model doesn't re-fetch the same file.
 */
const PRESERVE_RESULT_TOOLS = new Set([
  'read_file',
  'read_document',
  'extract_pdf_text',
])

/** Cheap token estimator. ~4 chars/token. Good enough for threshold checks. */
export function estimateTokens(messages: NormalizedMessage[]): number {
  return JSON.stringify(messages).length / 4
}

/**
 * L1: Replace `tool_result` text content older than the most recent
 * KEEP_RECENT with a placeholder. The model can always re-fetch by
 * calling the same tool again, but in practice it doesn't need to.
 */
export function microCompact(messages: NormalizedMessage[]): void {
  // Build tool_use_id → tool_name lookup from prior assistant messages.
  const toolNameById = new Map<string, string>()
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls) {
      for (const tc of m.toolCalls) toolNameById.set(tc.id, tc.name)
    }
  }

  // Collect tool messages in order.
  const toolMsgIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolMsgIndices.push(i)
  }
  if (toolMsgIndices.length <= KEEP_RECENT) return

  const toClear = toolMsgIndices.slice(0, -KEEP_RECENT)
  for (const idx of toClear) {
    const msg = messages[idx]
    const name = msg.toolName ?? toolNameById.get(msg.toolCallId ?? '') ?? 'tool'
    if (PRESERVE_RESULT_TOOLS.has(name)) continue
    // Replace text content; leave non-text (e.g. images) alone — those
    // are unusual in tool results and we'd rather not silently drop them.
    msg.content = msg.content.map((p) =>
      p.type === 'text'
        ? { type: 'text', text: `[Previous: used ${name}]` }
        : p,
    )
  }
}

export interface AutoCompactOptions {
  provider: ProviderProtocol
  /** Persist the full transcript before discarding. Returns a label for the placeholder. */
  saveTranscript: (messages: NormalizedMessage[]) => Promise<string | null>
  systemPrompt: string
  /** Soft cap on summarization output. Defaults to 2000 tokens. */
  maxSummaryTokens?: number
}

/**
 * L2: Save the transcript, ask the model for a summary, and return a
 * fresh single-message conversation that begins with that summary.
 */
export async function autoCompact(
  messages: NormalizedMessage[],
  opts: AutoCompactOptions,
): Promise<NormalizedMessage[]> {
  const transcriptLabel = await opts.saveTranscript(messages).catch(() => null)

  const transcriptText = JSON.stringify(messages).slice(-80_000)
  const summarizeMsgs: NormalizedMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'Summarize the following conversation for continuity. Keep:\n' +
            '1) what was accomplished and any state changes,\n' +
            '2) the current open task or pending question,\n' +
            '3) key decisions and constraints the user established.\n' +
            'Be concise but preserve specific paper IDs, field names, and file paths verbatim.\n\n' +
            transcriptText,
        },
      ],
    },
  ]

  let summary = ''
  try {
    const ctrl = new AbortController()
    for await (const ev of opts.provider.stream({
      model: '',
      systemPrompt: 'You compress agent conversations losslessly with respect to facts.',
      messages: summarizeMsgs,
      tools: [],
      temperature: 0,
      signal: ctrl.signal,
    })) {
      if (ev.type === 'text') summary += ev.delta
    }
  } catch {
    summary = '(summarization failed; transcript saved on disk)'
  }

  const header = transcriptLabel
    ? `[Conversation compacted. Full transcript: ${transcriptLabel}]`
    : '[Conversation compacted.]'

  return [
    {
      role: 'user',
      content: [{ type: 'text', text: `${header}\n\n${summary || '(empty summary)'}` }],
    },
  ]
}
