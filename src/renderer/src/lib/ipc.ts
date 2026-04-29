import type {
  PaperRef, PaperDetail, PaperDraft, PaperPatch, PaperId,
  Filter, SearchHit, Schema, Column, AgentEventEnvelope, AgentConfig,
  AgentProfile, ProfilePatch, Language, LibraryInfo, CollectionInfo,
  NewLibraryInput, NewS3LibraryInput, ProbeResult, LibraryNonePayload,
  ChatContentPart, ConversationSummary, Conversation,
} from '@shared/types'

type UnsubFn = () => void

export interface IApi {
  libraries: {
    list(): Promise<LibraryInfo[]>
    open(id: string): Promise<LibraryInfo>
    add(input: NewLibraryInput): Promise<LibraryInfo>
    remove(id: string): Promise<void>
    rename(id: string, newName: string): Promise<void>
    pickFolder(): Promise<string | null>
    probeLocal(path: string): Promise<ProbeResult>
    probeS3(cfg: Omit<NewS3LibraryInput, 'kind' | 'name' | 'initialize'>): Promise<ProbeResult>
    hasNone(): Promise<boolean>
    onSwitched(cb: (info: LibraryInfo) => void): UnsubFn
    onNone(cb: (payload: LibraryNonePayload) => void): UnsubFn
  }
  collections: {
    list(): Promise<CollectionInfo[]>
    create(name: string): Promise<void>
    delete(name: string): Promise<void>
    rename(oldName: string, newName: string): Promise<void>
    addPaper(id: PaperId, name: string): Promise<void>
    removePaper(id: PaperId, name: string): Promise<void>
  }
  papers: {
    list(filter?: Filter, collection?: string): Promise<PaperRef[]>
    get(id: PaperId): Promise<PaperDetail>
    add(draft: PaperDraft): Promise<PaperId>
    update(id: PaperId, patch: PaperPatch): Promise<void>
    delete(id: PaperId): Promise<void>
    search(q: string, filter?: Filter): Promise<SearchHit[]>
    importDoi(doi: string): Promise<PaperId>
    importPdf(path: string): Promise<PaperId>
  }
  schema: {
    get(): Promise<Schema>
    addColumn(col: Column): Promise<void>
    removeColumn(name: string): Promise<void>
    renameColumn(from: string, to: string): Promise<void>
  }
  agent: {
    send(
      message: string,
      attachments?: ChatContentPart[],
      paperId?: string,
      language?: Language,
      conversationId?: string,
    ): Promise<string>
    abort(conversationId?: string): Promise<void>
    getConfig(): Promise<AgentConfig | null>
    setProfile(name: string): Promise<void>
    updateProfile(name: string, patch: ProfilePatch): Promise<void>
    saveKey(profile: string, key: string): Promise<void>
    testKey(profile: string): Promise<boolean>
    getProfiles(): Promise<AgentProfile[]>
    onEvent(cb: (envelope: AgentEventEnvelope) => void): UnsubFn
  }
  conversations: {
    list(): Promise<ConversationSummary[]>
    get(id: string): Promise<Conversation>
    create(title?: string): Promise<ConversationSummary>
    rename(id: string, title: string): Promise<void>
    delete(id: string): Promise<void>
  }
  pdf: {
    getPath(id: PaperId): Promise<string | null>
  }
}

declare global {
  interface Window {
    api: IApi
  }
}

// ── Web preview stub (no Electron preload) ────────────────────────────────────
const MOCK_PAPERS: PaperRef[] = [
  {
    id: '2017-vaswani-attention',
    title: 'Attention Is All You Need',
    authors: ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.'],
    year: 2017,
    venue: 'NeurIPS',
    tags: ['nlp', 'transformer', 'attention'],
    status: 'read',
    rating: 5,
    added_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-03-15T14:22:00Z',
    hasPdf: true,
    doi: '10.48550/arXiv.1706.03762',
    url: 'https://arxiv.org/abs/1706.03762',
  },
  {
    id: '2020-ho-diffusion',
    title: 'Denoising Diffusion Probabilistic Models',
    authors: ['Ho, J.', 'Jain, A.', 'Abbeel, P.'],
    year: 2020,
    venue: 'NeurIPS',
    tags: ['generative', 'diffusion', 'image-synthesis'],
    status: 'reading',
    rating: 4,
    added_at: '2024-02-01T09:00:00Z',
    updated_at: '2024-04-01T11:00:00Z',
    hasPdf: false,
  },
  {
    id: '2020-brown-gpt3',
    title: 'Language Models are Few-Shot Learners',
    authors: ['Brown, T.', 'Mann, B.', 'Ryder, N.', 'Subbiah, M.'],
    year: 2020,
    venue: 'NeurIPS',
    tags: ['nlp', 'llm', 'few-shot'],
    status: 'unread',
    added_at: '2024-03-05T16:30:00Z',
    updated_at: '2024-03-05T16:30:00Z',
    hasPdf: false,
  },
  {
    id: '2021-dosovitskiy-vit',
    title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale',
    authors: ['Dosovitskiy, A.', 'Beyer, L.', 'Kolesnikov, A.'],
    year: 2021,
    venue: 'ICLR',
    tags: ['vision', 'transformer', 'vit'],
    status: 'read',
    rating: 4,
    added_at: '2024-01-20T08:00:00Z',
    updated_at: '2024-02-10T12:00:00Z',
    hasPdf: true,
  },
  {
    id: '2022-wei-cot',
    title: 'Chain-of-Thought Prompting Elicits Reasoning in Large Language Models',
    authors: ['Wei, J.', 'Wang, X.', 'Schuurmans, D.'],
    year: 2022,
    venue: 'NeurIPS',
    tags: ['nlp', 'llm', 'reasoning', 'prompting'],
    status: 'unread',
    added_at: '2024-04-10T10:00:00Z',
    updated_at: '2024-04-10T10:00:00Z',
    hasPdf: false,
  },
]

const MOCK_COLLECTIONS: CollectionInfo[] = [
  { name: 'NLP', paperCount: 3 },
  { name: 'Vision', paperCount: 2 },
]

const STUB_LIBRARY: LibraryInfo = {
  id: 'stub',
  name: 'Demo Library',
  kind: 'local',
  path: '/demo',
  active: true,
  paperCount: MOCK_PAPERS.length,
}

const webStub: IApi = {
  collections: {
    list: () => Promise.resolve(MOCK_COLLECTIONS),
    create: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    addPaper: () => Promise.resolve(),
    removePaper: () => Promise.resolve(),
  },
  libraries: {
    list: () => Promise.resolve([STUB_LIBRARY]),
    open: () => Promise.resolve(STUB_LIBRARY),
    add: () => Promise.resolve(STUB_LIBRARY),
    remove: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    pickFolder: () => Promise.resolve(null),
    probeLocal: () => Promise.resolve({ status: 'ready' }),
    probeS3: () => Promise.resolve({ status: 'ready' }),
    hasNone: () => Promise.resolve(false),
    onSwitched: () => () => {},
    onNone: () => () => {},
  },
  papers: {
    list: () => Promise.resolve(MOCK_PAPERS),
    get: (id) => {
      const p = MOCK_PAPERS.find(x => x.id === id)
      if (!p) return Promise.reject(new Error('not found'))
      return Promise.resolve({
        ...p,
        markdown: `## TL;DR\n\nThis is a landmark paper. It introduced ideas that are now foundational to modern deep learning.\n\n## Method\n\nThe core mechanism involves attention over input sequences, enabling the model to focus on relevant parts dynamically.\n\n## My Notes\n\nEssential reading. The ideas here have influenced virtually every subsequent architecture.`,
      })
    },
    add: () => Promise.resolve('new-id'),
    update: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    search: (q) => {
      const lower = q.toLowerCase()
      const hits = MOCK_PAPERS
        .filter(p =>
          p.title.toLowerCase().includes(lower) ||
          p.tags.some(t => t.includes(lower)) ||
          p.authors.some(a => a.toLowerCase().includes(lower))
        )
        .map(paper => ({ paper, score: 1, terms: [q] }))
      return Promise.resolve(hits)
    },
    importDoi: () => Promise.resolve('imported-id'),
    importPdf: () => Promise.resolve('imported-id'),
  },
  schema: {
    get: () => Promise.resolve({
      version: 1,
      columns: [
        { name: 'id',         type: 'text',   inCsv: true },
        { name: 'title',      type: 'text',   inCsv: true },
        { name: 'authors',    type: 'tags',   inCsv: true },
        { name: 'year',       type: 'number', inCsv: true },
        { name: 'venue',      type: 'text',   inCsv: true },
        { name: 'tags',       type: 'tags',   inCsv: true },
        {
          name: 'status', type: 'select', inCsv: true,
          options: [{ value: 'unread' }, { value: 'reading' }, { value: 'read' }, { value: 'archived' }],
        },
        { name: 'rating',     type: 'number', inCsv: true },
        { name: 'added_at',   type: 'date',   inCsv: true },
        { name: 'updated_at', type: 'date',   inCsv: true },
      ],
    }),
    addColumn: () => Promise.resolve(),
    removeColumn: () => Promise.resolve(),
    renameColumn: () => Promise.resolve(),
  },
  agent: {
    send: () => Promise.resolve(''),
    abort: () => Promise.resolve(),
    getConfig: () => Promise.resolve(null),
    setProfile: () => Promise.resolve(),
    updateProfile: () => Promise.resolve(),
    saveKey: () => Promise.resolve(),
    testKey: () => Promise.resolve(true),
    getProfiles: () => Promise.resolve([]),
    onEvent: () => () => {},
  },
  conversations: {
    list:   () => Promise.resolve([]),
    get:    () => Promise.reject(new Error('No conversations in web preview')),
    create: () => Promise.resolve({ id: 'stub', title: 'Demo', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0 }),
    rename: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  },
  pdf: {
    getPath: () => Promise.resolve(null),
  },
}

export const api: IApi = (window as { api?: IApi }).api ?? webStub
