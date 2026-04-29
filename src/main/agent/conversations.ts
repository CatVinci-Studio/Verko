import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile, readdir, rm } from 'fs/promises'
import { randomUUID } from 'crypto'
import type {
  ChatMessage,
  Conversation,
  ConversationSummary,
} from '@shared/types'

/**
 * On-disk conversation store. Each conversation is one JSON file at
 * `<userData>/conversations/<id>.json`. We keep them per-file (rather
 * than one big index) so a corrupted history doesn't take everything
 * down, and so a future cloud-sync layer can rsync individual files.
 */
export class ConversationStore {
  constructor(private readonly dir: string) {}

  static fromUserData(): ConversationStore {
    return new ConversationStore(join(app.getPath('userData'), 'conversations'))
  }

  async ensure(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`)
  }

  async list(): Promise<ConversationSummary[]> {
    await this.ensure()
    const files = await readdir(this.dir).catch(() => [] as string[])
    const out: ConversationSummary[] = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.dir, f), 'utf-8')
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
    const raw = await readFile(this.filePath(id), 'utf-8')
    return JSON.parse(raw) as Conversation
  }

  async create(title?: string): Promise<Conversation> {
    await this.ensure()
    const now = Date.now()
    const conv: Conversation = {
      id: randomUUID(),
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
    await this.ensure()
    conv.updatedAt = Date.now()
    conv.messageCount = conv.messages.length
    await writeFile(this.filePath(conv.id), JSON.stringify(conv, null, 2), 'utf-8')
  }

  async append(id: string, msg: ChatMessage): Promise<Conversation> {
    const conv = await this.get(id)
    conv.messages.push({ ...msg, createdAt: msg.createdAt ?? Date.now() })
    // Auto-title from the first user message if it's still the default.
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
    await rm(this.filePath(id), { force: true })
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
