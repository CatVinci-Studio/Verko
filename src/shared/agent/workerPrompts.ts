/**
 * Templates for one-shot worker prompts (no conversation, no chat UI).
 * Centralised so the prompt language stays consistent whether the
 * worker fires from the InboxBar drop, a background re-summarize job,
 * or a future "Resummarize" right-click action.
 */

/**
 * Post-ingest auto-summarize. The item already exists in the library
 * (freshly added by `Library.ingestUrl`); its markdown body holds the
 * raw extracted excerpt under `## Excerpt`. The worker distils this
 * into a short `summary` field and a useful reading guide.
 */
export function summarizeIngestedItemPrompt(itemId: string): string {
  return [
    `You are running a background "summarize this read-later item" pass.`,
    ``,
    `Item id: ${itemId}.`,
    ``,
    `Steps:`,
    `1. Call read_file with path "papers/${itemId}.md" to fetch the current body.`,
    `2. The body contains a "## Excerpt" section with raw extracted text from the source URL.`,
    `   Distil it into:`,
    `   - A 1-2 sentence summary (~30 words, plain English, no marketing tone).`,
    `   - A markdown body with these sections in order:`,
    `       ## TL;DR        (the summary, one paragraph)`,
    `       ## Key points   (3-5 bullets — concrete claims, not generic adjectives)`,
    `       ## Source       (the source URL on its own line)`,
    `3. Call update_paper exactly once with { id: "${itemId}", summary: <summary string>, markdown: <new body string> }.`,
    `4. Output just "done." — no chatter, no questions, no further tool calls.`,
    ``,
    `If the excerpt is too thin to summarise meaningfully (e.g. paywalled / JavaScript-only page that yielded mostly nav text), set summary to a single sentence describing what the page is from the URL + title, and write a body that explains the page couldn't be auto-summarized.`,
  ].join('\n')
}
