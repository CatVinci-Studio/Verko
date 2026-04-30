import type {
  ChatMessage, Conversation, ConversationSummary,
} from '@shared/types'
import type { StorageBackend } from '@shared/paperdb/backend'

const decoder = new TextDecoder('utf-8')
const decode = (b: Uint8Array): string => decoder.decode(b)

/**
 * Conversation persistence over a `StorageBackend`. One JSON file per
 * conversation (`<id>.json`) — matches the previous main-process format
 * so existing user history loads as-is.
 *
 * Desktop: backend = IpcBackend pointed at the `conversations` scope.
 * Web: backend = LocalStorageBackend (or future: S3-shared chats).
 */
export class ConversationStore {
  constructor(private readonly backend: StorageBackend) {}

  private fname(id: string): string {
    return `${id}.json`
  }

  async list(): Promise<ConversationSummary[]> {
    const all = await this.backend.listFiles('').catch(() => [] as string[])
    const out: ConversationSummary[] = []
    for (const f of all) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = decode(await this.backend.readFile(f))
        const c = JSON.parse(raw) as Conversation
        out.push({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: c.messages.length,
        })
      } catch {
        // skip malformed
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<Conversation> {
    const raw = decode(await this.backend.readFile(this.fname(id)))
    return JSON.parse(raw) as Conversation
  }

  async create(title?: string): Promise<Conversation> {
    const now = Date.now()
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: title ?? defaultTitle(now),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
    }
    await this.save(conv)
    return conv
  }

  async save(conv: Conversation): Promise<void> {
    conv.updatedAt = Date.now()
    conv.messageCount = conv.messages.length
    await this.backend.writeFile(this.fname(conv.id), JSON.stringify(conv, null, 2))
  }

  async append(id: string, msg: ChatMessage): Promise<Conversation> {
    let conv: Conversation
    try {
      conv = await this.get(id)
    } catch {
      // First write to a freshly-created conversation; reconstruct from id.
      const now = Date.now()
      conv = { id, title: defaultTitle(now), createdAt: now, updatedAt: now, messageCount: 0, messages: [] }
    }
    conv.messages.push({ ...msg, createdAt: msg.createdAt ?? Date.now() })
    if (conv.title.startsWith('New chat') && msg.role === 'user') {
      const text = msg.content.find((p) => p.type === 'text')
      if (text && text.type === 'text' && text.text.trim()) {
        conv.title = text.text.trim().slice(0, 60).replace(/\s+/g, ' ')
      }
    }
    await this.save(conv)
    return conv
  }

  async rename(id: string, title: string): Promise<void> {
    const conv = await this.get(id)
    conv.title = title
    await this.save(conv)
  }

  async delete(id: string): Promise<void> {
    await this.backend.deleteFile(this.fname(id))
  }
}

function defaultTitle(at: number): string {
  const d = new Date(at)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `New chat ${y}-${m}-${day} ${hh}:${mm}`
}
