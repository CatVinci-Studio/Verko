import type { ChatContentPart, PaperRef, PaperDetail } from '@shared/types'

/**
 * Expand each @-mentioned paper into a text content part containing its
 * full markdown + key metadata. Lets the model "see" the paper without
 * needing a tool call. Returns content parts in the same order as `refs`.
 *
 * `getDetail` is injected so this is testable without IPC.
 */
export async function expandMentionsToContent(
  refs: PaperRef[],
  getDetail: (id: string) => Promise<PaperDetail>,
): Promise<ChatContentPart[]> {
  const out: ChatContentPart[] = []
  for (const p of refs) {
    try {
      const detail = await getDetail(p.id)
      const meta = [
        `id: ${detail.id}`,
        `title: ${detail.title}`,
        detail.authors.length ? `authors: ${detail.authors.join('; ')}` : '',
        detail.year ? `year: ${detail.year}` : '',
        detail.venue ? `venue: ${detail.venue}` : '',
        detail.doi ? `doi: ${detail.doi}` : '',
      ].filter(Boolean).join('\n')
      out.push({
        type: 'text',
        text: `[Attached paper @${detail.title || detail.id}]\n${meta}\n\n${detail.markdown}`,
      })
    } catch {
      // ignore — fall back to whatever the @-token gives the model
    }
  }
  return out
}
